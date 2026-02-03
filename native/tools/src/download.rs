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
use tokio::io::AsyncWriteExt;
use tokio_util::sync::CancellationToken;

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
pub fn write_music_metadata(
    file_path: String,
    metadata: SongMetadata,
    cover_path: Option<String>,
) -> Result<()> {
    let cover_data = if let Some(path) = cover_path {
        match std::fs::read(&path) {
            Ok(bytes) => Some(bytes::Bytes::from(bytes)),
            Err(_) => None,
        }
    } else {
        None
    };
    write_metadata(&file_path, metadata, cover_data)
}

#[napi]
pub async fn download_file(
    id: u32,
    url: String,
    file_path: String,
    metadata: Option<SongMetadata>,
    on_progress: ThreadsafeFunction<String>, // Change to JSON String to support complex data
) -> Result<()> {
    let token = CancellationToken::new();
    DOWNLOAD_TASKS.insert(id, token.clone());

    let result = download_file_inner(token.clone(), url, file_path, metadata, on_progress).await;
    
    DOWNLOAD_TASKS.remove(&id);
    result
}

async fn download_file_inner(
    token: CancellationToken,
    url: String,
    file_path: String,
    metadata: Option<SongMetadata>,
    on_progress: ThreadsafeFunction<String>,
) -> Result<()> {
    println!("Start downloading: {} -> {}", url, file_path);

    // Check cancellation
    if token.is_cancelled() {
        return Err(Error::from_reason("Download cancelled"));
    }

    let client = reqwest::Client::builder()
        .user_agent("SPlayer/1.0")
        .build()
        .map_err(|e| Error::from_reason(e.to_string()))?;

    let response = client.get(&url)
        .send()
        .await
        .map_err(|e| Error::from_reason(e.to_string()))?;

    let total_size = response.content_length().unwrap_or(0);
    
    // Create file
    let mut file = tokio::fs::File::create(&file_path)
        .await
        .map_err(|e| Error::from_reason(e.to_string()))?;
        
    let mut stream = response.bytes_stream();
    let mut downloaded: u64 = 0;
    let mut last_progress_time = std::time::Instant::now();
    let mut last_percent = 0.0;

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
            
            // Throttle: update if > 1% change or > 1 second passed, or complete
            if percent - last_percent >= 0.01 || now.duration_since(last_progress_time).as_millis() > 500 || percent >= 1.0 {
                 let json = format!(
                    "{{\"percent\": {:.4}, \"transferredBytes\": {}, \"totalBytes\": {}}}", 
                    percent, downloaded, total_size
                 );
                 on_progress.call(Ok(json), ThreadsafeFunctionCallMode::NonBlocking);
                 last_progress_time = now;
                 last_percent = percent;
            }
        }
    }

    if token.is_cancelled() {
        println!("Download cancelled: {}", file_path);
        drop(file);
        let _ = tokio::fs::remove_file(&file_path).await;
        return Err(Error::from_reason("Download cancelled"));
    }

    file.flush()
        .await
        .map_err(|e| Error::from_reason(e.to_string()))?;
    drop(file); // Close file so we can reopen it for metadata
    println!("Download complete: {}", file_path);

    // Metadata
    if let Some(meta) = metadata {
        println!("Processing metadata for: {}", meta.title);
        // Download cover
        let cover_data = if let Some(cover_url) = &meta.cover_url {
            if !cover_url.is_empty() {
                println!("Downloading cover: {}", cover_url);
                match client.get(cover_url).send().await {
                    Ok(resp) => {
                        if resp.status().is_success() {
                            match resp.bytes().await {
                                Ok(b) => {
                                    println!("Cover downloaded, size: {}", b.len());
                                    Some(b)
                                }
                                Err(e) => {
                                    println!("Failed to read cover bytes: {}", e);
                                    None
                                }
                            }
                        } else {
                            println!("Cover download failed with status: {}", resp.status());
                            None
                        }
                    }
                    Err(e) => {
                        println!("Failed to download cover: {}", e);
                        None
                    }
                }
            } else {
                println!("Cover URL is empty string");
                None
            }
        } else {
            println!("No cover URL provided in metadata");
            None
        };

        // Write tags using lofty
        let path_clone = file_path.clone();

        tokio::task::spawn_blocking(move || {
            write_metadata(&path_clone, meta, cover_data)
                .map_err(|e| Error::from_reason(e.to_string()))
        })
        .await
        .map_err(|e| Error::from_reason(e.to_string()))??;
    }

    Ok(())
}

fn write_metadata(path: &str, meta: SongMetadata, cover_data: Option<bytes::Bytes>) -> Result<()> {
    println!("Writing metadata to: {}", path);
    let path_obj = Path::new(path);
    let mut tagged_file = Probe::open(path_obj)
        .map_err(|e| Error::from_reason(format!("Failed to open file for tagging: {}", e)))?
        .read()
        .map_err(|e| Error::from_reason(format!("Failed to read tags: {}", e)))?;

    let tag = match tagged_file.primary_tag_mut() {
        Some(primary_tag) => primary_tag,
        None => {
            if let Some(first_tag) = tagged_file.first_tag_mut() {
                first_tag
            } else {
                let tag_type = tagged_file.primary_tag_type();
                tagged_file.insert_tag(Tag::new(tag_type));
                tagged_file.primary_tag_mut().unwrap()
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
        println!("Embedding cover art...");
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

    println!("Metadata written successfully");
    Ok(())
}
