import { ipcMain } from "electron";
import { CacheService, type CacheResourceType, type CacheListItem } from "../services/CacheService";
import { processLog } from "../logger";

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
  const cacheService = CacheService.getInstance();

  // 初始化缓存服务
  cacheService.init();

  // 列出指定类型下的缓存文件
  ipcMain.handle(
    "cache-list",
    (_event, type: CacheResourceType): Promise<CacheIpcResult<CacheListItem[]>> => {
      return withErrorCatch(async () => {
        return await cacheService.list(type);
      });
    },
  );

  // 读取指定缓存文件
  ipcMain.handle(
    "cache-get",
    (_event, type: CacheResourceType, key: string): Promise<CacheIpcResult<Buffer>> => {
      return withErrorCatch(async () => {
        return await cacheService.get(type, key);
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
        await cacheService.put(type, key, data);
        return null;
      });
    },
  );

  // 删除单个缓存文件
  ipcMain.handle(
    "cache-remove",
    (_event, type: CacheResourceType, key: string): Promise<CacheIpcResult<null>> => {
      return withErrorCatch(async () => {
        await cacheService.remove(type, key);
        return null;
      });
    },
  );

  // 清空指定类型的缓存目录
  ipcMain.handle(
    "cache-clear",
    (_event, type: CacheResourceType): Promise<CacheIpcResult<null>> => {
      return withErrorCatch(async () => {
        await cacheService.clear(type);
        return null;
      });
    },
  );

  // 获取所有缓存类型的总大小
  ipcMain.handle("cache-size", (): Promise<CacheIpcResult<number>> => {
    return withErrorCatch(async () => {
      return await cacheService.getSize();
    });
  });
};

export default initCacheIpc;
