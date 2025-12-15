import { join, basename } from "path";
import { writeFile, readFile, mkdir } from "fs/promises";
import { existsSync } from "fs";
import { createHash } from "crypto";
import { useStore } from "../store";
import { type IAudioMetadata, parseFile } from "music-metadata";
import FastGlob, { type Entry } from "fast-glob";
import pLimit from "p-limit";

/** 音乐数据接口 */
export interface MusicTrack {
  /** 文件id */
  id: string;
  /** 文件路径 */
  path: string;
  /** 文件标题 */
  title: string;
  /** 文件艺术家 */
  artist: string;
  /** 文件专辑 */
  album: string;
  /** 文件时长 */
  duration: number;
  /** 文件封面 */
  cover?: string;
  /** 文件修改时间 */
  mtime: number;
  /** 文件大小 */
  size: number;
}

/** 音乐库数据库接口 */
interface MusicLibraryDB {
  /** 版本号 */
  version: number;
  /** 文件列表 */
  tracks: Record<string, MusicTrack>;
}

/** 本地音乐服务 */
export class LocalMusicService {
  /** 数据库路径 */
  private dbPath: string;
  /** 封面目录 */
  private coverDir: string;
  /** 数据库 */
  private db: MusicLibraryDB = { version: 1, tracks: {} };
  /** 限制并发解析数为 10，防止内存溢出 */
  private limit = pLimit(10);

  constructor() {
    const store = useStore();
    const localCachePath = join(store.get("cachePath"), "local-data");
    this.dbPath = join(localCachePath, "library.json");
    this.coverDir = join(localCachePath, "covers");
    this.init();
  }

  /** 初始化 */
  private async init() {
    if (!existsSync(this.coverDir)) {
      await mkdir(this.coverDir, { recursive: true });
    }
    await this.loadDB();
  }

  /** 加载数据库 */
  private async loadDB() {
    try {
      if (existsSync(this.dbPath)) {
        const data = await readFile(this.dbPath, "utf-8");
        this.db = JSON.parse(data);
      }
    } catch (e) {
      console.error("Failed to load DB, resetting:", e);
      this.db = { version: 1, tracks: {} };
    }
  }

  /** 保存数据库 */
  private async saveDB() {
    await writeFile(this.dbPath, JSON.stringify(this.db), "utf-8");
  }

  /** 获取文件id */
  private getFileId(filePath: string): string {
    return createHash("md5").update(filePath).digest("hex");
  }

  /** 提取封面 */
  private async extractCover(
    metadata: IAudioMetadata,
    fileId: string,
  ): Promise<string | undefined> {
    const picture = metadata.common.picture?.[0];
    if (!picture) return undefined;
    const ext = picture.format === "image/png" ? ".png" : ".jpg";
    const fileName = `${fileId}${ext}`;
    const savePath = join(this.coverDir, fileName);
    // 只有当封面不存在时才写入，节省 IO
    if (!existsSync(savePath)) {
      await writeFile(savePath, picture.data);
    }
    return fileName;
  }

  /**
   * 🔄 核心方法：刷新所有库文件夹
   * @param dirPaths 文件夹路径数组 ["D:/Music", "E:/Songs"]
   * @param onProgress 进度回调
   */
  async refreshLibrary(dirPaths: string[], onProgress?: (current: number, total: number) => void) {
    if (!dirPaths || dirPaths.length === 0) return [];

    // 构造 Glob 模式数组
    const patterns = dirPaths.map((dir) =>
      join(dir, "**/*.{mp3,flac,wav,ogg,m4a}").replace(/\\/g, "/"),
    );

    console.log("Scanning patterns:", patterns);

    // 扫描磁盘
    const entries: Entry[] = await FastGlob(patterns, {
      stats: true,
      absolute: true,
      onlyFiles: true,
    });

    /** 总文件数 */
    const totalFiles = entries.length;
    /** 已处理文件数 */
    let processedCount = 0;
    /** 是否脏数据 */
    let isDirty = false;

    // 用于记录本次扫描到的文件路径，用于后续清理“不存在的文件”
    const scannedPaths = new Set<string>();

    // 处理文件 (新增/更新)
    const tasks = entries.map((entry) => {
      return this.limit(async () => {
        const filePath = entry.path;
        const stats = entry.stats;
        if (!stats) return;
        /** 修改时间 */
        const mtime = stats.mtimeMs;
        /** 文件大小 */
        const size = stats.size;
        scannedPaths.add(filePath);
        /** 缓存 */
        const cached = this.db.tracks[filePath];

        // 只有当缓存存在 && 修改时间没变 && 文件大小没变 -> 才跳过
        if (cached && cached.mtime === mtime && cached.size === size) {
          processedCount++;
          return;
        }

        // 解析元数据
        try {
          // console.log("Parsing:", filePath);
          const id = this.getFileId(filePath);
          const metadata = await parseFile(filePath);
          const coverPath = await this.extractCover(metadata, id);

          const track: MusicTrack = {
            id,
            path: filePath,
            title: metadata.common.title || basename(filePath),
            artist: metadata.common.artist || "Unknown Artist",
            album: metadata.common.album || "Unknown Album",
            duration: (metadata.format.duration || 0) * 1000,
            mtime,
            size,
            cover: coverPath,
          };

          this.db.tracks[filePath] = track;
          isDirty = true;
        } catch (err) {
          console.warn(`Parse error [${filePath}]:`, err);
        } finally {
          processedCount++;
          // 节流发送进度
          if (processedCount % 10 === 0 || processedCount === totalFiles) {
            onProgress?.(processedCount, totalFiles);
          }
        }
      });
    });

    await Promise.all(tasks);

    // 清理脏数据 (处理文件删除 或 移除文件夹的情况)
    // 遍历数据库中现有的所有路径
    const dbPaths = Object.keys(this.db.tracks);
    for (const dbPath of dbPaths) {
      if (!scannedPaths.has(dbPath)) {
        delete this.db.tracks[dbPath];
        isDirty = true;
      }
    }

    // 持久化
    if (isDirty) await this.saveDB();
    // 返回所有数据
    return Object.values(this.db.tracks);
  }
}
