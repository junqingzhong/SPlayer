import { app, net } from "electron";
import { mkdir, access, writeFile, unlink } from "node:fs/promises";
import { join, resolve, extname } from "node:path";
import { EventEmitter } from "events";
import { loadNativeModule } from "../utils/native-loader";
import { useStore } from "../store";
import { ipcLog } from "../logger";
import type { SongMetadata } from "@native/tools";

type toolModule = typeof import("@native/tools");
const tools: toolModule = loadNativeModule("tools.node", "tools");

export interface DownloadOptions {
  fileName?: string;
  fileType?: string;
  path?: string;
  downloadMeta?: boolean;
  downloadCover?: boolean;
  downloadLyric?: boolean;
  saveMetaFile?: boolean;
  lyric?: string;
  songData?: any;
  skipIfExist?: boolean;
  threadCount?: number;
  referer?: string;
  enableDownloadHttp2?: boolean;
}

export interface DownloadProgress {
  id: number;
  percent: number;
  transferredBytes: number;
  totalBytes: number;
}

export class DownloadService extends EventEmitter {
  private activeDownloads = new Map<number, any>();

  constructor() {
    super();
  }

  async downloadFile(
    url: string,
    options: DownloadOptions,
  ): Promise<{ status: "success" | "skipped" | "error" | "cancelled"; message?: string }> {
    try {
      // Apply defaults
      const defaults = {
        fileName: "未知文件名",
        fileType: "mp3",
        path: app.getPath("downloads"),
      };
      const finalOptions = { ...defaults, ...options };
      const { path, fileName, fileType, skipIfExist } = finalOptions;

      const downloadPath = resolve(path);
      const finalFilePath = fileType
        ? join(downloadPath, `${fileName}.${fileType}`)
        : join(downloadPath, fileName);

      // 1. 准备目录
      try {
        await access(downloadPath);
      } catch {
        await mkdir(downloadPath, { recursive: true });
      }

      // 2. 检查是否存在
      if (skipIfExist) {
        try {
          await access(finalFilePath);
          return { status: "skipped", message: "文件已存在" };
        } catch {
          // File does not exist, continue
        }
      }

      // 3. 执行纯下载
      const downloadId = finalOptions.songData?.id || 0;
      await this.downloadRaw(url, finalFilePath, finalOptions, downloadId);

      // 4. 处理元数据
      if (finalOptions.downloadMeta && finalOptions.songData) {
        try {
          await this.processMetadata(finalFilePath, finalOptions);
        } catch (e) {
          ipcLog.error("Metadata processing failed:", e);
        }
      }

      // 5. 保存歌词
      if (finalOptions.downloadLyric && finalOptions.lyric && finalOptions.saveMetaFile) {
        try {
          await this.saveLyric(downloadPath, fileName, finalOptions.lyric);
        } catch (e) {
          ipcLog.error("Lyric saving failed:", e);
        }
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

  private prepareMetadata(options: DownloadOptions): SongMetadata | null {
    const { downloadMeta, songData, downloadCover, downloadLyric, lyric } = options;
    
    if (!downloadMeta || !songData) return null;

    const artist = this.formatArtist(songData.artists);
    const coverUrl =
      downloadCover && (songData.coverSize?.l || songData.cover)
        ? songData.coverSize?.l || songData.cover
        : undefined;

    return {
      title: songData.name || "未知曲目",
      artist: artist,
      album:
        (typeof songData.album === "string" ? songData.album : songData.album?.name) ||
        "未知专辑",
      coverUrl: coverUrl,
      lyric: downloadLyric && lyric ? lyric : undefined,
      description: songData.alia || "",
    };
  }

  private async downloadRaw(
    url: string,
    filePath: string,
    options: DownloadOptions,
    downloadId: number,
  ) {
    const store = useStore();
    const threadCount = options.threadCount || (store.get("downloadThreadCount") as number) || 8;
    const enableHttp2 =
      options.enableDownloadHttp2 !== undefined
        ? options.enableDownloadHttp2
        : (store.get("enableDownloadHttp2", true) as boolean);

    let finalUrl = url;
    if (enableHttp2 && finalUrl.startsWith("http://")) {
      finalUrl = finalUrl.replace(/^http:\/\//, "https://");
      ipcLog.info(`🔒 Upgraded download URL to HTTPS for HTTP/2 support: ${finalUrl}`);
    }

    const task = new tools.DownloadTask();
    this.activeDownloads.set(downloadId, task);

    try {
      await task.download(
        finalUrl,
        filePath,
        null, // No metadata here
        threadCount,
        options.referer,
        (data: any) => this.handleProgress(data, downloadId),
        enableHttp2,
      );
    } finally {
      this.activeDownloads.delete(downloadId);
    }
  }

  private async processMetadata(filePath: string, options: DownloadOptions) {
    const metadata = this.prepareMetadata(options);
    if (!metadata) return;

    let coverPath: string | undefined;

    if (metadata.coverUrl) {
      try {
        const tempDir = app.getPath("temp");
        // Use a simple name or random
        const tempCoverPath = join(
          tempDir,
          `cover-${Date.now()}-${Math.random().toString(36).substr(2, 5)}${extname(metadata.coverUrl) || ".jpg"}`,
        );
        await this.downloadCover(metadata.coverUrl, tempCoverPath);
        coverPath = tempCoverPath;
      } catch (e) {
        ipcLog.error("Failed to download cover:", e);
      }
    }

    try {
      await tools.writeMusicMetadata(filePath, metadata, coverPath);
    } finally {
      if (coverPath) {
        try {
          await unlink(coverPath);
        } catch {
          // Ignore error if file deletion fails
        }
      }
    }
  }

  private async saveLyric(dirPath: string, fileName: string, lyric: string) {
    const lrcPath = join(dirPath, `${fileName}.lrc`);
    await writeFile(lrcPath, lyric, "utf-8");
  }

  private async downloadCover(url: string, targetPath: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const request = net.request(url);
      request.on("response", (response) => {
        if (response.statusCode !== 200) {
          reject(new Error(`Failed to download cover: ${response.statusCode}`));
          return;
        }
        const chunks: Buffer[] = [];
        response.on("data", (chunk) => chunks.push(chunk));
        response.on("end", async () => {
          try {
            const buffer = Buffer.concat(chunks);
            await writeFile(targetPath, buffer);
            resolve();
          } catch (e) {
            reject(e);
          }
        });
        response.on("error", (err) => reject(err));
      });
      request.on("error", (err) => reject(err));
      request.end();
    });
  }

  cancelDownload(songId: number): boolean {
    const task = this.activeDownloads.get(songId);
    if (task) {
      task.cancel();
      return true;
    }
    return false;
  }

  private formatArtist(artists: any): string {
    if (Array.isArray(artists)) {
      return artists
        .map((ar: any) => (typeof ar === "string" ? ar : ar?.name || ""))
        .filter((name: string) => name && name.trim().length > 0)
        .join(", ");
    }
    if (typeof artists === "string" && artists.trim().length > 0) {
      return artists;
    }
    return "未知艺术家";
  }

  private handleProgress(progressData: any, id: number) {
    try {
      if (!progressData) return;

      if (typeof progressData === "string") {
        try {
          progressData = JSON.parse(progressData);
        } catch {
          return;
        }
      }

      if (!progressData || typeof progressData !== "object") return;

      const percent = progressData.percent;
      const transferredBytes = progressData.transferredBytes ?? progressData.transferred_bytes ?? 0;
      const totalBytes = progressData.totalBytes ?? progressData.total_bytes ?? 0;

      this.emit("progress", {
        id,
        percent,
        transferredBytes,
        totalBytes,
      });
    } catch (e) {
      console.error("Error processing progress callback", e);
    }
  }
}
