import type { SongType, SongLevelType, CustomDownloadType } from "@/types/main";
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

// 类型与接口定义

interface DownloadConfig {
  fileName: string;
  fileType: string;
  path: string;
  downloadMeta: boolean;
  downloadCover: boolean;
  downloadLyric: boolean;
  saveMetaFile: boolean;
  songData: SongType | CustomDownloadType;
  lyric: string;
  skipIfExist: boolean;
  threadCount: number;
  referer?: string;
  enableDownloadHttp2: boolean;
}

interface DownloadStrategy {
  readonly id: number | string;
  readonly name: string;
  readonly song: SongType | CustomDownloadType;
  readonly downloadUrl: string;

  // 准备阶段：获取链接，获取歌词，处理元数据
  prepare(): Promise<void>;

  // 执行阶段：返回给 Electron 下载器需要的配置对象
  getDownloadConfig(): DownloadConfig;

  // 收尾阶段：处理 ASS 生成，歌词文件写入
  postProcess(downloadedFilePath: string): Promise<void>;
}

interface LyricResult {
  lrc?: { lyric: string };
  tlyric?: { lyric: string };
  romalrc?: { lyric: string };
  yrc?: { lyric: string };
  ttml?: { lyric: string };
}

// 歌词处理辅助类

class LyricHelper {
  private static settingStore = useSettingStore();

  static async processBasic(lyricResult: LyricResult | null): Promise<string> {
    if (!lyricResult) return "";
    const lrc = lyricResult.lrc?.lyric || "";
    return await this.convertToTraditionalIfNeeded(lrc);
  }

