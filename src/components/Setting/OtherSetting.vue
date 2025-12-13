<!-- 本地设置 -->
<template>
  <div class="setting-type">
    <div class="set-list">
      <n-h3 prefix="bar"> 地区解锁 </n-h3>
      <n-card class="set-item">
        <div class="label">
          <n-text class="name">使用真实 IP 地址</n-text>
          <n-text class="tip" :depth="3">在海外或部分地区可能会受到限制，可开启此处尝试解决</n-text>
        </div>
        <n-switch class="set" v-model:value="settingStore.useRealIP" :round="false" />
      </n-card>
      <n-card class="set-item">
        <div class="label">
          <n-text class="name">真实 IP 地址</n-text>
          <n-text class="tip" :depth="3">可在此处输入国内 IP，不填写则为随机</n-text>
        </div>
        <n-input
          v-model:value="settingStore.realIP"
          :disabled="!settingStore.useRealIP"
          placeholder="127.0.0.1"
          class="set"
        >
          <template #prefix>
            <n-text depth="3">IP</n-text>
          </template>
        </n-input>
      </n-card>
    </div>
    <div v-if="isElectron" class="set-list">
      <n-h3 prefix="bar"> 网络代理 </n-h3>
      <n-card class="set-item">
        <div class="label">
          <n-text class="name">网络代理</n-text>
          <n-text class="tip" :depth="3">修改后请点击保存或重启软件以应用</n-text>
        </div>
        <n-flex>
          <n-button type="primary" strong secondary @click="setProxy"> 保存并应用 </n-button>
          <n-select
            v-model:value="settingStore.proxyProtocol"
            :options="[
              {
                label: '关闭代理',
                value: 'off',
              },
              {
                label: 'HTTP 代理',
                value: 'HTTP',
              },
              {
                label: 'HTTPS 代理',
                value: 'HTTPS',
              },
            ]"
            class="set"
          />
        </n-flex>
      </n-card>
      <n-card class="set-item">
        <div class="label">
          <n-text class="name">代理服务器地址</n-text>
          <n-text class="tip" :depth="3">请填写代理服务器地址，如 127.0.0.1</n-text>
        </div>
        <n-input
          v-model:value="settingStore.proxyServe"
          :disabled="settingStore.proxyProtocol === 'off'"
          placeholder="请填写代理服务器地址"
          class="set"
        >
          <template #prefix>
            <n-text depth="3">
              {{ settingStore.proxyProtocol === "off" ? "-" : settingStore.proxyProtocol }}
            </n-text>
          </template>
        </n-input>
      </n-card>
      <n-card class="set-item">
        <div class="label">
          <n-text class="name">代理服务器端口</n-text>
          <n-text class="tip" :depth="3">请填写代理服务器端口，如 80</n-text>
        </div>
        <n-input-number
          v-model:value="settingStore.proxyPort"
          :disabled="settingStore.proxyProtocol === 'off'"
          :show-button="false"
          :min="1"
          :max="65535"
          placeholder="请填写代理服务器端口"
          class="set"
        />
      </n-card>
      <n-collapse-transition :show="settingStore.proxyProtocol !== 'off'">
        <n-card class="set-item">
          <div class="label">
            <n-text class="name">测试代理</n-text>
            <n-text class="tip" :depth="3">测试代理配置是否可正常连通</n-text>
          </div>
          <n-button :loading="testProxyLoading" type="primary" strong secondary @click="testProxy">
            测试代理
          </n-button>
        </n-card>
      </n-collapse-transition>
    </div>
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
              在 <n-a href="https://www.last.fm/api/account/create" target="_blank">Last.fm API</n-a> 创建应用获取
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
            :disabled="!isLastfmConfigured"
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
          <n-button type="error" strong secondary @click="disconnectLastfm">
            断开连接
          </n-button>
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
    <div v-if="isElectron" class="set-list">
      <n-h3 prefix="bar"> 
        备份与恢复 
        <n-tag type="warning" size="small" round>Beta</n-tag>
      </n-h3>
      <n-card class="set-item">
        <div class="label">
          <n-text class="name">导出设置</n-text>
          <n-text class="tip" :depth="3">将当前所有设置导出为 JSON 文件</n-text>
        </div>
        <n-button type="primary" strong secondary @click="exportSettings"> 导出设置 </n-button>
      </n-card>
      <n-card class="set-item">
        <div class="label">
          <n-text class="name">导入设置</n-text>
          <n-text class="tip" :depth="3">从 JSON 文件恢复设置（导入后将自动重启）</n-text>
        </div>
        <n-button type="primary" strong secondary @click="importSettings"> 导入设置 </n-button>
      </n-card>
    </div>
    <div class="set-list">
      <n-h3 prefix="bar"> 重置 </n-h3>
      <n-card class="set-item">
        <div class="label">
          <n-text class="name">重置所有设置</n-text>
          <n-text class="tip" :depth="3">重置所有设置，恢复软件默认值</n-text>
        </div>
        <n-button type="warning" strong secondary @click="resetSetting"> 重置设置 </n-button>
      </n-card>
      <n-card class="set-item">
        <div class="label">
          <n-text class="name">清除全部数据</n-text>
          <n-text class="tip" :depth="3">重置所有设置，清除全部数据</n-text>
        </div>
        <n-button type="error" strong secondary @click="clearAllData"> 清除全部 </n-button>
      </n-card>
    </div>
  </div>
