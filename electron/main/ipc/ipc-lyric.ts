import { BrowserWindow, ipcMain, screen } from "electron";
import { useStore } from "../store";
import { isLinux } from "../utils/config";
import lyricWindow from "../windows/lyric-window";
import mainWindow from "../windows/main-window";

/**
 * 桌面歌词管理器
 * 负责歌词窗口的生命周期、状态管理及 IPC 通信
 */
class DesktopLyricManager {
  private restoreTimer: NodeJS.Timeout | null = null;
  private isLocked: boolean = false;
  private store = useStore();

  constructor() {
    this.isLocked = this.store.get("lyric.config")?.isLock ?? false;
    this.registerIpc();
  }

  /**
   * 获取歌词窗口实例
   */
  private get window(): BrowserWindow | null {
    return lyricWindow.getWin();
  }

  /**
   * 检查窗口是否存活
   */
  private get isValid(): boolean {
    return !!this.window && !this.window.isDestroyed();
  }

  /**
   * 安全发送 IPC 消息
   */
  private send(channel: string, ...args: any[]) {
    if (this.isValid) {
      this.window!.webContents.send(channel, ...args);
    }
  }

  /**
   * 设置鼠标穿透
   * @param enableForward 是否允许事件穿透（用于显示解锁按钮）
   */
  private setMouseEvents(enableForward: boolean) {
    if (!this.isValid || !this.isLocked) return;
    this.window!.setIgnoreMouseEvents(true, enableForward ? { forward: true } : undefined);
  }

  /**
   * 处理主窗口移动/调整大小事件
   * 此时应暂时禁用鼠标穿透，避免干扰窗口操作
   */
  private onMainWinInteract = () => {
    if (!this.isLocked) return;

    // 立即禁用 forward，防止操作冲突
    this.setMouseEvents(false);

    // 防抖恢复
    if (this.restoreTimer) clearTimeout(this.restoreTimer);
    this.restoreTimer = setTimeout(() => this.setMouseEvents(true), 300);
  };

  /**
   * 处理主窗口移动/调整大小结束事件
   */
  private onMainWinInteractEnd = () => {
    if (!this.isLocked) return;
    if (this.restoreTimer) clearTimeout(this.restoreTimer);
    this.setMouseEvents(true);
  };

  /**
   * 绑定主窗口事件监听
   */
  private bindMainWinEvents() {
    const mainWin = mainWindow.getWin();
    if (!mainWin) return;

    // 基础事件监听
    mainWin.on("move", this.onMainWinInteract);
    mainWin.on("resize", this.onMainWinInteract);

    // 平台特定优化
    if (!isLinux) {
      mainWin.on("moved", this.onMainWinInteractEnd);
      mainWin.on("resized", this.onMainWinInteractEnd);
    }
  }

  /**
   * 解绑主窗口事件监听
   */
  private unbindMainWinEvents() {
    const mainWin = mainWindow.getWin();
    if (!mainWin) return;

    mainWin.removeListener("move", this.onMainWinInteract);
    mainWin.removeListener("resize", this.onMainWinInteract);

    if (!isLinux) {
      mainWin.removeListener("moved", this.onMainWinInteractEnd);
      mainWin.removeListener("resized", this.onMainWinInteractEnd);
    }

    if (this.restoreTimer) {
      clearTimeout(this.restoreTimer);
      this.restoreTimer = null;
    }
  }

