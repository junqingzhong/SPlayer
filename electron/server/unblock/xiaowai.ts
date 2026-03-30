/*
 * 小歪音乐 - 稳定音源
 * 参考 Meting-API 实现
 */
import type { SongMatchInfo, SongUrlResult } from "./unblock";
import { isSongMatch } from "./match";
import { serverLog } from "../../main/logger";
import { filterByDuration } from "./index";
import axios from "axios";

// 小歪音乐 API
const XIAOWAI_API = "https://api.liumingye.cn/meting/api";

/**
 * 搜索歌曲
 * @param match 原曲匹配信息
 * @returns 歌曲信息或 null
 */
const search = async (match: SongMatchInfo): Promise<any | null> => {
  try {
    const keyword = encodeURIComponent(match.keyword);
    const url = `${XIAOWAI_API}?type=search&server=netease&keyword=${keyword}`;
    
    const response = await axios.get(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        "Referer": "https://api.liumingye.cn/",
      },
      timeout: 8000,
    });

    if (!response.data || !Array.isArray(response.data) || response.data.length === 0) {
      return null;
    }

    // 遍历搜索结果，找歌名和艺术家匹配的项
    for (const item of response.data) {
      const artistStr = item.author || item.artist || "";
      if (isSongMatch(item.name || item.title || "", artistStr, match)) {
        return item;
      }
    }
    
    // 如果没有精确匹配，返回第一个结果
    return response.data[0];
  } catch (error) {
    serverLog.error("❌ Xiaowai search error:", error);
    return null;
  }
};

/**
 * 获取歌曲 URL
 * @param song 歌曲信息
 * @returns URL 或 null
 */
const getTrackUrl = async (song: any): Promise<string | null> => {
  try {
    const id = song.id || song.songid;
    if (!id) return null;

    const url = `${XIAOWAI_API}?type=url&server=netease&id=${id}`;
    
    const response = await axios.get(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        "Referer": "https://api.liumingye.cn/",
      },
      timeout: 8000,
    });

    if (response.data && response.data.url) {
      return response.data.url;
    }
    return null;
  } catch (error) {
    serverLog.error("❌ Xiaowai track error:", error);
    return null;
  }
};

/**
 * 获取小歪音乐歌曲 URL
 * @param match 原曲匹配信息
 * @returns 包含歌曲 URL 的结果对象
 */
const getXiaowaiSongUrl = async (match: SongMatchInfo): Promise<SongUrlResult> => {
  try {
    if (!match.keyword) return { code: 404, url: null };

    // 1. 搜索歌曲
    const song = await search(match);
    if (!song) return { code: 404, url: null };

    // 2. 获取播放链接
    const playUrl = await getTrackUrl(song);
    if (!playUrl) return { code: 404, url: null };

    serverLog.log("🔗 XiaowaiSong URL:", playUrl);
    
    // 计算时长（毫秒）
    const duration = song.time || song.duration ? (song.time || song.duration) * 1000 : undefined;
    
    return filterByDuration({ code: 200, url: playUrl, duration });
  } catch (error) {
    serverLog.error("❌ Get XiaowaiSong URL Error:", error);
    return { code: 404, url: null };
  }
};

export default getXiaowaiSongUrl;
