<!-- 本地设置 -->
<template>
  <div class="setting-type">
    <div class="set-list">
      <n-h3 prefix="bar"> Last.fm 集成 </n-h3>
      <n-card class="set-item">
        <div class="label">
          <n-text class="name">启用 Last.fm</n-text>
          <n-text class="tip" :depth="3">开启后可记录播放历史到 Last.fm</n-text>
        </div>
        <n-switch class="set" v-model:value="settingStore.lastfm.enabled" :round="false" />
      </n-card>
      <n-collapse-transition :show="settingStore.lastfm.enabled">
        <n-card class="set-item">
          <div class="label">
            <n-text class="name">API Key</n-text>
            <n-text class="tip" :depth="3">
              在
              <n-a href="https://www.last.fm/api/account/create" target="_blank">Last.fm API</n-a>
              创建应用获取
            </n-text>
          </div>
          <n-input
            v-model:value="settingStore.lastfm.apiKey"
            placeholder="请输入 API Key"
            class="set"
            type="text"
          />
        </n-card>
        <n-card class="set-item">
          <div class="label">
            <n-text class="name">API Secret</n-text>
            <n-text class="tip" :depth="3">Shared Secret，用于签名验证</n-text>
          </div>
          <n-input
            v-model:value="settingStore.lastfm.apiSecret"
            placeholder="请输入 API Secret"
            class="set"
            type="password"
            show-password-on="click"
          />
        </n-card>
        <n-card v-if="!settingStore.lastfm.sessionKey" class="set-item">
          <div class="label">
            <n-text class="name">连接 Last.fm 账号</n-text>
            <n-text class="tip" :depth="3">首次使用需要授权连接</n-text>
          </div>
          <n-button
            type="primary"
            strong
            secondary
            :loading="lastfmAuthLoading"
            :disabled="!settingStore.isLastfmConfigured"
            @click="connectLastfm"
          >
            连接账号
          </n-button>
        </n-card>
        <n-card v-else class="set-item">
          <div class="label">
            <n-text class="name">已连接账号</n-text>
            <n-text class="tip" :depth="3">{{ settingStore.lastfm.username }}</n-text>
          </div>
          <n-button type="error" strong secondary @click="disconnectLastfm"> 断开连接 </n-button>
        </n-card>
        <n-card v-if="settingStore.lastfm.sessionKey" class="set-item">
          <div class="label">
            <n-text class="name">Scrobble（播放记录）</n-text>
            <n-text class="tip" :depth="3">自动记录播放历史到 Last.fm</n-text>
          </div>
          <n-switch
            class="set"
            v-model:value="settingStore.lastfm.scrobbleEnabled"
            :round="false"
          />
        </n-card>
        <n-card v-if="settingStore.lastfm.sessionKey" class="set-item">
          <div class="label">
            <n-text class="name">正在播放状态</n-text>
            <n-text class="tip" :depth="3">向 Last.fm 同步正在播放的歌曲</n-text>
          </div>
          <n-switch
            class="set"
            v-model:value="settingStore.lastfm.nowPlayingEnabled"
            :round="false"
          />
        </n-card>
      </n-collapse-transition>
    </div>
  </div>
</template>

<script setup lang="ts">
import { useSettingStore } from "@/stores";
import { getAuthToken, getAuthUrl, getSession } from "@/api/lastfm";

const settingStore = useSettingStore();

const lastfmAuthLoading = ref(false);

/**
 * 连接 Last.fm 账号
 */
const connectLastfm = async () => {
  try {
    lastfmAuthLoading.value = true;

    // 获取认证令牌
    const tokenResponse = await getAuthToken();
    if (!tokenResponse.token) {
      throw new Error("无法获取认证令牌");
    }

    const token = tokenResponse.token;

    // 打开授权页面
    const authUrl = getAuthUrl(token);
    if (typeof window !== "undefined") {
      const authWindow = window.open(authUrl, "_blank", "width=800,height=600");

      // 轮询等待用户授权
      const checkAuth = setInterval(async () => {
        if (authWindow?.closed) {
          clearInterval(checkAuth);
          if (lastfmAuthLoading.value) {
            lastfmAuthLoading.value = false;
            window.$message.warning("授权已取消");
          }
          return;
        }
        try {
          // 尝试获取会话
          const sessionResponse = await getSession(token);

          if (sessionResponse.session) {
            clearInterval(checkAuth);
            authWindow?.close();

            // 保存会话信息
            settingStore.lastfm.sessionKey = sessionResponse.session.key;
            settingStore.lastfm.username = sessionResponse.session.name;

            window.$message.success(`已成功连接到 Last.fm 账号: ${sessionResponse.session.name}`);
            lastfmAuthLoading.value = false;
          }
        } catch (error) {
          // 用户还未授权，继续等待
        }
      }, 2000);

      // 30秒超时
      setTimeout(() => {
        clearInterval(checkAuth);
        if (lastfmAuthLoading.value) {
          lastfmAuthLoading.value = false;
          window.$message.warning("授权超时，请重试");
        }
      }, 30000);
    }
  } catch (error: any) {
    console.error("Last.fm 连接失败:", error);
    window.$message.error(`连接失败: ${error.message || "未知错误"}`);
    lastfmAuthLoading.value = false;
  }
};

/**
 * 断开 Last.fm 账号
 */
const disconnectLastfm = () => {
  window.$dialog.warning({
    title: "断开连接",
    content: "确定要断开与 Last.fm 的连接吗？",
    positiveText: "确定",
    negativeText: "取消",
    onPositiveClick: () => {
      settingStore.lastfm.sessionKey = "";
      settingStore.lastfm.username = "";
      window.$message.success("已断开与 Last.fm 的连接");
    },
  });
};
</script>
