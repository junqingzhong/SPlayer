import { ipcMain, BrowserWindow, app } from "electron";
import { join } from "path";
import { loadNativeModule } from "../utils/native-loader";
import { processLog } from "../logger";
import {
  type MetadataParam,
  type PlayStatePayload,
  type TimelinePayload,
  type PlayModePayload,
} from "@native";

type NativeModule = typeof import("@native");

let nativeSmtc: NativeModule | null = null;

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

  ipcMain.on("smtc-update-metadata", (_, payload: MetadataParam) => {
    try {
      if (nativeSmtc) nativeSmtc.updateMetadata(payload);
    } catch (e) {
      processLog.error("[SMTC] 更新元数据失败", e);
    }
  });

  ipcMain.on("smtc-update-play-state", (_, payload: PlayStatePayload) => {
    try {
      if (nativeSmtc) nativeSmtc.updatePlayState(payload);
    } catch (e) {
      processLog.error("[SMTC] 更新播放状态失败", e);
    }
  });

  ipcMain.on("smtc-update-timeline", (_, payload: TimelinePayload) => {
    try {
      if (nativeSmtc) nativeSmtc.updateTimeline(payload);
    } catch (e) {
      processLog.error("[SMTC] 更新时间信息失败", e);
    }
  });

  ipcMain.on("smtc-update-play-mode", (_, payload: PlayModePayload) => {
    try {
      if (nativeSmtc) nativeSmtc.updatePlayMode(payload);
    } catch (e) {
      processLog.error("[SMTC] 更新播放模式失败", e);
    }
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
