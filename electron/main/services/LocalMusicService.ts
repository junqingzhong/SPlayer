import { existsSync } from "node:fs";
import { mkdir, readdir, stat } from "node:fs/promises";
import { join, extname, basename } from "node:path";
import { parseFile } from "music-metadata";
import { LocalMusicDB, type MusicTrack } from "../database/LocalMusicDB";
import { processLog } from "../logger";
import { useStore } from "../store";
import { loadNativeModule } from "../utils/native-loader";

type toolModule = typeof import("@native/tools");
const tools: toolModule | null = loadNativeModule("tools.node", "tools");

const isNativeModuleAvailable = tools !== null;
if (!isNativeModuleAvailable) {
  processLog.warn("[LocalMusicService] Rust 原生模块未加载，将使用 Node.js 降级方案");
}

const SUPPORTED_EXTENSIONS = [
  ".mp3",
  ".flac",
  ".wav",
  ".aac",
  ".m4a",
  ".ogg",
  ".opus",
  ".wma",
  ".ape",
  ".aiff",
  ".aif",
];

/** 本地音乐服务 */
export class LocalMusicService {
  /** 数据库实例 */
  private db: LocalMusicDB | null = null;
  /** 运行锁：防止并发扫描 */
  private isRefreshing = false;
  /** 初始化 Promise：确保只初始化一次 */
  private initPromise: Promise<void> | null = null;
  /** 记录最后一次使用的 DB 路径 */
  private lastDbPath: string = "";

  /** 获取动态路径 */
  get paths() {
    const store = useStore();
    const localCachePath = join(store.get("cachePath"), "local-data");
    return {
      dbPath: join(localCachePath, "library.db"),
      jsonPath: join(localCachePath, "library.json"),
      coverDir: join(localCachePath, "covers"),
      cacheDir: localCachePath,
    };
  }

  /** 初始化 */
  private async ensureInitialized(): Promise<void> {
    const { dbPath, jsonPath, coverDir } = this.paths;
    // 如果路径变了，强制重新初始化
    if (this.lastDbPath && this.lastDbPath !== dbPath) {
      this.initPromise = null;
      if (this.db) {
        this.db.close();
        this.db = null;
      }
    }
    this.lastDbPath = dbPath;
    if (this.initPromise) return this.initPromise;
    this.initPromise = (async () => {
      if (!existsSync(coverDir)) {
        await mkdir(coverDir, { recursive: true });
      }
      if (!this.db) {
        this.db = new LocalMusicDB(dbPath);
        this.db.init();
      }
      await this.db.migrateFromJsonIfNeeded(jsonPath);
    })();
    return this.initPromise;
  }

  /**
   * Node.js 降级扫描方案
   */
  private async _scanWithNodeJS(
    dirPaths: string[],
    ignoreDelete: boolean,
    onProgress?: (current: number, total: number) => void,
    onTracksBatch?: (tracks: MusicTrack[]) => void,
  ) {
    processLog.info("[LocalMusicService] 使用 Node.js 降级方案扫描");
    const allTracks: MusicTrack[] = [];
    let processedCount = 0;

    const scanDir = async (dirPath: string): Promise<string[]> => {
      const files: string[] = [];
      try {
        const entries = await readdir(dirPath, { withFileTypes: true });
        for (const entry of entries) {
          const fullPath = join(dirPath, entry.name);
          if (entry.isDirectory()) {
            files.push(...(await scanDir(fullPath)));
          } else if (entry.isFile()) {
            const ext = extname(entry.name).toLowerCase();
            if (SUPPORTED_EXTENSIONS.includes(ext)) {
              files.push(fullPath);
            }
          }
        }
      } catch (error) {
        processLog.error(`扫描目录失败: ${dirPath}`, error);
      }
      return files;
    };

    const allFiles: string[] = [];
    for (const dirPath of dirPaths) {
      if (existsSync(dirPath)) {
        allFiles.push(...(await scanDir(dirPath)));
      }
    }

    processLog.info(`找到 ${allFiles.length} 个音频文件`);

    for (const filePath of allFiles) {
      try {
        const fileStats = await stat(filePath);
        const metadata = await parseFile(filePath, { skipCovers: true });

        allTracks.push({
          id: filePath,
          path: filePath,
          title: metadata.common.title || basename(filePath, extname(filePath)),
          artist: metadata.common.artist || "未知艺术家",
          album: metadata.common.album || "未知专辑",
          duration: metadata.format.duration ? Math.floor(metadata.format.duration * 1000) : 0,
          bitrate: metadata.format.bitrate || 0,
          mtime: Math.floor(fileStats.mtimeMs),
          size: fileStats.size,
        });

        processedCount++;
        onProgress?.(processedCount, allFiles.length);

        if (onTracksBatch && allTracks.length >= 50) {
          onTracksBatch([...allTracks]);
          this.db?.addTracks(allTracks);
          allTracks.length = 0;
        }
      } catch (error) {
        processLog.error(`解析文件失败: ${filePath}`, error);
      }
    }

    if (allTracks.length > 0) {
      onTracksBatch?.([...allTracks]);
      this.db?.addTracks(allTracks);
    }

    if (!ignoreDelete) {
      const existingTracks = this.db?.getAllTracks() || [];
      const deletedPaths = existingTracks
        .filter((t) => !allFiles.includes(t.path))
        .map((t) => t.path);
      if (deletedPaths.length > 0) {
        this.db?.deleteTracks(deletedPaths);
      }
    }

    processLog.info(`Node.js 扫描完成，共处理 ${processedCount} 个文件`);
  }

