import { TASKBAR_IPC_CHANNELS, type SyncStatePayload, type TaskbarConfig } from "@shared";
import { app, ipcMain, nativeTheme } from "electron";
import type EventEmitter from "node:events";
import { useStore } from "../store";
import { getMainTray } from "../tray";
import mainWindow from "../windows/main-window";
import taskbarLyricManager from "../utils/taskbar-lyric-manager";

let cachedIsPlaying = false;

const getTaskbarConfig = (): TaskbarConfig => {
  const store = useStore();
  return {
    mode: store.get("taskbar.mode", "taskbar"),
    maxWidth: store.get("taskbar.maxWidth", 300),
    position: store.get("taskbar.position", "automatic"),
    autoShrink: store.get("taskbar.autoShrink", false),
    margin: store.get("taskbar.margin", 10),
    minWidth: store.get("taskbar.minWidth", 10),
    enabled: store.get("taskbar.enabled", false),
    floatingAlign: store.get("taskbar.floatingAlign", "right"),
    floatingAutoWidth: store.get("taskbar.floatingAutoWidth", true),
    floatingWidth: store.get("taskbar.floatingWidth", 300),
    floatingHeight: store.get("taskbar.floatingHeight", 48),
    floatingAlwaysOnTop: store.get("taskbar.floatingAlwaysOnTop", false),

    showWhenPaused: store.get("taskbar.showWhenPaused", true),
    showCover: store.get("taskbar.showCover", true),
    themeMode: store.get("taskbar.themeMode", "auto"),
    fontFamily: store.get("taskbar.fontFamily", "system-ui"),
    fontWeight: store.get("taskbar.fontWeight", 0),
    animationMode: store.get("taskbar.animationMode", "slide-blur"),
    singleLineMode: store.get("taskbar.singleLineMode", false),
    showWordLyrics: store.get("taskbar.showWordLyrics", true),
    showTranslation: store.get("taskbar.showTranslation", true),
    lineHeight: store.get("taskbar.lineHeight", 1.1),
    fontSize: store.get("taskbar.fontSize", 14),
    mainScale: store.get("taskbar.mainScale", 1.0),
    subScale: store.get("taskbar.subScale", 0.8),
  };
};

const updateWindowVisibility = (config: TaskbarConfig) => {
  const tray = getMainTray();
  if (tray) tray.setTaskbarLyricShow(config.enabled);
  if (!config.enabled) {
    taskbarLyricManager.close(false);
    return;
  }
  taskbarLyricManager.create(config.mode);
  const shouldBeVisible = cachedIsPlaying || config.showWhenPaused;
  taskbarLyricManager.setVisibility(shouldBeVisible);
};

const updateWindowLayout = (animate: boolean = true) => {
  taskbarLyricManager.updateLayout(animate);
};

const applyTaskbarOption = (option: Partial<TaskbarConfig>, pushToWindow: boolean) => {
  const store = useStore();
  const prev = getTaskbarConfig();
  const next = { ...prev, ...option };
  Object.entries(next).forEach(([key, value]) => {
    store.set(`taskbar.${key}`, value);
  });
  if (pushToWindow) {
    taskbarLyricManager.send(TASKBAR_IPC_CHANNELS.SYNC_STATE, {
      type: "config-update",
      data: option,
    } as SyncStatePayload);
  }
  updateWindowVisibility(next);
  if (next.enabled) {
    updateWindowLayout(false);
  }
};

const initTaskbarIpc = () => {
  const store = useStore();
  const initialConfig = getTaskbarConfig();
  if (initialConfig.enabled) {
    taskbarLyricManager.create(initialConfig.mode);
    updateWindowVisibility(initialConfig);
  }

  ipcMain.on("taskbar:set-width", (_event, width: number) => {
    taskbarLyricManager.setContentWidth(width);
  });

  ipcMain.handle(TASKBAR_IPC_CHANNELS.GET_OPTION, () => getTaskbarConfig());

  ipcMain.on(TASKBAR_IPC_CHANNELS.SET_OPTION, (_event, option: Partial<TaskbarConfig>, pushToWindow = true) => {
    if (!option) return;
    applyTaskbarOption(option, pushToWindow);
  });

  ipcMain.on(TASKBAR_IPC_CHANNELS.SYNC_STATE, (_event, payload: SyncStatePayload) => {
    if (payload.type === "playback-state") {
      const wasPlaying = cachedIsPlaying;
      cachedIsPlaying = payload.data.isPlaying;

      if (wasPlaying !== cachedIsPlaying) {
        updateWindowVisibility(getTaskbarConfig());
      }
    } else if (payload.type === "full-hydration" && payload.data.playback) {
      cachedIsPlaying = payload.data.playback.isPlaying;
      updateWindowVisibility(getTaskbarConfig());
    }

    taskbarLyricManager.send(TASKBAR_IPC_CHANNELS.SYNC_STATE, payload);
  });

  ipcMain.on(TASKBAR_IPC_CHANNELS.SYNC_TICK, (_event, payload) => {
    taskbarLyricManager.send(TASKBAR_IPC_CHANNELS.SYNC_TICK, payload);
  });

  ipcMain.on(TASKBAR_IPC_CHANNELS.REQUEST_DATA, () => {
    const mainWin = mainWindow.getWin();
    if (mainWin && !mainWin.isDestroyed()) {
      mainWin.webContents.send(TASKBAR_IPC_CHANNELS.REQUEST_DATA);
    }

    taskbarLyricManager.updateLayout(false);

    const isDark = nativeTheme.shouldUseDarkColors;
    taskbarLyricManager.send(TASKBAR_IPC_CHANNELS.SYNC_STATE, {
      type: "system-theme",
      data: { isDark },
    } as SyncStatePayload);
  });

  ipcMain.on("taskbar:fade-done", () => {
    taskbarLyricManager.handleFadeDone();
  });

  // 把事件发射到 app 里不太好，但是我觉得也没有必要为了这一个事件创建一个事件总线
  // TODO: 如果有了事件总线，通过那个事件总线发射这个事件
  (app as EventEmitter).on("explorer-restarted", () => {
    const currentEnabled = store.get("taskbar.enabled");
    const currentMode = store.get("taskbar.mode", "taskbar");
    if (currentEnabled && currentMode === "taskbar") {
      taskbarLyricManager.close(false);
      setTimeout(() => {
        taskbarLyricManager.create("taskbar");
      }, 500);
    }
  });
};

export default initTaskbarIpc;
