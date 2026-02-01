use napi_derive::napi;
use walkdir::WalkDir;
use lofty::probe::Probe;
use lofty::prelude::{TaggedFileExt, Accessor, AudioFile};
use rayon::prelude::*;
use napi::bindgen_prelude::{Result, Buffer};

/// 音频元数据结构体
#[napi(object)]
pub struct AudioMeta {
    /// 标题
    pub title: Option<String>,
    /// 艺术家
    pub artist: Option<String>,
    /// 专辑
    pub album: Option<String>,
    /// 时长 (秒)
    pub duration: f64, 
    /// 文件路径
    pub path: String,
    /// 修改时间 (毫秒)
    pub mtime: f64, 
    /// 文件大小
    pub size: i64,
    /// 比特率 (bps)
    pub bitrate: Option<f64>,
    /// 封面数据
    pub cover_data: Option<Buffer>,
}

fn scan_dirs_internal(paths: Vec<String>) -> Vec<AudioMeta> {
    paths
        .into_par_iter()
        .flat_map(|path| {
            WalkDir::new(path)
                .into_iter()
                .filter_map(|e| e.ok())
                .filter(|e| {
                    if !e.file_type().is_file() {
                        return false;
                    }
                    e.path()
                        .extension()
                        .map_or(false, |ext| {
                            let s = ext.to_string_lossy().to_lowercase();
                            matches!(s.as_str(), "mp3" | "flac" | "wav" | "ogg" | "m4a" | "aac" | "webm" | "aiff" | "aif")
                        })
                })
                .collect::<Vec<_>>() // Collect entries for this directory
                .into_par_iter() // Parallelize processing of files
                .filter_map(|entry| {
                    let path = entry.path();
                    let metadata = entry.metadata().ok()?;
                    let mtime = metadata.modified().ok()?.duration_since(std::time::UNIX_EPOCH).ok()?.as_millis() as f64;
                    let size = metadata.len() as i64;
                    
                    // Filter: size < 1MB
                    if size < 1024 * 1024 {
                        return None;
                    }

                    // Read audio metadata
                    let tagged_file = match Probe::open(path) {
                        Ok(probe) => match probe.read() {
                            Ok(tf) => tf,
                            Err(_) => return None,
                        },
                        Err(_) => return None,
                    };

                    let properties = tagged_file.properties();
                    let duration = properties.duration().as_secs_f64();
                    
                    // Filter: duration < 30s or > 2h (7200s)
                    if duration < 30.0 || duration > 7200.0 {
                        return None;
                    }

                    let tag = tagged_file.primary_tag().or_else(|| tagged_file.first_tag());
                    
                    // Extract cover
                    let cover_data = if let Some(t) = tag {
                        t.pictures().first().map(|p| p.data().into())
                    } else {
                        None
                    };

                    Some(AudioMeta {
                        title: tag.and_then(|t| t.title().map(|s| s.to_string())),
                        artist: tag.and_then(|t| t.artist().map(|s| s.to_string())),
                        album: tag.and_then(|t| t.album().map(|s| s.to_string())),
                        duration,
                        path: path.to_string_lossy().to_string(),
                        mtime,
                        size,
                        bitrate: properties.audio_bitrate().map(|b| (b * 1000) as f64),
                        cover_data,
                    })
                })
        })
        .collect()
}

/// 扫描音乐目录
#[napi]
pub async fn scan_music_dirs(paths: Vec<String>) -> Result<Vec<AudioMeta>> {
    tokio::task::spawn_blocking(move || scan_dirs_internal(paths))
        .await
        .map_err(|e| napi::Error::from_reason(e.to_string()))
}
