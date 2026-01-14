import {
  DiscordConfigPayload,
  MetadataParam,
  PlaybackStatus,
  PlayModePayload,
  SystemMediaEvent,
  TimelinePayload,
} from "@native";
import { app, ipcMain } from "electron";
import { join } from "path";
import { processLog } from "../logger";
import { loadNativeModule } from "../utils/native-loader";
import mainWindow from "../windows/main-window";

// 原生模块类型
type NativeMediaModule = typeof import("@native");

// 原生模块实例
let nativeMedia: NativeMediaModule | null = null;

/**
 * 派发事件到主窗口渲染进程
 */
const emitMediaEvent = (event: SystemMediaEvent) => {
  const mainWin = mainWindow.getWin();
  if (mainWin && !mainWin.isDestroyed()) {
    mainWin.webContents.send("media-event", event);
  }
};

/** 初始化原生媒体插件 */
const initNativeMedia = () => {
  nativeMedia = loadNativeModule("external-media-integration.node", "external-media-integration");
  if (!nativeMedia) {
    processLog.warn("[Media] 找不到原生插件，媒体集成功能将不可用");
    return;
  }

  try {
    const logDir = join(app.getPath("userData"), "logs", "external-media-integration");
    nativeMedia.initialize(logDir);
    processLog.info("[Media] 原生插件已初始化");

    nativeMedia.registerEventHandler((event) => {
      emitMediaEvent(event);
    });

    nativeMedia.enableSystemMedia();
  } catch (e) {
    processLog.error("[Media] 初始化时失败", e);
  }
};

/** 初始化媒体 IPC */
const initMediaIpc = () => {
  // 初始化原生模块
  initNativeMedia();

  // 元数据更新
  ipcMain.on("media-update-metadata", (_, payload: MetadataParam) => {
    if (!nativeMedia) return;
    try {
      nativeMedia.updateMetadata(payload);
    } catch (e) {
      processLog.error("[Media] 更新元数据失败", e);
    }
  });

  // 播放状态更新
  ipcMain.on("media-update-play-state", (_, payload: { status: PlaybackStatus }) => {
    if (!nativeMedia) return;
    try {
      nativeMedia.updatePlayState(payload);
    } catch (e) {
      processLog.error("[Media] 更新播放状态失败", e);
    }
  });

  // 进度更新
  ipcMain.on("media-update-timeline", (_, payload: TimelinePayload) => {
    if (!nativeMedia) return;
    try {
      nativeMedia.updateTimeline(payload);
    } catch (e) {
      processLog.error("[Media] 更新进度失败", e);
    }
  });

  // 播放模式更新
  ipcMain.on("media-update-play-mode", (_, payload: PlayModePayload) => {
    if (!nativeMedia) return;
    try {
      nativeMedia.updatePlayMode(payload);
    } catch (e) {
      processLog.error("[Media] 更新播放模式失败", e);
    }
  });

  // Discord 启用
  ipcMain.on("discord-enable", () => {
    if (nativeMedia) {
      try {
        nativeMedia.enableDiscordRpc();
      } catch (e) {
        processLog.error("[Discord RPC] 启用失败", e);
      }
    }
  });

  // Discord 禁用
  ipcMain.on("discord-disable", () => {
    if (nativeMedia) {
      try {
        nativeMedia.disableDiscordRpc();
      } catch (e) {
        processLog.error("[Discord RPC] 禁用失败", e);
      }
    }
  });

  // Discord 更新配置
  ipcMain.on("discord-update-config", (_, payload: DiscordConfigPayload) => {
    if (nativeMedia) {
      try {
        nativeMedia.updateDiscordConfig(payload);
      } catch (e) {
        processLog.error("[Discord RPC] 更新配置失败", e);
      }
    }
  });

  processLog.info("[Media] 媒体 IPC 已初始化");
};

/**
 * 关闭媒体 IPC
 */
export const shutdownMedia = () => {
  if (nativeMedia) {
    try {
      nativeMedia.shutdown();
    } catch (e) {
      processLog.error("[Media] 关闭时出错", e);
    }
  }

  processLog.info("[Media] 媒体 IPC 已关闭");
};

export default initMediaIpc;
