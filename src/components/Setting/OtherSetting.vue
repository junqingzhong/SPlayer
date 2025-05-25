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
          <n-text class="tip" :depth="3">可在此处输入国内 IP</n-text>
        </div>
        <n-input
          v-model:value="settingStore.realIP"
          :disabled="!settingStore.useRealIP"
          placeholder="请填写真实 IP 地址"
          class="set"
        >
          <template #prefix>
            <n-text depth="3">IP</n-text>
          </template>
        </n-input>
      </n-card>
    </div>
    <div class="set-list">
      <n-h3 prefix="bar"> 网络设置 </n-h3>
      <n-card v-if="!isElectron" class="set-item">
        <div class="label">
          <n-text class="name">Web版网络设置</n-text>
          <n-text class="tip" :depth="3">
            Web版受浏览器安全限制，无法直接设置系统代理。如需使用代理访问网易云API，建议：
            <br />1. 在浏览器设置中配置代理
            <br />2. 使用浏览器扩展程序
            <br />3. 使用桌面版应用获得完整代理功能
            <br />4. 配置CORS代理服务器
          </n-text>
        </div>
        <n-flex vertical>
          <n-button
            type="info"
            ghost
            @click="openBrowserProxySettings"
          >
            <template #icon>
              <SvgIcon name="Settings" />
            </template>
            打开浏览器代理设置
          </n-button>
          <n-button
            type="primary"
            ghost
            @click="testWebApiConnection"
            :loading="testApiLoading"
          >
            <template #icon>
              <SvgIcon name="Wifi" />
            </template>
            测试API连接
          </n-button>
        </n-flex>
      </n-card>
      <div v-if="isElectron">
        <n-h4>桌面版代理设置</n-h4>
      <n-card class="set-item">
        <div class="label">
          <n-text class="name">网络代理类型</n-text>
          <n-text class="tip" :depth="3">选择代理方式</n-text>
        </div>
        <n-select
          v-model:value="settingStore.proxyType"
          :options="[
            { label: '关闭代理', value: 'off' },
            { label: '系统代理', value: 'system' },
            { label: '手动代理', value: 'manual' },
            { label: 'PAC 脚本', value: 'pac' },
          ]"
          class="set"
        />
      </n-card>
      <!-- 手动代理配置 -->
      <n-collapse-transition :show="settingStore.proxyType === 'manual'">
        <n-card class="set-item nested">
          <div class="label">
            <n-text class="name">手动代理协议</n-text>
          </div>
          <n-select
            v-model:value="settingStore.proxyProtocol"
            :options="[
              { label: 'HTTP', value: 'http' },
              { label: 'HTTPS', value: 'https' },
            ]"
            class="set"
          />
        </n-card>
        <n-card class="set-item nested">
          <div class="label">
            <n-text class="name">代理服务器地址</n-text>
          </div>
          <n-input
            v-model:value="settingStore.proxyServe"
            placeholder="例如: 127.0.0.1"
            class="set"
          />
        </n-card>
        <n-card class="set-item nested">
          <div class="label">
            <n-text class="name">代理服务器端口</n-text>
          </div>
          <n-input-number
            v-model:value="settingStore.proxyPort"
            :show-button="false"
            :min="1"
            :max="65535"
            placeholder="例如: 8080"
            class="set"
          />
        </n-card>
        <n-card class="set-item nested">
          <div class="label">
            <n-text class="name">代理用户名 (可选)</n-text>
          </div>
          <n-input v-model:value="settingStore.proxyUsername" placeholder="可选" class="set" />
        </n-card>
        <n-card class="set-item nested">
          <div class="label">
            <n-text class="name">代理密码 (可选)</n-text>
          </div>
          <n-input
            v-model:value="settingStore.proxyPassword"
            type="password"
            show-password-on="click"
            placeholder="可选"
            class="set"
          />
        </n-card>
      </n-collapse-transition>
      <!-- PAC 脚本配置 -->
      <n-collapse-transition :show="settingStore.proxyType === 'pac'">
        <n-card class="set-item nested">
          <div class="label">
            <n-text class="name">PAC 脚本 URL</n-text>
          </div>
          <n-input v-model:value="settingStore.pacUrl" placeholder="例如: http://example.com/proxy.pac" class="set" />
        </n-card>
      </n-collapse-transition>
      </div>
      <!-- 应用和测试按钮 -->
      <n-card class="set-item">
        <n-flex justify="space-between">
          <n-button type="primary" strong secondary @click="applyProxySettings">
            应用代理设置
          </n-button>
          <n-button :loading="testProxyLoading" type="info" strong secondary @click="testCurrentProxy">
            测试当前代理
          </n-button>
        </n-flex>
      </n-card>
    </div>
    <div class="set-list">
      <n-h3 prefix="bar"> 全局配置 </n-h3>
      <n-card class="set-item">
        <div class="label">
          <n-text class="name">API服务器端口</n-text>
          <n-text class="tip" :depth="3">修改后需要重启应用生效</n-text>
        </div>
        <n-input-number
          v-model:value="serverPort"
          :show-button="false"
          :min="1000"
          :max="65535"
          placeholder="例如: 25884"
          class="set"
        />
      </n-card>
      <n-card class="set-item">
        <div class="label">
          <n-text class="name">API基础URL</n-text>
          <n-text class="tip" :depth="3">网易云音乐API的基础URL</n-text>
        </div>
        <n-input
          v-model:value="apiBaseUrl"
          placeholder="例如: /api/netease"
          class="set"
        />
      </n-card>
      <n-card class="set-item">
        <div class="label">
          <n-text class="name">解锁API URL</n-text>
          <n-text class="tip" :depth="3">歌曲解锁API的URL</n-text>
        </div>
        <n-input
          v-model:value="unblockApiUrl"
          placeholder="例如: /api/unblock"
          class="set"
        />
      </n-card>

      <n-h3 prefix="bar"> 内置浏览器 </n-h3>
      <n-card class="set-item">
        <div class="label">
          <n-text class="name">启用内置浏览器</n-text>
          <n-text class="tip" :depth="3">开启后可在应用内访问网站，支持网易云音乐等网页版服务</n-text>
        </div>
        <n-switch class="set" v-model:value="browserEnabled" :round="false" />
      </n-card>

      <n-collapse-transition :show="browserEnabled">
        <n-card class="set-item nested">
          <div class="label">
            <n-text class="name">默认主页</n-text>
            <n-text class="tip" :depth="3">浏览器启动时的默认页面</n-text>
          </div>
          <n-input
            v-model:value="browserHomepage"
            placeholder="例如: https://music.163.com"
            class="set"
          />
        </n-card>

        <n-card class="set-item nested">
          <div class="label">
            <n-text class="name">网易云自动登录Cookie</n-text>
            <n-text class="tip" :depth="3">用于网易云扫码登录后的自动登录，首次扫码登录后会自动保存到此处</n-text>
          </div>
          <n-input
            v-model:value="autoLoginCookie"
            type="textarea"
            placeholder="网易云登录Cookie将在首次扫码登录后自动填入"
            class="set"
            :autosize="{ minRows: 3, maxRows: 6 }"
          />
        </n-card>
      </n-collapse-transition>

      <n-card class="set-item">
        <n-flex justify="space-between" align="center">
          <n-button type="primary" strong secondary @click="applyBrowserConfig">
            <template #icon>
              <SvgIcon name="Settings" />
            </template>
            应用配置
          </n-button>
          <n-button
            type="info"
            strong
            secondary
            @click="openBrowser"
            :disabled="!browserEnabled"
          >
            <template #icon>
              <SvgIcon name="Link" />
            </template>
            打开浏览器
          </n-button>
          <n-button
            v-if="autoLoginCookie"
            type="warning"
            strong
            secondary
            @click="clearCookie"
          >
            <template #icon>
              <SvgIcon name="Delete" />
            </template>
            清除Cookie
          </n-button>
        </n-flex>
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
import { isElectron } from "@/utils/helper";
import { setCookies, clearAllCookies } from "@/utils/cookie";
import { debounce } from "lodash-es";
import config, { updateConfig } from "@/config";
import { ref } from "vue";
import { useRouter } from "vue-router";

