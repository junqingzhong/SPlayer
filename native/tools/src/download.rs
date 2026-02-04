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
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::Arc;
use tokio::io::{AsyncSeekExt, AsyncWriteExt, SeekFrom};
use tokio_util::sync::CancellationToken;

#[napi(object)]
#[derive(Clone, Copy)]
pub struct DownloadProgress {
    pub percent: f64,
    pub transferred_bytes: f64,
    pub total_bytes: f64,
}

struct ProgressState {
    last_percent: f64,
    last_time: std::time::Instant,
}

struct ProgressTracker {
    total_size: u64,
    transferred: AtomicU64,
    state: std::sync::Mutex<ProgressState>,
    callback: Arc<ThreadsafeFunction<DownloadProgress>>,
}

impl ProgressTracker {
    fn new(total_size: u64, callback: ThreadsafeFunction<DownloadProgress>) -> Self {
        Self {
            total_size,
            transferred: AtomicU64::new(0),
            state: std::sync::Mutex::new(ProgressState {
                last_percent: 0.0,
                last_time: std::time::Instant::now(),
            }),
            callback: Arc::new(callback),
        }
    }

    fn update(&self, delta: u64) {
        let current = self.transferred.fetch_add(delta, Ordering::Relaxed) + delta;
        let total = self.total_size;

        if total == 0 {
            return;
        }

        if let Ok(mut state) = self.state.try_lock() {
            let now = std::time::Instant::now();
            let percent = current as f64 / total as f64;

            if percent - state.last_percent >= 0.01
                || now.duration_since(state.last_time).as_millis() > 500
            {
                let progress = DownloadProgress {
                    percent,
                    transferred_bytes: current as f64,
                    total_bytes: total as f64,
                };
                self.callback
                    .call(Ok(progress), ThreadsafeFunctionCallMode::NonBlocking);
                state.last_percent = percent;
                state.last_time = now;
            }
        }
    }

    fn finish(&self) {
        let progress = DownloadProgress {
            percent: 1.0,
            transferred_bytes: self.total_size as f64,
            total_bytes: self.total_size as f64,
        };
        self.callback
            .call(Ok(progress), ThreadsafeFunctionCallMode::NonBlocking);
    }
}

static DOWNLOAD_TASKS: Lazy<DashMap<u32, CancellationToken>> = Lazy::new(DashMap::new);

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

    tokio::task::spawn_blocking(move || write_metadata(&file_path, metadata, cover_data))
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
    on_progress: ThreadsafeFunction<DownloadProgress>,
    enable_https: bool,
    enable_http2: bool,
) -> Result<()> {
    let token = CancellationToken::new();
    DOWNLOAD_TASKS.insert(id, token.clone());
    let _guard = TaskGuard(id);

    download_file_inner(
        token.clone(),
        url,
        file_path,
        metadata,
        thread_count,
        referer,
        on_progress,
        enable_https,
        enable_http2,
    )
    .await
}

