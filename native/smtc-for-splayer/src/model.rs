use napi::bindgen_prelude::Buffer;
use napi_derive::napi;

#[derive(Debug, Clone)]
pub struct MetadataPayload {
    pub song_name: String,
    pub author_name: String,
    pub album_name: String,

    pub cover_data: Option<Vec<u8>>,

    pub original_cover_url: Option<String>,

    pub ncm_id: Option<i64>,

    pub duration: Option<f64>,
}

#[napi(object)]
pub struct MetadataParam {
    pub song_name: String,
    pub author_name: String,
    pub album_name: String,

    /// 只用于 SMTC 更新
    pub cover_data: Option<Buffer>,

    /// 只用于 Discord RPC 更新，因为 Discord RPC 只能上传封面链接
    pub original_cover_url: Option<String>,

    /// 会以 "NCM-{ID}" 的格式上传到 SMTC 的 “流派” 字段
    pub ncm_id: Option<i64>,

    /// 单位是毫秒
    ///
    /// 只用于 Discord RPC，因为 Discord RPC 不太支持只更新元数据而不更新进度信息
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

#[napi]
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum PlaybackStatus {
    Playing,
    Paused,
}

#[napi]
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

/// Discord RPC 的配置内容
#[napi(object)]
#[derive(Debug, Clone)]
pub struct DiscordConfigPayload {
    /// 是否要在暂停后也显示 Discord Activity，如果为 false，则在暂停后清空 Discord Activity
    ///
    /// ### 备注
    ///
    /// 开启此功能后，暂停时进度条将显示为 0 (因为是通过 Hack 实现的)
    pub show_when_paused: bool,

    /// 自定义 "Listening to" 后面应该显示什么
    ///
    /// 详情请查看 [`DiscordDisplayMode`]
    pub display_mode: Option<DiscordDisplayMode>,
}

/// 自定义 Discord Activity 中 "Listening to" 后面应该显示什么
#[napi]
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum DiscordDisplayMode {
    /// 显示为 "Listening to Spotify"
    Name,

    /// 显示为 "Listening to Rick Astley"
    State,

    /// 显示为 "Listening to Never Gonna Give You Up"
    Details,
}
