import { ipcMain } from "electron";
import { existsSync, mkdirSync } from "fs";
import { readdir, readFile, rm, stat, writeFile } from "fs/promises";
import { join, resolve } from "path";
import { useStore } from "../store";
import type Store from "electron-store";
import type { StoreType } from "../store";
import { processLog } from "../logger";

/**
 * 缓存资源类型
 * - music: 音乐缓存
 * - lyrics: 歌词缓存
 * - local-data: 本地音乐数据缓存
 * - playlist-data: 歌单数据缓存
 */
type CacheResourceType = "music" | "lyrics" | "local-data" | "playlist-data";

/**
 * 缓存 IPC 通用返回结果
 * @template T 返回数据类型
 */
type CacheIpcResult<T = any> = {
  /** 是否成功 */
  success: boolean;
  /** 返回数据 */
  data?: T;
  /** 错误信息（失败时） */
  message?: string;
};

/**
 * 缓存列表项信息
 */
type CacheListItem = {
  /** 缓存 key（文件名或相对路径） */
  key: string;
  /** 文件大小（字节） */
  size: number;
  /** 最后修改时间（毫秒时间戳） */
  mtime: number;
};

/**
 * 不同缓存类型对应的子目录映射
 */
const CACHE_SUB_DIR: Record<CacheResourceType, string> = {
  music: "music",
  lyrics: "lyrics",
  "local-data": "local-data",
  "playlist-data": "playlist-data",
};

/**
 * 确保缓存根目录及各子目录存在
 * @param basePath 缓存根路径
 */
const ensureCacheDirs = (basePath: string): void => {
  if (!existsSync(basePath)) mkdirSync(basePath, { recursive: true });
  Object.values(CACHE_SUB_DIR).forEach((sub) => {
    const dir = join(basePath, sub);
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  });
};

/**
 * 从 Store 中获取缓存根路径
 * @param store Electron Store 实例
 * @returns 缓存根路径
 * @throws 当未配置 cachePath 时抛出异常
 */
const getCacheBasePath = (store: Store<StoreType>): string => {
  const base = store.get("cachePath") as string | undefined;
  if (!base) {
    throw new Error("cachePath 未配置");
  }
  return base;
};

/**
 * 解析并校验缓存文件路径，防止路径穿越
 * @param basePath 缓存根路径
 * @param type 缓存资源类型
 * @param key 缓存 key（文件名或相对路径）
 * @returns 目录与最终文件路径
 */
const resolveSafePath = (basePath: string, type: CacheResourceType, key: string) => {
  const dir = join(basePath, CACHE_SUB_DIR[type]);
  const target = resolve(dir, key);
  if (!target.startsWith(resolve(dir))) {
    throw new Error("非法的缓存 key");
  }
  return { dir, target };
};

/**
 * 将多种类型的数据转换为 Buffer
 * @param data 输入数据（Buffer / Uint8Array / ArrayBuffer / string / Node Buffer JSON）
 * @returns 对应的 Buffer
 * @throws 不支持的类型时抛出异常
 */
const toBuffer = (data: any): Buffer => {
  if (Buffer.isBuffer(data)) return data;
  if (data instanceof Uint8Array) return Buffer.from(data);
  if (data instanceof ArrayBuffer) return Buffer.from(new Uint8Array(data));
  if (typeof data === "string") return Buffer.from(data, "utf-8");
  if (data?.type === "Buffer" && Array.isArray(data?.data)) {
    return Buffer.from(data.data);
  }
  throw new Error("不支持的缓存写入数据类型");
};

/**
 * 递归计算目录大小
 * @param dirPath 目录路径
 * @returns 目录总大小（字节）
 */
const calculateDirSize = async (dirPath: string): Promise<number> => {
  let totalSize = 0;
  try {
    const entries = await readdir(dirPath, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = join(dirPath, entry.name);
      if (entry.isDirectory()) {
        totalSize += await calculateDirSize(fullPath);
      } else if (entry.isFile()) {
        const info = await stat(fullPath);
        totalSize += info.size;
      }
    }
  } catch (error) {
    // 忽略无法访问的目录或文件
    processLog.warn(`⚠️ 无法访问目录: ${dirPath}`, error);
  }
  return totalSize;
};