  /**
   * 内部扫描方法
   * @param dirPaths 文件夹路径数组
   * @param ignoreDelete 是否忽略删除操作（默认为 false）
   * @param onProgress 进度回调
   * @param onTracksBatch 批量track回调
   */
  private async _scan(
    dirPaths: string[],
    ignoreDelete: boolean = false,
    onProgress?: (current: number, total: number) => void,
    onTracksBatch?: (tracks: MusicTrack[]) => void,
  ) {
    const { dbPath, coverDir } = this.paths;
    // 运行锁
    if (this.isRefreshing) {
      throw new Error("SCAN_IN_PROGRESS");
    }
    // 确保初始化完成
    await this.ensureInitialized();
    if (!this.db) throw new Error("DB not initialized");
    if (!dirPaths || dirPaths.length === 0) {
      if (!ignoreDelete) {
        this.db.clearTracks();
      }
      return;
    }
    this.isRefreshing = true;
    try {
      if (isNativeModuleAvailable && tools) {
        console.time("RustScanStream");
        await new Promise<void>((resolve, reject) => {
          tools
            .scanMusicLibrary(dbPath, dirPaths, coverDir, (err, event) => {
            if (err) {
              processLog.error("[LocalMusicService] 原生模块扫描时出错:", err);
              return;
            }
            if (!event) return;
            // 处理事件
            try {
              switch (event.event) {
                // 进度更新
                case "progress":
                  if (event.progress) {
                    onProgress?.(event.progress.current, event.progress.total);
                  }
                  break;
                // 批量数据
                case "batch":
                  if (event.tracks && event.tracks.length > 0) {
                    this.db?.addTracks(event.tracks);
                    onTracksBatch?.(event.tracks);
                  }
                  break;
                // 扫描结束
                case "end":
                  if (!ignoreDelete && event.deletedPaths && event.deletedPaths.length > 0) {
                    this.db?.deleteTracks(event.deletedPaths);
                  }
                  resolve();
                  break;
              }
            } catch (e) {
              processLog.error("[LocalMusicService] 扫描时出错:", e);
            }
          })
          .catch((err) => {
            reject(err);
          });
      });
      console.timeEnd("RustScanStream");
      } else {
         await this._scanWithNodeJS(dirPaths, ignoreDelete, onProgress, onTracksBatch);
       }
    } catch (err) {
      processLog.error("[LocalMusicService]: 扫描失败", err);
      throw err;
    } finally {
      this.isRefreshing = false;
    }
  }

  /**
   * 刷新所有库文件夹
   * @param dirPaths 文件夹路径数组
   * @param onProgress 进度回调
   * @param onTracksBatch 批量track回调
   */
  async refreshLibrary(
    dirPaths: string[],
    onProgress?: (current: number, total: number) => void,
    onTracksBatch?: (tracks: MusicTrack[]) => void,
  ) {
    await this._scan(dirPaths, false, onProgress, onTracksBatch);
    return this.db?.getAllTracks() || [];
  }

  /**
   * 扫描指定目录
   * @param dirPath 目录路径
   */
  async scanDirectory(dirPath: string): Promise<MusicTrack[]> {
    await this._scan([dirPath], true);
    return this.db?.getTracksInPath(dirPath) || [];
  }

  /** 获取所有歌曲 */
  async getAllTracks(): Promise<MusicTrack[]> {
    await this.ensureInitialized();
    if (!this.db) return [];
    return this.db.getAllTracks();
  }

  /** 获取音频分析结果 */
  async getAnalysis(path: string) {
    await this.ensureInitialized();
    return this.db?.getAnalysis(path);
  }

  /** 保存音频分析结果 */
  async saveAnalysis(path: string, data: string, mtime: number, size: number) {
    await this.ensureInitialized();
    this.db?.saveAnalysis(path, data, mtime, size);
  }
}
