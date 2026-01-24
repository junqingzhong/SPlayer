import type { SongType, SongLevelType } from "@/types/main";
import { useDataStore, useSettingStore } from "@/stores";
import { isElectron } from "@/utils/env";
import { saveAs } from "file-saver";
import { cloneDeep } from "lodash-es";
import { songDownloadUrl, songLyric, songUrl, unlockSongUrl } from "@/api/song";

import { songLevelData } from "@/utils/meta";
import { getPlayerInfoObj } from "@/utils/format";

interface DownloadTask {
  song: SongType;
  quality: SongLevelType;
}

interface LyricResult {
  lrc?: { lyric: string };
  tlyric?: { lyric: string };
  romalrc?: { lyric: string };
}

class DownloadManager {
  private queue: DownloadTask[] = [];
  private activeDownloads: Set<number> = new Set();
  private maxConcurrent: number = 1;
  private initialized: boolean = false;

  constructor() {
    this.setupIpcListeners();
  }

  /**
   * 初始化：恢复未完成的下载任务
   */
  public init() {
    if (this.initialized) return;
    this.initialized = true;

    if (!isElectron) return;
    const dataStore = useDataStore();

    // 1. 重置下载中状态为等待中 (应用重启后的恢复)
    dataStore.downloadingSongs.forEach((item) => {
      if (item.status === "downloading") {
        dataStore.updateDownloadStatus(item.song.id, "waiting");
        dataStore.updateDownloadProgress(item.song.id, 0, "0MB", "0MB");
      }
    });

    // 2. 将等待中的任务加入队列
    dataStore.downloadingSongs.forEach((item) => {
      if (item.status === "waiting") {
        const isQueued = this.queue.some((t) => t.song.id === item.song.id);
        const isActive = this.activeDownloads.has(item.song.id);

        if (!isQueued && !isActive) {
          this.queue.push({ song: item.song, quality: item.quality });
        }
      }
    });

    // 3. 开始处理
    this.processQueue();
  }

  /**
   * 设置全局 IPC 监听器
   */
  private setupIpcListeners() {
    if (typeof window === "undefined" || !window.electron?.ipcRenderer) return;

    window.electron.ipcRenderer.on("download-progress", (_event, progress) => {
      const { id, percent, transferredBytes, totalBytes } = progress;
      if (!id) return;

      const dataStore = useDataStore();
      const transferred = (transferredBytes / 1024 / 1024).toFixed(2) + "MB";
      const total = (totalBytes / 1024 / 1024).toFixed(2) + "MB";

      dataStore.updateDownloadProgress(id, Number((percent * 100).toFixed(1)), transferred, total);
    });
  }

  /**
   * 获取已下载歌曲列表
   * @returns 已下载歌曲列表
   */
  public async getDownloadedSongs(): Promise<SongType[]> {
    const settingStore = useSettingStore();
    if (!isElectron) return [];
    const downloadPath = settingStore.downloadPath;
    if (!downloadPath) return [];
    try {
      const songs = await window.electron.ipcRenderer.invoke("get-music-files", downloadPath);
      return songs;
    } catch (error) {
      console.error("Failed to get downloaded songs:", error);
      return [];
    }
  }

  /**
   * 添加下载任务
   * @param song 歌曲信息
   * @param quality 音质
   */
  public async addDownload(song: SongType, quality: SongLevelType) {
    this.init();
    const dataStore = useDataStore();

    const isQueued = this.queue.some((t) => t.song.id === song.id);
    const isActive = this.activeDownloads.has(song.id);

    // 检查是否已存在
    const existing = dataStore.downloadingSongs.find((item) => item.song.id === song.id);

    if (existing) {
      // 如果是失败状态，重试
      if (existing.status === "failed") {
        this.retryDownload(song.id);
        return;
      }
      // 如果已经在队列或下载中，忽略
      if (
        isQueued ||
        isActive ||
        existing.status === "waiting" ||
        existing.status === "downloading"
      ) {
        return;
      }
    }

    // 添加到正在下载列表 (UI显示)
    dataStore.addDownloadingSong(song, quality);

    // 添加到下载队列
    this.queue.push({ song, quality });

    // 开始处理队列
    this.processQueue();
  }

  /**
   * 处理下载队列
   */
  private processQueue() {
    // 当活动任务数小于最大并发数，且队列不为空时，继续启动任务
    while (this.activeDownloads.size < this.maxConcurrent && this.queue.length > 0) {
      const task = this.queue.shift();
      if (task) {
        this.startTask(task);
      }
    }
  }