const router = useRouter();

const dataStore = useDataStore();
const settingStore = useSettingStore();

const testProxyLoading = ref<boolean>(false);
const testApiLoading = ref<boolean>(false);

// 全局配置变量
const serverPort = ref<number>(config.serverPort);
const apiBaseUrl = ref<string>(config.apiBaseUrl);
const unblockApiUrl = ref<string>(config.unblockApiUrl);

// 浏览器配置变量
const browserEnabled = ref<boolean>(settingStore.browserEnabled || false);
const browserHomepage = ref<string>(settingStore.browserHomepage || 'https://www.baidu.com');
const autoLoginCookie = ref<string>(settingStore.autoLoginCookie || '');

// 应用全局配置
const applyGlobalConfig = () => {
  const newConfig = {
    serverPort: serverPort.value,
    apiBaseUrl: apiBaseUrl.value,
    unblockApiUrl: unblockApiUrl.value
  };

  // 更新配置
  updateConfig(newConfig);

  window.$message.success("全局配置已更新，部分设置可能需要重启应用后生效");
};

/**
 * 应用浏览器配置
 */
const applyBrowserConfig = () => {
  // 更新设置存储
  settingStore.browserEnabled = browserEnabled.value;
  settingStore.browserHomepage = browserHomepage.value;
  settingStore.autoLoginCookie = autoLoginCookie.value;

  // 如果启用了自动登录Cookie，立即应用
  if (autoLoginCookie.value) {
    try {
      // 使用工具函数设置Cookie
      setCookies(autoLoginCookie.value);
      window.$message.success("浏览器配置已应用，网易云登录Cookie已设置");
    } catch (error) {
      window.$message.error("Cookie设置失败，请检查格式");
      console.error("Cookie设置错误:", error);
    }
  } else {
    window.$message.success("浏览器配置已应用");
  }
};

