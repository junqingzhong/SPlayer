use dashmap::DashMap;
use futures_util::StreamExt;
use lofty::config::WriteOptions;
use lofty::picture::{MimeType, Picture, PictureType};
use lofty::prelude::*;
use lofty::probe::Probe;
use lofty::tag::{ItemKey, Tag};
use napi::bindgen_prelude::*;
use napi::threadsafe_function::{ThreadsafeFunction, ThreadsafeFunctionCallMode};
use napi_derive::napi;
use once_cell::sync::Lazy;
use std::path::Path;
use tokio::io::{AsyncWriteExt, AsyncSeekExt, SeekFrom};
use tokio::sync::mpsc;
use tokio_util::sync::CancellationToken;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::Arc;
use serde::Serialize;
use serde_json::to_string;

#[derive(Serialize)]
struct DownloadProgress {
    percent: f64,
    #[serde(rename = "transferredBytes")]
    transferred_bytes: u64,
    #[serde(rename = "totalBytes")]
    total_bytes: u64,
}

static DOWNLOAD_TASKS: Lazy<DashMap<u32, CancellationToken>> = Lazy::new(DashMap::new);

static CLIENT: Lazy<reqwest::Client> = Lazy::new(|| {
    reqwest::Client::builder()
        .user_agent("SPlayer/1.0")
        .tcp_nodelay(true)
        .http2_keep_alive_interval(std::time::Duration::from_secs(15))
        .build()
        .expect("Failed to create HTTP client")
});

#[napi(object)]
#[derive(Debug)]
pub struct SongMetadata {
    pub title: String,
    pub artist: String,
    pub album: String,
    pub cover_url: Option<String>,
    pub lyric: Option<String>,
    pub description: Option<String>,
}

#[napi]
pub fn cancel_download(id: u32) {
    if let Some((_, token)) = DOWNLOAD_TASKS.remove(&id) {
        token.cancel();
    }
}

#[napi]
pub async fn write_music_metadata(
    file_path: String,
    metadata: SongMetadata,
    cover_path: Option<String>,
) -> Result<()> {
    let cover_data = if let Some(path) = cover_path {
        match tokio::fs::read(&path).await {
            Ok(bytes) => Some(bytes::Bytes::from(bytes)),
            Err(_) => None,
        }
    } else {
        None
    };

    tokio::task::spawn_blocking(move || {
        write_metadata(&file_path, metadata, cover_data)
    })
    .await
    .map_err(|e| Error::from_reason(e.to_string()))??;

    Ok(())
}

struct TaskGuard(u32);

impl Drop for TaskGuard {
    fn drop(&mut self) {
        DOWNLOAD_TASKS.remove(&self.0);
    }
}

#[napi]
pub async fn download_file(
    id: u32,
    url: String,
    file_path: String,
    metadata: Option<SongMetadata>,
    thread_count: u32,
    referer: Option<String>,
    on_progress: ThreadsafeFunction<String>,
) -> Result<()> {
    let token = CancellationToken::new();
    DOWNLOAD_TASKS.insert(id, token.clone());
    let _guard = TaskGuard(id);

    download_file_inner(token.clone(), url, file_path, metadata, thread_count, referer, on_progress).await
}

