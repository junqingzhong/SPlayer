import axios from "axios";
import crypto from "crypto";

// 格式化搜索结果
const format = (song: any) => ({
  id: song["hash"],
  id_hq: song["320hash"],
  id_sq: song["sqhash"],
  name: song["songname"],
  duration: song["duration"] * 1000,
  album: { id: song["album_id"], name: song["album_name"] },
});

// 计算md5
const md5 = (str: string) => crypto.createHash("md5").update(str).digest("hex");

// 搜索酷狗歌曲
export const kugouSearch = async (keyword: string) => {
  const url = "http://mobilecdn.kugou.com/api/v3/search/song";
  const res = await axios.get(url, {
    params: {
      format: "json",
      keyword,
      page: 1,
      pagesize: 10,
      showtype: 1,
    },
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36",
    },
  });
  if (!res.data.data || !res.data.data.info || res.data.data.info.length === 0) {
    return null;
  }
  return res.data.data.info.map(format);
};

// 获取酷狗播放链接（优先无损、320、普通）
export const kugouTrack = async (song: any) => {
  const tryFormats = [
    { key: "id_sq", name: "sqhash" },
    { key: "id_hq", name: "hqhash" },
    { key: "id", name: "hash" },
  ];
  for (const fmt of tryFormats) {
    const hash = song[fmt.key];
    if (!hash) continue;
    const url =
      "http://trackercdn.kugou.com/i/v2/?" +
      "key=" +
      md5(`${hash}kgcloudv2`) +
      "&hash=" +
      hash +
      "&appid=1005&pid=2&cmd=25&behavior=play&album_id=" +
      song.album.id;
    try {
      const res = await axios.get(url, {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36",
        },
      });
      if (res.data.url && res.data.url[0]) {
        return res.data.url[0];
      }
    } catch {
      // ignore, try next format
    }
  }
  return null;
};

// 入口：通过关键词获取酷狗播放链接
export const getKugouSongUrl = async (keyword: string): Promise<{ code: number; url: string | null }> => {
  try {
    const list = await kugouSearch(keyword);
    if (!list || list.length === 0) return { code: 404, url: null };

    for (const song of list) {
      const playUrl = await kugouTrack(song);
      if (playUrl) {
        return { code: 200, url: playUrl };
      }
    }
    // 全部尝试后都没有可用直链
    return { code: 404, url: null };
  } catch (e) {
    return { code: 500, url: (e instanceof Error ? e.message : "获取酷狗歌曲链接失败") };
  }
};

export default getKugouSongUrl;