/**
 * 打开浏览器页面
 */
const openBrowser = () => {
  if (!browserEnabled.value) {
    window.$message.warning("请先启用内置浏览器功能");
    return;
  }

  // 跳转到浏览器页面
  router.push({ name: 'browser' });
};

/**
 * 清除Cookie
 */
const clearCookie = () => {
  window.$dialog.warning({
    title: "清除Cookie",
    content: "确定要清除网易云登录Cookie吗？清除后需要重新扫码登录。",
    positiveText: "确定",
    negativeText: "取消",
    onPositiveClick: () => {
      autoLoginCookie.value = '';
      settingStore.autoLoginCookie = '';

      // 清除当前会话的Cookie
      try {
        clearAllCookies();
        window.$message.success("Cookie已清除");
      } catch (error) {
        console.error("清除Cookie失败:", error);
        window.$message.warning("Cookie清除可能不完整，建议重启应用");
      }
    }
  });
};

/**
 * 打开浏览器代理设置页面
 */
const openBrowserProxySettings = () => {
  // 检测浏览器类型并打开对应的代理设置页面
  const userAgent = navigator.userAgent.toLowerCase();
  let proxyUrl = '';

  if (userAgent.includes('chrome') && !userAgent.includes('edg')) {
    // Chrome浏览器
    proxyUrl = 'chrome://settings/system';
  } else if (userAgent.includes('firefox')) {
    // Firefox浏览器
    proxyUrl = 'about:preferences#general';
  } else if (userAgent.includes('safari') && !userAgent.includes('chrome')) {
    // Safari浏览器
    window.$message.info('请在 系统偏好设置 > 网络 > 高级 > 代理 中配置代理设置');
    return;
  } else if (userAgent.includes('edg')) {
    // Edge浏览器
    proxyUrl = 'edge://settings/system';
  } else {
    window.$message.info('请在浏览器设置中查找"代理"或"网络"相关选项');
    return;
  }

  try {
    window.open(proxyUrl, '_blank');
  } catch (error) {
    window.$message.warning('无法自动打开代理设置页面，请手动在浏览器设置中查找代理选项');
  }
};

