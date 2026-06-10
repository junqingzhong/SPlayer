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
      const result = await fetchWithTimeout(() => getNeteaseSongUrl(id), 5000, "网易云音乐解锁");
      if (!result) {
        return reply.send({ code: 404, url: null, message: "请求超时或失败" });
      }
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

  // 带超时的请求包装
  const fetchWithTimeout = async <T>(
    fetcher: () => Promise<T>,
    timeout: number = 8000,
    label: string = "请求",
  ): Promise<T | null> => {
    try {
      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error(`${label} 超时`)), timeout);
      });
      return await Promise.race([fetcher(), timeoutPromise]);
    } catch (error) {
      serverLog.warn(`⚠️ ${label} 失败:`, error instanceof Error ? error.message : error);
      return null;
    }
  };
  // kuwo
  fastify.get(
    "/unblock/kuwo",
    async (
      req: FastifyRequest<{ Querystring: { [key: string]: string } }>,
      reply: FastifyReply,
    ) => {
      const result = await fetchWithTimeout(
        () => getKuwoSongUrl(buildMatchInfo(req.query)),
        8000,
        "酷我音乐解锁",
      );
      if (!result) {
        return reply.send({ code: 404, url: null, message: "请求超时或失败" });
      }
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
      const result = await fetchWithTimeout(
        () => getBodianSongUrl(buildMatchInfo(req.query)),
        8000,
        "波点音乐解锁",
      );
      if (!result) {
        return reply.send({ code: 404, url: null, message: "请求超时或失败" });
      }
      return reply.send(result);
    },
  );
  serverLog.info("🌐 Register UnblockAPI successfully");
};
