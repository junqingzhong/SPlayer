import type { SongMetadata } from "@native/tools";
import { app, BrowserWindow } from "electron";
import { mkdir, access, writeFile, rename, unlink } from "node:fs/promises";
import { createWriteStream as createWriteStreamSync } from "node:fs";
import { join, resolve } from "node:path";
import https from "node:https";
import http from "node:http";
import { ipcLog } from "../logger";
import { useStore } from "../store";
import { loadNativeModule } from "../utils/native-loader";
import { getArtistNames } from "../utils/format";

type toolModule = typeof import("@native/tools");
const tools: toolModule = loadNativeModule("tools.node", "tools");

/**
 * 纯 Node.js 回退下载（当原生模块不可用时使用）
 */
const fallbackDownload = (
  url: string,
  destPath: string,
  onProgress?: (percent: number, transferred: number, total: number) => void,
): Promise<void> => {
  return new Promise((resolve, reject) => {
    const protocol = url.startsWith("https") ? https : http;
    const request = protocol.get(url, (res) => {
      // 处理重定向
      if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return fallbackDownload(res.headers.location, destPath, onProgress)
          .then(resolve)
          .catch(reject);
      }
      if (res.statusCode !== 200) {
        return reject(new Error(`下载失败，HTTP 状态码: ${res.statusCode}`));
      }
      const total = parseInt(res.headers["content-length"] || "0", 10);
      let transferred = 0;
      const writer = createWriteStreamSync(destPath);
      res.on("data", (chunk: Buffer) => {
        transferred += chunk.length;
        if (onProgress && total > 0) {
          onProgress(transferred / total, transferred, total);
        }
      });
      res.pipe(writer);
      writer.on("finish", () => resolve());
      writer.on("error", reject);
      res.on("error", reject);
    });
    request.on("error", reject);
    request.setTimeout(30000, () => {
      request.destroy();
      reject(new Error("下载超时"));
    });
  });
};

export class DownloadService {
  /** 存储活动下载任务：ID -> DownloadTask 实例 */
  private activeDownloads = new Map<number, any>();

