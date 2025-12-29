import { ipcMain, BrowserWindow, app } from "electron";
import { join } from "path";
import { loadNativeModule } from "../utils/native-loader";
import { processLog } from "../logger";
import { IpcChannelMap } from "../../../src/types/global";
import { discordRpcManager } from "../utils/discord-rpc";
import { DiscordDisplayMode } from "../../../src/types/smtc";

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

  // 注册原生 SMTC 事件处理器
  const registerNativeSmtcHandler = <K extends keyof IpcChannelMap>(
    channel: K,
    handler: (module: NativeModule, payload: IpcChannelMap[K]) => void,
    errorContext: string,
  ) => {
    ipcMain.on(channel, (_, payload: IpcChannelMap[K]) => {
      if (nativeSmtc) {
        try {
          handler(nativeSmtc, payload);
        } catch (e) {
          processLog.error(`[SMTC] ${errorContext} 失败`, e);
        }
      }
    });
  };

  // 元数据 - Discord
  ipcMain.on("discord-update-metadata", (_, payload: IpcChannelMap["discord-update-metadata"]) => {
    discordRpcManager.updateMetadata(payload);
  });

  // 元数据 - Native SMTC
  registerNativeSmtcHandler(
    "smtc-update-metadata",
    (mod, payload) => mod.updateMetadata(payload),
    "updateMetadata",
  );

  // 播放状态 - Discord
  ipcMain.on(
    "discord-update-play-state",
    (_, payload: IpcChannelMap["discord-update-play-state"]) => {
      discordRpcManager.updatePlayState(payload.status === 0 ? "playing" : "paused"); // PlaybackStatus.Playing = 0
    },
  );

  // 播放状态 - Native SMTC
  registerNativeSmtcHandler(
    "smtc-update-play-state",
    (mod, payload) => mod.updatePlayState(payload),
    "updatePlayState",
  );

  // 进度信息 - Discord
  ipcMain.on("discord-update-timeline", (_, payload: IpcChannelMap["discord-update-timeline"]) => {
    discordRpcManager.updateTimeline({
      currentTime: payload.currentTime,
      totalTime: payload.totalTime,
    });
  });

  // 进度信息 - Native SMTC
  registerNativeSmtcHandler(
    "smtc-update-timeline",
    (mod, payload) => mod.updateTimeline(payload),
    "updateTimeline",
  );

  // 播放模式
  registerNativeSmtcHandler(
    "smtc-update-play-mode",
    (mod, payload) => mod.updatePlayMode(payload),
    "updatePlayMode",
  );

  // Discord - 开启
  ipcMain.on("smtc-enable-discord", () => {
    discordRpcManager.enable();
  });

  // Discord - 关闭
  ipcMain.on("smtc-disable-discord", () => {
    discordRpcManager.disable();
  });

  // Discord - 更新配置
  ipcMain.on(
    "smtc-update-discord-config",
    (_, payload: IpcChannelMap["smtc-update-discord-config"]) => {
      discordRpcManager.updateConfig({
        showWhenPaused: payload.showWhenPaused,
        displayMode: payload.displayMode as DiscordDisplayMode,
      });
    },
  );
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