async fn download_file_inner(
    token: CancellationToken,
    url: String,
    file_path: String,
    metadata: Option<SongMetadata>,
    thread_count: u32,
    referer: Option<String>,
    on_progress: ThreadsafeFunction<String>,
) -> Result<()> {
    if token.is_cancelled() {
        return Err(Error::new(Status::Cancelled, "Download cancelled".to_string()));
    }

    let client = CLIENT.clone();

    // 发送 HEAD 请求获取文件大小
    let mut head_req = client.head(&url);
    if let Some(ref r) = referer {
        head_req = head_req.header("Referer", r);
    }
    let head_resp = head_req
        .send()
        .await
        .map_err(|e| Error::from_reason(e.to_string()))?;
    
    let version = head_resp.version();
    let mut total_size = head_resp.content_length().unwrap_or(0);
    
    // 如果 HEAD 请求失败，尝试发送带有 Range 0-0 的 GET 请求获取 Content-Range
    if total_size == 0 {
         println!("[Download] HEAD request returned 0 size, trying GET Range request...");
         let mut get_req = client.get(&url).header("Range", "bytes=0-0");
         if let Some(ref r) = referer {
             get_req = get_req.header("Referer", r);
         }
         match get_req.send().await {
             Ok(resp) => {
                 // 如果服务器忽略 Range 并返回 200，content_length 即为完整大小
                 if resp.status().as_u16() == 200 {
                     total_size = resp.content_length().unwrap_or(0);
                 } 
                 // 如果服务器支持 Range 并返回 206
                 else if resp.status().as_u16() == 206 {
                     if let Some(range_header) = resp.headers().get("content-range") {
                         if let Ok(range_str) = range_header.to_str() {
                             // 格式: bytes 0-0/12345
                             if let Some(slash_pos) = range_str.rfind('/') {
                                 if let Ok(size) = range_str[slash_pos+1..].parse::<u64>() {
                                     total_size = size;
                                 }
                             }
                         }
                     }
                 }
             },
             Err(e) => println!("[Download] Failed to probe size via GET: {}", e),
         }
    }

    println!("[Download] Protocol: {:?}, Request thread count: {}, Total size: {}", version, thread_count, total_size);
    if version != reqwest::Version::HTTP_2 {
         println!("[Download] Notice: HTTP/2 negotiation failed or server does not support it. Fallback to {:?}.", version);
    }

    if total_size > 5 * 1024 * 1024 && thread_count > 1 {
        println!("[Download] Using multi-threaded download ({} threads)", thread_count);
        download_multi_stream(token.clone(), client.clone(), url.clone(), file_path.clone(), total_size, thread_count, referer, on_progress).await?;
    } else {
        println!("[Download] Using single-threaded download");
        download_single_stream(token.clone(), client.clone(), url.clone(), file_path.clone(), total_size, referer, on_progress).await?;
    }

    if let Some(meta) = metadata {
        process_metadata(client, file_path, meta).await?;
    }

    Ok(())
}

async fn download_single_stream(
    token: CancellationToken,
    client: reqwest::Client,
    url: String,
    file_path: String,
    total_size: u64,
    referer: Option<String>,
    on_progress: ThreadsafeFunction<String>,
) -> Result<()> {
    let mut req = client.get(&url);
    if let Some(ref r) = referer {
        req = req.header("Referer", r);
    }
    let response = req
        .send()
        .await
        .map_err(|e| Error::from_reason(e.to_string()))?;

    let content_length = response.content_length().unwrap_or(0);

    let mut file = tokio::fs::File::create(&file_path)
        .await
        .map_err(|e| Error::from_reason(e.to_string()))?;

    let mut stream = response.bytes_stream();
    let mut downloaded: u64 = 0;
    let mut last_progress_time = std::time::Instant::now();
    let mut last_percent = 0.0;

    let total_size = if total_size == 0 {
        content_length
    } else {
        total_size
    };

    let process_result = async {
        while let Some(item) = tokio::select! {
            _ = token.cancelled() => None,
            item = stream.next() => item,
        } {
            let chunk = item.map_err(|e| Error::from_reason(e.to_string()))?;
            file.write_all(&chunk).await.map_err(|e| Error::from_reason(e.to_string()))?;
            downloaded += chunk.len() as u64;

            if total_size > 0 {
                let percent = downloaded as f64 / total_size as f64;
                let now = std::time::Instant::now();
                
                if percent - last_percent >= 0.01 || now.duration_since(last_progress_time).as_millis() > 500 || percent >= 1.0 {
                     let progress = DownloadProgress {
                         percent,
                         transferred_bytes: downloaded,
                         total_bytes: total_size,
                     };
                     if let Ok(json) = to_string(&progress) {
                         on_progress.call(Ok(json), ThreadsafeFunctionCallMode::NonBlocking);
                     }
                     last_progress_time = now;
                     last_percent = percent;
                }
            }
        }

        if token.is_cancelled() {
            return Err(Error::new(Status::Cancelled, "Download cancelled".to_string()));
        }

        file.flush().await.map_err(|e| Error::from_reason(e.to_string()))?;
        Ok(())
    }.await;

    if let Err(e) = process_result {
        drop(file);
        let _ = tokio::fs::remove_file(&file_path).await;
        return Err(e);
    }

    Ok(())
}

