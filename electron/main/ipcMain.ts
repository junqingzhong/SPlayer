import {
  app,
  ipcMain,
  BrowserWindow,
  powerSaveBlocker,
  screen,
  shell,
  dialog,
  net,
} from "electron";
import { File, Picture, Id3v2Settings } from "node-taglib-sharp";
import { parseFile } from "music-metadata";
import { getFonts } from "font-list";
import { MainTray } from "./tray";
import { Thumbar } from "./thumbar";
import { type StoreType } from "./store"; // Import StoreType
import { applyGlobalProxyFromMain, applyProxyFromMain } from "./index"; // Import applyProxyFromMain
import { isDev, getFileID, getFileMD5 } from "./utils";
import { isShortcutRegistered, registerShortcut, unregisterShortcuts } from "./shortcut";
import { join, basename, resolve, relative, isAbsolute } from "path";
import { type PlayModePayload } from "@shared";
import { checkUpdate, startDownloadUpdate } from "./update";
import fs from "fs/promises";
import { serverLog } from "../main/logger";
import Store from "electron-store";
import fg from "fast-glob";
import openLoginWin from "./loginWin";

// 注册 ipcMain
const initIpcMain = (
  win: BrowserWindow | null,
  lyricWin: BrowserWindow | null,
  loadingWin: BrowserWindow | null,
  tray: MainTray | null,
  thumbar: Thumbar | null,
  store: Store<StoreType>,
) => {
  initWinIpcMain(win, loadingWin, lyricWin, store);
  initLyricIpcMain(lyricWin, win, store);
  initTrayIpcMain(tray, win, lyricWin);
  initThumbarIpcMain(thumbar);
  initStoreIpcMain(store);
  initOtherIpcMain(win);
};

