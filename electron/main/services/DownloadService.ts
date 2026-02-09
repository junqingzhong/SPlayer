import { BrowserWindow } from "electron";
import { mkdir, access, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { loadNativeModule } from "../utils/native-loader";
import { useStore } from "../store";
import { ipcLog } from "../logger";
import type { SongMetadata } from "@native/tools";

type toolModule = typeof import("@native/tools");
const tools: toolModule = loadNativeModule("tools.node", "tools");

export interface DownloadOptions {
  fileName: string;
  fileType: string;
  path: string;
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

export class DownloadService {
  private activeDownloads = new Map<number, any>();

  constructor() {}

  async downloadFile(
    url: string,
    options: DownloadOptions,
    win: BrowserWindow,
  ): Promise<{ status: "success" | "skipped" | "error" | "cancelled"; message?: string }> {
    try {
      const { path, fileName, fileType, skipIfExist } = options;
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

      // 3. 准备元数据
      const metadata = this.prepareMetadata(options);

      // 4. 执行下载
      const downloadId = options.songData?.id || 0;
      await this.executeDownload(url, finalFilePath, metadata, options, downloadId, win);

      // 5. 后处理（如保存歌词文件）
      await this.postProcess(downloadPath, options);

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

  private async executeDownload(
    url: string,
    filePath: string,
    metadata: SongMetadata | null,
    options: DownloadOptions,
    downloadId: number,
    win: BrowserWindow
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
        metadata,
        threadCount,
        options.referer,
        (data: any) => this.handleProgress(data, downloadId, win),
        enableHttp2,
      );
    } finally {
      this.activeDownloads.delete(downloadId);
    }
  }

  private async postProcess(dirPath: string, options: DownloadOptions) {
    const { lyric, saveMetaFile, downloadLyric, fileName } = options;
    if (lyric && saveMetaFile && downloadLyric) {
      const lrcPath = join(dirPath, `${fileName}.lrc`);
      await writeFile(lrcPath, lyric, "utf-8");
    }
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

  private handleProgress(progressData: any, id: number, win: BrowserWindow) {
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

      win.webContents.send("download-progress", {
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
