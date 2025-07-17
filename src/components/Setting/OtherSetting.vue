<!-- 本地设置 -->
<template>
  <div>
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
        <n-input v-model:value="settingStore.realIP" :disabled="!settingStore.useRealIP" placeholder="请填写真实 IP 地址"
          class="set">
          <template #prefix>
            <n-text depth="3">IP</n-text>
          </template>
        </n-input>
      </n-card>
    </div>
    <div class="set-list">
      <n-h3 prefix="bar"> 网络设置 </n-h3>
      <n-card v-if="!isElectron" class="set-item">
        <n-flex vertical>
          <n-button type="info" ghost @click="openBrowserProxySettings">
            <template #icon>
              <SvgIcon name="Settings" />
            </template>
            打开浏览器代理设置
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
          <n-select v-model:value="settingStore.proxyType" :options="[
            { label: '关闭代理', value: 'off' },
            { label: '系统代理', value: 'system' },
            { label: '手动代理', value: 'manual' },
            { label: 'PAC 脚本', value: 'pac' },
          ]" class="set" />
        </n-card>
        <!-- 手动代理配置 -->
        <n-collapse-transition :show="settingStore.proxyType === 'manual'">
          <n-card class="set-item nested">
            <div class="label">
              <n-text class="name">手动代理协议</n-text>
            </div>
            <n-select v-model:value="settingStore.proxyProtocol" :options="[
              { label: 'HTTP', value: 'http' },
              { label: 'HTTPS', value: 'https' },
            ]" class="set" />
          </n-card>
          <n-card class="set-item nested">
            <div class="label">
              <n-text class="name">代理服务器地址</n-text>
            </div>
            <n-input v-model:value="settingStore.proxyServe" placeholder="例如: 127.0.0.1" class="set" />
          </n-card>
          <n-card class="set-item nested">
            <div class="label">
              <n-text class="name">代理服务器端口</n-text>
            </div>
            <n-input-number v-model:value="settingStore.proxyPort" :show-button="false" :min="1" :max="65535"
              placeholder="例如: 8080" class="set" />
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
            <n-input v-model:value="settingStore.proxyPassword" type="password" show-password-on="click"
              placeholder="可选" class="set" />
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
      <n-h3 prefix="bar"> API接口设置 </n-h3>

      <n-card class="set-item">
        <div class="label">
          <n-text class="name">API服务器端口</n-text>
          <n-text class="tip" :depth="3">修改后需要重启应用生效</n-text>
        </div>
        <n-input-number v-model:value="serverPort" :show-button="false" :min="1000" :max="65535" placeholder="例如: 25884"
          class="set" />
      </n-card>
      <n-card class="set-item">
        <div class="label">
          <n-text class="name">API基础URL</n-text>
          <n-text class="tip" :depth="3">网易云音乐API的基础URL</n-text>
        </div>
        <n-input v-model:value="apiBaseUrl" placeholder="例如: /api/netease" class="set" />
      </n-card>
      <n-card class="set-item">
        <div class="label">
          <n-text class="name">解锁API URL</n-text>
          <n-text class="tip" :depth="3">歌曲解锁API的URL</n-text>
        </div>
        <n-input v-model:value="unblockApiUrl" placeholder="例如: /api/unblock" class="set" />
      </n-card>
      <n-card class="set-item">
        <div class="label">
          <n-text class="name">活动列表API域名</n-text>
          <n-text class="tip" :depth="3">活动列表API的基础URL</n-text>
        </div>
        <n-input v-model:value="activitiesApiBaseUrl" placeholder="例如: http://127.0.0.1:8000/api" class="set" />
      </n-card>
      <n-card class="set-item">
        <n-button type="primary" strong secondary @click="applyGlobalConfig">
          <template #icon>
            <SvgIcon name="Settings" />
          </template>
          应用API配置
        </n-button>
      </n-card>
    </div>
    <div class="set-list">
      <n-h3 prefix="bar"> cookie设置 </n-h3>
       <n-card class="set-item">
        <div class="label">
          <n-text class="name">QQ音乐Cookie</n-text>
          <n-text class="tip" :depth="3">用于部分接口需要QQ音乐登录信息</n-text>
        </div>
        <n-input v-model:value="qqCookie" type="textarea" placeholder="请填写QQ音乐Cookie" class="set" :autosize="{ minRows: 2, maxRows: 4 }" />
      </n-card>
      <n-card class="set-item">
        <div class="label">
          <n-text class="name">网易云自动登录Cookie(保存等3s自动刷新)</n-text>
          <n-card class="set-item nested">
            <div class="label">
              <n-text class="tip" :depth="3">用于网易云扫码登录后的自动登录，首次扫码登录后会自动保存到此处</n-text>
              <n-text class="tip" :depth="3">Cookie状态: {{ autoLoginCookie ? '已设置' : '未设置' }}</n-text>
              <n-text v-if="autoLoginCookie" class="tip" :depth="3">上次更新: {{ formatCookieDate() }}</n-text>
            </div>
            <n-input v-model:value="autoLoginCookie" type="textarea" placeholder="网易云登录Cookie将在首次扫码登录后自动填入"
              class="set" :autosize="{ minRows: 3, maxRows: 6 }" />
            <n-space class="cookie-actions" justify="end" style="margin-top: 8px">
              <n-button size="small" type="info" @click="applyCookie" :disabled="!autoLoginCookie">
                <template #icon>
                  <SvgIcon name="Settings" />
                </template>
                立即登录
              </n-button>
              <n-button size="small" type="info" @click="modifyCookie" :disabled="!autoLoginCookie">
                <template #icon>
                  <SvgIcon name="Settings" />
                </template>
                修改cookie
              </n-button>
            </n-space>
          </n-card>
        </div>
      </n-card>
    </div>
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
import { setCookies } from "@/utils/cookie";
import { debounce } from "lodash-es";
import config, { updateConfig } from "@/config";
import { ref, watch  } from "vue";
import axios from "axios";

