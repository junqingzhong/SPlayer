import { ipcMain, BrowserWindow, app } from "electron";
import { join } from "path";
import { loadNativeModule } from "../utils/native-loader";
import { processLog } from "../logger";
import { IpcChannelMap } from "../../../src/types/global";
import { discordRpcManager, DiscordDisplayMode } from "../utils/discord-rpc";

type NativeModule = typeof import("@native");

let nativeSmtc: NativeModule | null = null;

export default function initSmtcIpc() {
  nativeSmtc = loadNativeModule("smtc-for-splayer.node", "smtc-for-splayer");

  if (!nativeSmtc) {
    processLog.warn("[SMTC] 找不到原生插件，SMTC 功能将不可用");
  } else {
    try {
      const logDir = join(app.getPath("userData"), "logs", "smtc");
      nativeSmtc.initialize(logDir);
      processLog.info("[SMTC] SMTC 原生插件已初始化");

      nativeSmtc.registerEventHandler((event) => {
        const wins = BrowserWindow.getAllWindows();
        if (wins.length > 0) {
          wins.forEach((win) => {
            if (!win.isDestroyed()) {
              win.webContents.send("smtc-event", event);
            }
          });
        }
      });

      nativeSmtc.enableSmtc();
    } catch (e) {
      processLog.error("[SMTC] 初始化时失败", e);
    }
  }

  // 元数据 - Discord
  ipcMain.on("discord-update-metadata", (_, payload: IpcChannelMap["discord-update-metadata"]) => {
    discordRpcManager.updateMetadata(payload);
  });

  // 元数据 - Native SMTC
  ipcMain.on("smtc-update-metadata", (_, payload: IpcChannelMap["smtc-update-metadata"]) => {
    if (nativeSmtc) {
      try {
        nativeSmtc.updateMetadata(payload);
      } catch (e) {
        processLog.error("[SMTC] updateMetadata 失败", e);
      }
    }
  });

  // 播放状态 - Discord
  ipcMain.on("discord-update-play-state", (_, payload: IpcChannelMap["discord-update-play-state"]) => {
    discordRpcManager.updatePlayState(payload.status === 0 ? "playing" : "paused"); // PlaybackStatus.Playing = 0
  });

  // 播放状态 - Native SMTC
  ipcMain.on("smtc-update-play-state", (_, payload: IpcChannelMap["smtc-update-play-state"]) => {
    if (nativeSmtc) {
      try {
        nativeSmtc.updatePlayState(payload);
      } catch (e) {
        processLog.error("[SMTC] updatePlayState 失败", e);
      }
    }
  });

  // 进度信息 - Discord
  ipcMain.on("discord-update-timeline", (_, payload: IpcChannelMap["discord-update-timeline"]) => {
    discordRpcManager.updateTimeline({
      currentTime: payload.currentTime,
      totalTime: payload.totalTime,
    });
  });

  // 进度信息 - Native SMTC
  ipcMain.on("smtc-update-timeline", (_, payload: IpcChannelMap["smtc-update-timeline"]) => {
    if (nativeSmtc) {
      try {
        nativeSmtc.updateTimeline(payload);
      } catch (e) {
        processLog.error("[SMTC] updateTimeline 失败", e);
      }
    }
  });

  // 播放模式
  ipcMain.on("smtc-update-play-mode", (_, payload: IpcChannelMap["smtc-update-play-mode"]) => {
    if (nativeSmtc) {
      try {
        nativeSmtc.updatePlayMode(payload);
      } catch (e) {
        processLog.error("[SMTC] updatePlayMode 失败", e);
      }
    }
  });

  // Discord - 开启
  ipcMain.on("smtc-enable-discord", () => {
    discordRpcManager.enable();
  });

  // Discord - 关闭
  ipcMain.on("smtc-disable-discord", () => {
    discordRpcManager.disable();
  });

  // Discord - 更新配置
  ipcMain.on("smtc-update-discord-config", (_, payload: IpcChannelMap["smtc-update-discord-config"]) => {
    discordRpcManager.updateConfig({
      showWhenPaused: payload.showWhenPaused,
      displayMode: payload.displayMode as unknown as DiscordDisplayMode,
    });
  });
}

export function shutdownSmtc() {
  discordRpcManager.disable();
  if (nativeSmtc) {
    try {
      nativeSmtc.shutdown();
    } catch (e) {
      processLog.error("[SMTC] 关闭时出错", e);
    }
  }
}