  /**
   * 启动单个任务
   */
  private async startTask(task: DownloadTask) {
    this.activeDownloads.add(task.song.id);

    try {
      await this.executeDownload(task.song, task.quality);
    } catch (error) {
      console.error(`Error processing task for song ${task.song.id}:`, error);
    } finally {
      // 任务结束（无论成功失败取消），移除活动状态
      this.activeDownloads.delete(task.song.id);
      // 触发下一个任务
      this.processQueue();
    }
  }

  /**
   * 执行单个下载任务
   * @param song 歌曲信息
   * @param quality 音质
   */
  private async executeDownload(song: SongType, quality: SongLevelType) {
    const dataStore = useDataStore();
    const settingStore = useSettingStore();

    // 更新状态为下载中
    dataStore.updateDownloadStatus(song.id, "downloading");

    try {
      const result = await this.processDownload({
        song,
        quality,
        downloadPath: settingStore.downloadPath,
        skipIfExist: true,
      });

      if (result.success) {
        // 下载成功，移除正在下载状态
        dataStore.removeDownloadingSong(song.id);
        window.$message.success(`${song.name} 下载完成`);
      } else {
        // 如果是取消，则不进行任何操作
        if (result.status === "cancelled") return;

        // 检查任务是否已被用户移除，如果移除则不再报错
        const currentTask = dataStore.downloadingSongs.find((s) => s.song.id === song.id);
        if (!currentTask) return;

        // 下载失败，保留在列表中并标记失败
        dataStore.markDownloadFailed(song.id);
        window.$message.error(result.message || "下载失败");
      }
    } catch (error) {
      console.error("Download failed:", error);
      // 下载出错，保留在列表中并标记失败
      dataStore.markDownloadFailed(song.id);
      window.$message.error("下载出错");
    }
  }

