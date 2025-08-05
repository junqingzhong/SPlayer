
import axios from "axios";

// 搜索 QQ 歌曲
const qqSearch = async (keyword: string, cookie: string = "") => {
  const url = "https://u.y.qq.com/cgi-bin/musicu.fcg";
  const data = {
    search: {
      method: "DoSearchForQQMusicDesktop",
      module: "music.search.SearchCgiService",
      param: {
        num_per_page: 5,
        page_num: 1,
        query: keyword,
        search_type: 0,
      },
    },
  };
  const headers = {
    origin: "http://y.qq.com/",
    referer: "http://y.qq.com/",
    cookie: cookie || "",
  };
  const res = await axios.get(url, {
    params: { data: JSON.stringify(data) },
    headers,
  });
  const list = res.data?.search?.data?.body?.song?.list;
  if (!list || list.length === 0) return [];
  return list.map((song: any) => ({
    songmid: song.mid,
    name: song.name,
    album: { id: song.album?.mid, name: song.album?.name },
    artists: song.singer?.map((s: any) => ({ id: s.mid, name: s.name })),
    interval: song.interval,
  }));
};

// 获取 QQ 歌曲播放链接（优先高音质）
const qqTrack = async (songmid: string, cookie: string = ""): Promise<string | null> => {
  const formats = [
    ["F000", ".flac"], // FLAC
    ["M800", ".mp3"],  // 320K
    ["M500", ".mp3"],  // 128K
    [null, null],      // 备用
  ];
  const headers = {
    origin: "http://y.qq.com/",
    referer: "http://y.qq.com/",
    cookie: cookie || "",
  };
  const uin = ((cookie || "").match(/uin=(\d+)/) || [])[1] || "0";
  const url = "https://u.y.qq.com/cgi-bin/musicu.fcg";
  for (const format of formats) {
    const filename = format[0] ? [format[0] + songmid + format[1]] : null;
    const vkeyData = {
      req_0: {
        module: "vkey.GetVkeyServer",
        method: "CgiGetVkey",
        param: {
          guid: (Math.random() * 10000000).toFixed(0),
          loginflag: 1,
          filename,
          songmid: [songmid],
          songtype: [0],
          uin,
          platform: "20",
        },
      },
    };
    try {
      const res = await axios.get(url, {
        params: { data: JSON.stringify(vkeyData) },
        headers,
      });
      const { sip, midurlinfo } = res.data?.req_0?.data || {};
      if (midurlinfo && midurlinfo[0]?.purl) {
        return sip[0] + midurlinfo[0].purl;
      }
    } catch {
      // ignore, try next format
    }
  }
  return null;
};

// 入口：通过关键词和cookie获取 QQ 歌曲高音质直链
export const getQQSongUrl = async (keyword: string, cookie: string = ""): Promise<{ code: number; url: string | null }> => {
  try {
    const list = await qqSearch(keyword, cookie);
    if (!list || list.length === 0) return { code: 404, url: null };
    for (const song of list) {
      const playUrl = await qqTrack(song.songmid, cookie);
      if (playUrl) {
        return { code: 200, url: playUrl };
      }
    }
    return { code: 404, url: null };
  } catch (e) {
     return { code: 500, url: (e instanceof Error ? e.message : "获取qq歌曲链接失败") };
  }
};

export default getQQSongUrl;