/*
 * @Author: ZJQ
 * @Date: 2025-08-22 23:56:06
 * @LastEditors: zjq 631724110@qq.com
 * @LastEditTime: 2025-08-23 00:58:14
 * @FilePath: /llm/electron/server/unblock/bilibili.ts
 * @Description:
 *
 * Copyright (c) 2025 by ${git_name_email}, All Rights Reserved.
 */
import axios from 'axios';
import { createHash } from 'crypto';

// 服务端内存缓存实现
const memoryCache = new Map<string, { data: any; expiry: number }>();

/**
 * 服务端缓存函数
 * @param fetcher 数据获取函数
 * @param options 缓存配置
 * @returns 缓存或新获取的数据
 */
const getCacheData = async (
  fetcher: () => Promise<any>,
  options: { key: string; time?: number } = { key: 'default', time: 5 }
): Promise<any> => {
  const { key, time = 5 } = options;
  const cacheKey = key;
  const now = Date.now();

  // 检查内存缓存
  const cached = memoryCache.get(cacheKey);
  if (cached && cached.expiry > now) {
    return cached.data;
  }

  try {
    const data = await fetcher();
    // 设置缓存，默认5分钟
    memoryCache.set(cacheKey, {
      data,
      expiry: now + (time * 60 * 1000)
    });
    return data;
  } catch (error) {
    // 如果有缓存但过期，返回过期数据
    if (cached) {
      return cached.data;
    }
    throw error;
  }
};

// 创建独立的axios实例，避免代理配置影响
const request = axios.create({
  timeout: 15000,
  withCredentials: false,
  headers: {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Referer': 'https://www.bilibili.com/',
    'Accept': 'application/json, text/plain, */*',
    'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
    'Accept-Encoding': 'gzip, deflate, br',
    'Cache-Control': 'no-cache',
    'Pragma': 'no-cache',
    'Sec-Ch-Ua': '"Not_A Brand";v="8", "Chromium";v="120", "Google Chrome";v="120"',
    'Sec-Ch-Ua-Mobile': '?0',
    'Sec-Ch-Ua-Platform': '"Windows"',
    'Sec-Fetch-Dest': 'empty',
    'Sec-Fetch-Mode': 'cors',
    'Sec-Fetch-Site': 'same-site'
  }
});

const select = (list: any[], info: { keyword: string }) => {
  const keyword = info.keyword.toLowerCase().trim();

  let matched = list.find((item: any) =>
    item.name?.toLowerCase() === keyword ||
    item.artists?.name?.toLowerCase() === keyword
  );

  if (matched) return matched;

  matched = list.find((item: any) => {
    const songName = item.name?.toLowerCase();
    const artistName = item.artists?.name?.toLowerCase();

    return songName?.includes(keyword) ||
           artistName?.includes(keyword) ||
           keyword.split(' ').some(k =>
             songName?.includes(k) || artistName?.includes(k)
           );
  });

  return matched || list[0];
};

/**
 * Bilibili 歌曲对象类型
 */
interface Song {
  id: string;
  name: string;
  artists: { id: string; name: string };
}



/**
 * 格式化Bilibili歌曲数据
 * @param song Bilibili歌曲数据
 * @returns 标准化歌曲格式
 */
const format = (song: any): Song => ({
  id: song.bvid,
  name: song.title,
  artists: { id: song.typeid, name: song.typename },
});

const mixinKeyEncTab = [
  46, 47, 18, 2, 53, 8, 23, 32, 15, 50, 10, 31, 58, 3, 45, 35, 27, 43, 5, 49,
  33, 9, 42, 19, 29, 28, 14, 39, 12, 38, 41, 13, 37, 48, 7, 16, 24, 55, 40,
  61, 26, 17, 0, 1, 60, 51, 30, 4, 22, 25, 54, 21, 56, 59, 6, 63, 57, 62, 11,
  36, 20, 34, 44, 52,
];

const getMixinKey = (orig: string) =>
  mixinKeyEncTab.map((n) => orig[n]).join('').slice(0, 32);