  /**
   * 处理下载逻辑
   * @param params 下载参数
   * @param params.song 歌曲信息
   * @param params.quality 音质
   * @param params.downloadPath 下载路径
   * @param params.skipIfExist 是否跳过已存在
   * @param params.mode 下载模式
   */
  private async processDownload({
    song,
    quality,
    downloadPath,
    skipIfExist,
    mode,
  }: {
    song: SongType;
    quality: SongLevelType;
    downloadPath?: string;
    skipIfExist?: boolean;
    mode?: "standard" | "playback";
  }): Promise<{ success: boolean; skipped?: boolean; message?: string; status?: string }> {
    try {
      const settingStore = useSettingStore();
      let url = "";
      let type = "mp3";

      const usePlayback = mode ? mode === "playback" : settingStore.usePlaybackForDownload;

      // 获取下载链接
      const levelName = songLevelData[quality].level;

      // 尝试获取播放链接
      if (usePlayback) {
        try {
          const result = await songUrl(song.id, levelName as Parameters<typeof songUrl>[1]);
          if (result.code === 200 && result?.data?.[0]?.url) {
            url = result.data[0].url;
            type = (result.data[0].type || result.data[0].encodeType || "mp3").toLowerCase();
          }
        } catch (e) {
          console.error("Error fetching playback url for download:", e);
        }
      }

      // 尝试使用解锁接口获取下载链接 (新增)
      if (!url && settingStore.useUnlockForDownload) {
        try {
          const servers = settingStore.songUnlockServer.filter((s) => s.enabled).map((s) => s.key);
          const artist = Array.isArray(song.artists) ? song.artists[0].name : song.artists;
          const keyWord = song.name + "-" + artist;

          if (servers.length > 0) {
            // 并发请求所有启用的解锁服务
            const results = await Promise.allSettled(
              servers.map((server) =>
                unlockSongUrl(song.id, keyWord, server).then((result) => ({
                  server,
                  result,
                  success: result.code === 200 && !!result.url,
                })),
              ),
            );

            // 查找第一个成功的结果
            for (const r of results) {
              if (r.status === "fulfilled" && r.value.success) {
                const unlockUrl = r.value?.result?.url;
                if (unlockUrl) {
                  url = unlockUrl;
                  // 尝试推断类型
                  if (url.includes(".flac")) type = "flac";
                  else if (url.includes(".ogg")) type = "ogg";
                  else if (url.includes(".wav")) type = "wav";
                  else if (url.includes(".m4a")) type = "m4a";
                  else type = "mp3";
                  console.log(`🔓 [${song.id}] Unlock download URL found:`, url);
                  break;
                }
              }
            }
          }
        } catch (e) {
          console.error("Error fetching unlock url for download:", e);
        }
      }

      // 尝试获取标准下载链接
      if (!url) {
        const result = await songDownloadUrl(song.id, quality);
        if (result.code !== 200 || !result?.data?.url) {
          return {
            success: false,
            message: result.message || "获取下载链接失败",
          };
        }
        url = result.data.url;
        type = result.data.type?.toLowerCase() || "mp3";
      }

      const infoObj = getPlayerInfoObj(song) || {
        name: song.name || "未知歌曲",
        artist: "未知歌手",
        album: "未知专辑",
      };

      const baseTitle = infoObj.name || "未知歌曲";
      const rawArtist = infoObj.artist || "未知歌手";
      const rawAlbum = infoObj.album || "未知专辑";

      const safeArtist = rawArtist.replace(/[/:*?"<>|]/g, "&");
      const safeAlbum = rawAlbum.replace(/[/:*?"<>|]/g, "&");

      const finalPath = downloadPath || settingStore.downloadPath;

      // 音乐命名格式与文件夹分类
      const { fileNameFormat, folderStrategy } = settingStore;

      let displayName = baseTitle;
      if (fileNameFormat === "artist-title") {
        displayName = `${safeArtist} - ${baseTitle}`;
      } else if (fileNameFormat === "title-artist") {
        displayName = `${baseTitle} - ${safeArtist}`;
      }

      const safeFileName = displayName.replace(/[/:*?"<>|]/g, "&");

      let targetPath = finalPath;
      if (folderStrategy === "artist") {
        targetPath = `${finalPath}\\${safeArtist}`;
      } else if (folderStrategy === "artist-album") {
        targetPath = `${finalPath}\\${safeArtist}\\${safeAlbum}`;
      }

      // 校验下载路径
      if (finalPath === "" && isElectron) {
        return { success: false, message: "请配置下载目录" };
      }

      if (isElectron) {
        const { downloadMeta, downloadCover, downloadLyric, saveMetaFile } = settingStore;
        let lyric = "";
        if (downloadLyric) {
          const lyricResult = (await songLyric(song.id)) as LyricResult;
          lyric = this.processLyric(lyricResult);
        }

        const config = {
          fileName: safeFileName,
          fileType: type.toLowerCase(),
          path: targetPath,
          downloadMeta,
          downloadCover,
          downloadLyric,
          saveMetaFile,
          songData: cloneDeep(song),
          lyric,
          skipIfExist,
        };

        const result = await window.electron.ipcRenderer.invoke("download-file", url, config);
        if (result.status === "skipped") {
          return { success: true, skipped: true, message: result.message };
        }
        if (result.status === "cancelled") {
          return { success: false, status: "cancelled", message: "已取消" };
        }
        if (result.status === "error") {
          return { success: false, message: result.message || "下载失败" };
        }
      } else {
        saveAs(url, `${safeFileName}.${type}`);
      }

      return { success: true };
    } catch (error) {
      console.error(`Error downloading song ${song.name}:`, error);
      return { success: false, message: "下载过程出错" };
    }
  }

  /**
   * 歌词处理辅助函数
   * @param lyricResult 歌词结果
   * @returns 处理后的歌词字符串
   */
  private processLyric(lyricResult: LyricResult): string {
    const settingStore = useSettingStore();
    try {
      const rawLyric = lyricResult?.lrc?.lyric || "";
      const excludeRegex = /^\{"t":\d+,"c":\[\{"[^"]+":"[^"]*"}(?:,\{"[^"]+":"[^"]*"})*]}$/;
      const lrc = rawLyric
        .split("\n")
        .filter((line: string) => !excludeRegex.test(line.trim()))
        .join("\n");

      if (!lrc) return "";

      const tlyric = settingStore.downloadLyricTranslation ? lyricResult?.tlyric?.lyric : null;
      const romalrc = settingStore.downloadLyricRomaji ? lyricResult?.romalrc?.lyric : null;

      if (!tlyric && !romalrc) return lrc;

      // 正则：匹配 [mm:ss.xx] 或 [mm:ss.xxx] 形式的时间标签
      const timeTagRe = /\[(\d{2}):(\d{2})(?:\.(\d{1,3}))?\]/g;

      // 把时间字符串转成秒（用于模糊匹配）
      const timeStrToSeconds = (timeStr: string) => {
        const m = timeStr.match(/^(\d{2}):(\d{2})(?:\.(\d{1,3}))?$/);
        if (!m) return 0;
        const minutes = parseInt(m[1], 10);
        const seconds = parseInt(m[2], 10);
        const frac = m[3] ? parseInt((m[3] + "00").slice(0, 3), 10) : 0;
        return minutes * 60 + seconds + frac / 1000;
      };

      const parseToMap = (lyricStr: string) => {
        const map = new Map<string, string>();
        if (!lyricStr) return map;
        const lines = lyricStr.split(/\r?\n/);
        for (const raw of lines) {
          let m: RegExpExecArray | null;
          const timeTags: string[] = [];
          timeTagRe.lastIndex = 0;
          while ((m = timeTagRe.exec(raw)) !== null) {
            const frac = m[3] ?? "";
            const tag = `[${m[1]}:${m[2]}${frac ? "." + frac : ""}]`;
            timeTags.push(tag);
          }
          const text = raw.replace(timeTagRe, "").trim();
          for (const tag of timeTags) {
            if (text) {
              const prev = map.get(tag);
              map.set(tag, prev ? prev + "\n" + text : text);
            }
          }
        }
        return map;
      };

      const findMatch = (map: Map<string, string>, currentTag: string) => {
        const exact = map.get(currentTag);
        if (exact) return exact;

        const tSec = timeStrToSeconds(currentTag.slice(1, -1));
        let bestTag: string | null = null;
        let bestDiff = Infinity;
        for (const key of Array.from(map.keys())) {
          const kSec = timeStrToSeconds(key.slice(1, -1));
          const diff = Math.abs(kSec - tSec);
          if (diff < bestDiff) {
            bestDiff = diff;
            bestTag = key;
          }
        }
        if (bestTag && bestDiff < 0.5) {
          return map.get(bestTag);
        }
        return null;
      };

      const tMap = parseToMap(tlyric || "");
      const rMap = parseToMap(romalrc || "");
      const lines: string[] = [];
      const lrcLinesRaw = lrc.split(/\r?\n/);

      for (const raw of lrcLinesRaw) {
        let m: RegExpExecArray | null;
        const timeTags: string[] = [];
        timeTagRe.lastIndex = 0;
        while ((m = timeTagRe.exec(raw)) !== null) {
          const frac = m[3] ?? "";
          const tag = `[${m[1]}:${m[2]}${frac ? "." + frac : ""}]`;
          timeTags.push(tag);
        }

        if (timeTags.length === 0) continue;
        const text = raw.replace(timeTagRe, "").trim();
        if (!text) continue;

        for (const timeTag of timeTags) {
          lines.push(`${timeTag}${text}`);
          const lyricMaps = [
            { map: tMap, enabled: tlyric },
            { map: rMap, enabled: romalrc },
          ];

          for (const { map, enabled } of lyricMaps) {
            if (enabled) {
              const matchedText = findMatch(map, timeTag);
              if (matchedText) {
                for (const lt of matchedText.split("\n")) {
                  if (lt.trim()) lines.push(`${timeTag}${lt}`);
                }
              }
            }
          }
        }
      }
      return lines.join("\n");
    } catch (e) {
      console.error("Lyric processing failed", e);
      return "";
    }
  }

  /**
   * 移除下载任务
   * @param songId 歌曲ID
   */
  public removeDownload(songId: number) {
    this.init();
    const dataStore = useDataStore();

    // 从队列中移除
    this.queue = this.queue.filter((task) => task.song.id !== songId);

    // 如果正在下载，尝试取消
    if (this.activeDownloads.has(songId) && isElectron) {
      window.electron.ipcRenderer.invoke("cancel-download", songId);
    }
    dataStore.removeDownloadingSong(songId);
  }

  /**
   * 重试下载任务
   * @param songId 歌曲ID
   */
  public retryDownload(songId: number) {
    this.init();
    const dataStore = useDataStore();
    const task = dataStore.downloadingSongs.find((item) => item.song.id === songId);
    if (!task) return;

    // 重置任务状态与进度
    dataStore.updateDownloadStatus(songId, "waiting");
    dataStore.updateDownloadProgress(songId, 0, "0MB", "0MB");

    const isQueued = this.queue.some((t) => t.song.id === songId);
    const isActive = this.activeDownloads.has(songId);

    // 重新加入队列 (避免重复)
    if (!isQueued && !isActive) {
      this.queue.push({ song: task.song, quality: task.quality });
      this.processQueue();
    }
  }

  /**
   * 重试所有下载任务（失败的）
   */
  public retryAllDownloads() {
    this.init();
    const dataStore = useDataStore();
    // 找到所有失败的任务
    const failedSongs = dataStore.downloadingSongs
      .filter((item) => item.status === "failed")
      .map((item) => item.song.id);

    failedSongs.forEach((id) => {
      this.retryDownload(id);
    });
  }
}

let instance: DownloadManager | null = null;

export const useDownloadManager = (): DownloadManager => {
  if (!instance) instance = new DownloadManager();
  return instance;
};
