import type { SongMatchInfo, SongUrlResult } from "./unblock";
import { isSongMatch } from "./match";
import { serverLog } from "../../main/logger";
import axios from "axios";

// 咪咕搜索接口
const searchSong = async (match: SongMatchInfo): Promise<string | null> => {
  try {
    const keyword = encodeURIComponent(match.keyword.replace(" - ", " "));
    const url = `https://m.music.migu.cn/migu/remoting/scr_search_tag?keyword=${keyword}&type=2&pg=1&pz=10`;
    const result = await axios.get(url, {
      headers: {
        Referer: "https://m.music.migu.cn/",
        "User-Agent":
          "Mozilla/5.0 (Linux; Android 9; MI 9 Build/PKQ1.181121.001) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/91.0.4472.114 Mobile Safari/537.36",
      },
    });
    const data = result.data;
    if (!data || !data.musics || data.musics.length < 1) {
      return null;
    }
    // 遍历搜索结果，找歌名和艺术家匹配的项
    for (const item of data.musics) {
      const songId = item?.copyrightId;
      if (!songId) continue;
      if (isSongMatch(item?.songName || "", item?.singerName || "", match)) {
        return songId;
      }
    }
    serverLog.warn(`⚠️ Migu 搜索结果均不匹配原曲: "${match.songName}"`);
    return null;
  } catch (error) {
    serverLog.error("❌ Get MiguSongId Error:", error);
    return null;
  }
};

// 获取咪咕音乐歌曲 URL
const getMiguSongUrl = async (match: SongMatchInfo): Promise<SongUrlResult> => {
  try {
    if (!match.keyword) return { code: 404, url: null };
    const copyrightId = await searchSong(match);
    if (!copyrightId) return { code: 404, url: null };
    // 获取播放链接
    const url = `https://m.music.migu.cn/migu/remoting/play_url/v2?copyrightId=${copyrightId}&type=1`;
    const result = await axios.get(url, {
      headers: {
        Referer: "https://m.music.migu.cn/",
        "User-Agent":
          "Mozilla/5.0 (Linux; Android 9; MI 9 Build/PKQ1.181121.001) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/91.0.4472.114 Mobile Safari/537.36",
      },
    });
    const playUrl = result.data?.data?.playUrl;
    if (playUrl) {
      serverLog.log("🔗 MiguSong URL:", playUrl);
      return { code: 200, url: playUrl };
    }
    return { code: 404, url: null };
  } catch (error) {
    serverLog.error("❌ Get MiguSong URL Error:", error);
    return { code: 404, url: null };
  }
};

export default getMiguSongUrl;