/**
 * 通用错误捕获包装器，为 IPC 返回统一结果结构
 * @param action 实际执行的异步逻辑
 * @returns 包装后的结果对象
 */
const withErrorCatch = async <T>(action: () => Promise<T>): Promise<CacheIpcResult<T>> => {
  try {
    const data = await action();
    return { success: true, data };
  } catch (error: any) {
    processLog.error("❌ IPC cache error:", error);
    return { success: false, message: error?.message || String(error) };
  }
};

/**
 * 初始化缓存相关 IPC 事件
 */
const initCacheIpc = (): void => {
  const store = useStore();
  if (!store) return;

  try {
    const basePath = getCacheBasePath(store);
    ensureCacheDirs(basePath);
  } catch (error) {
    processLog.error("❌ 初始化缓存目录失败:", error);
  }

  // 列出指定类型下的缓存文件
  ipcMain.handle(
    "cache-list",
    (_event, type: CacheResourceType): Promise<CacheIpcResult<CacheListItem[]>> => {
      return withErrorCatch(async () => {
        const basePath = getCacheBasePath(store);
        ensureCacheDirs(basePath);
        const dir = join(basePath, CACHE_SUB_DIR[type]);
        const files = await readdir(dir, { withFileTypes: true });
        const items: CacheListItem[] = [];

        for (const file of files) {
          if (!file.isFile()) continue;
          const filePath = join(dir, file.name);
          const info = await stat(filePath);
          items.push({
            key: file.name,
            size: info.size,
            mtime: info.mtimeMs,
          });
        }

        return items;
      });
    },
  );

  // 读取指定缓存文件
  ipcMain.handle(
    "cache-get",
    (_event, type: CacheResourceType, key: string): Promise<CacheIpcResult<Buffer>> => {
      return withErrorCatch(async () => {
        const basePath = getCacheBasePath(store);
        ensureCacheDirs(basePath);
        const { target } = resolveSafePath(basePath, type, key);
        return await readFile(target);
      });
    },
  );

  // 写入/更新缓存文件
  ipcMain.handle(
    "cache-put",
    (
      _event,
      type: CacheResourceType,
      key: string,
      data: Buffer | Uint8Array | ArrayBuffer | string,
    ): Promise<CacheIpcResult<null>> => {
      return withErrorCatch(async () => {
        const basePath = getCacheBasePath(store);
        ensureCacheDirs(basePath);
        const { dir, target } = resolveSafePath(basePath, type, key);
        if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
        const buffer = toBuffer(data);
        await writeFile(target, buffer);
        return null;
      });
    },
  );

  // 删除单个缓存文件
  ipcMain.handle(
    "cache-remove",
    (_event, type: CacheResourceType, key: string): Promise<CacheIpcResult<null>> => {
      return withErrorCatch(async () => {
        const basePath = getCacheBasePath(store);
        ensureCacheDirs(basePath);
        const { target } = resolveSafePath(basePath, type, key);
        await rm(target, { force: true });
        return null;
      });
    },
  );

  // 清空指定类型的缓存目录
  ipcMain.handle(
    "cache-clear",
    (_event, type: CacheResourceType): Promise<CacheIpcResult<null>> => {
      return withErrorCatch(async () => {
        const basePath = getCacheBasePath(store);
        const dir = join(basePath, CACHE_SUB_DIR[type]);
        await rm(dir, { recursive: true, force: true });
        ensureCacheDirs(basePath);
        return null;
      });
    },
  );

  // 获取所有缓存类型的总大小
  ipcMain.handle(
    "cache-size",
    (_event): Promise<CacheIpcResult<number>> => {
      return withErrorCatch(async () => {
        const basePath = getCacheBasePath(store);
        ensureCacheDirs(basePath);
        let totalSize = 0;

        for (const type of Object.keys(CACHE_SUB_DIR) as CacheResourceType[]) {
          const dir = join(basePath, CACHE_SUB_DIR[type]);
          totalSize += await calculateDirSize(dir);
        }

        return totalSize;
      });
    },
  );
};

export default initCacheIpc;
