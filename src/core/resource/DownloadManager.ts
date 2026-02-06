import type { SongType, SongLevelType } from "@/types/main";
import { useDataStore, useSettingStore } from "@/stores";
import { isElectron } from "@/utils/env";
import { saveAs } from "file-saver";
import { cloneDeep } from "lodash-es";
import { songDownloadUrl, songLyric, songLyricTTML, songUrl, unlockSongUrl } from "@/api/song";
import { qqMusicMatch } from "@/api/qqmusic";
import { songLevelData } from "@/utils/meta";
import { getPlayerInfoObj } from "@/utils/format";
import { getConverter } from "@/utils/opencc";

import {
  lyricLinesToTTML,
  parseQRCLyric,
  parseSmartLrc,
  alignLyrics,
} from "@/utils/lyric/lyricParser";
import { generateASS } from "@/utils/assGenerator";
import { parseTTML, parseYrc, type LyricLine } from "@applemusic-like-lyrics/lyric";

interface DownloadTask {
  song: SongType;
  quality: SongLevelType;
}

interface LyricResult {
  lrc?: { lyric: string };
  tlyric?: { lyric: string };
  romalrc?: { lyric: string };
  yrc?: { lyric: string };
  ttml?: { lyric: string };
}

interface DownloadStrategy {
  getDownloadUrl(): Promise<{ url: string; type: string }>;
  getFileName(): string;
  getDownloadPath(): string;
  fetchLyrics(): Promise<LyricResult | null>;
  shouldDownloadLyrics(): boolean;
  shouldDownloadCover(): boolean;
  shouldDownloadMeta(): boolean;
}

class SongDownloadStrategy implements DownloadStrategy {
  private settingStore = useSettingStore();
  private dataStore = useDataStore();

  constructor(
    private song: SongType,
    private quality: SongLevelType
  ) {}

