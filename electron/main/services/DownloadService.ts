import { app } from "electron";
import { mkdir, access, writeFile, unlink } from "node:fs/promises";
import { join, resolve, extname } from "node:path";
import { EventEmitter } from "events";
import { loadNativeModule } from "../utils/native-loader";
import { useStore } from "../store";
import { ipcLog } from "../logger";
import { formatArtist } from "../utils/artist";
import { downloadFromUrl } from "../utils/network";
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

  async downloadMusic(
    url: string,
    rawOptions: any,
  ): Promise<{ status: "success" | "skipped" | "error" | "cancelled"; message?: string; filePath?: string }> {
    try {
      // 数据清洗与默认值 (Business Logic)
      const options = this.normalizeOptions(rawOptions);
      const { path, fileName, fileType, skipIfExist } = options;

      // Ensure path, fileName, fileType are strings (normalizeOptions guarantees this but type system needs to know)
      if (!path || !fileName) {
          throw new Error("Invalid options: path and fileName are required");
      }

      const downloadPath = resolve(path);
      const finalFilePath = fileType
        ? join(downloadPath, `${fileName}.${fileType}`)
        : join(downloadPath, fileName);

      // 准备目录
      try {
        await access(downloadPath);
      } catch {
        await mkdir(downloadPath, { recursive: true });
      }

      // 检查是否存在
      if (skipIfExist) {
        try {
          await access(finalFilePath);
          return { status: "skipped", message: "文件已存在", filePath: finalFilePath };
        } catch {
          // File does not exist, continue
        }
      }

      //  执行纯下载
      const downloadId = options.songData?.id || 0;
      await this.performDownload(url, finalFilePath, options, downloadId);

      // 后处理 (Post-processing)
      if (options.songData) {
        await this.postProcessMusic(finalFilePath, options, downloadPath, fileName);
      }

      return { status: "success", filePath: finalFilePath };
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

  private normalizeOptions(raw: any): DownloadOptions {
    return {
      fileName: raw.fileName || "未知文件名",
      fileType: raw.fileType || "mp3",
      path: raw.path || app.getPath("downloads"),
      ...raw,
    };
  }

  private async performDownload(
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

  private async postProcessMusic(
    filePath: string,
    options: DownloadOptions,
    dirPath: string,
    fileName: string,
  ) {
    // 4. 处理元数据
    if (options.downloadMeta && options.songData) {
      try {
        await this.processMetadata(filePath, options);
      } catch (e) {
        ipcLog.error("Metadata processing failed:", e);
      }
    }

    // 5. 保存歌词
    if (options.downloadLyric && options.lyric && options.saveMetaFile) {
      try {
        await this.saveLyric(dirPath, fileName, options.lyric);
      } catch (e) {
        ipcLog.error("Lyric saving failed:", e);
      }
    }
  }

  private prepareMetadata(options: DownloadOptions): SongMetadata | null {
    const { downloadMeta, songData, downloadCover, downloadLyric, lyric } = options;

    if (!downloadMeta || !songData) return null;

    const artist = formatArtist(songData.artists);
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

  private async processMetadata(filePath: string, options: DownloadOptions) {
    const metadata = this.prepareMetadata(options);
    if (!metadata) return;

    let coverPath: string | undefined;

    if (metadata.coverUrl) {
      try {
        const tempDir = app.getPath("temp");
        const tempCoverPath = join(
          tempDir,
          `cover-${Date.now()}-${Math.random().toString(36).substr(2, 5)}${extname(
            metadata.coverUrl,
          ) || ".jpg"}`,
        );
        await downloadFromUrl(metadata.coverUrl, tempCoverPath);
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

  cancelDownload(songId: number): boolean {
    const task = this.activeDownloads.get(songId);
    if (task) {
      task.cancel();
      return true;
    }
    return false;
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
