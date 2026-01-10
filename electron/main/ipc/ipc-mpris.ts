import { ipcMain, BrowserWindow } from "electron";
import { IpcChannelMap } from "../../../src/types/global";
import { processLog } from "../logger";
import { loadNativeModule } from "../utils/native-loader";

type NativeMprisModule = typeof import("@mpris");

let nativeMpris: NativeMprisModule | null = null;
let mprisInstance: InstanceType<NativeMprisModule["SPlayerMpris"]> | null = null;

/**
 * 注册 IPC 处理函数
 */
const registerHandler = <K extends keyof IpcChannelMap>(
  channel: K,
  handler: (payload: IpcChannelMap[K]) => void,
  errorContext: string,
) => {
  ipcMain.on(channel, (_, payload: IpcChannelMap[K]) => {
    if (mprisInstance) {
      try {
        handler(payload);
      } catch (e) {
        processLog.error(`[MPRIS] ${errorContext} 失败`, e);
      }
    }
  });
};

export default function initMprisIpc() {
  // 仅在 Linux 上加载 MPRIS 原生模块
  if (process.platform !== "linux") {
    processLog.info("[MPRIS] 非 Linux 系统，跳过 MPRIS 初始化");
    return;
  }

  nativeMpris = loadNativeModule("mpris-for-splayer.node", "mpris-for-splayer");

  if (!nativeMpris) {
    processLog.warn("[MPRIS] 找不到原生插件，MPRIS 功能将不可用");
  } else {
    try {
      // 创建 MPRIS 实例
      mprisInstance = new nativeMpris.SPlayerMpris();

      // 注册事件处理器
      mprisInstance.registerEventHandler((event) => {
        if (!event || !event.eventType) {
          processLog.warn("[MPRIS] 收到无效的事件:", event);
          return;
        }
        const wins = BrowserWindow.getAllWindows();
        if (wins.length > 0) {
          wins.forEach((win) => {
            if (!win.isDestroyed()) {
              win.webContents.send("mpris-event", event);
            }
          });
        }
      });

      processLog.info("[MPRIS] MPRIS 原生插件已初始化");
    } catch (e) {
      processLog.error("[MPRIS] 初始化时失败", e);
    }
  }

  // 元数据更新
  registerHandler(
    "mpris-update-metadata",
    (payload) => {
      mprisInstance!.setMetadata({
        title: payload.title,
        artist: payload.artist,
        album: payload.album,
        length: payload.length,
        url: payload.url,
      });
    },
    "updateMetadata",
  );

  // 播放状态更新
  registerHandler(
    "mpris-update-play-state",
    (payload) => mprisInstance!.setPlaybackStatus(payload.status),
    "updatePlayState",
  );

  // 进度更新
  registerHandler(
    "mpris-update-timeline",
    (payload) => {
      // 转换为微秒
      const position = payload.position * 1000;
      const length = payload.length * 1000;
      mprisInstance!.setProgress(position, length);
    },
    "updateTimeline",
  );

  // 循环模式更新
  registerHandler(
    "mpris-update-loop-status",
    (payload) => mprisInstance!.setLoopStatus(payload.status),
    "updateLoopStatus",
  );

  // 随机播放更新
  registerHandler(
    "mpris-update-shuffle",
    (payload) => mprisInstance!.setShuffle(payload.shuffle),
    "updateShuffle",
  );

  // 音量更新
  registerHandler(
    "mpris-update-volume",
    (payload) => mprisInstance!.setVolume(payload.volume),
    "updateVolume",
  );
}

export function shutdownMpris() {
  if (mprisInstance) {
    try {
      // MPRIS 实例会在析构时自动清理
      mprisInstance = null;
      processLog.info("[MPRIS] MPRIS 已关闭");
    } catch (e) {
      processLog.error("[MPRIS] 关闭时出错", e);
    }
  }
}
