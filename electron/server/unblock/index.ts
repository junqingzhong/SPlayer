/*
 * @Author: ZJQ
 * @Date: 2025-05-23 10:50:52
 * @LastEditors: zjq zjq@xkb.com.cn
 * @LastEditTime: 2025-12-11 15:53:37
 * @FilePath: \tea\electron\server\unblock\index.ts
 * @Description:
 *
 * Copyright (c) 2025 by ${git_name_email}, All Rights Reserved.
 */
import { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { SongUrlResult } from "./unblock";
import getKuwoSongUrl from "./kuwo";
import getKugouSongUrl from "./kugou";
import getQQSongUrl from "./qq";
import { check as getBilibiliSongUrl } from "./bilibili";
import { serverLog } from "../../main/logger";
import axios from "axios";
import getBodianSongUrl from "./bodian";
import getGequbaoSongUrl from "./gequbao";

// 最小有效音频时长（毫秒）
const MIN_VALID_DURATION = 30 * 1000; // 60秒，避免11秒音频

/**
 * 检查音频时长是否有效
 * @param result 音频结果
 * @returns 过滤后的结果
 */
export const filterByDuration = (result: SongUrlResult): SongUrlResult => {
  // 如果没有 URL 或者状态码不是 200，直接返回原结果
  if (!result.url || result.code !== 200) return result;

  // 如果有时长信息
  if (result.duration !== undefined) {
    // 排除时长过短的音频（小于60秒）
    if (result.duration < MIN_VALID_DURATION) {
      serverLog.log(`🔍 排除时长过短的音频链接: ${result.duration}ms < ${MIN_VALID_DURATION}ms`);
      return { code: 404, url: null };
    }

    // 排除异常时长（如11秒、22秒等常见无效时长）
    const invalidDurations = [11000, 22000, 33000]; // 常见无效时长
    if (invalidDurations.includes(result.duration)) {
      serverLog.log(`🔍 排除异常时长音频链接: ${result.duration}ms`);
      return { code: 404, url: null };
    }
  } else {
    // 如果没有时长信息，记录日志但允许通过
    serverLog.log(`⚠️ 音频链接缺少时长信息: ${result.url}`);
  }

  return result;
};

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
    serverLog.log("🔗 NeteaseSongUrl URL:", songUrl);

    // 尝试获取音频时长
    let duration: number | undefined = undefined;
    if (result.data.duration) {
      duration = parseInt(result.data.duration) * 1000; // 转换为毫秒
    }

    // 应用时长过滤
    return filterByDuration({ code: 200, url: songUrl, duration });
  } catch (error) {
    serverLog.error("❌ Get NeteaseSongUrl Error:", error);
    return { code: 404, url: null };
  }
};

// 初始化 UnblockAPI
export const initUnblockAPI = async (fastify: FastifyInstance) => {
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
  // 构造匹配信息（fallback 用 lastIndexOf 兼容歌名含连字符的情况）
  const buildMatchInfo = (query: { [key: string]: string }) => {
    let songName = query.songName || "";
    let artist = query.artist || "";
    if (!songName && query.keyword) {
      const lastIdx = query.keyword.lastIndexOf("-");
      if (lastIdx > 0) {
        songName = query.keyword.slice(0, lastIdx).trim();
        artist = artist || query.keyword.slice(lastIdx + 1).trim();
      } else {
        songName = query.keyword.trim();
      }
    }
    return { keyword: query.keyword || "", songName, artist };
  };
  // kuwo
  fastify.get(
    "/unblock/kuwo",
    async (
      req: FastifyRequest<{ Querystring: { [key: string]: string } }>,
      reply: FastifyReply,
    ) => {
      const result = await getKuwoSongUrl(buildMatchInfo(req.query));
      return reply.send(result);
    },
  );
  // bodian
  fastify.get(
    "/unblock/bodian",
    async (
      req: FastifyRequest<{ Querystring: { [key: string]: string } }>,
      reply: FastifyReply,
    ) => {
      const result = await getBodianSongUrl(buildMatchInfo(req.query));
      return reply.send(result);
    },
  );
  // gequbao
  fastify.get(
    "/unblock/gequbao",
    async (
      req: FastifyRequest<{ Querystring: { [key: string]: string } }>,
      reply: FastifyReply,
    ) => {
      const result = await getGequbaoSongUrl(buildMatchInfo(req.query));
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
      const { keyword, cookie } = req.query;
      const result = await getQQSongUrl(keyword, cookie);
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
      const result = await getBilibiliSongUrl({ keyword });
      return reply.send(result);
    },
  );

  serverLog.log("🌐 Register UnblockAPI successfully");
};