// win
const initWinIpcMain = (
  win: BrowserWindow | null,
  loadingWin: BrowserWindow | null,
  lyricWin: BrowserWindow | null,
  store: Store<StoreType>,
) => {
  let preventId: number | null = null;

  // 当前窗口状态
  ipcMain.on("win-state", (ev) => {
    ev.returnValue = win?.isMaximized();
  });

  // 加载完成
  ipcMain.on("win-loaded", () => {
    if (loadingWin && !loadingWin.isDestroyed()) loadingWin.close();
    win?.show();
    win?.focus();
  });

  // 最小化
  ipcMain.on("win-min", (ev) => {
    ev.preventDefault();
    win?.minimize();
  });
  // 最大化
  ipcMain.on("win-max", () => {
    win?.maximize();
  });
  // 还原
  ipcMain.on("win-restore", () => {
    win?.restore();
  });
  // 关闭
  ipcMain.on("win-close", (ev) => {
    ev.preventDefault();
    win?.close();
    app.quit();
  });
  // 隐藏
  ipcMain.on("win-hide", () => {
    win?.hide();
  });
  // 显示
  ipcMain.on("win-show", () => {
    win?.show();
  });
  // 重启
  ipcMain.on("win-reload", () => {
    app.quit();
    app.relaunch();
  });

  // 显示进度
  ipcMain.on("set-bar", (_, val: number | "none" | "indeterminate" | "error" | "paused") => {
    switch (val) {
      case "none":
        win?.setProgressBar(-1);
        break;
      case "indeterminate":
        win?.setProgressBar(2, { mode: "indeterminate" });
        break;
      case "error":
        win?.setProgressBar(1, { mode: "error" });
        break;
      case "paused":
        win?.setProgressBar(1, { mode: "paused" });
        break;
      default:
        if (typeof val === "number") {
          win?.setProgressBar(val / 100);
        } else {
          win?.setProgressBar(-1);
        }
        break;
    }
  });

  // 开启控制台
  ipcMain.on("open-dev-tools", () => {
    win?.webContents.openDevTools({
      title: "SPlayer DevTools",
      mode: isDev ? "right" : "detach",
    });
  });

  // 获取系统全部字体
  ipcMain.handle("get-all-fonts", async () => {
    try {
      const fonts = await getFonts();
      return fonts;
    } catch (error) {
      serverLog.error(`❌ Failed to get all system fonts: ${error}`);
      return [];
    }
  });

  // 切换桌面歌词
  ipcMain.on("change-desktop-lyric", (_, val: boolean) => {
    if (val) {
      lyricWin?.show();
      lyricWin?.setAlwaysOnTop(true, "screen-saver");
    } else lyricWin?.hide();
  });

  // 是否阻止系统息屏
  ipcMain.on("prevent-sleep", (_, val: boolean) => {
    if (val) {
      preventId = powerSaveBlocker.start("prevent-display-sleep");
      serverLog.log("⏾ System sleep prevention started");
    } else {
      if (preventId !== null) {
        powerSaveBlocker.stop(preventId);
        serverLog.log("✅ System sleep prevention stopped");
      }
    }
  });

  // 默认文件夹
  ipcMain.handle(
    "get-default-dir",
    (_, type: "documents" | "downloads" | "pictures" | "music" | "videos"): string => {
      return app.getPath(type);
    },
  );

  // 遍历音乐文件
  ipcMain.handle("get-music-files", async (_, dirPath: string) => {
    try {
      // 规范化路径
      const filePath = resolve(dirPath).replace(/\\/g, "/");
      console.info(`📂 Fetching music files from: ${filePath}`);
      // 查找指定目录下的所有音乐文件
      const musicFiles = await fg("**/*.{mp3,wav,flac}", { cwd: filePath });
      // 解析元信息
      const metadataPromises = musicFiles.map(async (file) => {
        const filePath = join(dirPath, file);
        // 处理元信息
        const { common, format } = await parseFile(filePath);
        // 获取文件大小
        const { size } = await fs.stat(filePath);
        // 判断音质等级
        let quality: string;
        if ((format.sampleRate || 0) >= 96000 || (format.bitsPerSample || 0) > 16) {
          quality = "Hi-Res";
        } else if ((format.sampleRate || 0) >= 44100) {
          quality = "HQ";
        } else {
          quality = "SQ";
        }
        return {
          id: getFileID(filePath),
          name: common.title || basename(filePath),
          artists: common.artists?.[0] || common.artist,
          album: common.album || "",
          alia: common.comment?.[0],
          duration: (format?.duration ?? 0) * 1000,
          size: (size / (1024 * 1024)).toFixed(2),
          path: filePath,
          quality,
        };
      });
      const metadataArray = await Promise.all(metadataPromises);
      return metadataArray;
    } catch (error) {
      serverLog.error("❌ Error fetching music metadata:", error);
      throw error;
    }
  });

  // 获取音乐元信息
  ipcMain.handle("get-music-metadata", async (_, path: string) => {
    try {
      const filePath = resolve(path).replace(/\\/g, "/");
      const { common, format } = await parseFile(filePath);
      return {
        // 文件名称
        fileName: basename(filePath),
        // 文件大小
        fileSize: (await fs.stat(filePath)).size / (1024 * 1024),
        // 元信息
        common,
        // 音质信息
        format,
        // md5
        md5: await getFileMD5(filePath),
      };
    } catch (error) {
      serverLog.error("❌ Error fetching music metadata:", error);
      throw error;
    }
  });

  // 获取音乐歌词
  ipcMain.handle("get-music-lyric", async (_, path: string): Promise<string> => {
    try {
      const filePath = resolve(path).replace(/\\/g, "/");
      const { common } = await parseFile(filePath);
      const lyric = common?.lyrics;
      if (lyric && lyric.length > 0) return String(lyric[0]);
      // 如果歌词数据不存在，尝试读取同名的 lrc 文件
      else {
        const lrcFilePath = filePath.replace(/\.[^.]+$/, ".lrc");
        try {
          await fs.access(lrcFilePath);
          const lrcData = await fs.readFile(lrcFilePath, "utf-8");
          return lrcData || "";
        } catch {
          return "";
        }
      }
    } catch (error) {
      serverLog.error("❌ Error fetching music lyric:", error);
      throw error;
    }
  });

  // 获取音乐封面
  ipcMain.handle(
    "get-music-cover",
    async (_, path: string): Promise<{ data: Buffer; format: string } | null> => {
      try {
        const { common } = await parseFile(path);
        // 获取封面数据
        const picture = common.picture?.[0];
        if (picture) {
          return { data: Buffer.from(picture.data), format: picture.format };
        } else {
          const coverFilePath = path.replace(/\.[^.]+$/, ".jpg");
          try {
            await fs.access(coverFilePath);
            const coverData = await fs.readFile(coverFilePath);
            return { data: coverData, format: "image/jpeg" };
          } catch {
            return null;
          }
        }
      } catch (error) {
        console.error("❌ Error fetching music cover:", error);
        throw error;
      }
    },
  );

  // 删除文件
  ipcMain.handle("delete-file", async (_, path: string) => {
    try {
      // 规范化路径
      const resolvedPath = resolve(path);
      // 检查文件是否存在
      try {
        await fs.access(resolvedPath);
      } catch {
        throw new Error("❌ File not found");
      }
      // 删除文件
      await fs.unlink(resolvedPath);
      return true;
    } catch (error) {
      serverLog.error("❌ File delete error", error);
      return false;
    }
  });

  // 打开文件夹
  ipcMain.on("open-folder", async (_, path: string) => {
    try {
      // 规范化路径
      const resolvedPath = resolve(path);
      // 检查文件夹是否存在
      try {
        await fs.access(resolvedPath);
      } catch {
        throw new Error("❌ Folder not found");
      }
      // 打开文件夹
      shell.showItemInFolder(resolvedPath);
    } catch (error) {
      serverLog.error("❌ Folder open error", error);
      throw error;
    }
  });

  // 图片选择窗口
  ipcMain.handle("choose-image", async () => {
    try {
      const { filePaths } = await dialog.showOpenDialog({
        properties: ["openFile"],
        filters: [{ name: "Images", extensions: ["jpg", "jpeg", "png"] }],
      });
      if (!filePaths || filePaths.length === 0) return null;
      return filePaths[0];
    } catch (error) {
      serverLog.error("❌ Image choose error", error);
      return null;
    }
  });

  // 路径选择窗口
  ipcMain.handle("choose-path", async () => {
    try {
      const { filePaths } = await dialog.showOpenDialog({
        title: "选择文件夹",
        defaultPath: app.getPath("downloads"),
        properties: ["openDirectory", "createDirectory"],
        buttonLabel: "选择文件夹",
      });
      if (!filePaths || filePaths.length === 0) return null;
      return filePaths[0];
    } catch (error) {
      serverLog.error("❌ Path choose error", error);
      return null;
    }
  });

  // 修改音乐元信息
  ipcMain.handle("set-music-metadata", async (_, path: string, metadata: any) => {
    try {
      const { name, artist, album, alia, lyric, cover } = metadata;
      // 规范化路径
      const songPath = resolve(path);
      const coverPath = cover ? resolve(cover) : null;
      // 读取歌曲文件
      const songFile = File.createFromPath(songPath);
      // 读取封面文件
      const songCover = coverPath ? Picture.fromPath(coverPath) : null;
      // 保存元数据
      Id3v2Settings.forceDefaultVersion = true;
      Id3v2Settings.defaultVersion = 3;
      songFile.tag.title = name || "未知曲目";
      songFile.tag.performers = [artist || "未知艺术家"];
      songFile.tag.album = album || "未知专辑";
      songFile.tag.albumArtists = [artist || "未知艺术家"];
      songFile.tag.lyrics = lyric || "";
      songFile.tag.description = alia || "";
      songFile.tag.comment = alia || "";
      if (songCover) songFile.tag.pictures = [songCover];
      // 保存元信息
      songFile.save();
      songFile.dispose();
      return true;
    } catch (error) {
      serverLog.error("❌ Error setting music metadata:", error);
      throw error;
    }
  });

  // New IPC handler for updating and applying proxy settings
  ipcMain.on("update-proxy-config", (_, newProxyConfig: StoreType["proxyConfig"]) => {
    if (store) {
      store.set("proxyConfig", newProxyConfig);
      serverLog.log("Proxy config updated in store:", newProxyConfig);
      applyProxyFromMain(newProxyConfig);
    } else {
      serverLog.error("Store not available to update proxy config");
    }
  });

  // IPC handler for applying global proxy configuration
  ipcMain.on("apply-global-proxy", (_, globalProxyConfig) => {
    try {
      serverLog.log("Received global proxy configuration from renderer");
      applyGlobalProxyFromMain(globalProxyConfig);
    } catch (error) {
      serverLog.error("Error applying global proxy configuration:", error);
    }
  });

  // New IPC handler for testing proxy settings
  ipcMain.handle("test-new-proxy", async (_, testProxyConfig: StoreType["proxyConfig"]) => {
    if (!win) {
      serverLog.error("Main window not available for proxy test");
      return false;
    }
    const originalProxyConfig = (store as any)?.get("proxyConfig");
    serverLog.log("Testing proxy configuration:", testProxyConfig);

    try {
      // Apply temporary proxy settings for testing
      applyProxyFromMain(testProxyConfig);

      // Perform a test network request
      const request = net.request({ url: "https://www.baidu.com" }); // Or any other reliable URL
      const result = await new Promise<boolean>((resolve) => {
        request.on("response", (response) => {
          serverLog.log(`Proxy test response status: ${response.statusCode}`);
          resolve(response.statusCode === 200);
        });
        request.on("error", (error) => {
          serverLog.error("Proxy test request error:", error);
          resolve(false);
        });
        request.end();
      });

      return result;
    } catch (error) {
      serverLog.error("Error during proxy test:", error);
      return false;
    } finally {
      // Revert to original proxy settings
      serverLog.log("Reverting to original proxy configuration after test");
      if (originalProxyConfig) {
        applyProxyFromMain(originalProxyConfig);
      } else {
        // If no original config, turn off proxy
        applyProxyFromMain({ type: "off" });
      }
    }
  });

  // 重置全部设置
  ipcMain.on("reset-setting", () => {
    (store as unknown as { reset: () => void }).reset();
    serverLog.log("✅ Reset setting successfully");
  });

  // 检查更新
  ipcMain.on("check-update", (_, showTip) => checkUpdate(win!, showTip));

  // 开始下载更新
  ipcMain.on("start-download-update", () => startDownloadUpdate());

  // 新建窗口
  ipcMain.on("open-login-web", () => openLoginWin(win!));
};