const dataStore = useDataStore();
const settingStore = useSettingStore();

const testProxyLoading = ref<boolean>(false);

// 全局配置变量
const serverPort = ref<number>(config.serverPort);
const apiBaseUrl = ref<string>(config.apiBaseUrl);
const unblockApiUrl = ref<string>(config.unblockApiUrl);
const activitiesApiBaseUrl = ref<string>(settingStore.activitiesApiBaseUrl);

// 浏览器配置变量
const autoLoginCookie = ref<string>(settingStore.autoLoginCookie || '');
// QQ音乐Cookie配置变量
const qqCookie = ref<string>(localStorage.getItem('qq-cookie') || '');

// 监听qqCookie变化并同步到localStorage
watch(qqCookie, (val) => {
  localStorage.setItem('qq-cookie', val || '');
});

// 应用全局配置
const applyGlobalConfig = () => {
  const newConfig = {
    serverPort: serverPort.value,
    apiBaseUrl: apiBaseUrl.value,
    unblockApiUrl: unblockApiUrl.value
  };

  // 更新配置
  updateConfig(newConfig);

  // 更新活动列表API域名设置
  settingStore.activitiesApiBaseUrl = activitiesApiBaseUrl.value;

  window.$message.success("全局配置已更新，部分设置可能需要重启应用后生效");
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
/**
 * 格式化Cookie更新日期
 */
const formatCookieDate = () => {
  const cookieDate = localStorage.getItem('cookie-update-time');
  if (!cookieDate) return '未知';

  try {
    const date = new Date(parseInt(cookieDate));
    return date.toLocaleString();
  } catch (error) {
    console.error('解析Cookie日期失败:', error);
    return '日期格式错误';
  }
};

/**
 * 立即应用Cookie
 */
const applyCookie = async () => {
  if (!autoLoginCookie.value) {
    window.$message.warning('请先设置Cookie');
    return;
  }

  try {
    setCookies(autoLoginCookie.value);
    settingStore.autoLoginCookie = autoLoginCookie.value;
    localStorage.setItem('cookie-update-time', Date.now().toString());
    if (isElectron) window.electron.ipcRenderer.send("reset-setting");
    window.$message.loading("Cookie已成功应用，软件即将热重载", { duration: 3000 });
  } catch (error) {
    console.error('应用Cookie和更新设置时发生错误:', error);
    window.$message.error('应用Cookie和更新设置失败，请检查格式');
  } finally {
    // 无论成功或失败，都在消息显示后尝试热重载
    setTimeout(() => {
      window.location.reload();
    }, 3000); // 确保消息有足够时间显示
  }
};

/**
 * 修改Cookie
 */
const modifyCookie = async () => {
  if (!autoLoginCookie.value) {
    window.$message.warning('请先设置Cookie');
    return;
  }
  let userInfoId = null;
  let success = false;
  try {
    if (settingStore.autoLoginCookie) {
      const headers = {
        'Authorization': `Bearer ${settingStore.autoLoginCookie}`,
        'Content-Type': 'application/json'
      };
      const apiUrl = `${settingStore.activitiesApiBaseUrl}/users?current_info=true`;
      const response = await axios.get(apiUrl, { headers });
      if (response.data.status === 200 && response.data.data.length > 0) {
        userInfoId = response.data.data[0].id;
        const apiUpdateUrl = `${settingStore.activitiesApiBaseUrl}/user/${userInfoId}`;
        const udresponse = await axios.put(apiUpdateUrl, {
          cookie: autoLoginCookie.value,
        }, { headers });
        if (udresponse.data.status === 200) {
          window.$message.success("Cookie已成功修改并应用");
          success = true;
          // 同步全局登录cookie
          try {
            setCookies(autoLoginCookie.value);
            settingStore.autoLoginCookie = autoLoginCookie.value;
            localStorage.setItem('cookie-update-time', Date.now().toString());
            if (isElectron) window.electron.ipcRenderer.send("reset-setting");
            if (success) {
              window.$message.loading("Cookie已成功修改并应用，软件即将热重载", { duration: 3000 });
            } else {
              window.$message.loading("尝试修改并应用Cookie，软件即将热重载", { duration: 3000 });
            }
          } catch (error) {
            window.$message.error('应用Cookie和更新设置失败，请检查格式');
          } finally {
            setTimeout(() => {
              window.location.reload();
            }, 3000);
          }
        } else {
          window.$message.error(udresponse.data.data.message || "更新用户信息失败");
        }
      } else {
        window.$message.error(response.data.message || "获取用户信息失败");
      }
    }
  } catch (error) {
    window.$message.error("获取用户信息时发生错误，请检查网络或API服务");
  }

};
</script>