  /**
   * 处理文件下载请求
   * @param event IPC 调用事件
   * @param url 下载链接
   * @param options 下载选项
   * @returns 下载结果状态
   */
  async downloadFile(
    event: Electron.IpcMainInvokeEvent,
    url: string,
    options: {
      fileName: string;
      fileType: string;
      path: string;
      downloadMeta?: boolean;
      downloadCover?: boolean;
      downloadLyric?: boolean;
      saveMetaFile?: boolean;
      lyric?: string;
      albumArtists?: string[];
      songData?: any;
      skipIfExist?: boolean;
      threadCount?: number;
      referer?: string;
      enableDownloadHttp2?: boolean;
    } = {
      fileName: "未知文件名",
      fileType: "mp3",
      path: app.getPath("downloads"),
    },
  ): Promise<{ status: "success" | "skipped" | "error" | "cancelled"; message?: string }> {
    try {
      // 获取窗口
      const win = BrowserWindow.fromWebContents(event.sender);
      if (!win || !win.webContents) return { status: "error", message: "Window not found" };
      // 获取配置
      const {
        fileName,
        fileType,
        path,
        lyric,
        albumArtists,
        downloadMeta,
        downloadCover,
        downloadLyric,
        saveMetaFile,
        songData,
        skipIfExist,
        referer,
      } = options;
      // 规范化路径
      const downloadPath = resolve(path);
      // 检查文件夹是否存在，不存在则自动递归创建
      try {
        await access(downloadPath);
      } catch {
        await mkdir(downloadPath, { recursive: true });
      }
      // 规范化文件名
      const finalFilePath = fileType
        ? join(downloadPath, `${fileName}.${fileType}`)
        : join(downloadPath, fileName);
      // 检查文件是否存在
      if (skipIfExist) {
        try {
          await access(finalFilePath);
          return { status: "skipped", message: "文件已存在" };
        } catch {
          // 文件不存在，继续下载
        }
      }
      // 使用隐藏的临时文件夹来避免扫描
      const tempDir = join(downloadPath, ".splayer_temp");
      try {
        await access(tempDir);
      } catch {
        await mkdir(tempDir, { recursive: true });
      }
      const tempFileName = fileType ? `${fileName}.${fileType}` : fileName;
      const tempFilePath = join(tempDir, tempFileName);
      // 准备元数据
      let metadata: SongMetadata | undefined | null = null;
      if (downloadMeta && songData) {
        const artistNames = getArtistNames(songData.artists);
        const artist = artistNames.join(", ") || "未知艺术家";
        const albumArtist = albumArtists?.join(", ");
        const coverUrl =
          downloadCover && (songData.coverSize?.l || songData.cover)
            ? songData.coverSize?.l || songData.cover
            : undefined;
        metadata = {
          title: songData.name || "未知曲目",
          artist: artist,
          album:
            (typeof songData.album === "string" ? songData.album : songData.album?.name) ||
            "未知专辑",
          albumArtist: albumArtist && albumArtist !== "" ? albumArtist : undefined,
          coverUrl: coverUrl,
          lyric: downloadLyric && lyric ? lyric : undefined,
          description: songData.alia || "",
        };
      }
      // 进度回调
      const onProgress = (...args: any[]) => {
        let progressData: any;
        // 处理 (err, value) 或 (value) 签名
        if (args.length > 1 && args[0] === null) {
          progressData = args[1];
        } else if (args.length > 0) {
          progressData = args[0];
        }
        // 处理进度数据
        try {
          if (!progressData) return;
          // 处理对象（新）和 JSON 字符串（旧/回退）
          if (typeof progressData === "string") {
            try {
              progressData = JSON.parse(progressData);
            } catch (e) {
              console.error("Failed to parse progress json", e);
              return;
            }
          }
          // 检查进度数据
          if (!progressData || typeof progressData !== "object") return;
          // 映射 snake_case（Rust）到 camelCase（JS）
          // Rust struct: { percent, transferred_bytes, total_bytes }
          const percent = progressData.percent;
          const transferredBytes =
            progressData.transferredBytes ?? progressData.transferred_bytes ?? 0;
          const totalBytes = progressData.totalBytes ?? progressData.total_bytes ?? 0;
          // 发送进度更新
          win.webContents.send("download-progress", {
            id: songData?.id,
            percent: percent,
            transferredBytes: transferredBytes,
            totalBytes: totalBytes,
          });
        } catch (e) {
          console.error("Error processing progress callback", e, "Args:", args);
        }
      };
      // 检查工具模块
      const store = useStore();
      // 使用 threadCount（如果可用），否则回退到 store
      const threadCount = options.threadCount || store.get("downloadThreadCount") || 8;
      // 使用 enableDownloadHttp2（如果可用），否则回退到 store
      const enableHttp2 = options.enableDownloadHttp2 ?? store.get("enableDownloadHttp2", true);
      // 如果启用了 HTTP/2，将 HTTP 升级到 HTTPS（HTTP/2 通常需要 HTTPS）
      let finalUrl = url;
      if (enableHttp2 && finalUrl.startsWith("http://")) {
        finalUrl = finalUrl.replace(/^http:\/\//, "https://");
        ipcLog.info(`🔒 Upgraded download URL to HTTPS for HTTP/2 support: ${finalUrl}`);
      }

      if (tools) {
        // 使用原生多线程下载器
        const task = new tools.DownloadTask();
        const downloadId = songData?.id || 0;
        this.activeDownloads.set(downloadId, task);

        try {
          await task.download(
            finalUrl,
            tempFilePath,
            metadata,
            threadCount,
            referer,
            onProgress,
            enableHttp2,
          );
          await rename(tempFilePath, finalFilePath);
        } catch (err) {
          try {
            await unlink(tempFilePath);
          } catch {
            /* 忽略清理错误 */
          }
          throw err;
        } finally {
          this.activeDownloads.delete(downloadId);
        }
      } else {
        // 原生模块不可用，使用 Node.js 回退下载
        ipcLog.warn(
          "⚠️ Native tools not loaded，使用 Node.js 回退下载（不支持多线程和元数据写入）",
        );
        try {
          await fallbackDownload(finalUrl, tempFilePath, (percent, transferred, total) => {
            win.webContents.send("download-progress", {
              id: songData?.id,
              percent,
              transferredBytes: transferred,
              totalBytes: total,
            });
          });
          await rename(tempFilePath, finalFilePath);
        } catch (err) {
          try {
            await unlink(tempFilePath);
          } catch {
            /* 忽略清理错误 */
          }
          throw err;
        }
      }

      // 创建同名歌词文件
      if (lyric && saveMetaFile && downloadLyric) {
        const lrcPath = join(downloadPath, `${fileName}.lrc`);
        await writeFile(lrcPath, lyric, "utf-8");
      }

      return { status: "success" };
    } catch (error: any) {
      ipcLog.error("❌ Error downloading file:", error);
      if ((error.message && error.message.includes("cancelled")) || error.code === "Cancelled") {
        return { status: "cancelled", message: "下载已取消" };
      }
      return {
        status: "error",
        message: error instanceof Error ? error.message : "Unknown error",
      };
    }
  }

  /**
   * 取消下载
   * @param songId 歌曲ID
   * @returns 是否成功取消
   */
  cancelDownload(songId: number): boolean {
    const task = this.activeDownloads.get(songId);
    if (task) {
      task.cancel();
      return true;
    }
    return false;
  }
}