/**
 * 测试Web版API连接
 */
const testWebApiConnection = async () => {
  testApiLoading.value = true;

  try {
    // 测试网易云API连接
    const testUrls = [
      '/api/login/status',
      '/api/user/account',
      '/api/recommend/songs'
    ];

    const results = [];

    for (const url of testUrls) {
      try {
        const response = await fetch(url, {
          method: 'GET',
          timeout: 5000
        });

        results.push({
          url,
          status: response.status,
          success: response.ok
        });
      } catch (error) {
        results.push({
          url,
          status: 'Error',
          success: false,
          error: error.message
        });
      }
    }

    const successCount = results.filter(r => r.success).length;
    const totalCount = results.length;

    if (successCount === totalCount) {
      window.$message.success(`API连接测试完成：${successCount}/${totalCount} 个接口正常`);
    } else if (successCount > 0) {
      window.$message.warning(`API连接测试完成：${successCount}/${totalCount} 个接口正常，部分接口可能需要代理`);
    } else {
      window.$message.error('API连接测试失败，建议配置代理或检查网络连接');
    }

    // 显示详细结果
    console.log('API连接测试结果:', results);

  } catch (error) {
    console.error('API测试错误:', error);
    window.$message.error('API连接测试失败');
  } finally {
    testApiLoading.value = false;
  }
};

// 应用代理设置
const applyProxySettings = debounce(() => {
  const configToApply: any = {
    type: settingStore.proxyType,
  };
  if (settingStore.proxyType === "manual") {
    configToApply.manualConfig = {
      protocol: settingStore.proxyProtocol,
      server: settingStore.proxyServe,
      port: settingStore.proxyPort,
      username: settingStore.proxyUsername,
      password: settingStore.proxyPassword,
    };
    if (!configToApply.manualConfig.server || !configToApply.manualConfig.port) {
      window.$message.error("手动代理需要服务器地址和端口");
      return;
    }
  } else if (settingStore.proxyType === "pac") {
    if (!settingStore.pacUrl) {
      window.$message.error("PAC 脚本需要 URL");
      return;
    }
    configToApply.pacUrl = settingStore.pacUrl;
  }

  window.electron.ipcRenderer.send("update-proxy-config", configToApply);
  window.$message.success("代理设置已发送至主进程应用");
}, 300);

// 测试当前代理配置
const testCurrentProxy = async () => {
  testProxyLoading.value = true;
  const configToTest: any = {
    type: settingStore.proxyType,
  };
  if (settingStore.proxyType === "manual") {
    configToTest.manualConfig = {
      protocol: settingStore.proxyProtocol,
      server: settingStore.proxyServe,
      port: settingStore.proxyPort,
      username: settingStore.proxyUsername,
      password: settingStore.proxyPassword,
    };
    if (!configToTest.manualConfig.server || !configToTest.manualConfig.port) {
      window.$message.error("测试前请填写手动代理的服务器地址和端口");
      testProxyLoading.value = false;
      return;
    }
  } else if (settingStore.proxyType === "pac") {
    if (!settingStore.pacUrl) {
      window.$message.error("测试前请填写 PAC 脚本的 URL");
      testProxyLoading.value = false;
      return;
    }
    configToTest.pacUrl = settingStore.pacUrl;
  } else if (settingStore.proxyType === "off" || settingStore.proxyType === "system") {
    // For 'off' or 'system', we can still test general connectivity through this setting
    // The main process will handle applying 'off' or 'system' correctly for the test
  }

  try {
    const result = await window.electron.ipcRenderer.invoke("test-new-proxy", configToTest);
    if (result) {
      window.$message.success("代理连接测试成功！");
    } else {
      window.$message.error("代理连接测试失败，请检查配置或网络。");
    }
  } catch (error) {
    window.$message.error("代理测试时发生错误。");
    console.error("Proxy test error:", error);
  } finally {
    testProxyLoading.value = false;
  }
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