// lyric
const initLyricIpcMain = (
  lyricWin: BrowserWindow | null,
  mainWin: BrowserWindow | null,
  store: Store<StoreType>,
): void => {
  // 音乐名称更改
  ipcMain.on("play-song-change", (_, title) => {
    if (!title) return;
    lyricWin?.webContents.send("play-song-change", title);
  });

  // 音乐歌词更改
  ipcMain.on("play-lyric-change", (_, lyricData) => {
    if (!lyricData) return;
    lyricWin?.webContents.send("play-lyric-change", lyricData);
  });

  // 获取窗口位置
  ipcMain.handle("get-window-bounds", () => {
    return lyricWin?.getBounds();
  });

  // 获取屏幕尺寸
  ipcMain.handle("get-screen-size", () => {
    const { width, height } = screen.getPrimaryDisplay().workAreaSize;
    return { width, height };
  });

  // 移动窗口
  ipcMain.on("move-window", (_, x, y, width, height) => {
    lyricWin?.setBounds({ x, y, width, height });
    // 保存配置
    const currentLyric = store.get("lyric");
    store.set("lyric", { ...currentLyric, x, y, width, height });
    // 保持置顶
    lyricWin?.setAlwaysOnTop(true, "screen-saver");
  });

  // 更新高度
  ipcMain.on("update-window-height", (_, height) => {
    if (!lyricWin) return;
    const { width } = lyricWin.getBounds();
    // 更新窗口高度
    lyricWin.setBounds({ width, height });
  });

  // 获取配置
  ipcMain.handle("get-desktop-lyric-option", () => {
    return store.get("lyric");
  });

  // 保存配置
  ipcMain.on("set-desktop-lyric-option", (_, option, callback: boolean = false) => {
    store.set("lyric", option);
    // 触发窗口更新
    if (callback && lyricWin) {
      lyricWin.webContents.send("desktop-lyric-option-change", option);
    }
    mainWin?.webContents.send("desktop-lyric-option-change", option);
  });

  // 发送主程序事件
  ipcMain.on("send-main-event", (_, name, val) => {
    mainWin?.webContents.send(name, val);
  });

  // 关闭桌面歌词
  ipcMain.on("closeDesktopLyric", () => {
    lyricWin?.hide();
    mainWin?.webContents.send("closeDesktopLyric");
  });

  // 锁定/解锁桌面歌词
  ipcMain.on("toogleDesktopLyricLock", (_, isLock: boolean) => {
    if (!lyricWin) return;
    // 是否穿透
    if (isLock) {
      lyricWin.setIgnoreMouseEvents(true, { forward: true });
    } else {
      lyricWin.setIgnoreMouseEvents(false);
    }
  });

  // 检查是否是子文件夹
  ipcMain.handle("check-if-subfolder", (_, localFilesPath: string[], selectedDir: string) => {
    const resolvedSelectedDir = resolve(selectedDir);
    const allPaths = localFilesPath.map((p) => resolve(p));
    return allPaths.some((existingPath) => {
      const relativePath = relative(existingPath, resolvedSelectedDir);
      return relativePath && !relativePath.startsWith("..") && !isAbsolute(relativePath);
    });
  });
};

