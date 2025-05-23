/*
 * @Author: ZJQ
 * @Date: 2025-05-23 10:50:52
 * @LastEditors: zjq zjq@xkb.com.cn
 * @LastEditTime: 2025-05-23 12:12:28
 * @FilePath: \tea\electron\server\index.ts
 * @Description:
 *
 * Copyright (c) 2025 by ${git_name_email}, All Rights Reserved.
 */
import { join } from "path";
import { isDev } from "../main/utils";
import initNcmAPI from "./netease";
import initUnblockAPI from "./unblock";
import fastifyCookie from "@fastify/cookie";
import fastifyMultipart from "@fastify/multipart";
import fastifyStatic from "@fastify/static";
import fastify from "fastify";
import log from "../main/logger";

const initAppServer = async () => {
  try {
    const server = fastify({
      // 忽略尾随斜杠
      ignoreTrailingSlash: true,
    });
    // 注册插件
    server.register(fastifyCookie);
    server.register(fastifyMultipart);
    // 生产环境启用静态文件
    if (!isDev) {
      log.info("📂 Serving static files from /renderer");
      server.register(fastifyStatic, {
        root: join(__dirname, "../renderer"),
      });
    }
    // 声明
    server.get("/api", (_, reply) => {
      reply.send({
        name: "SPlayer API",
        description: "SPlayer API service",
        author: "@imsyy",
        list: [
          {
            name: "NeteaseCloudMusicApi",
            url: "/api/netease",
          },
          {
            name: "UnblockAPI",
            url: "/api/unblock",
          },
        ],
      });
    });
    // 注册接口
    server.register(initNcmAPI, { prefix: "/api" });
    server.register(initUnblockAPI, { prefix: "/api" });
    // 尝试从全局配置获取端口
    let port = 25884; // 默认端口
    try {
      // 尝试从localStorage获取用户配置
      const configStr = global.localStorage?.getItem('splayer-config');
      if (configStr) {
        const config = JSON.parse(configStr);
        if (config.serverPort && typeof config.serverPort === 'number') {
          port = config.serverPort;
          log.info(`Using custom port from config: ${port}`);
        }
      }
    } catch (error) {
      log.warn('Failed to get port from config, using default or env port');
    }

    // 如果没有从配置获取到，则使用环境变量
    if (port === 25884) {
      port = Number(import.meta.env["VITE_SERVER_PORT"] || 25884);
    }

    // Docker模式优先级最高
    if (process.env.SPLAYER_DOCKER_MODE === "true") {
      port = Number(process.env.VITE_SPLAYER_BACKEND_PORT || 25885);
      log.info("SPLAYER_DOCKER_MODE is true, using VITE_SPLAYER_BACKEND_PORT");
    }
    await server.listen({ port, host: "0.0.0.0" }); // Listen on all interfaces for Docker
    log.info(`🌐 Starting AppServer on port ${port}`);
    return server;
  } catch (error) {
    log.error("🚫 AppServer failed to start");
    throw error;
  }
};

export default initAppServer;