  /**
   * 注册 IPC 监听器
   */
  private registerIpc() {
    // 切换桌面歌词显示/隐藏
    ipcMain.on("toggle-desktop-lyric", (_, show: boolean) => {
      if (show) {
        if (!this.isValid) {
          const win = lyricWindow.create();
          if (win) {
            // 窗口关闭时清理事件
            win.on("closed", () => this.unbindMainWinEvents());

            // 初始化位置
            const { x, y } = this.store.get("lyric");
            if (Number.isFinite(x) && Number.isFinite(y)) {
              win.setPosition(Math.round(Number(x)), Math.round(Number(y)));
            }

            // 绑定主窗口联动
            this.bindMainWinEvents();

            // 初始状态设置
            if (this.isLocked) {
              win.setIgnoreMouseEvents(true, { forward: true });
            }
          }
        } else {
          this.window!.show();
        }

        if (this.isValid) {
          this.window!.setAlwaysOnTop(true, "screen-saver");
        }
      } else {
        if (this.isValid) {
          this.unbindMainWinEvents();
          this.window!.close();
        }
      }
    });

    // 数据更新类 IPC
    ipcMain.on("update-desktop-lyric-data", (_, data) => {
      if (data) this.send("update-desktop-lyric-data", data);
    });

    ipcMain.on("play-status-change", (_, status) => {
      this.send("update-desktop-lyric-data", { playStatus: status });
    });

    ipcMain.on("play-lyric-change", (_, data) => {
      if (data) this.send("update-desktop-lyric-data", data);
    });

    // 配置更新
    ipcMain.on("update-desktop-lyric-option", (_, option, callback = false) => {
      if (!option) return;

      const prevOption = this.store.get("lyric.config");
      const newOption = { ...prevOption, ...option };
      this.store.set("lyric.config", newOption);

      if (callback) {
        this.send("update-desktop-lyric-option", newOption);
      }

      const mainWin = mainWindow.getWin();
      if (mainWin && !mainWin.isDestroyed()) {
        mainWin.webContents.send("update-desktop-lyric-option", newOption);
      }
    });

    // 窗口尺寸与位置管理
    ipcMain.handle("get-window-bounds", () => {
      return this.isValid ? this.window!.getBounds() : {};
    });

    ipcMain.on("move-window", (_, x, y, width, height) => {
      if (!this.isValid) return;
      this.window!.setBounds({ x, y, width, height });
      this.store.set("lyric", { ...this.store.get("lyric"), x, y, width, height });
    });

    ipcMain.on("update-lyric-size", (_, width, height) => {
      if (!this.isValid) return;
      this.window!.setBounds({ width, height });
      this.store.set("lyric", { ...this.store.get("lyric"), width, height });
    });

    ipcMain.on("update-window-height", (_, height) => {
      if (!this.isValid) return;
      const { width } = this.window!.getBounds();
      this.window!.setBounds({ width, height });
      this.store.set("lyric", { ...this.store.get("lyric"), height });
    });

    // 锁定状态管理
    ipcMain.on(
      "toggle-desktop-lyric-lock",
      (_, { lock, temp }: { lock: boolean; temp?: boolean }) => {
        if (!temp) this.isLocked = lock;

        if (this.isValid) {
          if (lock) {
            this.window!.setIgnoreMouseEvents(true, { forward: true });
          } else {
            this.window!.setIgnoreMouseEvents(false);
          }
        }

        if (!temp) {
          this.store.set("lyric.config.isLock", lock);
          const config = this.store.get("lyric.config");
          const mainWin = mainWindow.getWin();
          if (mainWin && !mainWin.isDestroyed()) {
            mainWin.webContents.send("update-desktop-lyric-option", config);
          }
        }
      },
    );

    // 屏幕信息工具
    ipcMain.handle("get-screen-size", () => {
      const { width, height } = screen.getPrimaryDisplay().workAreaSize;
      return { width, height };
    });

    ipcMain.handle("get-virtual-screen-bounds", () => {
      const displays = screen.getAllDisplays();
      const bounds = displays.map((d) => d.workArea);
      return {
        minX: Math.min(...bounds.map((b) => b.x)),
        minY: Math.min(...bounds.map((b) => b.y)),
        maxX: Math.max(...bounds.map((b) => b.x + b.width)),
        maxY: Math.max(...bounds.map((b) => b.y + b.height)),
      };
    });

    // 杂项
    ipcMain.on("toggle-fixed-max-size", (_, { width, height, fixed }) => {
      if (!this.isValid) return;
      if (fixed) {
        this.window!.setMaximumSize(width, height);
      } else {
        this.window!.setMaximumSize(1400, 360);
      }
    });

    ipcMain.on("request-desktop-lyric-data", () => {
      const mainWin = mainWindow.getWin();
      if (this.isValid && mainWin && !mainWin.isDestroyed()) {
        mainWin.webContents.send("request-desktop-lyric-data");
      }
    });

    ipcMain.handle("request-desktop-lyric-option", () => {
      const config = this.store.get("lyric.config");
      this.send("update-desktop-lyric-option", config);
      return config;
    });

    ipcMain.on("close-desktop-lyric", () => {
      const mainWin = mainWindow.getWin();
      if (this.isValid) {
        this.window!.hide();
      }
      if (mainWin && !mainWin.isDestroyed()) {
        mainWin.webContents.send("close-desktop-lyric");
      }
    });
  }
}

/**
 * 初始化歌词 IPC
 */
const initLyricIpc = (): void => {
  new DesktopLyricManager();
};

export default initLyricIpc;
