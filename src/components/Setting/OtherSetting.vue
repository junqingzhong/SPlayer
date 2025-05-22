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
    <div v-if="isElectron" class="set-list">
      <n-h3 prefix="bar"> 网络代理 </n-h3>
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
import { debounce } from "lodash-es";

const dataStore = useDataStore();
const settingStore = useSettingStore();

const testProxyLoading = ref<boolean>(false);

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
