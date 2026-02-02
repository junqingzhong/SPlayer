#[cfg(target_os = "linux")]
mod linux;
#[cfg(target_os = "macos")]
mod macos;
#[cfg(target_os = "windows")]
mod windows;
mod download;

mod scanner;

pub use scanner::scan_music_library;
#[cfg(target_os = "windows")]
pub use windows::get_taskbar_created_message_id;

pub use download::*;