// tray
const initTrayIpcMain = (
  tray: MainTray | null,
  win: BrowserWindow | null,
  lyricWin: BrowserWindow | null,
): void => {
  // 音乐播放状态更改
  ipcMain.on("play-status-change", (_, playStatus: boolean) => {
    tray?.setPlayState(playStatus ? "play" : "pause");
    lyricWin?.webContents.send("play-status-change", playStatus);
  });

  // 音乐名称更改
  ipcMain.on("play-song-change", (_, title) => {
    if (!title) return;
    // 更改标题
    win?.setTitle(title);
    tray?.setTitle(title);
    tray?.setPlayName(title);
  });

  // 播放模式切换
  ipcMain.on("play-mode-change", (_, data: PlayModePayload) => {
    tray?.setPlayMode(data.repeatMode, data.shuffleMode);
  });

  // 喜欢状态切换
  ipcMain.on("like-status-change", (_, likeStatus: boolean) => {
    tray?.setLikeState(likeStatus);
  });

  // 桌面歌词开关
  ipcMain.on("change-desktop-lyric", (_, val: boolean) => {
    tray?.setDesktopLyricShow(val);
  });

  // 锁定/解锁桌面歌词
  ipcMain.on("toogleDesktopLyricLock", (_, isLock: boolean) => {
    tray?.setDesktopLyricLock(isLock);
  });
};

