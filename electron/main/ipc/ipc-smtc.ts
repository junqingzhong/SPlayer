import { ipcMain, BrowserWindow, app } from "electron";
import { join } from "path";
import { loadNativeModule } from "../utils/native-loader";
import { processLog } from "../logger";
import { IpcChannelMap } from "../../../src/types/global";

type NativeModule = typeof import("@native");

let nativeSmtc: NativeModule | null = null;

function registerSmtcHandler<K extends keyof IpcChannelMap>(
  channel: K,
  handler: (module: NativeModule, payload: IpcChannelMap[K]) => void,
) {
  ipcMain.on(channel, (_, payload: IpcChannelMap[K]) => {
    if (!nativeSmtc) return;

    try {
      handler(nativeSmtc, payload);
    } catch (e) {
      processLog.error(`[SMTC] 在 ${channel} 中的错误`, e);
    }
  });
}

export default function initSmtcIpc() {
  if (process.platform !== "win32") {
    return;
  }

  nativeSmtc = loadNativeModule("smtc-for-splayer.node", "smtc-for-splayer");

  if (!nativeSmtc) {
    processLog.warn("[SMTC] 找不到原生插件");
    return;
  }

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

  // 元数据
  registerSmtcHandler("smtc-update-metadata", (mod, payload) => {
    mod.updateMetadata(payload);
  });

  // 播放状态
  registerSmtcHandler("smtc-update-play-state", (mod, payload) => {
    mod.updatePlayState(payload);
  });

  // 进度信息
  registerSmtcHandler("smtc-update-timeline", (mod, payload) => {
    mod.updateTimeline(payload);
  });

  // 播放模式
  registerSmtcHandler("smtc-update-play-mode", (mod, payload) => {
    mod.updatePlayMode(payload);
  });
}

export function shutdownSmtc() {
  if (nativeSmtc) {
    try {
      nativeSmtc.shutdown();
    } catch (e) {
      processLog.error("[SMTC] 关闭时出错", e);
    }
  }
}
