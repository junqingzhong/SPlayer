/*
 * @Author: ZJQ
 * @Date: 2025-05-23 10:50:52
 * @LastEditors: zjq zjq@xkb.com.cn
 * @LastEditTime: 2026-01-27 11:55:21
 * @FilePath: \tea\electron\server\unblock\kuwo.ts
 * @Description:
 *
 * Copyright (c) 2025 by ${git_name_email}, All Rights Reserved.
 */
import { encryptQuery } from "./kwDES";
import type { SongMatchInfo, SongUrlResult } from "./unblock";
import { isSongMatch } from "./match";
import { filterByDuration } from "./index";
import { serverLog } from "../../main/logger";
import axios from "axios";

/**
 * 备用获取酷我音乐 URL 的方法
 * @param songId 歌曲 ID
 * @returns URL 或 null
 */
const fetchKuwoUrlAntiserver = async (songId: string): Promise<string | null> => {
  try {
    const url = "http://antiserver.kuwo.cn/anti.s?type=convert_url&rid=" + songId + "&format=mp3";
    const result = await axios.get(url, {
      headers: {
        "User-Agent": "okhttp/3.10.0",
      },
    });
    if (result.data && typeof result.data === "string") {
      const urlMatch = result.data.match(/http[^\s$"]+/);
      return urlMatch ? urlMatch[0] : null;
    }
    return null;
  } catch (error) {
    serverLog.error("❌ Kuwo Antiserver Error:", error);
    return null;
  }
};

// 获取酷我音乐歌曲 ID
const getKuwoSongId = async (match: SongMatchInfo): Promise<string | null> => {
  try {
    const url =
      "http://search.kuwo.cn/r.s?&correct=1&stype=comprehensive&encoding=utf8&rformat=json&mobi=1&show_copyright_off=1&searchapi=6&all=" +
      encodeURIComponent(match.keyword);
    const result = await axios.get(url);
    if (
      !result.data ||
      result.data.content.length < 2 ||
      !result.data.content[1].musicpage ||
      result.data.content[1].musicpage.abslist.length < 1
    ) {
      return null;
    }
    // 遍历搜索结果，找歌名和艺术家匹配的项
    for (const item of result.data.content[1].musicpage.abslist) {
      const songId = item?.MUSICRID;
      if (!songId) continue;
      if (isSongMatch(item?.SONGNAME || "", item?.ARTIST || "", match)) {
        return songId.slice("MUSIC_".length);
      }
    }
    serverLog.warn(`⚠️ Kuwo 搜索结果均不匹配原曲: "${match.songName}"`);
    return null;
  } catch (error) {
    serverLog.error("❌ Get KuwoSongId Error:", error);
    return null;
  }
};

// 获取酷我音乐歌曲 URL
const getKuwoSongUrl = async (match: SongMatchInfo): Promise<SongUrlResult> => {
  try {
    if (!match.keyword) return { code: 404, url: null };
    const songId = await getKuwoSongId(match);
    if (!songId) return { code: 404, url: null };
    // 请求地址
    const PackageName = "kwplayer_ar_5.1.0.0_B_jiakong_vh.apk";
    const url =
      "http://mobi.kuwo.cn/mobi.s?f=kuwo&q=" +
      encryptQuery(
        `corp=kuwo&source=${PackageName}&p2p=1&type=convert_url2&sig=0&format=mp3` +
          "&rid=" +
          songId,
      );
    const result = await axios.get(url, {
      headers: {
        "User-Agent": "okhttp/3.10.0",
      },
    });
    if (result.data) {
      const urlMatch = result.data.match(/http[^\s$"]+/)[0];
      serverLog.log("🔗 KuwoSong URL:", urlMatch);

      let duration: number | undefined = undefined;
      try {
        const detailUrl = `http://www.kuwo.cn/api/www/music/musicInfo?mid=${songId}`;
        const detailResult = await axios.get(detailUrl, {
          headers: {
            "User-Agent":
              "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36",
            Referer: "http://www.kuwo.cn/",
          },
        });

        if (detailResult.data && detailResult.data.data && detailResult.data.data.duration) {
          const durationStr = detailResult.data.data.duration; // 格式可能是 "03:45"
          const parts = durationStr.split(":");
          if (parts.length === 2) {
            const minutes = parseInt(parts[0]);
            const seconds = parseInt(parts[1]);
            duration = (minutes * 60 + seconds) * 1000;
          }
        }
      } catch (detailError) {
        serverLog.error("❌ Get Kuwo Song Duration Error:", detailError);
      }

      const filtered = filterByDuration({ code: 200, url: urlMatch, duration });
      if (!filtered.url) {
        const fallback = await fetchKuwoUrlAntiserver(songId);
        if (fallback) {
          serverLog.log("🔗 KuwoSong URL (fallback):", fallback);
          return filterByDuration({ code: 200, url: fallback, duration });
        }
      }
      return filtered;
    }
    return { code: 404, url: null };
  } catch (error) {
    serverLog.error("❌ Get KuwoSong URL Error:", error);
    try {
      const songId = await getKuwoSongId(match);
      if (songId) {
        const fallback = await fetchKuwoUrlAntiserver(songId);
        if (fallback) {
          serverLog.log("🔗 KuwoSong URL (fallback):", fallback);
          return filterByDuration({ code: 200, url: fallback });
        }
      }
    } catch (e) {
      serverLog.error("❌ Kuwo fallback error:", e);
    }
    return { code: 404, url: null };
  }
};

export default getKuwoSongUrl;