async fn download_multi_stream(
    token: CancellationToken,
    client: reqwest::Client,
    url: String,
    file_path: String,
    total_size: u64,
    thread_count: u32,
    referer: Option<String>,
    on_progress: ThreadsafeFunction<String>,
) -> Result<()> {
    let file = tokio::fs::File::create(&file_path)
        .await
        .map_err(|e| Error::from_reason(e.to_string()))?;
    file.set_len(total_size).await.map_err(|e| Error::from_reason(e.to_string()))?;
    drop(file);

    let on_progress = Arc::new(on_progress);
    
    // 动态分块: 4MB 分块
    const CHUNK_SIZE: u64 = 4 * 1024 * 1024; 
    let next_offset = Arc::new(AtomicU64::new(0));
    let transferred = Arc::new(AtomicU64::new(0));
    let mut handles = Vec::new();

    let transferred_monitor = transferred.clone();
    let token_monitor = token.clone();
    let on_progress_monitor = on_progress.clone();
    
    let monitor_handle = tokio::spawn(async move {
        let mut last_percent = 0.0;
        let mut last_progress_time = std::time::Instant::now();
        loop {
            if token_monitor.is_cancelled() { break; }
            tokio::time::sleep(tokio::time::Duration::from_millis(100)).await;
            
            let current = transferred_monitor.load(Ordering::Relaxed);
            let percent = if total_size > 0 { current as f64 / total_size as f64 } else { 0.0 };
            let now = std::time::Instant::now();

            if percent - last_percent >= 0.01 || now.duration_since(last_progress_time).as_millis() > 500 || percent >= 1.0 {
                 let progress = DownloadProgress {
                     percent,
                     transferred_bytes: current,
                     total_bytes: total_size,
                 };
                 if let Ok(json) = to_string(&progress) {
                     on_progress_monitor.call(Ok(json), ThreadsafeFunctionCallMode::NonBlocking);
                 }
                 last_percent = percent;
                 last_progress_time = now;
            }
            if current >= total_size { break; }
        }
    });

    // 写入线程通道
    let (tx, mut rx) = mpsc::channel::<(u64, Vec<u8>)>(32);
    let writer_transferred = transferred.clone();
    let writer_file_path = file_path.clone();

    // 写入任务
    let writer_handle = tokio::spawn(async move {
        let mut file = tokio::fs::OpenOptions::new()
            .write(true)
            .open(&writer_file_path)
            .await
            .map_err(|e| e.to_string())?;
        
        while let Some((offset, data)) = rx.recv().await {
            let len = data.len() as u64;
            file.seek(SeekFrom::Start(offset)).await.map_err(|e| e.to_string())?;
            file.write_all(&data).await.map_err(|e| e.to_string())?;
            writer_transferred.fetch_add(len, Ordering::Relaxed);
        }
        file.flush().await.map_err(|e| e.to_string())?;
        Ok::<(), String>(())
    });

    for _ in 0..thread_count {
        let client = client.clone();
        let url = url.clone();
        let next_offset = next_offset.clone();
        let token = token.clone();
        let referer = referer.clone();
        let tx = tx.clone();

        handles.push(tokio::spawn(async move {
            loop {
                if token.is_cancelled() { return Ok(()); }

                let start = next_offset.fetch_add(CHUNK_SIZE, Ordering::Relaxed);
                if start >= total_size { break; }

                let end = std::cmp::min(start + CHUNK_SIZE - 1, total_size - 1);
                
                // 重试逻辑
                let mut attempts = 0;
                let max_retries = 3;
                let mut success = false;

                while attempts < max_retries {
                    if token.is_cancelled() { return Ok(()); }
                    
                    let range_header = format!("bytes={}-{}", start, end);
                    let mut req = client.get(&url).header("Range", &range_header);
                    if let Some(ref r) = &referer {
                        req = req.header("Referer", r);
                    }

                    match req.send().await {
                        Ok(resp) => {
                            if !resp.status().is_success() {
                                attempts += 1;
                                tokio::time::sleep(tokio::time::Duration::from_secs(1)).await;
                                continue;
                            }

                            let mut stream = resp.bytes_stream();
                            let mut chunk_offset = start;
                            let mut stream_failed = false;

                            while let Some(item) = stream.next().await {
                                if token.is_cancelled() { return Ok(()); }
                                match item {
                                    Ok(chunk) => {
                                        let len = chunk.len() as u64;
                                        if tx.send((chunk_offset, chunk.to_vec())).await.is_err() {
                                            return Err("Writer channel closed".to_string());
                                        }
                                        chunk_offset += len;
                                    },
                                    Err(_) => {
                                        stream_failed = true;
                                        break;
                                    }
                                }
                            }

                            if !stream_failed {
                                success = true;
                                break; 
                            }
                        },
                        Err(e) => {
                            // 请求失败
                            println!("[Download] Chunk request failed on attempt {}: {}", attempts + 1, e);
                        }
                    }

                    attempts += 1;
                    tokio::time::sleep(tokio::time::Duration::from_secs(1)).await;
                }

                if !success {
                    return Err(format!("Failed to download chunk {}-{} after {} attempts", start, end, max_retries));
                }
            }
            Ok::<(), String>(())
        }));
    }

    // 丢弃主线程的发送端，以便在所有工作线程完成后关闭接收端
    drop(tx);

    let results = futures_util::future::join_all(handles).await;
    
    // 检查工作线程错误
    let mut error = None;
    for res in results {
        match res {
            Ok(Ok(_)) => {},
            Ok(Err(e)) => error = Some(Error::from_reason(e)),
            Err(e) => error = Some(Error::from_reason(e.to_string())),
        }
    }

    // 等待写入完成
    let writer_res = writer_handle.await;
    match writer_res {
        Ok(Ok(_)) => {},
        Ok(Err(e)) => if error.is_none() { error = Some(Error::from_reason(e)); },
        Err(e) => if error.is_none() { error = Some(Error::from_reason(e.to_string())); },
    }

    monitor_handle.abort();

    if let Some(e) = error {
        let _ = tokio::fs::remove_file(&file_path).await;
        return Err(e);
    }

    if token.is_cancelled() {
        let _ = tokio::fs::remove_file(&file_path).await;
        return Err(Error::new(Status::Cancelled, "Download cancelled".to_string()));
    }
    
    let progress = DownloadProgress {
        percent: 1.0,
        transferred_bytes: total_size,
        total_bytes: total_size,
    };
    if let Ok(json) = to_string(&progress) {
        on_progress.call(Ok(json), ThreadsafeFunctionCallMode::NonBlocking);
    }
    
    Ok(())
}