  static async fetchVerbatim(
    song: SongType,
    initialLyricResult: LyricResult | null,
  ): Promise<{ ttml: string; yrc: string }> {
    let ttmlLyric = "";
    let yrcLyric = "";

    try {
      const ttmlRes = await songLyricTTML(song.id);
      if (typeof ttmlRes === "string") ttmlLyric = ttmlRes;

      if (!ttmlLyric) {
        yrcLyric = initialLyricResult?.yrc?.lyric || "";

        // 尝试 QQ 音乐匹配兜底
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

  static async saveVerbatimFile(
    ttml: string,
    yrc: string,
    lyricResult: LyricResult | null,
    fileName: string,
    path: string,
  ) {
    const settingStore = useSettingStore();
    let content = ttml || yrc;
    let merged = false;
    let lines: LyricLine[] = [];

    if (content) {
      if (yrc && !ttml) {
        // 优先使用 TTML，若无则解析 YRC
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

      content = await this.convertToTraditionalIfNeeded(content);
      const ext = ttml || lines.length > 0 ? "ttml" : "yrc";
      const encoding = settingStore.downloadLyricEncoding || "utf-8";

      if (ext === "ttml" && encoding !== "utf-8") {
        content = content.replace('encoding="utf-8"', `encoding="${encoding}"`);
        content = content.replace('encoding="UTF-8"', `encoding="${encoding}"`);
      }

      await window.electron.ipcRenderer.invoke("save-file", {
        path: `${path}\\${fileName}.${ext}`,
        content,
        encoding,
      });
    }
  }

  static async saveAssFile(
    ttml: string,
    yrc: string,
    lyricResult: LyricResult | null,
    fileName: string,
    path: string,
    title: string,
    artist: string,
  ) {
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
        if (transParsed?.lines?.length)
          lines = alignLyrics(lines, transParsed.lines, "translatedLyric");
      }

      const assContent = generateASS(lines, { title, artist });

      await window.electron.ipcRenderer.invoke("save-file", {
        path: `${path}\\${fileName}.ass`,
        content: assContent,
        encoding: settingStore.downloadLyricEncoding || "utf-8",
      });
    }
  }
}

// 下载策略实现

class SongDownloadStrategy implements DownloadStrategy {
  private settingStore = useSettingStore();
  private dataStore = useDataStore();

  // prepare 阶段准备的状态
  private _downloadUrl = "";
  private fileType = "mp3";
  private lyricResult: LyricResult | null = null;
  private basicLyric = "";
  private ttmlLyric = "";
  private yrcLyric = "";

  constructor(
    public readonly song: SongType,
    private quality: SongLevelType,
  ) {}

  get id() {
    return this.song.id;
  }
  get name() {
    return this.song.name;
  }
  get downloadUrl() {
    return this._downloadUrl;
  }

  async prepare(): Promise<void> {
    // 解析下载链接
    const { url, type } = await this.resolveUrl();
    this._downloadUrl = url;
    this.fileType = type;

    // 获取歌词
    if (this.shouldDownloadLyrics()) {
      this.lyricResult = (await songLyric(this.song.id)) as LyricResult;

      // 处理基础歌词
      this.basicLyric = await LyricHelper.processBasic(this.lyricResult);

      // 处理逐字歌词 (后续使用)
      const { downloadMakeYrc, downloadSaveAsAss } = this.settingStore;
      if (downloadMakeYrc || downloadSaveAsAss) {
        const verbatim = await LyricHelper.fetchVerbatim(this.song, this.lyricResult);
        this.ttmlLyric = verbatim.ttml;
        this.yrcLyric = verbatim.yrc;
      }
    }
  }

  getDownloadConfig(): DownloadConfig {
    const fileName = this.getFileName();
    const targetPath = this.getDownloadPath();
    const { downloadMeta, downloadCover, saveMetaFile, downloadThreadCount, enableDownloadHttp2 } =
      this.settingStore;

    return {
      fileName,
      fileType: this.fileType,
      path: targetPath,
      downloadMeta: downloadMeta,
      downloadCover: downloadCover && downloadMeta,
      downloadLyric: this.shouldDownloadLyrics(),
      saveMetaFile: downloadMeta && saveMetaFile,
      songData: cloneDeep(this.song),
      lyric: this.basicLyric,
      skipIfExist: true,
      threadCount: downloadThreadCount,
      enableDownloadHttp2: enableDownloadHttp2,
    };
  }

  async postProcess(downloadedFilePath: string): Promise<void> {
    console.log(`Post-processing file: ${downloadedFilePath}`);
    // 使用存储的文件名和路径
    const fileName = this.getFileName();
    const targetPath = this.getDownloadPath();
    const { downloadMakeYrc, downloadSaveAsAss } = this.settingStore;

    if (downloadMakeYrc) {
      await LyricHelper.saveVerbatimFile(
        this.ttmlLyric,
        this.yrcLyric,
        this.lyricResult,
        fileName,
        targetPath,
      );
    }

    if (downloadSaveAsAss) {
      const artist = Array.isArray(this.song.artists)
        ? this.song.artists[0]?.name
        : String(this.song.artists || "");
      await LyricHelper.saveAssFile(
        this.ttmlLyric,
        this.yrcLyric,
        this.lyricResult,
        fileName,
        targetPath,
        this.song.name,
        artist,
      );
    }
  }

  private async resolveUrl(): Promise<{ url: string; type: string }> {
    const usePlayback = this.settingStore.usePlaybackForDownload;
    const levelName = songLevelData[this.quality].level;

    // 尝试使用播放链接
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

    // 尝试使用解锁链接
    const isVipUser = this.dataStore.userData?.vipType > 0;
    const isRestricted = this.song.free === 1 || this.song.free === 4 || this.song.free === 8;
    const canUseUnlock = !isRestricted || isVipUser;

    if (this.settingStore.useUnlockForDownload && canUseUnlock) {
      try {
        const servers = this.settingStore.songUnlockServer
          .filter((s) => s.enabled)
          .map((s) => s.key);
        const artist =
          (Array.isArray(this.song.artists) ? this.song.artists[0]?.name : this.song.artists) || "";
        const keyWord = `${this.song.name}-${artist}`;

        if (servers.length > 0) {
          const results = await Promise.allSettled(
            servers.map((server) =>
              unlockSongUrl(this.song.id, keyWord, server).then((result) => ({
                server,
                result,
                success: result.code === 200 && !!result.url,
              })),
            ),
          );

          for (const r of results) {
            if (r.status === "fulfilled" && r.value.success) {
              const unlockUrl = r.value?.result?.url;
              if (unlockUrl) {
                const extensionMatch = unlockUrl.match(/\.([a-z0-9]+)(?:[?#]|$)/i);
                return {
                  url: unlockUrl,
                  type: extensionMatch ? extensionMatch[1].toLowerCase() : "mp3",
                };
              }
            }
          }
        }
      } catch (e) {
        console.error("Error fetching unlock url for download:", e);
      }
    }

    // 标准下载流程
    const result = await songDownloadUrl(this.song.id, this.quality);
    if (result.code !== 200 || !result?.data?.url) {
      throw new Error(result.message || "获取下载链接失败");
    }
    return {
      url: result.data.url,
      type: result.data.type?.toLowerCase() || "mp3",
    };
  }

  private getFileName(): string {
    const infoObj = getPlayerInfoObj(this.song) || {
      name: this.song.name || "未知歌曲",
      artist: "未知歌手",
    };
    const baseTitle = infoObj.name || "未知歌曲";
    const rawArtist = infoObj.artist || "未知歌手";
    const safeArtist = rawArtist.replace(/[/:*?"<>|]/g, "&");
    const { fileNameFormat } = this.settingStore;

    let displayName = baseTitle;
    if (fileNameFormat === "artist-title") displayName = `${safeArtist} - ${baseTitle}`;
    else if (fileNameFormat === "title-artist") displayName = `${baseTitle} - ${safeArtist}`;

    return displayName.replace(/[/:*?"<>|]/g, "&");
  }

  private getDownloadPath(): string {
    const finalPath = this.settingStore.downloadPath;
    const infoObj = getPlayerInfoObj(this.song) || { artist: "未知歌手", album: "未知专辑" };
    const safeArtist = (infoObj.artist || "未知歌手").replace(/[/:*?"<>|]/g, "&");
    const safeAlbum = (infoObj.album || "未知专辑").replace(/[/:*?"<>|]/g, "&");
    const { folderStrategy } = this.settingStore;

    if (folderStrategy === "artist") return `${finalPath}\\${safeArtist}`;
    else if (folderStrategy === "artist-album") return `${finalPath}\\${safeArtist}\\${safeAlbum}`;
    return finalPath;
  }

  private shouldDownloadLyrics(): boolean {
    return this.settingStore.downloadLyric && this.settingStore.downloadMeta;
  }
}

class CustomDownloadStrategy implements DownloadStrategy {
  private settingStore = useSettingStore();

  constructor(public readonly song: CustomDownloadType) {}

  get id() {
    return this.song.id;
  }
  get name() {
    return this.song.name;
  }
  get downloadUrl() {
    return this.song.url;
  }

  async prepare(): Promise<void> {
    if (!this.song.url) throw new Error("无效的自定义下载链接");
  }

  getDownloadConfig(): DownloadConfig {
    const fileName = this.song.name.replace(/[/:*?"<>|]/g, "&");
    return {
      fileName,
      fileType: "", // 后续自动检测
      path: this.settingStore.downloadPath,
      downloadMeta: false,
      downloadCover: false,
      downloadLyric: false,
      saveMetaFile: false,
      songData: cloneDeep(this.song),
      lyric: "",
      skipIfExist: true,
      threadCount: this.settingStore.downloadThreadCount,
      referer: this.song.referer,
      enableDownloadHttp2: this.settingStore.enableDownloadHttp2,
    };
  }

  async postProcess(): Promise<void> {
    // 自定义下载无需处理歌词或ASS
  }
}

// 下载管理器核心类

class DownloadManager {
  private queue: DownloadStrategy[] = [];
  private activeDownloads: Set<number | string> = new Set();
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
    // 清理卡住的任务状态
    dataStore.downloadingSongs.forEach((item) => {
      if (item.status === "downloading") {
        dataStore.updateDownloadStatus(item.song.id, "waiting");
        dataStore.updateDownloadProgress(item.song.id, 0, "0MB", "0MB");
      }
    });

    // 重新加入等待中的任务
    dataStore.downloadingSongs.forEach((item) => {
      if (item.status === "waiting") {
        const isQueued = this.queue.some((s) => s.id === item.song.id);
        const isActive = this.activeDownloads.has(item.song.id);
        if (!isQueued && !isActive) {
          // 区分任务类型
          if (
            "url" in item.song &&
            typeof item.song.url === "string" &&
            typeof item.song.id === "string"
          ) {
            // 自定义下载
            this.queue.push(new CustomDownloadStrategy(item.song as CustomDownloadType));
          } else {
            // 常规歌曲下载
            this.queue.push(new SongDownloadStrategy(item.song as SongType, item.quality));
          }
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

    if (this.checkExisting(song.id)) return;

    dataStore.addDownloadingSong(song, quality);
    const strategy = new SongDownloadStrategy(song, quality);
    this.queue.push(strategy);
    this.processQueue();
  }

  public async addCustomDownload(url: string, fileName: string, referer?: string) {
    this.init();
    const dataStore = useDataStore();

    // 生成唯一字符串ID
    const id = `custom-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

    const customItem: CustomDownloadType = {
      id,
      name: fileName,
      url,
      referer,
      artists: [{ id: 0, name: "自定义下载" }],
      album: { id: 0, name: "" },
      cover: "",
    };

    dataStore.addDownloadingSong(customItem, "l"); // 自定义下载不区分音质
    const strategy = new CustomDownloadStrategy(customItem);
    this.queue.push(strategy);
    this.processQueue();
  }

  public retryDownload(id: number | string) {
    const dataStore = useDataStore();
    const task = dataStore.downloadingSongs.find((s) => s.song.id === id);
    if (task) {
      dataStore.updateDownloadStatus(id, "waiting");
      // 重新加入队列
      if (
        "url" in task.song &&
        typeof task.song.url === "string" &&
        typeof task.song.id === "string"
      ) {
        this.queue.push(new CustomDownloadStrategy(task.song as CustomDownloadType));
      } else {
        this.queue.push(new SongDownloadStrategy(task.song as SongType, task.quality));
      }
      this.processQueue();
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

  private checkExisting(id: number | string): boolean {
    const dataStore = useDataStore();
    const existing = dataStore.downloadingSongs.find((item) => item.song.id === id);

    if (existing) {
      if (existing.status === "failed") {
        this.retryDownload(id);
        return true;
      }
      const isQueued = this.queue.some((s) => s.id === id);
      const isActive = this.activeDownloads.has(id);
      if (
        isQueued ||
        isActive ||
        existing.status === "waiting" ||
        existing.status === "downloading"
      ) {
        return true;
      }
    }
    return false;
  }

  private processQueue() {
    while (this.activeDownloads.size < this.maxConcurrent && this.queue.length > 0) {
      const strategy = this.queue.shift();
      if (strategy) this.startTask(strategy);
    }
  }

  private async startTask(strategy: DownloadStrategy) {
    this.activeDownloads.add(strategy.id);
    const dataStore = useDataStore();
    dataStore.updateDownloadStatus(strategy.id, "downloading");

    try {
      await strategy.prepare();
      const config = strategy.getDownloadConfig();

      if (isElectron) {
        if (!strategy.downloadUrl) throw new Error("Download URL missing");

        const downloadResult = await window.electron.ipcRenderer.invoke(
          "download-file",
          strategy.downloadUrl,
          config,
        );

        if (downloadResult.success || downloadResult.status === "skipped") {
          await strategy.postProcess(downloadResult.path || config.path); // IPC 返回结果通常包含路径
          dataStore.removeDownloadingSong(strategy.id);
          window.$message.success(`${strategy.name} 下载完成`);
        } else {
          if (downloadResult.status === "cancelled") {
            // 已取消，无需处理
          } else {
            throw new Error(downloadResult.message || "下载失败");
          }
        }
      } else {
        // 浏览器端兜底处理
        if (!strategy.downloadUrl) throw new Error("Download URL missing");
        saveAs(strategy.downloadUrl, config.fileName + "." + config.fileType);
        dataStore.removeDownloadingSong(strategy.id);
      }
    } catch (error: any) {
      console.error(`Error processing task ${strategy.name}:`, error);
      dataStore.markDownloadFailed(strategy.id);
      window.$message.error(error.message || "下载出错");
    } finally {
      this.activeDownloads.delete(strategy.id);
      this.processQueue();
    }
  }
}

export const downloadManager = new DownloadManager();
export const useDownloadManager = () => downloadManager;
export default downloadManager;