async fn download_file_inner(
    token: CancellationToken,
    url: String,
    file_path: String,
    metadata: Option<SongMetadata>,
    thread_count: u32,
    referer: Option<String>,
    on_progress: ThreadsafeFunction<DownloadProgress>,
    enable_https: bool,
    enable_http2: bool,
) -> Result<()> {
    if token.is_cancelled() {
        return Err(Error::new(Status::Cancelled, "下载已取消".to_string()));
    }

    let mut builder = reqwest::Client::builder()
        .user_agent("SPlayer/1.0")
        .tcp_nodelay(true)
        .http2_keep_alive_interval(std::time::Duration::from_secs(15));

    if !enable_http2 {
        builder = builder.http1_only();
    }

    let client = builder
        .build()
        .map_err(|e| Error::from_reason(format!("创建 HTTP 客户端失败: {}", e)))?;

    let mut final_url = url.clone();

    // 尝试将 HTTP 升级到 HTTPS 以启用 HTTP/2
    if enable_https && final_url.starts_with("http://") {
        let https_url = final_url.replacen("http://", "https://", 1);
        println!("[Download] 检测到 HTTP 链接，尝试升级到 HTTPS: {}", https_url);

        let mut probe_req = client.head(&https_url);
        if let Some(ref r) = referer {
            probe_req = probe_req.header("Referer", r);
        }

        if let Ok(resp) = probe_req.send().await {
            if resp.status().is_success() {
                println!(
                    "[Download] HTTPS 升级成功 (Protocol: {:?})",
                    resp.version()
                );
                final_url = https_url;
            } else {
                println!(
                    "[Download] HTTPS 探测返回状态码 {}，回退到 HTTP",
                    resp.status()
                );
            }
        } else {
            println!("[Download] HTTPS 连接失败，回退到 HTTP");
        }
    }

    // 发送 HEAD 请求获取文件大小
    let mut head_req = client.head(&final_url);
    if let Some(ref r) = referer {
        head_req = head_req.header("Referer", r);
    }

    let mut total_size = 0;
    let mut version = reqwest::Version::HTTP_11;

    if let Ok(head_resp) = head_req.send().await {
        version = head_resp.version();
        if let Some(len) = head_resp.content_length() {
            total_size = len;
        }
    }

    // 如果 HEAD 失败或没给长度，尝试 Range 探测 (Range: bytes=0-0)
    if total_size == 0 {
        let mut range_req = client.get(&final_url).header("Range", "bytes=0-0");
        if let Some(ref r) = referer {
            range_req = range_req.header("Referer", r);
        }

        if let Ok(range_resp) = range_req.send().await {
            if range_resp.status() == reqwest::StatusCode::PARTIAL_CONTENT {
                if let Some(val) = range_resp.headers().get(reqwest::header::CONTENT_RANGE) {
                    if let Ok(s) = val.to_str() {
                        // 格式: bytes 0-0/12345
                        if let Some(size_str) = s.rsplit('/').next() {
                            total_size = size_str.parse().unwrap_or(0);
                        }
                    }
                }
            }
        }
    }

    println!(
        "[Download] 最终使用 URL: {}, 协议: {:?}, 请求线程数: {}, 总大小: {}",
        final_url, version, thread_count, total_size
    );
    if version != reqwest::Version::HTTP_2 {
        println!(
            "[Download] 注意: HTTP/2 协商失败或服务器不支持。降级为 {:?}。",
            version
        );
    }

    if total_size > 5 * 1024 * 1024 && thread_count > 1 {
        println!("[Download] 使用多线程下载 ({} 线程)", thread_count);
        download_multi_stream(
            token.clone(),
            client.clone(),
            final_url.clone(),
            file_path.clone(),
            total_size,
            thread_count,
            referer,
            on_progress,
        )
        .await?;
    } else {
        println!("[Download] 使用单线程下载");
        download_single_stream(
            token.clone(),
            client.clone(),
            final_url.clone(),
            file_path.clone(),
            total_size,
            referer,
            on_progress,
        )
        .await?;
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
    on_progress: ThreadsafeFunction<DownloadProgress>,
) -> Result<()> {
    let mut req = client.get(&url);
    if let Some(ref r) = referer {
        req = req.header("Referer", r);
    }
    let response = req
        .send()
        .await
        .map_err(|e| Error::from_reason(format!("发送请求失败: {}", e)))?;

    let content_length = response.content_length().unwrap_or(0);

    let mut file = tokio::fs::File::create(&file_path)
        .await
        .map_err(|e| Error::from_reason(format!("创建文件失败: {}", e)))?;

    let mut stream = response.bytes_stream();
    let total_size = if total_size == 0 {
        content_length
    } else {
        total_size
    };
    let tracker = Arc::new(ProgressTracker::new(total_size, on_progress));

    let process_result = async {
        while let Some(item) = tokio::select! {
            _ = token.cancelled() => None,
            item = stream.next() => item,
        } {
            let chunk = item.map_err(|e| Error::from_reason(format!("读取数据失败: {}", e)))?;
            file.write_all(&chunk)
                .await
                .map_err(|e| Error::from_reason(format!("写入数据失败: {}", e)))?;
            tracker.update(chunk.len() as u64);
        }

        if token.is_cancelled() {
            return Err(Error::new(Status::Cancelled, "下载已取消".to_string()));
        }

        file.flush()
            .await
            .map_err(|e| Error::from_reason(format!("刷新文件失败: {}", e)))?;
        Ok(())
    }
    .await;

    if let Err(e) = process_result {
        drop(file);
        let _ = tokio::fs::remove_file(&file_path).await;
        return Err(Error::from_reason(format!("下载单线程失败: {}", e)));
    }

    tracker.finish();
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
    on_progress: ThreadsafeFunction<DownloadProgress>,
) -> Result<()> {
    let mut file = tokio::fs::File::create(&file_path)
        .await
        .map_err(|e| Error::from_reason(format!("创建文件失败: {}", e)))?;
    file.set_len(total_size)
        .await
        .map_err(|e| Error::from_reason(format!("设置文件大小失败: {}", e)))?;

    let tracker = Arc::new(ProgressTracker::new(total_size, on_progress));
    const CHUNK_SIZE: u64 = 4 * 1024 * 1024;

    let mut ranges = Vec::new();
    let mut start = 0;
    while start < total_size {
        let end = std::cmp::min(start + CHUNK_SIZE - 1, total_size - 1);
        ranges.push((start, end));
        start += CHUNK_SIZE;
    }

    let download_futures = futures_util::stream::iter(ranges).map(|(start, end)| {
        let client = client.clone();
        let url = url.clone();
        let referer = referer.clone();
        let token = token.clone();

        async move { download_chunk_with_retry(client, url, referer, start, end, token).await }
    });

    let mut stream = download_futures.buffer_unordered(thread_count as usize);

    let process_result = async {
        while let Some(result) = stream.next().await {
            let (offset, data) = result?;
            if token.is_cancelled() {
                return Err(Error::new(Status::Cancelled, "下载已取消".to_string()));
            }

            file.seek(SeekFrom::Start(offset))
                .await
                .map_err(|e| Error::from_reason(format!("移动文件指针失败: {}", e)))?;
            file.write_all(&data)
                .await
                .map_err(|e| Error::from_reason(format!("写入数据失败: {}", e)))?;
            tracker.update(data.len() as u64);
        }
        file.flush()
            .await
            .map_err(|e| Error::from_reason(format!("刷新文件失败: {}", e)))?;
        Ok(())
    }
    .await;

    if let Err(e) = process_result {
        drop(file);
        let _ = tokio::fs::remove_file(&file_path).await;
        return Err(Error::from_reason(format!("多线程下载失败: {}", e)));
    }

    tracker.finish();
    Ok(())
}

async fn download_chunk_with_retry(
    client: reqwest::Client,
    url: String,
    referer: Option<String>,
    start: u64,
    end: u64,
    token: CancellationToken,
) -> Result<(u64, bytes::Bytes)> {
    let mut attempts = 0;
    let max_retries = 3;
    let mut last_error = String::new();

    while attempts < max_retries {
        if token.is_cancelled() {
            return Err(Error::new(Status::Cancelled, "下载已取消".to_string()));
        }

        let range_header = format!("bytes={}-{}", start, end);
        let mut req = client.get(&url).header("Range", &range_header);
        if let Some(ref r) = referer {
            req = req.header("Referer", r);
        }

        match req.send().await {
            Ok(resp) => {
                if !resp.status().is_success() {
                    last_error = format!("HTTP 状态码 {}", resp.status());
                    attempts += 1;
                    tokio::time::sleep(tokio::time::Duration::from_secs(1)).await;
                    continue;
                }

                match resp.bytes().await {
                    Ok(bytes) => return Ok((start, bytes)),
                    Err(e) => {
                        last_error = format!("读取图片数据失败: {}", e);
                    }
                }
            }
            Err(e) => {
                last_error = e.to_string();
            }
        }

        attempts += 1;
        tokio::time::sleep(tokio::time::Duration::from_secs(1)).await;
    }
    Err(Error::from_reason(format!(
        "下载分片 {}-{} 失败，已尝试 {} 次。最后一次错误：{}",
        start, end, max_retries, last_error
    )))
}

async fn process_metadata(
    client: reqwest::Client,
    file_path: String,
    meta: SongMetadata,
) -> Result<()> {
    let cover_data = if let Some(cover_url) = &meta.cover_url {
        if !cover_url.is_empty() {
            match tokio::time::timeout(
                std::time::Duration::from_secs(10),
                client.get(cover_url).send(),
            )
            .await
            {
                Ok(Ok(resp)) => {
                    if resp.status().is_success() {
                        match resp.bytes().await {
                            Ok(b) => Some(b),
                            Err(_e) => None,
                        }
                    } else {
                        None
                    }
                }
                _ => None,
            }
        } else {
            None
        }
    } else {
        None
    };

    let path_clone = file_path.clone();
    tokio::task::spawn_blocking(move || {
        write_metadata(&path_clone, meta, cover_data)
            .map_err(|e| Error::from_reason(format!("保存标签失败: {}", e)))
    })
    .await
    .map_err(|e| Error::from_reason(format!("保存标签任务失败: {}", e)))??;

    Ok(())
}

fn get_or_create_tag(tagged_file: &mut lofty::file::TaggedFile) -> Result<&mut Tag> {
    if tagged_file.primary_tag_mut().is_some() {
        return Ok(tagged_file.primary_tag_mut().unwrap());
    }

    if tagged_file.first_tag_mut().is_some() {
        return Ok(tagged_file.first_tag_mut().unwrap());
    }

    let tag_type = tagged_file.primary_tag_type();
    tagged_file.insert_tag(Tag::new(tag_type));

    tagged_file
        .primary_tag_mut()
        .ok_or_else(|| Error::from_reason("创建新标签失败"))
}

fn write_metadata(path: &str, meta: SongMetadata, cover_data: Option<bytes::Bytes>) -> Result<()> {
    let path_obj = Path::new(path);

    let mut tagged_file = match Probe::open(path_obj) {
        Ok(probe) => match probe.read() {
            Ok(f) => f,
            Err(e) => return Err(Error::from_reason(format!("读取文件标签失败: {}", e))),
        },
        Err(e) => return Err(Error::from_reason(format!("打开文件标签失败: {}", e))),
    };

    let tag = get_or_create_tag(&mut tagged_file)?;

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
        .map_err(|e| Error::from_reason(format!("保存标签失败: {}", e)))?;

    Ok(())
}
