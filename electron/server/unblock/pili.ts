/*
 * PILI-API - 多平台聚合音源
 */
import type { SongMatchInfo, SongUrlResult } from "./unblock";
import { isSongMatch } from "./match";
import { serverLog } from "../../main/logger";
import { filterByDuration } from "./index";
import axios from "axios";

// PILI API
const PILI_API = "https://api.pili.im";

/**
 * 搜索歌曲
 * @param match 原曲匹配信息
 * @returns 歌曲信息或 null
 */
const search = async (match: SongMatchInfo): Promise<any | null> => {
  try {
    const keyword = encodeURIComponent(match.keyword);
    const url = `${PILI_API}/search?keywords=${keyword}&limit=5`;

    const response = await axios.get(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
      },
      timeout: 8000,
    });

    const songs = response.data?.result?.songs;
    if (!songs || !Array.isArray(songs) || songs.length === 0) {
      return null;
    }

    // 遍历搜索结果，找歌名和艺术家匹配的项
    for (const item of songs) {
      const artistStr = item.ar?.map((a: any) => a.name).join(" & ") || "";
      if (isSongMatch(item.name || "", artistStr, match)) {
        return item;
      }
    }

    // 如果没有精确匹配，返回第一个结果
    return songs[0];
  } catch (error) {
    serverLog.error("PILI search error:", error);
    return null;
  }
};

/**
 * 获取歌曲 URL
 * @param id 歌曲ID
 * @returns URL 或 null
 */
const getTrackUrl = async (id: number): Promise<string | null> => {
  try {
    const url = `${PILI_API}/song/url?id=${id}`;

    const response = await axios.get(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
      },
      timeout: 8000,
    });

    const songUrl = response.data?.data?.[0]?.url;
    if (songUrl) {
      return songUrl;
    }
    return null;
  } catch (error) {
    serverLog.error("PILI track error:", error);
    return null;
  }
};

/**
 * 获取 PILI 歌曲 URL
 * @param match 原曲匹配信息
 * @returns 包含歌曲 URL 的结果对象
 */
const getPiliSongUrl = async (match: SongMatchInfo): Promise<SongUrlResult> => {
  try {
    if (!match.keyword) return { code: 404, url: null };

    // 1. 搜索歌曲
    const song = await search(match);
    if (!song) return { code: 404, url: null };

    // 2. 获取播放链接
    const id = song.id;
    const playUrl = await getTrackUrl(id);
    if (!playUrl) return { code: 404, url: null };

    serverLog.log("PILISong URL:", playUrl);

    // 计算时长（毫秒）
    const duration = song.dt || song.duration;

    return filterByDuration({ code: 200, url: playUrl, duration });
  } catch (error) {
    serverLog.error("Get PILISong URL Error:", error);
    return { code: 404, url: null };
  }
};

export default getPiliSongUrl;
