FROM debian:bullseye-slim

WORKDIR /app

# 安装依赖（Python、Node、Nginx、编译环境）
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 python3-pip python3-dev \
    build-essential \
    curl wget git \
    ffmpeg \
    nginx \
    gnupg \
    ca-certificates \
    && curl -fsSL https://deb.nodesource.com/setup_20.x | bash - \
    && apt-get install -y --no-install-recommends nodejs \
    && apt-get clean && rm -rf /var/lib/apt/lists/* /tmp/* /var/tmp/*

# 安装 Python 包
RUN pip install --no-cache-dir --upgrade pip && pip install --no-cache-dir \
    fastapi \
    uvicorn[standard] \
    python-dotenv \
    httpx \
    sqlalchemy \
    passlib[bcrypt] \
    python-jose[cryptography] \
    pydantic \
    jinja2 \
    itsdangerous \
    python-multipart

# 安装 Node 服务
RUN npm install -g --omit=dev @unblockneteasemusic/server NeteaseCloudMusicApi \
    && npm cache clean --force

# 安装 yt-dlp
RUN wget https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp -O /usr/local/bin/yt-dlp \
    && chmod +x /usr/local/bin/yt-dlp

# 拷贝后端代码
COPY . .

# 拷贝 nginx 配置文件
COPY nginx.conf /etc/nginx/nginx.conf

# 拷贝启动脚本
COPY docker-entrypoint.sh /
RUN chmod +x /docker-entrypoint.sh

# Nginx 默认监听 80，FastAPI 监听 8000，网易云 API 3000，Unblock 8081
EXPOSE 80 8000 3000 8081

ENV NODE_TLS_REJECT_UNAUTHORIZED=0

ENTRYPOINT ["/docker-entrypoint.sh"]
