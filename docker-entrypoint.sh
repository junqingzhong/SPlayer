#!/bin/sh
###
 # @Author: ZJQ
 # @Date: 2025-05-23 10:50:52
 # @LastEditors: zjq zjq@xkb.com.cn
 # @LastEditTime: 2025-05-29 12:25:54
 # @FilePath: \tea\docker-entrypoint.sh
 # @Description:
 #
 # Copyright (c) 2025 by ${git_name_email}, All Rights Reserved.
###

set -e

# sh -c "cd /app && uvicorn app:app --host 0.0.0.0 --port 8000 --reload"
# start unblock service in the background
# Use port 8081 for HTTP and 8082 for HTTPS to avoid conflict with Nginx
npx unblockneteasemusic -p 8081:443 -s -f ${NETEASE_SERVER_IP:-111.124.200.65} -o ${UNBLOCK_SOURCES:-kugou kuwo bilibili} 2>&1 &

# point the neteasemusic address to the unblock service
if ! grep -q "music.163.com" /etc/hosts; then
    echo "127.0.0.1 music.163.com" >> /etc/hosts
fi
if ! grep -q "interface.music.163.com" /etc/hosts; then
    echo "127.0.0.1 interface.music.163.com" >> /etc/hosts
fi
if ! grep -q "interface3.music.163.com" /etc/hosts; then
    echo "127.0.0.1 interface3.music.163.com" >> /etc/hosts
fi
if ! grep -q "interface.music.163.com.163jiasu.com" /etc/hosts; then
    echo "127.0.0.1 interface.music.163.com.163jiasu.com" >> /etc/hosts
fi
if ! grep -q "interface3.music.163.com.163jiasu.com" /etc/hosts; then
    echo "127.0.0.1 interface3.music.163.com.163jiasu.com" >> /etc/hosts
fi

# Configure SPlayer backend
# export ELECTRON_STORE_PATH=/app/splayer_config/config.json
# export SPLAYER_DOCKER_MODE=true
# export VITE_SPLAYER_BACKEND_PORT=${VITE_SPLAYER_BACKEND_PORT:-25885}

# echo "Starting SPlayer backend server on port $VITE_SPLAYER_BACKEND_PORT..."
# Assuming /app/out/main/index.js will respect SPLAYER_DOCKER_MODE and VITE_SPLAYER_BACKEND_PORT
# Commented out for splayer-app (Nginx image) as it's not supposed to run here and path doesn't exist
# node /app/out/main/index.js &

#!/bin/bash

# 启动 FastAPI（Uvicorn）后台运行
uvicorn app:app --host 0.0.0.0 --port 8000 --reload &

echo "fastapi start."

# 启动 NeteaseCloudMusicApi 也后台运行
npx NeteaseCloudMusicApi &

echo "netease api start."

# 启动 nginx（必须前台，否则容器会退出）
nginx -g "daemon off;"

