import { ipcMain, BrowserWindow, app } from "electron";
import { join } from "path";
import { loadNativeModule } from "../utils/native-loader";
import { processLog } from "../logger";
import { IpcChannelMap } from "../../../src/types/global";

type NativeSmtcModule = typeof import("@native");
type DiscordRpcModule = typeof import("@discord-rpc");

let nativeSmtc: NativeSmtcModule | null = null;
let discordRpcNative: DiscordRpcModule | null = null;

export default function initSmtcIpc() {
  // 加载 SMTC 原生模块（仅 Windows）
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

  // 加载 Discord RPC 原生模块（跨平台）
  discordRpcNative = loadNativeModule("discord-rpc-for-splayer.node", "discord-rpc-for-splayer");

  if (!discordRpcNative) {
    processLog.warn("[Discord RPC] 找不到原生插件，Discord RPC 功能将不可用");
  } else {
    try {
      discordRpcNative.initialize();
      processLog.info("[Discord RPC] Discord RPC 原生插件已初始化");
    } catch (e) {
      processLog.error("[Discord RPC] 初始化失败", e);
    }
  }

  // 注册原生 SMTC 事件处理器
  const registerNativeSmtcHandler = <K extends keyof IpcChannelMap>(
    channel: K,
    handler: (module: NativeSmtcModule, payload: IpcChannelMap[K]) => void,
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

  // 注册 Discord RPC 事件处理器
  const registerDiscordRpcHandler = <K extends keyof IpcChannelMap>(
    channel: K,
    handler: (module: DiscordRpcModule, payload: IpcChannelMap[K]) => void,
    errorContext: string,
  ) => {
    ipcMain.on(channel, (_, payload: IpcChannelMap[K]) => {
      if (discordRpcNative) {
        try {
          handler(discordRpcNative, payload);
        } catch (e) {
          processLog.error(`[Discord RPC] ${errorContext} 失败`, e);
        }
      }
    });
  };

  // 元数据 - Discord
  registerDiscordRpcHandler(
    "discord-update-metadata",
    (mod, payload) => mod.updateMetadata(payload),
    "updateMetadata",
  );

  // 元数据 - Native SMTC
  registerNativeSmtcHandler(
    "smtc-update-metadata",
    (mod, payload) => mod.updateMetadata(payload),
    "updateMetadata",
  );

  // 播放状态 - Discord
  registerDiscordRpcHandler(
    "discord-update-play-state",
    (mod, payload) => mod.updatePlayState(payload),
    "updatePlayState",
  );

  // 播放状态 - Native SMTC
  registerNativeSmtcHandler(
    "smtc-update-play-state",
    (mod, payload) => mod.updatePlayState(payload),
    "updatePlayState",
  );

  // 进度信息 - Discord
  registerDiscordRpcHandler(
    "discord-update-timeline",
    (mod, payload) => mod.updateTimeline(payload),
    "updateTimeline",
  );

  // 进度信息 - Native SMTC
  registerNativeSmtcHandler(
    "smtc-update-timeline",
    (mod, payload) => mod.updateTimeline(payload),
    "updateTimeline",
  );

  // 播放模式 - Native SMTC
  registerNativeSmtcHandler(
    "smtc-update-play-mode",
    (mod, payload) => mod.updatePlayMode(payload),
    "updatePlayMode",
  );

  // Discord - 开启
  ipcMain.on("smtc-enable-discord", () => {
    if (discordRpcNative) {
      try {
        discordRpcNative.enable();
      } catch (e) {
        processLog.error("[Discord RPC] 启用失败", e);
      }
    }
  });

  // Discord - 关闭
  ipcMain.on("smtc-disable-discord", () => {
    if (discordRpcNative) {
      try {
        discordRpcNative.disable();
      } catch (e) {
        processLog.error("[Discord RPC] 禁用失败", e);
      }
    }
  });

  // Discord - 更新配置
  registerDiscordRpcHandler(
    "smtc-update-discord-config",
    (mod, payload) => mod.updateConfig(payload),
    "updateConfig",
  );
}

export function shutdownSmtc() {
  if (discordRpcNative) {
    try {
      discordRpcNative.shutdown();
    } catch (e) {
      processLog.error("[Discord RPC] 关闭时出错", e);
    }
  }

  if (nativeSmtc) {
    try {
      nativeSmtc.shutdown();
    } catch (e) {
      processLog.error("[SMTC] 关闭时出错", e);
    }
  }
}
