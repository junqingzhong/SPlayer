#!/bin/sh

# 优化后的 All-in-One 启动脚本
# ----------------------------------------------------------------
# 它会按正确的顺序在后台启动所有依赖服务，最后启动 Nginx 作为前台进程来保持容器运行。
# 顺序: FastAPI -> NeteaseCloudMusicApi -> UnblockNeteaseMusic -> Nginx
# ----------------------------------------------------------------

# 当任何命令失败时，脚本立即退出
set -e

echo "Preparing UnblockNeteaseMusic service..."
# QQ_COOKIE="uin=o2738323431;qm_keyst=W_X_63B0aOjcAAQPbhd044BCWZRbqx8qnh-07P_lpW4QxXKs0WT_Qw_l7kVoYIpEbvgjJl5UGiJN_G8ZAaNYX8jadGHMZny8"

# COOKIE_FILE="/app/qq.cookie" # 使用 /tmp 目录更标准
cat > /app/.env <<EOF
 QQ_COOKIE="uin=o2738323431;qm_keyst=W_X_63B0aOjcAAQPbhd044BCWZRbqx8qnh-07P_lpW4QxXKs0WT_Qw_l7kVoYIpEbvgjJl5UGiJN_G8ZAaNYX8jadGHMZny8"
 UNBLOCK_SOURCES="qq kugou kuwo pyncmd bilibili"
 NETEASE_SERVER_IP=111.124.200.65
 UNBLOCK_SOURCES="qq kugou kuwo pyncmd bilibili"
 ENABLE_FLAC=false
 ENABLE_HTTPDNS=false
 BLOCK_ADS=true
 DISABLE_UPGRADE_CHECK=false
 DEVELOPMENT=false
 FOLLOW_SOURCE_ORDER=true
 JSON_LOG=false
 NO_CACHE=false
 SELECT_MAX_BR=true
 LOG_LEVEL=info
 SEARCH_ALBUM=true
 ENABLE_LOCAL_VIP=svip
 MIN_BR=320000
EOF

if [ -f /app/.env ]; then
  # `set -a` 会自动导出之后所有被定义的变量
  set -a
  . /app/.env
  # `set +a` 恢复默认行为
  set +a
fi
# 3.3 在后台启动 Unblock 服务，并明确指定上游 API
# 使用 -e 参数可以避免服务间的连接问题
echo "Starting UnblockNeteaseMusic service in the background..."
npx unblockneteasemusic \
  -f ${NETEASE_SERVER_IP:-111.124.200.65} \
  -o ${UNBLOCK_SOURCES:-qq kugou kuwo pyncmd bilibili} \
  -e http://127.0.0.1:8081 \
  -p 8081:443 2>&1 &

# point the neteasemusic address to the unblock service
echo "Updating /etc/hosts file..."
{
    echo "127.0.0.1 music.163.com"
    echo "127.0.0.1 interface.music.163.com"
    echo "127.0.0.1 interface3.music.163.com"
    echo "127.0.0.1 interface.music.163.com.163jiasu.com"
    echo "127.0.0.1 interface3.music.163.com.163jiasu.com"
} >> /etc/hosts

# 启动 FastAPI（Uvicorn）后台运行
uvicorn app:app --host 0.0.0.0 --port 8000 --reload &

echo "fastapi start."

# 启动 NeteaseCloudMusicApi 也后台运行
npx NeteaseCloudMusicApi --proxy http://127.0.0.1:8081 &

echo "netease api start."

# 启动 nginx（必须前台，否则容器会退出）
nginx -g "daemon off;"

