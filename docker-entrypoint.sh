#!/bin/sh
###
 # @Author: ZJQ
 # @Date: 2025-05-23 10:50:52
 # @LastEditors: zjq zjq@xkb.com.cn
 # @LastEditTime: 2025-05-23 17:05:10
 # @FilePath: \tea\docker-entrypoint.sh
 # @Description:
 #
 # Copyright (c) 2025 by ${git_name_email}, All Rights Reserved.
###

set -e

# start unblock service in the background
npx unblockneteasemusic -p 80:443 -s -f ${NETEASE_SERVER_IP:-220.197.30.65} -o ${UNBLOCK_SOURCES:-kugou kuwo bilibili} 2>&1 &

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
export ELECTRON_STORE_PATH=/app/splayer_config/config.json
export SPLAYER_DOCKER_MODE=true
export VITE_SPLAYER_BACKEND_PORT=${VITE_SPLAYER_BACKEND_PORT:-25885}

echo "Starting SPlayer backend server on port $VITE_SPLAYER_BACKEND_PORT..."
# Assuming /app/out/main/index.js will respect SPLAYER_DOCKER_MODE and VITE_SPLAYER_BACKEND_PORT
node /app/out/main/index.js &

# start the nginx daemon
echo "Starting Nginx..."
nginx

# start the main process (if any, otherwise this will just keep the container alive if nginx is not daemonized)
# If nginx runs in foreground (default for docker images), this exec might not be reached or needed.
# Keeping it for now as per original script structure.
echo "Executing main CMD..."
exec "$@"
