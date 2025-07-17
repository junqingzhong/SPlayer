import { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { SongUrlResult } from "./unblock";
import getKuwoSongUrl from "./kuwo";
import log from "../../main/logger";
import axios from "axios";

/**
 * 直接获取 网易云云盘 链接
 * Thank @939163156
 * Power by GD音乐台(music.gdstudio.xyz)
 */
const getNeteaseSongUrl = async (id: number | string): Promise<SongUrlResult> => {
  try {
    if (!id) return { code: 404, url: null };
    const baseUrl = "https://music-api.gdstudio.xyz/api.php";
    const result = await axios.get(baseUrl, {
      params: { types: "url", id },
    });
    const songUrl = result.data.url;
    log.info("🔗 NeteaseSongUrl URL:", songUrl);
    return { code: 200, url: songUrl };
  } catch (error) {
    log.error("❌ Get NeteaseSongUrl Error:", error);
    return { code: 404, url: null };
  }
};

/**
 * 获取 QQ音乐 链接
 * 通过关键词搜索获取歌曲ID，然后获取播放链接
 */
const getQQSongUrl = async (keyword: string, qqCookie?: string): Promise<{ code: number; url: string | null }> => {
  log.info("🔍 Searching QQ song with keyword:", keyword);
  try {
    const cookie = qqCookie || localStorage.getItem('qq-cookie') || '';
    // 1. 搜索歌曲
    const searchUrl = "https://u.y.qq.com/cgi-bin/musicu.fcg";
    const searchData = {
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
    const searchRes = await axios.get(searchUrl, {
      params: { data: JSON.stringify(searchData) },
      headers: {
        Referer: "https://y.qq.com/",
        Cookie: cookie,
      },
    });
    const list = searchRes.data?.search?.data?.body?.song?.list;
    if (!list || list.length === 0) return { code: 404, url: null };
    const songInfo = list[0];
    const songmid = songInfo.mid;

    // 2. 依次尝试不同格式
    const formats = [
      ["F000", ".flac"],
      ["M800", ".mp3"],
      ["M500", ".mp3"],
      [null, null],
    ];
    for (const format of formats) {
      const guid = (Math.random() * 10000000).toFixed(0);
      const uin = ((cookie || '').match(/uin=(\\d+)/) || [])[1] || '0';
      const filename = format[0] ? [format[0] + songmid + format[1]] : null;
      const vkeyData = {
        req_0: {
          module: "vkey.GetVkeyServer",
          method: "CgiGetVkey",
          param: {
            guid,
            loginflag: 1,
            filename,
            songmid: [songmid],
            songtype: [0],
            uin,
            platform: "20",
          },
        },
      };
      const vkeyRes = await axios.get(searchUrl, {
        params: { data: JSON.stringify(vkeyData) },
        headers: {
          Referer: "https://y.qq.com/",
          Cookie: cookie,
        },
      });
      const { sip, midurlinfo } = vkeyRes.data?.req_0?.data || {};
      if (midurlinfo && midurlinfo[0]?.purl) {
        const playurl = sip[0] + midurlinfo[0].purl;
        return { code: 200, url: playurl };
      }
    }
    return { code: 4041, url: null };
  } catch (error) {
    return { code: 4042, url: null };
  }
};

/**
 * 获取 酷狗音乐 链接
 * 通过关键词搜索获取歌曲hash和album_id，然后获取播放链接
 */
const getKugouSongUrl = async (keyword: string): Promise<SongUrlResult> => {
  try {
    if (!keyword) return { code: 404, url: null };

    // 第一步：搜索歌曲获取hash和album_id
    const searchUrl = "http://mobilecdn.kugou.com/api/v3/search/song";
    const searchResult = await axios.get(searchUrl, {
      params: {
        format: "json",
        keyword: keyword,
        page: 1,
        pagesize: 5,
        showtype: 1
      },
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36"
      }
    });

    if (!searchResult.data.data || !searchResult.data.data.info || searchResult.data.data.info.length === 0) {
      return { code: 404, url: null };
    }

    const songInfo = searchResult.data.data.info[0];
    const hash = songInfo.hash;
    const albumId = songInfo.album_id;

    // 第二步：获取播放链接
    const songUrl = `https://wwwapi.kugou.com/yy/index.php?r=play/getdata&hash=${hash}&album_id=${albumId}&mid=1`;
    const songResult = await axios.get(songUrl, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36",
        Referer: "https://www.kugou.com/"
      }
    });

    if (!songResult.data.data || !songResult.data.data.play_url) {
      return { code: 404, url: null };
    }

    const playUrl = songResult.data.data.play_url;
    log.info("🔗 KugouSong URL:", playUrl);
    return { code: 200, url: playUrl };
  } catch (error) {
    log.error("❌ Get KugouSong URL Error:", error);
    return { code: 404, url: null };
  }
};

