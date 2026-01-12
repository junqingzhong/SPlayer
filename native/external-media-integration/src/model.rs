use std::fmt;

use napi::bindgen_prelude::Buffer;
use napi_derive::napi;

#[napi(string_enum)]
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum SystemMediaEventType {
    Play,
    Pause,
    Stop,
    NextSong,
    PreviousSong,
    ToggleShuffle,
    ToggleRepeat,
    Seek,
}

#[napi(object)]
#[derive(Clone, Debug)]
pub struct SystemMediaEvent {
    pub type_: SystemMediaEventType,
    pub position_ms: Option<f64>,
}

impl SystemMediaEvent {
    pub const fn new(t: SystemMediaEventType) -> Self {
        Self {
            type_: t,
            position_ms: None,
        }
    }
    pub const fn seek(pos: f64) -> Self {
        Self {
            type_: SystemMediaEventType::Seek,
            position_ms: Some(pos),
        }
    }
}

#[derive(Clone, PartialEq)]
pub struct MetadataPayload {
    pub song_name: String,
    pub author_name: String,
    pub album_name: String,

    pub cover_data: Option<Vec<u8>>,

    pub original_cover_url: Option<String>,

    pub ncm_id: Option<i64>,

    pub duration: Option<f64>,
}

impl fmt::Debug for MetadataPayload {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.debug_struct("MetadataPayload")
            .field("song_name", &self.song_name)
            .field("author_name", &self.author_name)
            .field("album_name", &self.album_name)
            .field(
                "cover_data",
                &self.cover_data.as_ref().map_or_else(
                    || "None".to_string(),
                    |bytes| format!("Some({} bytes)", bytes.len()),
                ),
            )
            .field("original_cover_url", &self.original_cover_url)
            .field("ncm_id", &self.ncm_id)
            .field("duration", &self.duration)
            .finish()
    }
}

#[napi(object)]
pub struct MetadataParam {
    pub song_name: String,
    pub author_name: String,
    pub album_name: String,

    /// 只用于 SMTC 更新
    pub cover_data: Option<Buffer>,

    /// `HTTP URL` 用于封面显示
    pub original_cover_url: Option<String>,

    /// 会以 "NCM-{ID}" 的格式上传到 SMTC 的 “流派” 字段
    pub ncm_id: Option<i64>,

    pub duration: Option<f64>,
}

impl From<MetadataParam> for MetadataPayload {
    fn from(param: MetadataParam) -> Self {
        Self {
            song_name: param.song_name,
            author_name: param.author_name,
            album_name: param.album_name,
            cover_data: param.cover_data.map(|b| b.to_vec()),
            original_cover_url: param.original_cover_url,
            ncm_id: param.ncm_id,
            duration: param.duration,
        }
    }
}

#[napi(string_enum)]
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum PlaybackStatus {
    Playing,
    Paused,
}

#[napi(string_enum)]
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum RepeatMode {
    None,
    Track,
    List,
}

#[napi(object)]
#[derive(Debug, Clone, Copy)]
pub struct PlayStatePayload {
    pub status: PlaybackStatus,
}

#[napi(object)]
#[derive(Debug, Clone, Copy)]
pub struct TimelinePayload {
    /// 单位是毫秒
    pub current_time: f64,

    /// 单位是毫秒
    pub total_time: f64,
}

#[napi(object)]
#[derive(Debug, Clone, Copy)]
pub struct PlayModePayload {
    pub is_shuffling: bool,
    pub repeat_mode: RepeatMode,
}

/// Discord 显示模式枚举
///
/// 控制 Discord 左下角 "正在听 XXX" 的显示内容
#[napi(string_enum)]
#[allow(clippy::doc_markdown)]
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum DiscordDisplayMode {
    /// Listening to SPlayer
    Name,
    /// Listening to Rick Astley
    State,
    /// Listening to Never Gonna Give You Up
    Details,
}

/// Discord 配置参数
#[napi(object)]
#[derive(Debug, Clone)]
pub struct DiscordConfigPayload {
    /// 暂停时是否显示
    pub show_when_paused: bool,
    /// 显示模式
    pub display_mode: Option<DiscordDisplayMode>,
}
