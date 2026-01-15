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

// 增强的select实现，支持模糊匹配
const select = (list: any[], info: { keyword: string }) => {
  const keyword = info.keyword.toLowerCase().trim();

  // 精确匹配优先
  let matched = list.find((item: any) =>
    item.name?.toLowerCase() === keyword ||
    item.artists?.name?.toLowerCase() === keyword
  );

  if (matched) return matched;

  // 模糊匹配
  matched = list.find((item: any) => {
    const songName = item.name?.toLowerCase();
    const artistName = item.artists?.name?.toLowerCase();

    // 包含关键词匹配
    return songName?.includes(keyword) ||
           artistName?.includes(keyword) ||
           // 分割关键词匹配
           keyword.split(' ').some(k =>
             songName?.includes(k) || artistName?.includes(k)
           );
  });

  return matched || list[0]; // 如果没找到，返回第一个结果作为备选
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
const format = (song: any): Song => {
  return {
    id: song.id || song.sid,
    name: song.title || song.name,
    artists: {
      id: song.mid || song.author_id,
      name: song.author || song.uname || song.artist
    },
  };
};

/**
 * 延迟函数
 * @param ms 毫秒
 */
const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

/**
 * 获取Bilibili的cookie
 */
const getBilibiliCookies = async (): Promise<string> => {
  try {
    // 先访问主站获取必要的cookie
    await request.get('https://www.bilibili.com', {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8'
      }
    });
    return 'buvid3=1; b_nut=1; _uuid=1; CURRENT_FNVAL=4048; rpdid=1; PVID=1';
  } catch {
    return '';
  }
};

/**
 * 带重试的请求函数
 * @param url 请求URL
 * @param retries 重试次数
 * @returns 响应数据
 */
const requestWithRetry = async (url: string, retries = 3): Promise<any> => {
  const cookies = await getBilibiliCookies();

  for (let i = 0; i < retries; i++) {
    try {
      // 添加更长的随机延迟避免被限流
      await delay(Math.random() * 3000 + 2000);

      const response = await request.get(url, {
        headers: {
          'Cookie': cookies,
          'Origin': 'https://www.bilibili.com',
          'X-Requested-With': 'XMLHttpRequest'
        }
      });

      // 检查是否被限流
      if (response.data && response.data.code === -412) {
        throw new Error('Request was banned (412)');
      }

      return response;
    } catch (error: any) {
      console.error(`Request attempt ${i + 1} failed:`, error.message);

      if (i === retries - 1) {
        throw error;
      }

      // 更长的指数退避延迟
      await delay(Math.pow(3, i) * 3000);
    }
  }
};

/**
 * 搜索Bilibili音乐
 * @param info 搜索信息
 * @returns 匹配的歌曲ID
 */
const search = (info: { keyword: string }): Promise<string> => {
  // 2025年最新搜索API - 包含移动端和Web端
  const urls = [
    // 移动端API - 更稳定
    'https://app.bilibili.com/x/v2/search/type?' +
    'type=video&page=1&pagesize=20&' +
    `keyword=${encodeURIComponent(info.keyword + ' 音乐')}`,

    // Web端搜索API
    'https://api.bilibili.com/x/web-interface/search/type?' +
    'search_type=video&page=1&pagesize=20&' +
    `keyword=${encodeURIComponent(info.keyword + ' 音乐')}`,

    // 音频搜索API
    'https://api.bilibili.com/audio/music-service-c/s?' +
    'search_type=music&page=1&pagesize=30&' +
    `keyword=${encodeURIComponent(info.keyword)}`,

    // 国际版API作为备选
    'https://api.bilibili.tv/intl/music-service-c/s?' +
    'search_type=music&page=1&pagesize=30&' +
    `keyword=${encodeURIComponent(info.keyword)}`
  ];

  // 尝试多个URL，直到成功
  const tryUrls = async (urls: string[]): Promise<any> => {
    for (const url of urls) {
      try {
        console.log('Trying URL:', url);
        const response = await requestWithRetry(url);
        const jsonBody = response.data;

        console.log('Bilibili search response:', jsonBody);

        let results = [];

        // 检查主要API响应
        if (jsonBody.data && jsonBody.data.result && jsonBody.data.result.length > 0) {
          results = jsonBody.data.result.map(format);
          return results;
        }

        // 检查视频搜索结果
        if (jsonBody.data && jsonBody.data.result && jsonBody.data.result.length > 0) {
          results = jsonBody.data.result
            .filter((item: any) => item.duration && item.duration > 60)
            .slice(0, 5)
            .map((item: any) => ({
              id: String(item.id),
              name: String(item.title || '').replace(/<[^>]*>/g, ''),
              artists: { id: String(item.mid), name: String(item.author) }
            }));
          if (results.length > 0) return results;
        }

      } catch (error) {
        console.error('URL failed:', url, error);
        continue;
      }
    }
    throw new Error('All search URLs failed');
  };

  return tryUrls(urls)
      .then((results: Song[]) => {
        if (!results || results.length === 0) {
          throw new Error('No search results found');
        }

        const matched = select(results, info);
        return matched ? matched.id : results[0].id;
      })
      .catch((error) => {
        console.error('Bilibili search error:', error);
        // 返回友好的错误信息
        if (error.message.includes('412') || error.message.includes('banned')) {
          throw new Error('Bilibili解锁失败: 请求被限制，请稍后再试');
        }
        throw new Error(`Bilibili解锁失败: ${error.message}`);
      });
};

