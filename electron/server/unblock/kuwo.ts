/*
 * @Author: ZJQ
 * @Date: 2025-05-23 10:50:52
 * @LastEditors: zjq zjq@xkb.com.cn
 * @LastEditTime: 2025-12-10 17:03:44
 * @FilePath: \tea\electron\server\unblock\kuwo.ts
 * @Description:
 *
 * Copyright (c) 2025 by ${git_name_email}, All Rights Reserved.
 */
import { encryptQuery } from "./kwDES";
import { SongUrlResult } from "./unblock";
import { serverLog } from "../../main/logger";
import axios from "axios";

// 导入时长过滤函数
import { filterByDuration } from "./index";

// 获取酷我音乐歌曲 ID
const getKuwoSongId = async (keyword: string): Promise<string | null> => {
  try {
    const url =
      "http://search.kuwo.cn/r.s?&correct=1&stype=comprehensive&encoding=utf8&rformat=json&mobi=1&show_copyright_off=1&searchapi=6&all=" +
      keyword;
    const result = await axios.get(url, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Referer': 'https://www.kuwo.cn/',
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
            'Sec-Fetch-Site': 'same-site',
            'Cookie': 'Hm_Iuvt_cdb524f42f23cer9b268564v7y735ewrq2324=mKTSStA6xdsEHSXjQrcBibiN5zPbp5nf; Hm_lpvt_cdb524f42f0ce19b169a8071123a4797=1755881315; Hm_lvt_cdb524f42f0ce19b169a8071123a4797=1755880985; _ga=GA1.2.809238187.1755880986; _ga_ETPBRPM9ML=GS2.2.s1755880987$o1$g1$t1755881314$j60$l0$h0; _gat=1; _gid=GA1.2.725880452.1755880986; kw_token=your_token_here; bid=1; crossid=1; Hm_Iuvt_cdb524f42f23cer9b268564v7y735ewrq2324=1'
          }
        });
    if (
      !result.data ||
      result.data.content.length < 2 ||
      !result.data.content[1].musicpage ||
      result.data.content[1].musicpage.abslist.length < 1
    ) {
      return null;
    }
    // 获取歌曲信息
    const songId = result.data.content[1].musicpage.abslist[0].MUSICRID;
    const songName = result.data.content[1].musicpage.abslist[0]?.SONGNAME;
    // 是否与原曲吻合
    const originalName = keyword?.split("-") ?? keyword;
    if (songName && !songName?.includes(originalName[0])) return null;
    return songId.slice("MUSIC_".length);
  } catch (error) {
    serverLog.error("❌ Get KuwoSongId Error:", error);
    return null;
  }
};

// 获取酷我音乐歌曲 URL
const getKuwoSongUrl = async (keyword: string): Promise<SongUrlResult> => {
  try {
    if (!keyword) return { code: 404, url: null };
    const songId = await getKuwoSongId(keyword);
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

      // 尝试获取歌曲时长信息
      let duration: number | undefined = undefined;
      try {
        // 获取歌曲详情以获取时长
        const detailUrl = `http://www.kuwo.cn/api/www/music/musicInfo?mid=${songId}`;
        const detailResult = await axios.get(detailUrl, {
          headers: {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36",
            "Referer": "http://www.kuwo.cn/"
          }
        });

        if (detailResult.data && detailResult.data.data && detailResult.data.data.duration) {
          // 将时长转换为毫秒
          const durationStr = detailResult.data.data.duration; // 格式可能是 "03:45"
          const parts = durationStr.split(':');
          if (parts.length === 2) {
            const minutes = parseInt(parts[0]);
            const seconds = parseInt(parts[1]);
            duration = (minutes * 60 + seconds) * 1000; // 转换为毫秒
          }
        }
      } catch (detailError) {
        serverLog.error("❌ Get Kuwo Song Duration Error:", detailError);
      }

      // 应用时长过滤
      return filterByDuration({ code: 200, url: urlMatch, duration });
    }
    return { code: 404, url: null };
  } catch (error) {
    serverLog.error("❌ Get KuwoSong URL Error:", error);
    return { code: 404, url: null };
  }
};

export default getKuwoSongUrl;