// thumbar
const initThumbarIpcMain = (thumbar: Thumbar | null): void => {
  if (!thumbar) return;
  // 更新工具栏
  ipcMain.on("play-status-change", (_, playStatus: boolean) => {
    thumbar?.updateThumbar(playStatus);
  });
};

// store
const initStoreIpcMain = (store: Store<StoreType>): void => {
  if (!store) return;
};

// other
const initOtherIpcMain = (mainWin: BrowserWindow | null): void => {
  // 快捷键是否被注册
  ipcMain.handle("is-shortcut-registered", (_, shortcut: string) => isShortcutRegistered(shortcut));

  // 注册快捷键
  ipcMain.handle("register-all-shortcut", (_, allShortcuts: any): string[] | false => {
    if (!mainWin || !allShortcuts) return false;
    // 卸载所有快捷键
    unregisterShortcuts();
    // 注册快捷键
    const failedShortcuts: string[] = [];
    for (const key in allShortcuts) {
      const shortcut = allShortcuts[key].globalShortcut;
      if (!shortcut) continue;
      // 快捷键回调
      const callback = () => mainWin.webContents.send(key);
      const isSuccess = registerShortcut(shortcut, callback);
      if (!isSuccess) failedShortcuts.push(shortcut);
    }
    return failedShortcuts;
  });

  // 卸载所有快捷键
  ipcMain.on("unregister-all-shortcut", () => unregisterShortcuts());
};

export default initIpcMain;