/**
 * 获取 Bilibili 音乐链接
 * 通过关键词搜索获取音频ID，然后获取播放链接
 */
const getBilibiliSongUrl = async (keyword: string): Promise<SongUrlResult> => {
  try {
    if (!keyword) return { code: 404, url: null };

    // 第一步：搜索音频
    const searchUrl = "https://api.bilibili.com/audio/music-service-c/s";
    const searchResult = await axios.get(searchUrl, {
      params: {
        search_type: "music",
        keyword: keyword,
        page: 1,
        pagesize: 5
      },
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36",
        Referer: "https://www.bilibili.com/"
      }
    });

    if (!searchResult.data.data || !searchResult.data.data.result || searchResult.data.data.result.length === 0) {
      return { code: 404, url: null };
    }

    const audioId = searchResult.data.data.result[0].id;

    // 第二步：获取播放链接
    const songUrl = `https://api.bilibili.com/audio/music-service-c/url?sid=${audioId}&privilege=2&quality=2`;
    const songResult = await axios.get(songUrl, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36",
        Referer: "https://www.bilibili.com/"
      }
    });

    if (!songResult.data.data || !songResult.data.data.cdns || songResult.data.data.cdns.length === 0) {
      return { code: 404, url: null };
    }

    const playUrl = songResult.data.data.cdns[0];
    log.info("🔗 BilibiliSong URL:", playUrl);
    return { code: 200, url: playUrl };
  } catch (error) {
    log.error("❌ Get BilibiliSong URL Error:", error);
    return { code: 404, url: null };
  }
};

// 初始化 UnblockAPI
const UnblockAPI = async (fastify: FastifyInstance) => {
  // 主信息
  fastify.get("/unblock", (_, reply) => {
    reply.send({
      name: "UnblockAPI",
      description: "SPlayer UnblockAPI service",
      author: "@imsyy",
      content:
        "部分接口采用 @939163156 by GD音乐台(music.gdstudio.xyz)，仅供本人学习使用，不可传播下载内容，不可用于商业用途。",
    });
  });
  // netease
  fastify.get(
    "/unblock/netease",
    async (
      req: FastifyRequest<{ Querystring: { [key: string]: string } }>,
      reply: FastifyReply,
    ) => {
      const { id } = req.query;
      const result = await getNeteaseSongUrl(id);
      return reply.send(result);
    },
  );
  // kuwo
  fastify.get(
    "/unblock/kuwo",
    async (
      req: FastifyRequest<{ Querystring: { [key: string]: string } }>,
      reply: FastifyReply,
    ) => {
      const { keyword } = req.query;
      const result = await getKuwoSongUrl(keyword);
      return reply.send(result);
    },
  );

  // qq
  fastify.get(
    "/unblock/qq",
    async (
      req: FastifyRequest<{ Querystring: { [key: string]: string } }>,
      reply: FastifyReply,
    ) => {
      const { keyword } = req.query;
      const result = await getQQSongUrl(keyword);
      return reply.send(result);
    },
  );

  // kugou
  fastify.get(
    "/unblock/kugou",
    async (
      req: FastifyRequest<{ Querystring: { [key: string]: string } }>,
      reply: FastifyReply,
    ) => {
      const { keyword } = req.query;
      const result = await getKugouSongUrl(keyword);
      return reply.send(result);
    },
  );

  // bilibili
  fastify.get(
    "/unblock/bilibili",
    async (
      req: FastifyRequest<{ Querystring: { [key: string]: string } }>,
      reply: FastifyReply,
    ) => {
      const { keyword } = req.query;
      const result = await getBilibiliSongUrl(keyword);
      return reply.send(result);
    },
  );

  log.info("🌐 Register UnblockAPI successfully");
};

export default UnblockAPI;