/**
 * 获取Bilibili音乐URL
 * @param id 歌曲ID
 * @returns 音乐URL
 */
const track = (id: string): Promise<string> => {
  // 2025年最新音乐URL获取API
  const urls = [
    // 新版音频API
    'https://api.bilibili.com/audio/music-service-c/url?sid=' + id + '&privilege=2&quality=320',
    // Web端音频API
    'https://www.bilibili.com/audio/music-service-c/web/url?privilege=2&quality=2&sid=' + id,
    // 移动端音频API
    'https://app.bilibili.com/x/v2/audio/url?sid=' + id + '&quality=320',
    // 国际版API
    'https://api.bilibili.tv/intl/music-service-c/web/url?privilege=2&quality=2&sid=' + id,
    // 视频音频提取API（作为备选）
    'https://api.bilibili.com/x/player/playurl?bvid=' + id + '&cid=1&qn=112&type=&otype=json&fourk=1&fnver=0&fnval=4048'
  ];

  const tryTrackUrls = async (urls: string[]): Promise<string> => {
    for (const url of urls) {
      try {
        console.log('Trying track URL:', url);
        const response = await requestWithRetry(url);
        const jsonBody = response.data;

        console.log('Bilibili track response:', jsonBody);

        if (jsonBody.code === 0 && jsonBody.data) {
          if (jsonBody.data.cdns && jsonBody.data.cdns.length > 0) {
            // bilibili music requires referer, connect do not support referer, so change to http
            return jsonBody.data.cdns[0].replace('https', 'http');
          } else if (jsonBody.data.url) {
            // 备用格式
            return jsonBody.data.url.replace('https', 'http');
          }
        }

        // 检查是否有其他格式的URL
        if (jsonBody.data && jsonBody.data.playurl) {
          return jsonBody.data.playurl.replace('https', 'http');
        }

      } catch (error) {
        console.error('Track URL failed:', url, error);
        continue;
      }
    }
    throw new Error('All track URLs failed');
  };

  return tryTrackUrls(urls)
    .catch((error) => {
      console.error('Bilibili track error:', error);
      // 返回友好的错误信息
      if (error.message.includes('412') || error.message.includes('banned')) {
        throw new Error('Bilibili解锁失败: 请求被限制，请稍后再试');
      }
      throw new Error(`Bilibili解锁失败: ${error.message}`);
    });
};

/**
 * 检查并获取Bilibili歌曲播放地址
 * @param info 搜索信息
 * @returns 歌曲播放地址
 */
const check = (info: any): Promise<string> => getCacheData(
  async () => {
    try {
      const id = await search(info);
      return await track(id);
    } catch (error) {
      // 提供更详细的错误信息
      throw new Error(`Bilibili解锁失败: ${error instanceof Error ? error.message : '未知错误'}`);
    }
  },
  { key: `bilibili_${info.keyword}`, time: 10 }
);

export { check, track };
