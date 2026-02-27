import { TASKBAR_IPC_CHANNELS } from "@shared";
import { type BrowserWindow, nativeTheme, screen } from "electron";
import { useStore } from "../store";
import { isDev, port } from "../utils/config";
import { createWindow } from "./index";

const floatingTaskbarLyricUrl =
  isDev && process.env.ELECTRON_RENDERER_URL
    ? `${process.env.ELECTRON_RENDERER_URL}/#/taskbar-lyric?win=taskbar-lyric&mode=floating`
    : `http://localhost:${port}/#/taskbar-lyric?win=taskbar-lyric&mode=floating`;

class FloatingTaskbarLyricWindow {
  private win: BrowserWindow | null = null;
  private themeListener: (() => void) | null = null;
  private contentWidth = 300;
  private shouldBeVisible = false;
  private isFadingOut = false;

  create(): BrowserWindow | null {
    if (this.win && !this.win.isDestroyed()) {
      this.win.show();
      return this.win;
    }

    const store = useStore();
    const primaryDisplay = screen.getPrimaryDisplay();
    const workArea = primaryDisplay.workArea;

    const x = store.get("taskbar.floatingX", Math.round(workArea.x + workArea.width / 2 - 150));
    const y = store.get("taskbar.floatingY", Math.round(workArea.y + workArea.height - 120));

    this.win = createWindow({
      width: 300,
      height: 48,
      minWidth: 100,
      minHeight: 30,
      maxWidth: workArea.width,
      maxHeight: 100,
      x,
      y,
      type: "toolbar",
      frame: false,
      transparent: true,
      backgroundColor: "#00000000",
      hasShadow: false,
      show: false,
      skipTaskbar: true,
      minimizable: false,
      maximizable: false,
      fullscreenable: false,
      resizable: false,
      movable: true,
      webPreferences: {
        zoomFactor: 1.0,
        partition: "persist:taskbar-lyric",
      },
    });

    if (!this.win) return null;

    this.win.loadURL(floatingTaskbarLyricUrl);

    const sendTheme = () => {
      if (this.win && !this.win.isDestroyed()) {
        const isDark = nativeTheme.shouldUseDarkColors;
        this.win.webContents.send(TASKBAR_IPC_CHANNELS.SYNC_STATE, {
          type: "system-theme",
          data: { isDark },
        });
      }
    };

    if (!this.themeListener) {
      this.themeListener = sendTheme;
      nativeTheme.on("updated", this.themeListener);
    }

    this.win.once("ready-to-show", () => {
      if (!this.win || this.win.isDestroyed()) return;
      if (this.shouldBeVisible) {
        this.win.show();
      }
      this.updateLayout(false);
      sendTheme();
    });

    this.win.on("move", () => {
      if (!this.win || this.win.isDestroyed()) return;
      const { x, y } = this.win.getBounds();
      store.set("taskbar.floatingX", x);
      store.set("taskbar.floatingY", y);
    });

    this.win.on("closed", () => {
      this.destroy();
      this.win = null;
    });

    return this.win;
  }

  private getMaxWidthPercent(screenWidth: number) {
    const store = useStore();
    let maxWidthSetting = store.get("taskbar.maxWidth", 30);
    if (maxWidthSetting > 100) {
      const converted = Math.round((maxWidthSetting / screenWidth) * 100);
      maxWidthSetting = Math.min(Math.max(converted, 10), 100);
      store.set("taskbar.maxWidth", maxWidthSetting);
      return maxWidthSetting;
    }
    return Math.min(Math.max(maxWidthSetting, 10), 100);
  }

  updateLayout(_animate: boolean = false) {
    if (!this.win || this.win.isDestroyed()) return;

    const primaryDisplay = screen.getPrimaryDisplay();
    const maxWidthPercent = this.getMaxWidthPercent(primaryDisplay.workAreaSize.width);
    const maxWidth = Math.round((primaryDisplay.workAreaSize.width * maxWidthPercent) / 100);

    const nextWidth = Math.min(Math.max(Math.round(this.contentWidth), 100), maxWidth);
    const bounds = this.win.getBounds();
    if (bounds.width !== nextWidth) {
      this.win.setBounds({ width: nextWidth });
    }
  }

  setContentWidth(width: number) {
    if (this.contentWidth !== width) {
      this.contentWidth = width;
      this.updateLayout(false);
    }
  }

  setVisibility(shouldShow: boolean) {
    this.shouldBeVisible = shouldShow;

    if (!this.win || this.win.isDestroyed()) return;

    if (shouldShow) {
      this.isFadingOut = false;
      if (!this.win.isVisible()) {
        this.win.show();
      }
      this.win.webContents.send("taskbar:fade-in");
    } else {
      if (this.win.isVisible() && !this.isFadingOut) {
        this.isFadingOut = true;
        this.win.webContents.send("taskbar:fade-out");
      }
    }
  }

  handleFadeDone() {
    if (this.isFadingOut && this.win && !this.win.isDestroyed()) {
      this.win.hide();
      this.isFadingOut = false;
    }
  }

  close() {
    if (this.win && !this.win.isDestroyed()) {
      this.win.close();
    } else {
      this.win = null;
    }
  }

  destroy() {
    if (this.themeListener) {
      nativeTheme.removeListener("updated", this.themeListener);
      this.themeListener = null;
    }
  }

  send(channel: string, ...args: unknown[]) {
    if (this.win && !this.win.isDestroyed()) {
      this.win.webContents.send(channel, ...args);
    }
  }
}

export default new FloatingTaskbarLyricWindow();

