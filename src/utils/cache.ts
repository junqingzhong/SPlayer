/*
 * @Author: ZJQ
 * @Date: 2025-07-12 01:33:40
 * @LastEditors: zjq 631724110@qq.com
 * @LastEditTime: 2025-08-23 00:24:32
 * @FilePath: /llm/src/utils/cache.ts
 * @Description:
 *
 * Copyright (c) 2025 by ${git_name_email}, All Rights Reserved.
 */
type StorageType = "localStorage" | "sessionStorage";

interface CacheOptions {
  key: string;
  time: number; // 缓存时长，单位为分钟
  storage?: StorageType; // 默认为 sessionStorage
  useCache?: boolean; // 是否使用缓存，默认为 true
}

/**
 * 获取接口请求缓存
 * @template T
 * @param {(...args: any[]) => Promise<T>} promiseFunc - 异步请求函数
 * @param {Object} options - 缓存选项
 * @param {string} options.key - 用于存储和检索缓存数据的键值
 * @param {number} options.time - 缓存有效时间（分钟）。如果为 -1，则表示永久有效
 * @param {string} [options.storage="sessionStorage"] - 储存方式，默认为 `sessionStorage`，可选 `localStorage`
 * @param {...any} args - 传递的参数
 * @returns {Promise<T>}
 * @returns
 */
const memoryCache = new Map<string, { value: any; expiry: number }>();

export const getCacheData = async <T>(
  promiseFunc: (...args: any[]) => Promise<T>,
  options: CacheOptions,
  ...args: any[]
): Promise<T> => {
  const { key, time, storage = "sessionStorage", useCache = true } = options;

  // 浏览器环境使用 localStorage/sessionStorage，Node 环境使用内存缓存
  const isBrowser = typeof window !== "undefined";
  const storageObj = isBrowser ? window[storage] : null;

  try {
    // 读取缓存
    let cachedData: string | null = null;
    if (isBrowser && storageObj) {
      cachedData = storageObj.getItem(key);
    } else {
      const item = memoryCache.get(key);
      if (item && (item.expiry === -1 || Date.now() < item.expiry)) {
        cachedData = JSON.stringify(item);
      }
    }

    if (cachedData && useCache) {
      const { value, expiry } = JSON.parse(cachedData);
      if (expiry === -1 || Date.now() < expiry) {
        return value;
      }
    }

    // 请求数据
    const result = await promiseFunc(...args);
    const expiry = time === -1 ? -1 : Date.now() + time * 60 * 1000;

    // 写入缓存
    if (isBrowser && storageObj) {
      storageObj.setItem(key, JSON.stringify({ value: result, expiry }));
    } else {
      memoryCache.set(key, { value: result, expiry });
    }

    return result;
  } catch (error) {
    console.error(`❌ Error in getCacheData: ${error}`);
    throw error;
  }
};
