# SPlayer Docker 部署指南

本文档提供了使用 Docker 和 Docker Compose 部署 SPlayer 的说明。此设置通过 Nginx 运行 SPlayer 前端，SPlayer 后端 API 服务器，Binaryify NeteaseCloudMusicApi 服务器和 UnblockNeteaseMusic 服务。

## 架构概述

Docker 部署由 `docker-compose.yml` 中定义的单个服务组成，该服务内部运行多个进程：

1.  **Nginx**：提供 SPlayer 静态前端（构建的 Vue.js 应用程序）并充当反向代理。
2.  **SPlayer 后端 API**：一个 Node.js Fastify 服务器（源自 SPlayer 的 Electron 主进程代码），提供 SPlayer 特定的 API 功能。可通过 Nginx 在 `/splayer-api/` 访问。
3.  **Binaryify NeteaseCloudMusicApi 服务器**：`NeteaseCloudMusicApi` 包的标准 Node.js 服务器，提供对网易云音乐服务的访问。可通过 Nginx 在 `/api/netease/` 访问。
4.  **UnblockNeteaseMusic 服务**：一项尝试通过查找替代来源解锁区域限制的网易歌曲的服务。它与 Binaryify Netease API 服务器配合使用。

## 先决条件

-   **Docker**：确保 Docker 已安装并在您的系统上运行。[安装 Docker](https://docs.docker.com/get-docker/)
-   **Docker Compose**：确保已安装 Docker Compose（通常包含在 Docker Desktop 中）。[安装 Docker Compose](https://docs.docker.com/compose/install/)

## 设置说明

### 1. 克隆仓库

```bash
git clone https://github.com/imsyy/SPlayer.git
cd SPlayer
```

### 2. 准备配置文件

-   **Nginx 配置（`nginx.conf`）：**
    仓库包含一个预配置的 `nginx.conf` 文件。该文件将被挂载到 Docker 容器中。它被设置为提供 SPlayer 前端并将 API 请求代理到 SPlayer 后端和 Netease API 服务器。

-   **SPlayer 用户数据目录：**
    创建一个目录以持久化 SPlayer 用户设置（例如，`electron-store` 数据）。
    ```bash
    mkdir splayer_data
    ```
    该目录将作为卷挂载到容器中。

-   **（可选）自定义主机端口：**
    默认情况下，Nginx（以及 SPlayer UI）将在主机端口 `8080` 上可访问。如果您希望使用不同的端口，可以在构建和运行之前修改 `docker-compose.yml` 中的 `ports` 部分。例如，要使用端口 `80`：
    ```yaml
    # 在 docker-compose.yml 中
    ports:
      - "80:80" # 在主机端口 80 上暴露 Nginx
    ```

### 3. 使用 Docker Compose 构建和运行

从克隆仓库的根目录运行：

```bash
docker-compose up -d --build
```

-   `--build`：强制 Docker Compose 使用提供的 `Dockerfile` 构建 SPlayer 镜像。
-   `-d`：在后台运行容器（分离模式）。

## 访问 SPlayer

容器启动并运行后：

-   **SPlayer UI**：打开您的网络浏览器并导航到 `http://localhost:HOST_NGINX_PORT`。
    -   如果您使用默认的 `docker-compose.yml`，这将是 `http://localhost:8080`。
    -   如果您在 `docker-compose.yml` 中更改了主机端口，请使用该端口。

## 持久化数据

-   **SPlayer 用户设置**：用户特定设置（如桌面应用中由 `electron-store` 管理的设置）存储在主机机器上的 `./splayer_data` 目录中。该目录在容器内挂载到 `/app/splayer_config`，并且 `ELECTRON_STORE_PATH` 环境变量设置为 `/app/splayer_config/config.json`。
-   **Nginx 配置**：Nginx 配置从主机机器上的 `./nginx.conf` 挂载。如果您需要自定义 Nginx 行为，可以修改此文件并重启 Docker Compose 服务（`docker-compose restart SPlayer`）。

## 环境变量

以下环境变量在 `docker-compose.yml` 中为 `SPlayer` 服务配置：

-   `VITE_SPLAYER_BACKEND_PORT=25885`：指定 SPlayer 后端 API 服务器在*容器内*监听的端口。Nginx 将请求代理到此端口。
-   `SPLAYER_DOCKER_MODE=true`：一个自定义环境变量，向 SPlayer 应用程序代码（`electron/main/index.ts`）发出信号，以"仅后端"模式运行，禁用 Electron 窗口创建并仅启动 Fastify 服务器。
-   `NETEASE_SERVER_IP`：（可选）Netease Cloud Music API 服务器的 IP 地址。
-   `UNBLOCK_SOURCES`：（可选）UnblockNeteaseMusic 服务的来源（例如，`kugou kuwo bilibili`）。
-   其他 UnblockNeteaseMusic 特定环境变量（例如，`ENABLE_FLAC`，`LOG_LEVEL`）。

## 将 UnblockNeteaseMusic 作为依赖库使用

除了作为独立服务运行外，UnblockNeteaseMusic 还可以作为依赖库集成到您的项目中。以下是在 Node.js 应用程序中使用 UnblockNeteaseMusic 作为依赖库的示例：

### 安装依赖

```bash
npm install @unblockneteasemusic/server --save
```

### 基本用法

```javascript
const { createServer } = require('@unblockneteasemusic/server');

// 创建 UnblockNeteaseMusic 服务器实例
const unblockServer = createServer({
  // 配置选项
  port: 8080,                      // 服务器端口
  address: '0.0.0.0',              // 监听地址
  proxyUrl: 'http://your-proxy',   // 代理URL（可选）
  strict: false,                   // 严格模式
  log: console.log,                // 日志函数
  cache: true,                     // 启用缓存
  cacheSize: 1000,                 // 缓存大小
  ua: 'Mozilla/5.0...',            // 自定义User-Agent
  sources: ['kugou', 'kuwo', 'bilibili', 'migu', 'joox', 'youtube'], // 音乐源
  matchOrder: ['kugou', 'kuwo'],   // 匹配顺序
  token: 'your-token',             // API令牌（如需要）
  enableLocalVip: true,            // 启用本地VIP
  checkVersion: true,              // 检查版本更新
  searchLimit: 3,                  // 搜索结果限制
  searchDelay: 500,                // 搜索延迟（毫秒）
  usePublicSource: true,           // 使用公共源
  allowRangeRequests: true,        // 允许范围请求
  followRedirect: true,            // 跟随重定向
  maxRedirects: 3,                 // 最大重定向次数
  timeout: 10000,                  // 请求超时（毫秒）
  blockAds: true,                  // 阻止广告
  miniProgramSupport: true,        // 小程序支持
  apiOptions: {                    // API特定选项
    migu: { cookie: 'your-cookie' },
    joox: { cookie: 'your-cookie' },
    youtube: { key: 'your-api-key' }
  }
});

// 启动服务器
unblockServer.listen().then(() => {
  console.log('UnblockNeteaseMusic 服务器已启动');
});

// 处理特定歌曲
async function unblockSong(songId) {
  try {
    const result = await unblockServer.processSong({
      id: songId,
      quality: 'flac',  // 可选值: 'low', 'medium', 'high', 'lossless', 'flac'
      headers: {}       // 自定义请求头
    });
    return result;
  } catch (error) {
    console.error('处理歌曲时出错:', error);
    return null;
  }
}

// 使用示例
unblockSong('1234567').then(song => {
  if (song) {
    console.log('已解锁的歌曲URL:', song.url);
    console.log('歌曲信息:', song.artist, song.name, song.album);
  }
});

// 关闭服务器
process.on('SIGINT', () => {
  unblockServer.close().then(() => {
    console.log('UnblockNeteaseMusic 服务器已关闭');
    process.exit(0);
  });
});
```

### 在 Express 应用中集成

```javascript
const express = require('express');
const { createServer } = require('@unblockneteasemusic/server');

const app = express();
const unblockServer = createServer({
  port: 0,  // 不需要监听端口，因为我们将使用Express路由
  sources: ['kugou', 'kuwo', 'bilibili'],
  cache: true
});

// 初始化UnblockNeteaseMusic
unblockServer.initialize();

// 创建API端点
app.get('/unblock/:id', async (req, res) => {
  try {
    const songId = req.params.id;
    const quality = req.query.quality || 'flac';

    const result = await unblockServer.processSong({
      id: songId,
      quality: quality
    });

    if (result && result.url) {
      res.json({
        success: true,
        data: result
      });
    } else {
      res.status(404).json({
        success: false,
        message: '无法解锁该歌曲'
      });
    }
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

app.listen(3000, () => {
  console.log('服务器运行在 http://localhost:3000');
});
```

## 重要限制：设置管理

**重要说明：** 此 Docker 部署主要专注于提供 SPlayer UI 并使其后端音乐功能（Netease API、UnblockMusic、SPlayer 自己的 API 逻辑）可用。

然而，严重依赖 Electron 的进程间通信（IPC）机制直接在 UI 和主进程之间交互的功能**将无法像在桌面应用程序中那样工作**。这特别影响**设置管理**。

-   SPlayer 中现有的设置 UI（Vue 组件）使用 `window.electron.ipcRenderer.send(...)` 和 `window.electron.ipcRenderer.invoke(...)` 将更改传达给 Electron 主进程，然后主进程使用 `electron-store` 保存它们。
-   在此 Docker 设置中，UI 由 Nginx 提供并在标准 Web 浏览器中运行，其中 `window.electron` 不可用。
-   **因此，通过现有 UI 保存设置将无法正常工作。**

要在此 Docker 化环境中启用完整的设置交互性，SPlayer 应用程序需要进行重大重构：
1.  SPlayer 后端（Fastify 服务器）需要暴露新的 HTTP API 端点（例如，在 `/splayer-api/settings` 下）以获取和设置应用程序配置。
2.  前端设置 UI 组件需要修改为向这些新的后端端点发出 HTTP 请求，而不是使用 Electron IPC。

由于这些架构差异，此版本的 Docker 部署提供核心音乐播放体验，但不复制 Electron 桌面应用程序的完整设置交互性。用户设置将依赖于默认值或手动放置或修改在 `./splayer_data` 卷中的 `config.json` 文件。

## Troubleshooting

-   **View Logs**: To see the combined logs for all services (Nginx, SPlayer backend, UnblockNeteaseMusic):
    ```bash
    docker-compose logs -f SPlayer
    ```
-   **Common Issues**:
    -   **Port Conflicts**: If the host port (e.g., `8080`) is already in use, `docker-compose up` will fail. Change the host port mapping in `docker-compose.yml`.
    -   **Nginx Configuration Errors**: If Nginx fails to start, check for syntax errors in `./nginx.conf`.
    -   **Backend Not Starting**: Check the logs for errors from the SPlayer backend or UnblockNeteaseMusic service. Ensure environment variables are correctly set.
    -   **API Issues**: Test API endpoints using `curl` or a tool like Postman:
        -   Netease API (via Unblock): `curl http://localhost:HOST_NGINX_PORT/api/netease/search?keywords=someartist`
        -   SPlayer API: `curl http://localhost:HOST_NGINX_PORT/splayer-api/unblock/netease?id=someid`

This setup aims to provide a convenient way to run SPlayer and its associated services in a containerized environment.