async fn process_metadata(client: reqwest::Client, file_path: String, meta: SongMetadata) -> Result<()> {
    let cover_data = if let Some(cover_url) = &meta.cover_url {
        if !cover_url.is_empty() {
            match tokio::time::timeout(std::time::Duration::from_secs(10), client.get(cover_url).send()).await {
                Ok(Ok(resp)) => {
                    if resp.status().is_success() {
                        match resp.bytes().await {
                            Ok(b) => Some(b),
                            Err(_e) => None
                        }
                    } else { None }
                },
                _ => None,
            }
        } else { None }
    } else { None };

    let path_clone = file_path.clone();
    tokio::task::spawn_blocking(move || {
        write_metadata(&path_clone, meta, cover_data)
            .map_err(|e| Error::from_reason(e.to_string()))
    })
    .await
    .map_err(|e| Error::from_reason(e.to_string()))??;
    
    Ok(())
}

fn write_metadata(path: &str, meta: SongMetadata, cover_data: Option<bytes::Bytes>) -> Result<()> {
    let path_obj = Path::new(path);
    
    let mut tagged_file = None;
    let mut last_err = String::new();
    
    for i in 0..3 {
        match Probe::open(path_obj) {
            Ok(probe) => match probe.read() {
                Ok(f) => {
                    tagged_file = Some(f);
                    break;
                },
                Err(e) => last_err = e.to_string(),
            },
            Err(e) => last_err = e.to_string(),
        }
        if i < 2 {
            std::thread::sleep(std::time::Duration::from_millis(500));
        }
    }

    let mut tagged_file = tagged_file.ok_or_else(|| Error::from_reason(format!("Failed to open file for tagging after retries: {}", last_err)))?;

    let tag = match tagged_file.primary_tag_mut() {
        Some(primary_tag) => primary_tag,
        None => {
            if let Some(first_tag) = tagged_file.first_tag_mut() {
                first_tag
            } else {
                let tag_type = tagged_file.primary_tag_type();
                tagged_file.insert_tag(Tag::new(tag_type));
                if let Some(tag) = tagged_file.primary_tag_mut() {
                    tag
                } else {
                    return Err(Error::from_reason("Failed to create a new tag"));
                }
            }
        }
    };

    tag.set_title(meta.title.clone());
    tag.set_artist(meta.artist.clone());
    tag.set_album(meta.album.clone());

    if let Some(desc) = meta.description.clone() {
        tag.set_comment(desc);
    }

    if let Some(lyric) = meta.lyric.clone() {
        tag.insert_text(ItemKey::Lyrics, lyric);
    }

    if let Some(data) = cover_data {
        let mime_type = if data.starts_with(&[0xFF, 0xD8, 0xFF]) {
            MimeType::Jpeg
        } else if data.starts_with(&[0x89, 0x50, 0x4E, 0x47]) {
            MimeType::Png
        } else {
            MimeType::Jpeg
        };

        let picture = Picture::new_unchecked(
            PictureType::CoverFront,
            Some(mime_type),
            None,
            data.to_vec(),
        );
        tag.push_picture(picture);
    }

    tagged_file
        .save_to_path(path_obj, WriteOptions::default())
        .map_err(|e| Error::from_reason(format!("Failed to save tags: {}", e)))?;

    Ok(())
}
