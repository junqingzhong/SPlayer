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
      const {
        fileName,
        fileType,
        path,
        lyric,
        downloadMeta,
        downloadCover,
        downloadLyric,
        saveMetaFile,
        songData,
        skipIfExist,
        referer,
        enableDownloadHttp2,
      } = options;

      const downloadPath = resolve(path);

      try {
        await access(downloadPath);
      } catch {
        await mkdir(downloadPath, { recursive: true });
      }

      const finalFilePath = fileType
        ? join(downloadPath, `${fileName}.${fileType}`)
        : join(downloadPath, fileName);

      if (skipIfExist) {
        try {
          await access(finalFilePath);
          return { status: "skipped", message: "文件已存在" };
        } catch {
          // File does not exist, continue
        }
      }

      // Metadata preparation
      let metadata: SongMetadata | undefined | null = null;
      if (downloadMeta && songData) {
        const artist = this.formatArtist(songData.artists);
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
          coverUrl: coverUrl,
          lyric: downloadLyric && lyric ? lyric : undefined,
          description: songData.alia || "",
        };
      }

      const store = useStore();
      const threadCount = options.threadCount || (store.get("downloadThreadCount") as number) || 8;
      const enableHttp2 =
        enableDownloadHttp2 !== undefined
          ? enableDownloadHttp2
          : (store.get("enableDownloadHttp2", true) as boolean);

      // Upgrade HTTP to HTTPS if HTTP2 is enabled
      // Note: Logic moved here but arguably should be upstream.
      // Keeping it here for now to maintain behavior but could be refactored later.
      let finalUrl = url;
      if (enableHttp2 && finalUrl.startsWith("http://")) {
        finalUrl = finalUrl.replace(/^http:\/\//, "https://");
        ipcLog.info(`🔒 Upgraded download URL to HTTPS for HTTP/2 support: ${finalUrl}`);
      }

      const task = new tools.DownloadTask();
      const downloadId = songData?.id || 0;
      this.activeDownloads.set(downloadId, task);

      try {
        await task.download(
          finalUrl,
          finalFilePath,
          metadata,
          threadCount,
          referer,
          (data: any) => this.handleProgress(data, downloadId, win),
          enableHttp2,
        );
      } finally {
        this.activeDownloads.delete(downloadId);
      }

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
