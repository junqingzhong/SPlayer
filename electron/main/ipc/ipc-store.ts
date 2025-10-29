import { ipcMain } from "electron";
import { useStore } from "../store";
import type { StoreType } from "../store";

/**
 * 初始化 store IPC 主进程
 */
const initStoreIpc = (): void => {
  const store = useStore();
  if (!store) return;

  // 获取配置项
  ipcMain.handle("store-get", (_event, key: keyof StoreType) => {
    return store.get(key as any);
  });

  // 设置配置项
  ipcMain.handle("store-set", (_event, key: keyof StoreType, value: unknown) => {
    store.set(key as any, value as any);
    return true;
  });

  // 判断配置项是否存在
  ipcMain.handle("store-has", (_event, key: keyof StoreType) => {
    return store.has(key as any);
  });

  // 删除配置项
  ipcMain.handle("store-delete", (_event, key: keyof StoreType) => {
    store.delete(key as any);
    return true;
  });

  // 重置配置（支持指定 keys 或全部重置）
  ipcMain.handle("store-reset", (_event, keys?: (keyof StoreType)[]) => {
    if (keys && keys.length > 0) {
      store.reset(...(keys as any));
    } else {
      store.reset();
    }
    return true;
  });
};

export default initStoreIpc;