  async getDownloadUrl(): Promise<{ url: string; type: string }> {
    const usePlayback = this.settingStore.usePlaybackForDownload;
    const levelName = songLevelData[this.quality].level;

    // 1. 如果启用，尝试使用播放链接
    if (usePlayback) {
      try {
        const result = await songUrl(this.song.id, levelName as Parameters<typeof songUrl>[1]);
        if (result.code === 200 && result?.data?.[0]?.url) {
          return {
            url: result.data[0].url,
            type: (result.data[0].type || result.data[0].encodeType || "mp3").toLowerCase(),
          };
        }
      } catch (e) {
        console.error("Error fetching playback url for download:", e);
      }
    }

    // 2. 如果启用，尝试使用解锁链接
    const isVipUser = this.dataStore.userData?.vipType > 0;
    const isRestricted = this.song.free === 1 || this.song.free === 4 || this.song.free === 8;
    const canUseUnlock = !isRestricted || isVipUser;

    if (this.settingStore.useUnlockForDownload && canUseUnlock) {
      try {
        const servers = this.settingStore.songUnlockServer
          .filter((s) => s.enabled)
          .map((s) => s.key);
        const artist = (
          Array.isArray(this.song.artists) ? this.song.artists[0]?.name : this.song.artists
        ) || "";
        const keyWord = `${this.song.name}-${artist}`;

        if (servers.length > 0) {
          const results = await Promise.allSettled(
            servers.map((server) =>
              unlockSongUrl(this.song.id, keyWord, server).then((result) => ({
                server,
                result,
                success: result.code === 200 && !!result.url,
              }))
            )
          );

          for (const r of results) {
            if (r.status === "fulfilled" && r.value.success) {
              const unlockUrl = r.value?.result?.url;
              if (unlockUrl) {
                const extensionMatch = unlockUrl.match(/\.([a-z0-9]+)(?:[?#]|$)/i);
                const extension = extensionMatch ? extensionMatch[1].toLowerCase() : "mp3";
                console.log(`🔓 [${this.song.id}] Unlock download URL found:`, unlockUrl);
                return { url: unlockUrl, type: extension };
              }
            }
          }
        }
      } catch (e) {
        console.error("Error fetching unlock url for download:", e);
      }
    }

    // 3. 标准下载链接
    const result = await songDownloadUrl(this.song.id, this.quality);
    if (result.code !== 200 || !result?.data?.url) {
      throw new Error(result.message || "获取下载链接失败");
    }
    return {
      url: result.data.url,
      type: result.data.type?.toLowerCase() || "mp3",
    };
  }

  getFileName(): string {
    const infoObj = getPlayerInfoObj(this.song) || {
      name: this.song.name || "未知歌曲",
      artist: "未知歌手",
      album: "未知专辑",
    };
    const baseTitle = infoObj.name || "未知歌曲";
    const rawArtist = infoObj.artist || "未知歌手";
    const safeArtist = rawArtist.replace(/[/:*?"<>|]/g, "&");
    const { fileNameFormat } = this.settingStore;
    
    let displayName = baseTitle;
    if (fileNameFormat === "artist-title") {
      displayName = `${safeArtist} - ${baseTitle}`;
    } else if (fileNameFormat === "title-artist") {
      displayName = `${baseTitle} - ${safeArtist}`;
    }
    
    return displayName.replace(/[/:*?"<>|]/g, "&");
  }

  getDownloadPath(): string {
    const finalPath = this.settingStore.downloadPath;
    const infoObj = getPlayerInfoObj(this.song) || {
        artist: "未知歌手",
        album: "未知专辑",
    };
    const rawArtist = infoObj.artist || "未知歌手";
    const rawAlbum = infoObj.album || "未知专辑";
    const safeArtist = rawArtist.replace(/[/:*?"<>|]/g, "&");
    const safeAlbum = rawAlbum.replace(/[/:*?"<>|]/g, "&");
    const { folderStrategy } = this.settingStore;

    if (folderStrategy === "artist") {
      return `${finalPath}\\${safeArtist}`;
    } else if (folderStrategy === "artist-album") {
      return `${finalPath}\\${safeArtist}\\${safeAlbum}`;
    }
    return finalPath;
  }

  shouldDownloadLyrics(): boolean {
    return this.settingStore.downloadLyric && this.settingStore.downloadMeta;
  }
  
  shouldDownloadCover(): boolean {
    return this.settingStore.downloadCover && this.settingStore.downloadMeta;
  }

  shouldDownloadMeta(): boolean {
    return this.settingStore.downloadMeta;
  }

  async fetchLyrics(): Promise<LyricResult | null> {
    if (!this.shouldDownloadLyrics()) return null;
    return (await songLyric(this.song.id)) as LyricResult;
  }
}

class CustomDownloadStrategy implements DownloadStrategy {
  constructor(private song: SongType) {}

  async getDownloadUrl(): Promise<{ url: string; type: string }> {
    if (!this.song.customUrl) throw new Error("无效的自定义下载链接");
    return { url: this.song.customUrl, type: "" }; // 类型由 IPC 或文件名决定
  }

  getFileName(): string {
    return this.song.name.replace(/[/:*?"<>|]/g, "&");
  }

  getDownloadPath(): string {
    return useSettingStore().downloadPath;
  }

  async fetchLyrics(): Promise<LyricResult | null> {
    return null;
  }

  shouldDownloadLyrics(): boolean { return false; }
  shouldDownloadCover(): boolean { return false; }
  shouldDownloadMeta(): boolean { return false; }
}

class LyricProcessor {
  private static settingStore = useSettingStore();

  static async process(lyricResult: LyricResult | null): Promise<string> {
    if (!lyricResult) return "";
    
    const lrc = lyricResult.lrc?.lyric || "";
    
    const finalLyric = lrc;
    
    return await this.convertToTraditionalIfNeeded(finalLyric);
  }

  static async fetchVerbatimLyrics(song: SongType, initialLyricResult: LyricResult | null): Promise<{ ttml: string; yrc: string }> {
    let ttmlLyric = "";
    let yrcLyric = "";
    
    console.log(`[Download] Fetching verbatim lyrics for ${song.name} (${song.id})...`);
    try {
      const ttmlRes = await songLyricTTML(song.id);
      if (typeof ttmlRes === "string") ttmlLyric = ttmlRes;

      if (!ttmlLyric) {
        yrcLyric = initialLyricResult?.yrc?.lyric || "";
        
        // QM 降级方案
        if (!yrcLyric) {
           try {
              const artistsStr = Array.isArray(song.artists)
                ? song.artists.map((a) => a.name).join("/")
                : String(song.artists || "");
              const keyword = `${song.name}-${artistsStr}`;
              const qmResult = await qqMusicMatch(keyword);
              
              if (qmResult?.code === 200 && qmResult?.qrc) {
                 const parsedLines = parseQRCLyric(qmResult.qrc, qmResult.trans, qmResult.roma);
                 if (parsedLines.length > 0) {
                   ttmlLyric = lyricLinesToTTML(parsedLines);
                 } else {
                   yrcLyric = qmResult.qrc;
                 }
              }
           } catch (e) {
              console.error("[Download] QM Fallback failed", e);
           }
        }
      }
    } catch (e) {
      console.error("[Download] Error fetching verbatim lyrics:", e);
    }
    return { ttml: ttmlLyric, yrc: yrcLyric };
  }

  static async convertToTraditionalIfNeeded(content: string): Promise<string> {
    if (!content) return "";
    const { downloadLyricToTraditional } = this.settingStore;
    if (downloadLyricToTraditional) {
      try {
        const converter = await getConverter("s2t");
        return converter(content);
      } catch (e) {
        console.error("繁简转换失败", e);
      }
    }
    return content;
  }
}

class DownloadManager {
  private queue: DownloadTask[] = [];
  private activeDownloads: Set<number> = new Set();
  private maxConcurrent: number = 1;
  private initialized: boolean = false;

  constructor() {
    this.setupIpcListeners();
  }

  public init() {
    if (this.initialized) return;
    this.initialized = true;
    if (!isElectron) return;
    
    const dataStore = useDataStore();
    // 重置卡住的下载
    dataStore.downloadingSongs.forEach((item) => {
      if (item.status === "downloading") {
        dataStore.updateDownloadStatus(item.song.id, "waiting");
        dataStore.updateDownloadProgress(item.song.id, 0, "0MB", "0MB");
      }
    });

    // 重新入队等待中的任务
    dataStore.downloadingSongs.forEach((item) => {
      if (item.status === "waiting") {
        const isQueued = this.queue.some((t) => t.song.id === item.song.id);
        const isActive = this.activeDownloads.has(item.song.id);
        if (!isQueued && !isActive) {
          this.queue.push({ song: item.song, quality: item.quality });
        }
      }
    });

    this.processQueue();
  }

  private setupIpcListeners() {
    if (typeof window === "undefined" || !window.electron?.ipcRenderer) return;
    window.electron.ipcRenderer.on("download-progress", (_event, progress) => {
      const { id, percent, transferredBytes, totalBytes } = progress;
      if (!id) return;
      const dataStore = useDataStore();
      const transferred = transferredBytes
        ? (transferredBytes / 1024 / 1024).toFixed(2) + "MB"
        : "0MB";
      const total = totalBytes ? (totalBytes / 1024 / 1024).toFixed(2) + "MB" : "0MB";
      dataStore.updateDownloadProgress(id, Number((percent * 100).toFixed(1)), transferred, total);
    });
  }

  public async getDownloadedSongs(): Promise<SongType[]> {
    const settingStore = useSettingStore();
    if (!isElectron) return [];
    const downloadPath = settingStore.downloadPath;
    if (!downloadPath) return [];
    try {
      return await window.electron.ipcRenderer.invoke("get-music-files", downloadPath);
    } catch (error) {
      console.error("Failed to get downloaded songs:", error);
      return [];
    }
  }

  public async addDownload(song: SongType, quality: SongLevelType) {
    this.init();
    const dataStore = useDataStore();
    const isQueued = this.queue.some((t) => t.song.id === song.id);
    const isActive = this.activeDownloads.has(song.id);
    const existing = dataStore.downloadingSongs.find((item) => item.song.id === song.id);

    if (existing) {
      if (existing.status === "failed") {
        this.retryDownload(song.id);
        return;
      }
      if (isQueued || isActive || existing.status === "waiting" || existing.status === "downloading") {
        return;
      }
    }

    dataStore.addDownloadingSong(song, quality);
    this.queue.push({ song, quality });
    this.processQueue();
  }

  public async addCustomDownload(url: string, fileName: string, referer?: string) {
    const id = -Math.floor(Date.now() + Math.random() * 1000);
    const song: SongType = {
      id,
      name: fileName,
      artists: [{ id: 0, name: "自定义下载" }],
      album: { id: 0, name: "" },
      duration: 0,
      cover: "",
      free: 0,
      mv: null,
      isCustom: true,
      customUrl: url,
      customReferer: referer,
      type: "song",
    };
    this.addDownload(song, "l");
  }

  private processQueue() {
    while (this.activeDownloads.size < this.maxConcurrent && this.queue.length > 0) {
      const task = this.queue.shift();
      if (task) this.startTask(task);
    }
  }

  private async startTask(task: DownloadTask) {
    this.activeDownloads.add(task.song.id);
    try {
      await this.executeDownload(task);
    } catch (error) {
      console.error(`Error processing task for song ${task.song.id}:`, error);
    } finally {
      this.activeDownloads.delete(task.song.id);
      this.processQueue();
    }
  }

  private async executeDownload(task: DownloadTask) {
    const dataStore = useDataStore();
    const { song } = task;
    dataStore.updateDownloadStatus(song.id, "downloading");

    try {
      const strategy = song.isCustom 
        ? new CustomDownloadStrategy(song) 
        : new SongDownloadStrategy(song, task.quality);

      const result = await this.processDownload(strategy, task);

      if (result.success) {
        dataStore.removeDownloadingSong(song.id);
        window.$message.success(`${song.name} 下载完成`);
      } else {
        if (result.status === "cancelled") return;
        const currentTask = dataStore.downloadingSongs.find((s) => s.song.id === song.id);
        if (!currentTask) return;
        dataStore.markDownloadFailed(song.id);
        window.$message.error(result.message || "下载失败");
      }
    } catch (error: any) {
      console.error("Download failed:", error);
      dataStore.markDownloadFailed(song.id);
      window.$message.error(error.message || "下载出错");
    }
  }

  private async processDownload(strategy: DownloadStrategy, task: DownloadTask) {
    const settingStore = useSettingStore();
    const { song } = task;
    
    // 1. 获取链接
    const { url, type } = await strategy.getDownloadUrl();
    
    // 2. 准备路径
    const safeFileName = strategy.getFileName();
    const targetPath = strategy.getDownloadPath();
    
    if (settingStore.downloadPath === "" && isElectron) {
      return { success: false, message: "请配置下载目录" };
    }

    // 3. 准备歌词和元数据
    let lyric = "";
    let ttmlLyric = "";
    let yrcLyric = "";
    let lyricResult: LyricResult | null = null;

    if (isElectron && strategy.shouldDownloadLyrics()) {
      lyricResult = await strategy.fetchLyrics();
      
      // 基础 LRC 处理
      if (lyricResult?.lrc?.lyric) {
         lyric = await LyricProcessor.convertToTraditionalIfNeeded(lyricResult.lrc.lyric);
      }
      
      // 高级歌词 (YRC/TTML)
      const { downloadMakeYrc, downloadSaveAsAss } = settingStore;
      if (downloadMakeYrc || downloadSaveAsAss) {
        const verbatim = await LyricProcessor.fetchVerbatimLyrics(song, lyricResult);
        ttmlLyric = verbatim.ttml;
        yrcLyric = verbatim.yrc;
      }
    }

    // 4. 配置 IPC 参数
    const config = {
      fileName: safeFileName,
      fileType: type,
      path: targetPath,
      downloadMeta: strategy.shouldDownloadMeta(),
      downloadCover: strategy.shouldDownloadCover(),
      downloadLyric: strategy.shouldDownloadLyrics(),
      saveMetaFile: strategy.shouldDownloadMeta() && settingStore.saveMetaFile,
      songData: cloneDeep(song),
      lyric,
      skipIfExist: true,
      threadCount: settingStore.downloadThreadCount,
      referer: song.customReferer,
      enableDownloadHttp2: settingStore.enableDownloadHttp2,
    };

    // 5. 调用下载
    if (isElectron) {
      const result = await window.electron.ipcRenderer.invoke("download-file", url, config);

      // 6. 后处理 (额外歌词 / ASS)
      const { downloadMakeYrc, downloadSaveAsAss } = settingStore;
      if (result.status !== "cancelled" && result.status !== "error") {
         if (downloadMakeYrc) {
             await this.saveVerbatimLyrics(ttmlLyric, yrcLyric, lyricResult, safeFileName, targetPath);
         }
         if (downloadSaveAsAss) {
             await this.saveAss(ttmlLyric, yrcLyric, lyricResult, safeFileName, targetPath, task);
         }
      }

      if (result.status === "skipped") return { success: true, skipped: true, message: result.message };
      if (result.status === "cancelled") return { success: false, status: "cancelled", message: "已取消" };
      if (result.status === "error") return { success: false, message: result.message || "下载失败" };
      
      return { success: true };
    } else {
      saveAs(url, `${safeFileName}.${type}`);
      return { success: true };
    }
  }

  private async saveVerbatimLyrics(ttml: string, yrc: string, lyricResult: LyricResult | null, fileName: string, path: string) {
     const settingStore = useSettingStore();
     let content = ttml || yrc;
     let merged = false;
     let lines: LyricLine[] = [];

     if (content) {
        // 尝试解析以进行合并
        if (ttml) {
           // 跳过 TTML 解析以保留原始内容
        } else if (yrc) {
           if (yrc.trim().startsWith("<") || yrc.includes("<QrcInfos>")) {
             lines = parseQRCLyric(yrc);
           } else {
             lines = parseYrc(yrc) || [];
           }
        }

        if (lines.length > 0) {
           const tlyric = settingStore.downloadLyricTranslation ? lyricResult?.tlyric?.lyric : null;
           const romalrc = settingStore.downloadLyricRomaji ? lyricResult?.romalrc?.lyric : null;

           if (tlyric) {
             const transParsed = parseSmartLrc(tlyric);
             if (transParsed?.lines?.length) {
               lines = alignLyrics(lines, transParsed.lines, "translatedLyric");
               merged = true;
             }
           }
           if (romalrc) {
             const romaParsed = parseSmartLrc(romalrc);
             if (romaParsed?.lines?.length) {
               lines = alignLyrics(lines, romaParsed.lines, "romanLyric");
               merged = true;
             }
           }

           if ((merged || yrc) && lines.length > 0) {
              content = lyricLinesToTTML(lines);
           }
        }
        
        content = await LyricProcessor.convertToTraditionalIfNeeded(content);
        const ext = ttml || lines.length > 0 ? "ttml" : "yrc";
        const encoding = settingStore.downloadLyricEncoding || "utf-8";
        
        if (ext === "ttml" && encoding !== "utf-8") {
           content = content.replace('encoding="utf-8"', `encoding="${encoding}"`);
           content = content.replace('encoding="UTF-8"', `encoding="${encoding}"`);
        }

        await window.electron.ipcRenderer.invoke("save-file", {
           path: `${path}\\${fileName}.${ext}`,
           content,
           encoding
        });
     }
  }

  private async saveAss(ttml: string, yrc: string, lyricResult: LyricResult | null, fileName: string, path: string, task: DownloadTask) {
     const settingStore = useSettingStore();
     let lines: LyricLine[] = [];
     
     if (ttml) {
        const parsed = parseTTML(ttml);
        if (parsed?.lines) lines = parsed.lines;
     } else if (yrc) {
        if (yrc.trim().startsWith("<")) lines = parseQRCLyric(yrc);
        else lines = parseYrc(yrc) || [];
     } else if (lyricResult?.lrc?.lyric) {
        const parsed = parseSmartLrc(lyricResult.lrc.lyric);
        if (parsed?.lines) lines = parsed.lines;
     }

     if (lines.length > 0) {
        const tlyric = settingStore.downloadLyricTranslation ? lyricResult?.tlyric?.lyric : null;
        if (tlyric) {
           const transParsed = parseSmartLrc(tlyric);
           if (transParsed?.lines?.length) lines = alignLyrics(lines, transParsed.lines, "translatedLyric");
        }
        
        const assContent = generateASS(lines, {
           title: task.song.name,
           artist: Array.isArray(task.song.artists) ? task.song.artists[0]?.name : typeof task.song.artists === 'string' ? task.song.artists : "",
        });

        await window.electron.ipcRenderer.invoke("save-file", {
           path: `${path}\\${fileName}.ass`,
           content: assContent,
           encoding: settingStore.downloadLyricEncoding || "utf-8"
        });
     }
  }

  public retryDownload(id: number) {
    const dataStore = useDataStore();
    const task = dataStore.downloadingSongs.find((s) => s.song.id === id);
    if (task) {
      dataStore.updateDownloadStatus(id, "waiting");
      this.addDownload(task.song, task.quality);
    }
  }

  public retryAllDownloads() {
    this.init();
    const dataStore = useDataStore();
    const failedSongs = dataStore.downloadingSongs
      .filter((item) => item.status === "failed")
      .map((item) => item.song.id);
    failedSongs.forEach((id) => this.retryDownload(id));
  }
}

const downloadManager = new DownloadManager();
export default downloadManager;
export const useDownloadManager = () => downloadManager;
