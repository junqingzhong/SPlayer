import { throttle } from "lodash-es";
import { isElectron, isWin } from "@/utils/env";
import { getPlaySongData } from "@/utils/format";
import { type MetadataParam } from "@native";
import { RepeatMode, PlaybackStatus, DiscordDisplayMode } from "@/types/smtc";

/**
 * 发送播放状态
 * @param isPlaying 是否播放
 */
export const sendPlayStatus = (isPlaying: boolean) => {
  if (isElectron) window.electron.ipcRenderer.send("play-status-change", isPlaying);
};

/**
 * 发送歌曲信息
 * @param title 歌曲标题
 * @param name 歌曲名称
 * @param artist 歌手
 * @param album 专辑
 */
export const sendSongChange = (title: string, name: string, artist: string, album: string) => {
  if (!isElectron) return;
  // 获取歌曲时长
  const duration = getPlaySongData()?.duration ?? 0;
  window.electron.ipcRenderer.send("play-song-change", { title, name, artist, album, duration });
  window.electron.ipcRenderer.send("update-desktop-lyric-data", {
    playName: name,
    artistName: artist,
  });
};

/**
 * 发送进度
 * @param progress 进度
 */
export const sendTaskbarProgress = throttle((progress: number | "none") => {
  if (isElectron) {
    window.electron.ipcRenderer.send("set-bar", progress);
  }
}, 1000);

/**
 * 发送 Socket 实时进度
 */
export const sendSocketProgress = throttle((currentTime: number, duration: number) => {
  if (isElectron) {
    window.electron.ipcRenderer.send("set-progress", { currentTime, duration });
  }
}, 500);

/**
 * 发送歌词
 * @param data 歌词数据
 */
export const sendLyric = throttle((data: unknown) => {
  if (isElectron) window.electron.ipcRenderer.send("play-lyric-change", data);
}, 500);

/**
 * 发送喜欢状态
 * @param isLiked 是否喜欢
 */
export const sendLikeStatus = (isLiked: boolean) => {
  if (isElectron) window.electron.ipcRenderer.send("like-status-change", isLiked);
};

/**
 * 发送桌面歌词开关
 * @param show 是否显示
 */
export const toggleDesktopLyric = (show: boolean) => {
  if (isElectron) window.electron.ipcRenderer.send("toggle-desktop-lyric", show);
};

/**
 * 发送播放模式
 * @param mode 播放模式
 */
export const sendPlayMode = (mode: string) => {
  if (isElectron) window.electron.ipcRenderer.send("play-mode-change", mode);
};

///////////////////////////////////////////
//
// 原生插件相关部分
//
///////////////////////////////////////////

// eslint-disable-next-line @typescript-eslint/no-unused-vars
type NativeModule = typeof import("@native"); // 用于 JSDoc

/**
 * @description 通过原生插件更新 SMTC 元数据
 * @param payload - 参见 {@link MetadataParam}
 * @see {@link NativeModule.updateMetadata 原生模块的 `updateMetadata` 方法}
 */
export const sendSmtcMetadata = (payload: MetadataParam) => {
  if (isElectron && isWin) window.electron.ipcRenderer.send("smtc-update-metadata", payload);
};

/**
 * @description 通过原生插件更新 SMTC 播放状态
 * @param status - 参见 {@link PlaybackStatus}
 * @see {@link NativeModule.updatePlayState 原生模块的 `updatePlayState` 方法}
 */
export const sendSmtcPlayState = (status: PlaybackStatus) => {
  if (isElectron && isWin) window.electron.ipcRenderer.send("smtc-update-play-state", { status });
};

/**
 * @description 通过原生插件更新 SMTC 进度信息
 * @param currentTime - 当前的播放进度，单位是毫秒
 * @param totalTime - 总时长，单位是毫秒
 * @see {@link NativeModule.updateTimeline 原生模块的 `updateTimeline` 方法}
 */
export const sendSmtcTimeline = throttle((currentTime: number, totalTime: number) => {
  if (isElectron && isWin)
    window.electron.ipcRenderer.send("smtc-update-timeline", { currentTime, totalTime });
}, 1000);

/**
 * @description 通过原生插件更新 SMTC 播放模式
 *
 * 注意: SPlayer 的随机和循环按钮和网易云是一样合在一起的，需要特殊的逻辑来分开
 * @param isShuffling - 当前是否是随机播放模式
 * @param repeatMode - 当前的循环播放模式，参见 {@link RepeatMode}
 * @see {@link NativeModule.updatePlayMode 原生模块的 `updatePlayMode` 方法}
 */
export const sendSmtcPlayMode = (isShuffling: boolean, repeatMode: RepeatMode) => {
  if (isElectron && isWin)
    window.electron.ipcRenderer.send("smtc-update-play-mode", { isShuffling, repeatMode });
};

/**
 * @description 启用 Discord RPC
 */
export const enableDiscordRpc = () => {
  if (isElectron && isWin) window.electron.ipcRenderer.send("smtc-enable-discord");
};

/**
 * @description 禁用 Discord RPC
 */
export const disableDiscordRpc = () => {
  if (isElectron && isWin) window.electron.ipcRenderer.send("smtc-disable-discord");
};

/**
 * @description 更新 Discord RPC 配置
 * @param payload 配置信息
 */
export const updateDiscordConfig = (payload: {
  showWhenPaused: boolean;
  displayMode: "name" | "state" | "details";
}) => {
  if (isElectron && isWin) {
    const modeMap: Record<string, DiscordDisplayMode> = {
      name: DiscordDisplayMode.Name,
      state: DiscordDisplayMode.State,
      details: DiscordDisplayMode.Details,
    };

    window.electron.ipcRenderer.send("smtc-update-discord-config", {
      showWhenPaused: payload.showWhenPaused,
      displayMode: modeMap[payload.displayMode] ?? DiscordDisplayMode.Name,
    });
  }
};
