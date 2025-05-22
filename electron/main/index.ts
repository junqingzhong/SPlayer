import { app, shell, BrowserWindow, BrowserWindowConstructorOptions, session } from "electron";
import { electronApp } from "@electron-toolkit/utils";
import { join } from "path";
import { release, type } from "os";
import { isDev, isMac, appName } from "./utils";
import { unregisterShortcuts } from "./shortcut";
import { initTray, MainTray } from "./tray";
import { initThumbar, Thumbar } from "./thumbar";
import { type StoreType, initStore } from "./store";
import Store from "electron-store";
import initAppServer from "../server";
import initIpcMain from "./ipcMain";
import log from "./logger";
// icon
import icon from "../../public/icons/favicon.png?asset";

// 屏蔽报错
process.env.ELECTRON_DISABLE_SECURITY_WARNINGS = "true";

// 模拟打包
Object.defineProperty(app, "isPackaged", {
  get() {
    return true;
  },
});

// Check for Docker mode
const isDockerMode = process.env.SPLAYER_DOCKER_MODE === "true";

if (isDockerMode) {
  log.info("🚀 SPlayer running in Docker mode (backend server only).");
  // Initialize store for server (optional, if server needs access to settings)
  // initStore(); // Consider if server needs settings access directly
  initAppServer().catch(err => {
    log.error("🚫 Failed to start AppServer in Docker mode:", err);
    process.exit(1);
  });
} else {
  log.info("🚀 SPlayer running in Electron mode.");
  // 主进程
  class MainProcess {
    // 窗口
  mainWindow: BrowserWindow | null = null;
  lyricWindow: BrowserWindow | null = null;
  loadingWindow: BrowserWindow | null = null;
  // store
  store: Store<StoreType> | null = null;
  // 托盘
  mainTray: MainTray | null = null;
  // 工具栏
  thumbar: Thumbar | null = null;
  // 是否退出
  isQuit: boolean = false;
  constructor() {
    log.info("🚀 Main process startup");
    // 禁用 Windows 7 的 GPU 加速功能
    if (release().startsWith("6.1") && type() == "Windows_NT") app.disableHardwareAcceleration();
    // 单例锁
    if (!app.requestSingleInstanceLock()) {
      log.error("❌ There is already a program running and this process is terminated");
      app.quit();
      process.exit(0);
    } else this.showWindow();
    // 准备就绪
    app.on("ready", async () => {
      log.info("🚀 Application Process Startup");
      // 设置应用程序名称
      electronApp.setAppUserModelId("com.imsyy.splayer");
      // 初始化 store
      this.store = initStore();
      // 启动主服务进程
      await initAppServer();
      // 启动进程
      this.createLoadingWindow();
      this.createMainWindow();
      this.createLyricsWindow();
      this.handleAppEvents();
      this.handleWindowEvents();
      // 注册其他服务
      this.mainTray = initTray(this.mainWindow!, this.lyricWindow!);
      this.thumbar = initThumbar(this.mainWindow!);
      // 注册主进程事件
      initIpcMain(
        this.mainWindow,
        this.lyricWindow,
        this.loadingWindow,
        this.mainTray,
        this.thumbar,
        this.store,
      );
    });
  }
  // 创建窗口
  createWindow(options: BrowserWindowConstructorOptions = {}): BrowserWindow {
    const defaultOptions: BrowserWindowConstructorOptions = {
      title: appName,
      width: 1280,
      height: 720,
      frame: false,
      center: true,
      // 图标
      icon,
      webPreferences: {
        preload: join(__dirname, "../preload/index.mjs"),
        // 禁用渲染器沙盒
        sandbox: false,
        // 禁用同源策略
        webSecurity: false,
        // 允许 HTTP
        allowRunningInsecureContent: true,
        // 禁用拼写检查
        spellcheck: false,
        // 启用 Node.js
        nodeIntegration: true,
        nodeIntegrationInWorker: true,
        // 启用上下文隔离
        contextIsolation: false,
      },
    };
    // 合并参数
    options = Object.assign(defaultOptions, options);
    // 创建窗口
    const win = new BrowserWindow(options);
    return win;
  }
  // 创建主窗口
  createMainWindow() {
    // 窗口配置项
    const options: BrowserWindowConstructorOptions = {
      // @ts-ignore
      width: this.store?.get("window").width,
      // @ts-ignore
      height: this.store?.get("window").height,
      minHeight: 800,
      minWidth: 1280,
      // 菜单栏
      titleBarStyle: "customButtonsOnHover",
      // 立即显示窗口
      show: false,
    };
    // 初始化窗口
    this.mainWindow = this.createWindow(options);

    // 渲染路径
    if (isDev && process.env["ELECTRON_RENDERER_URL"]) {
      this.mainWindow.loadURL(process.env["ELECTRON_RENDERER_URL"]);
    } else {
      const port = Number(import.meta.env["VITE_SERVER_PORT"] || 25884);
      this.mainWindow.loadURL(`http://127.0.0.1:${port}`);
    }

    // 配置网络代理
    // Apply initial proxy settings
    // @ts-ignore
    this.applyProxySettings(this.store?.get("proxyConfig"));

    // 窗口打开处理程序
    this.mainWindow.webContents.setWindowOpenHandler((details) => {
      const { url } = details;
      if (url.startsWith("https://") || url.startsWith("http://")) {
        shell.openExternal(url);
      }
      return { action: "deny" };
    });
  }
  // 创建加载窗口
  createLoadingWindow() {
    // 初始化窗口
    this.loadingWindow = this.createWindow({
      width: 800,
      height: 560,
      maxWidth: 800,
      maxHeight: 560,
      resizable: false,
    });
    // 渲染路径
    this.loadingWindow.loadFile(join(__dirname, "../main/web/loading.html"));
  }
  // 创建桌面歌词窗口
  createLyricsWindow() {
    // 初始化窗口
    this.lyricWindow = this.createWindow({
      // @ts-ignore
      width: this.store?.get("lyric").width || 800,
      // @ts-ignore
      height: this.store?.get("lyric").height || 180,
      minWidth: 440,
      minHeight: 120,
      maxWidth: 1600,
      maxHeight: 300,
      // 窗口位置
      // @ts-ignore
      x: this.store?.get("lyric").x,
      // @ts-ignore
      y: this.store?.get("lyric").y,
      transparent: true,
      backgroundColor: "rgba(0, 0, 0, 0)",
      alwaysOnTop: true,
      resizable: true,
      movable: true,
      // 不在任务栏显示
      skipTaskbar: true,
      // 窗口不能最小化
      minimizable: false,
      // 窗口不能最大化
      maximizable: false,
      // 窗口不能进入全屏状态
      fullscreenable: false,
      show: false,
    });
    // 渲染路径
    this.lyricWindow.loadFile(join(__dirname, "../main/web/lyric.html"));
  }
  // 应用程序事件
  handleAppEvents() {
    // 窗口被关闭时
    app.on("window-all-closed", () => {
      if (!isMac) app.quit();
      this.mainWindow = null;
      this.loadingWindow = null;
    });

    // 应用被激活
    app.on("activate", () => {
      const allWindows = BrowserWindow.getAllWindows();
      if (allWindows.length) {
        allWindows[0].focus();
      } else {
        this.createMainWindow();
      }
    });

    // 新增 session
    app.on("second-instance", () => {
      this.showWindow();
    });

    // 自定义协议
    app.on("open-url", (_, url) => {
      console.log("Received custom protocol URL:", url);
    });

    // 将要退出
    app.on("will-quit", () => {
      // 注销全部快捷键
      unregisterShortcuts();
    });

    // 退出前
    app.on("before-quit", () => {
      this.isQuit = true;
    });
  }
  // 窗口事件
  handleWindowEvents() {
    this.mainWindow?.on("ready-to-show", () => {
      if (!this.mainWindow) return;
      this.thumbar = initThumbar(this.mainWindow);
    });
    this.mainWindow?.on("show", () => {
      // this.mainWindow?.webContents.send("lyricsScroll");
    });
    this.mainWindow?.on("focus", () => {
      this.saveBounds();
    });
    // 移动或缩放
    this.mainWindow?.on("resized", () => {
      // 若处于全屏则不保存
      if (this.mainWindow?.isFullScreen()) return;
      this.saveBounds();
    });
    this.mainWindow?.on("moved", () => {
      this.saveBounds();
    });

    // 歌词窗口缩放
    this.lyricWindow?.on("resized", () => {
      const bounds = this.lyricWindow?.getBounds();
      if (bounds) {
        const { width, height } = bounds;
        // @ts-ignore
        this.store?.set("lyric", { // @ts-ignore
                                  ...this.store?.get("lyric"), width, height });
      }
    });

    // 窗口关闭
    this.mainWindow?.on("close", (event) => {
      event.preventDefault();
      if (this.isQuit) {
        app.exit();
      } else {
        this.mainWindow?.hide();
      }
    });
  }
  // 更新窗口大小
  saveBounds() {
    if (this.mainWindow?.isFullScreen()) return;
    const bounds = this.mainWindow?.getBounds();
    // @ts-ignore
    if (bounds) this.store?.set("window", bounds);
  }
  // 显示窗口
  showWindow() {
    if (this.mainWindow) {
      this.mainWindow.show();
      if (this.mainWindow.isMinimized()) this.mainWindow.restore();
      this.mainWindow.focus();
    }
  }

  // Function to apply proxy settings
  applyProxySettings(proxyConfig: StoreType["proxyConfig"] | undefined) {
    if (!this.mainWindow || !proxyConfig) {
      log.warn("applyProxySettings: No mainWindow or proxyConfig found");
      return;
    }

    const ses = this.mainWindow.webContents.session;

    if (proxyConfig.type === "off") {
      ses.setProxy({ proxyRules: undefined, pacScript: undefined, proxyBypassRules: undefined })
        .then(() => log.info("Proxy settings: OFF"))
        .catch(err => log.error("Error disabling proxy:", err));
    } else if (proxyConfig.type === "system") {
      ses.setProxy({ mode: "system" })
        .then(() => log.info("Proxy settings: SYSTEM"))
        .catch(err => log.error("Error setting system proxy:", err));
    } else if (proxyConfig.type === "manual" && proxyConfig.manualConfig) {
      const { protocol, server, port } = proxyConfig.manualConfig;
      // Note: Electron's setProxy doesn't directly support username/password in proxyRules.
      // This needs to be handled via app.on('login', ...) or session.on('will-download', ...).
      // For now, we'll set the basic proxy rule.
      const rules = `${protocol}://${server}:${port}`;
      ses.setProxy({ proxyRules: rules })
        .then(() => log.info(`Proxy settings: MANUAL - ${rules}`))
        .catch(err => log.error("Error setting manual proxy:", err));
    } else if (proxyConfig.type === "pac" && proxyConfig.pacUrl) {
      ses.setProxy({ pacScript: proxyConfig.pacUrl })
        .then(() => log.info(`Proxy settings: PAC - ${proxyConfig.pacUrl}`))
        .catch(err => log.error("Error setting PAC script:", err));
    } else {
      log.warn("applyProxySettings: Unknown or incomplete proxy configuration", proxyConfig);
      // Default to 'off' if config is invalid
      ses.setProxy({ proxyRules: undefined, pacScript: undefined, proxyBypassRules: undefined })
        .then(() => log.info("Proxy settings: Reverted to OFF due to invalid config"))
        .catch(err => log.error("Error disabling proxy after invalid config:", err));
    }
  }
}

const mainProcessInstance = new MainProcess();

// Make applyProxySettings available for IPC
export const applyProxyFromMain = (proxyConfig: StoreType["proxyConfig"]) => {
  mainProcessInstance.applyProxySettings(proxyConfig);
};

export default mainProcessInstance;
} // This closes the 'else' block for Electron mode