const encWbi = (params: Record<string, string | number>, imgKey: string, subKey: string) => {
  const mixinKey = getMixinKey(imgKey + subKey);
  const currTime = Math.round(Date.now() / 1000);
  const chrFilter = /[!'()*]/g;

  Object.assign(params, { wts: currTime });
  const query = Object.keys(params)
    .sort()
    .map((key) => {
      const value = params[key].toString().replace(chrFilter, '');
      return `${encodeURIComponent(key)}=${encodeURIComponent(value)}`;
    })
    .join('&');

  const wbiSign = createHash('md5').update(query + mixinKey).digest('hex');
  return query + '&w_rid=' + wbiSign;
};

const getWbiKeys = async () => {
  const res = await request.get('https://api.bilibili.com/x/web-interface/nav', {
    headers: {
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/58.0.3029.110 Safari/537.3',
      Referer: 'https://www.bilibili.com/',
    },
  });
  const { img_url, sub_url } = res.data?.data?.wbi_img || {};
  return {
    img_key: img_url.slice(img_url.lastIndexOf('/') + 1, img_url.lastIndexOf('.')),
    sub_key: sub_url.slice(sub_url.lastIndexOf('/') + 1, sub_url.lastIndexOf('.')),
  };
};

const signParam = async (param: Record<string, string | number>) => {
  const keys = await getCacheData(getWbiKeys, { key: 'bilibili_wbi', time: 10 });
  return encWbi(param, keys.img_key, keys.sub_key);
};

const getBiliVideoHeader = async () => {
  const url = 'https://www.bilibili.com';
  const cookies = await getCacheData(async () => {
    const response = await request.get(url);
    const setCookie = response.headers?.['set-cookie'] || [];
    return setCookie.map((cookie: string) => cookie.split(';')[0]).join('; ');
  }, { key: 'bilibili_cookie', time: 10 });
  return cookies;
};

/**
 * 搜索Bilibili音乐
 * @param info 搜索信息
 * @returns 匹配的歌曲ID
 */
const search = async (info: { keyword: string }): Promise<string> => {
  const cookies = await getBiliVideoHeader();
  const param = await signParam({
    search_type: 'video',
    keyword: info.keyword,
  });
  const url = 'https://api.bilibili.com/x/web-interface/wbi/search/type?' + param;
  const response = await request.get(url, {
    headers: { cookie: cookies, referer: 'https://search.bilibili.com' },
  });
  const list = response.data?.data?.result?.map(format) || [];
  if (list.length === 0) {
    throw new Error('No search results found');
  }
  const matched = select(list, info);
  return (matched ? matched.id : list[0].id) as string;
};

/**
 * 获取Bilibili音乐URL
 * @param id 歌曲ID
 * @returns 音乐URL
 */
const track = async (id: string): Promise<string> => {
  const viewParam = await signParam({ bvid: id });
  const viewUrl = 'https://api.bilibili.com/x/web-interface/wbi/view?' + viewParam;
  const viewResponse = await request.get(viewUrl);
  const viewBody = viewResponse.data;
  if (viewBody?.code !== 0) {
    throw new Error('Bilibili view failed');
  }
  const cid = viewBody?.data?.cid;
  if (!cid) {
    throw new Error('Bilibili cid missing');
  }
  const playParam = await signParam({
    bvid: id,
    cid,
    fnval: 16,
    platform: 'pc',
  });
  const playUrl = 'https://api.bilibili.com/x/player/wbi/playurl?' + playParam;
  const playResponse = await request.get(playUrl);
  const playBody = playResponse.data;
  const baseUrl = playBody?.data?.dash?.audio?.[0]?.base_url;
  if (!baseUrl) {
    throw new Error('Bilibili playurl missing');
  }
  return baseUrl;
};

/**
 * 检查并获取Bilibili歌曲播放地址
 * @param info 搜索信息
 * @returns 歌曲播放地址
 */
const check = (info: any): Promise<string> =>
  getCacheData(async () => {
    try {
      const id = await search(info);
      return await track(id);
    } catch (error) {
      throw new Error(`Bilibili解锁失败: ${error instanceof Error ? error.message : '未知错误'}`);
    }
  }, { key: `bilibili_${info.keyword}`, time: 10 });

export { check, track };
