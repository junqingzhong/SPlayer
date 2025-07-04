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
const getQQSongUrl = async (keyword: string): Promise<SongUrlResult> => {
  try {
    if (!keyword) return { code: 404, url: null };

    // 第一步：搜索歌曲获取ID
    const searchUrl = "https://c.y.qq.com/soso/fcgi-bin/client_search_cp";
    const searchResult = await axios.get(searchUrl, {
      params: {
        w: keyword,
        format: "json",
        p: 1,
        n: 5
      },
      headers: {
        Referer: "https://y.qq.com/",
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36"
      }
    });

    if (!searchResult.data.data || !searchResult.data.data.song || !searchResult.data.data.song.list || searchResult.data.data.song.list.length === 0) {
      return { code: 404, url: null };
    }

    const songInfo = searchResult.data.data.song.list[0];
    const songMid = songInfo.songmid;

    // 第二步：获取播放链接
    const getVkeyUrl = "https://u.y.qq.com/cgi-bin/musicu.fcg";
    const pguid = (Math.random() * 10000000).toFixed(0);
    const data = {
      req: {
        module: "CDN.SrfCdnDispatchServer",
        method: "GetCdnDispatch",
        param: { guid:pguid, calltype: 0, userip: "" }
      },
      req_0: {
        module: "vkey.GetVkeyServer",
        method: "CgiGetVkey",
        param: {
          guid: pguid,
          songmid: [songMid],
          songtype: [0],
          uin: "0",
          loginflag: 1,
          platform: "20"
        }
      },
      comm: { uin: 0, format: "json", ct: 24, cv: 0 }
    };

    const vkeyResult = await axios.get(getVkeyUrl, {
      params: {
        data: JSON.stringify(data)
      },
      headers: {
        Referer: "https://y.qq.com/",
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36"
      }
    });

    if (!vkeyResult.data.req_0.data.midurlinfo || vkeyResult.data.req_0.data.midurlinfo.length === 0) {
      return { code: 404, url: null };
    }

    const purl = vkeyResult.data.req_0.data.midurlinfo[0].purl;
    if (!purl) {
      return { code: 404, url: null };
    }

    const baseUrl = vkeyResult.data.req_0.data.sip[0];
    const songUrl = baseUrl + purl;

    log.info("🔗 QQSong URL:", songUrl);
    return { code: 200, url: songUrl };
  } catch (error) {
    log.error("❌ Get QQSong URL Error:", error);
    return { code: 404, url: null };
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
 * 获取 pyncmd 音乐链接
 * 通过 pyncmd API 获取网易云音乐的替代链接
 * Power by GD音乐台(music.gdstudio.xyz)
 */
const getPyncmdSongUrl = async (id: number | string): Promise<SongUrlResult> => {
  try {
    if (!id) return { code: 404, url: null };
    const baseUrl = "https://music-api.gdstudio.xyz/api.php";
    const result = await axios.get(baseUrl, {
      params: { types: "pyncmd", id },
    });
    const songUrl = result.data.url;
    log.info("🔗 PyncmdSong URL:", songUrl);
    return { code: 200, url: songUrl };
  } catch (error) {
    log.error("❌ Get PyncmdSong URL Error:", error);
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

  // pyncmd
  fastify.get(
    "/unblock/pyncmd",
    async (
      req: FastifyRequest<{ Querystring: { [key: string]: string } }>,
      reply: FastifyReply,
    ) => {
      const { id } = req.query;
      const result = await getPyncmdSongUrl(id);
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