</template>

<script setup lang="ts">
import { useSettingStore, useDataStore } from "@/stores";
import { isElectron } from "@/utils/env";
import { debounce } from "lodash-es";
import { NAlert, NTag } from "naive-ui";
import {
  getAuthToken,
  getAuthUrl,
  getSession,
} from "@/api/lastfm";

const dataStore = useDataStore();
const settingStore = useSettingStore();

const testProxyLoading = ref<boolean>(false);
const lastfmAuthLoading = ref(false);
const isLastfmConfigured = computed(() => {
  const { apiKey, apiSecret } = settingStore.lastfm;
  return Boolean(apiKey && apiSecret);
});

// 获取当前代理配置
const proxyConfig = computed(() => ({
  protocol: settingStore.proxyProtocol,
  server: settingStore.proxyServe,
  port: settingStore.proxyPort,
}));

// 应用代理
const setProxy = debounce(() => {
  if (settingStore.proxyProtocol === "off" || !settingStore.proxyServe || !settingStore.proxyPort) {
    window.electron.ipcRenderer.send("remove-proxy");
    window.$message.success("成功关闭网络代理");
    return;
  }
  window.electron.ipcRenderer.send("set-proxy", proxyConfig.value);
  window.$message.success("网络代理配置完成，请重启软件");
}, 300);

// 测试代理
const testProxy = async () => {
  testProxyLoading.value = true;
  const result = await window.electron.ipcRenderer.invoke("test-proxy", proxyConfig.value);
  if (result) {
    window.$message.success("该代理可正常使用");
  } else {
    window.$message.error("代理测试失败，请重试");
  }
  testProxyLoading.value = false;
  testProxyLoading.value = false;
};

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

// 导出设置
const exportSettings = async () => {
  console.log("[Frontend] Export settings clicked");
  try {
    // 收集渲染进程数据 (localStorage)
    const rendererData = {
      "setting-store": localStorage.getItem("setting-store"),
      "shortcut-store": localStorage.getItem("shortcut-store"),
    };
    
    const result = await window.api.store.export(rendererData);
    console.log("[Frontend] Export result:", result);
    if (result) {
      window.$message.success("设置导出成功");
    } else {
      window.$message.error("设置导出失败");
    }
  } catch (error) {
    console.error("[Frontend] Export error:", error);
    window.$message.error("设置导出出错");
  }
};

// 导入设置
const importSettings = async () => {
  console.log("[Frontend] Import settings clicked");
  window.$dialog.warning({
    title: "导入设置",
    content: () => h("div", null, [
      h(NAlert, { type: "warning", showIcon: true, style: { marginBottom: "12px" } }, { default: () => "目前备份数据功能属于测试阶段，不保证可用性" }),
      h("div", null, "导入设置将覆盖当前所有配置并重启软件，是否继续？")
    ]),
    positiveText: "确定",
    negativeText: "取消",
    onPositiveClick: async () => {
      console.log("[Frontend] Import confirmed");
      try {
        const data = await window.api.store.import();
        console.log("[Frontend] Import data:", data);
        
        if (data) {
          // 恢复渲染进程数据
          if (data.renderer) {
            if (data.renderer["setting-store"]) localStorage.setItem("setting-store", data.renderer["setting-store"]);
            if (data.renderer["shortcut-store"]) localStorage.setItem("shortcut-store", data.renderer["shortcut-store"]);
          }
          
          window.$message.success("设置导入成功，即将重启");
          setTimeout(() => {
            window.location.reload();
          }, 1000);
        } else {
          window.$message.error("设置导入失败或已取消");
        }
      } catch (error) {
        console.error("[Frontend] Import error:", error);
        window.$message.error("设置导入出错");
      }
    },
  });
};

// 重置设置
const resetSetting = () => {
  window.$dialog.warning({
    title: "警告",
    content: "此操作将重置所有设置，是否继续?",
    positiveText: "确定",
    negativeText: "取消",
    onPositiveClick: () => {
      settingStore.$reset();
      // electron
      if (isElectron) window.electron.ipcRenderer.send("reset-setting");
      window.$message.success("设置重置完成");
    },
  });
};

// 清除全部数据
const clearAllData = () => {
  window.$dialog.warning({
    title: "高危操作",
    content: "此操作将重置所有设置并清除全部数据，同时将退出登录状态，是否继续?",
    positiveText: "确定",
    negativeText: "取消",
    onPositiveClick: async () => {
      // 重置设置
      window.localStorage.clear();
      window.sessionStorage.clear();
      // deleteDB
      await dataStore.deleteDB();
      // electron
      if (isElectron) window.electron.ipcRenderer.send("reset-setting");
      window.$message.loading("数据清除完成，软件即将热重载", {
        duration: 3000,
        onAfterLeave: () => window.location.reload(),
      });
    },
  });
};
</script>
