<template>
  <div class="cookie-setting">
    <n-h3 prefix="bar">全局Cookie设置</n-h3>

    <n-card class="set-item">
      <div class="label">
        <n-text class="name">全局登录Cookie</n-text>
        <n-text class="tip" :depth="3">
          设置全局登录Cookie，用于项目扫码登录或Cookie登录时使用
        </n-text>
      </div>

      <n-space vertical>
        <n-input
          v-model:value="globalCookie"
          type="textarea"
          placeholder="请输入网易云音乐登录Cookie，支持扫码登录后自动获取"
          :autosize="{ minRows: 4, maxRows: 8 }"
          class="set"
        />

        <n-space>
          <n-button type="primary" @click="applyGlobalCookie">
            <template #icon>
              <SvgIcon name="Settings" />
            </template>
            应用Cookie
          </n-button>

          <n-button type="info" @click="testCookie" :loading="testLoading">
            <template #icon>
              <SvgIcon name="Link" />
            </template>
            测试Cookie
          </n-button>

          <n-button
            v-if="globalCookie"
            type="warning"
            @click="clearGlobalCookie"
          >
            <template #icon>
              <SvgIcon name="Delete" />
            </template>
            清除Cookie
          </n-button>
        </n-space>
      </n-space>
    </n-card>

    <n-card class="set-item">
      <div class="label">
        <n-text class="name">Cookie状态</n-text>
        <n-text class="tip" :depth="3">
          当前Cookie的有效性和登录状态
        </n-text>
      </div>

      <n-space vertical>
        <n-tag :type="cookieStatus.type" size="large">
          {{ cookieStatus.text }}
        </n-tag>

        <div v-if="userInfo" class="user-info">
          <n-space align="center">
            <n-avatar
              :src="userInfo.avatarUrl"
              :size="40"
              fallback-src="/images/pic/default.png"
            />
            <div>
              <n-text strong>{{ userInfo.nickname }}</n-text>
              <br>
              <n-text :depth="3" size="small">UID: {{ userInfo.userId }}</n-text>
            </div>
          </n-space>
        </div>
      </n-space>
    </n-card>

    <n-card class="set-item">
      <div class="label">
        <n-text class="name">Cookie使用说明</n-text>
        <n-text class="tip" :depth="3">
          如何获取和使用网易云音乐Cookie
        </n-text>
      </div>

      <n-space vertical>
        <n-alert type="info" title="获取Cookie方法">
          <ol>
            <li>在网页版网易云音乐登录账号</li>
            <li>按F12打开开发者工具</li>
            <li>切换到Network标签页</li>
            <li>刷新页面，找到任意请求</li>
            <li>复制请求头中的Cookie值</li>
          </ol>
        </n-alert>

        <n-alert type="warning" title="注意事项">
          <ul>
            <li>Cookie包含敏感信息，请勿泄露给他人</li>
            <li>Cookie有时效性，过期后需要重新获取</li>
            <li>建议定期更新Cookie以保持登录状态</li>
          </ul>
        </n-alert>
      </n-space>
    </n-card>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, computed } from 'vue';
import { useSettingStore } from '@/stores';
import { setCookies, clearAllCookies } from '@/utils/cookie';
import { userAccount } from '@/api/user';

const settingStore = useSettingStore();

// 响应式数据
const globalCookie = ref<string>('');
const testLoading = ref<boolean>(false);
const userInfo = ref<any>(null);
const isValidCookie = ref<boolean>(false);

// Cookie状态
const cookieStatus = computed(() => {
  if (!globalCookie.value) {
    return { type: 'default' as const, text: '未设置Cookie' };
  }
  if (isValidCookie.value && userInfo.value) {
    return { type: 'success' as const, text: '已登录' };
  }
  if (testLoading.value) {
    return { type: 'info' as const, text: '验证中...' };
  }
  return { type: 'warning' as const, text: 'Cookie状态未知' };
});

/**
 * 应用全局Cookie
 */
const applyGlobalCookie = async () => {
  try {
    if (!globalCookie.value.trim()) {
      window.$message.warning('请先输入Cookie');
      return;
    }

    // 设置到全局存储
    settingStore.setGlobalCookie(globalCookie.value);

    // 应用到当前会话
    setCookies(globalCookie.value);

    // 测试Cookie有效性
    await testCookie();

    window.$message.success('全局Cookie已应用');
  } catch (error) {
    console.error('应用Cookie失败:', error);
    window.$message.error('应用Cookie失败');
  }
};

/**
 * 测试Cookie有效性
 */
const testCookie = async () => {
  if (!globalCookie.value.trim()) {
    window.$message.warning('请先输入Cookie');
    return;
  }

  testLoading.value = true;

  try {
    // 临时设置Cookie进行测试
    setCookies(globalCookie.value);

    // 获取用户信息验证Cookie
    const response = await userAccount();

    if (response.code === 200 && response.profile) {
      isValidCookie.value = true;
      userInfo.value = {
        userId: response.profile.userId,
        nickname: response.profile.nickname,
        avatarUrl: response.profile.avatarUrl
      };
      window.$message.success('Cookie验证成功');
    } else {
      isValidCookie.value = false;
      userInfo.value = null;
      window.$message.error('Cookie无效或已过期');
    }
  } catch (error) {
    console.error('Cookie测试失败:', error);
    isValidCookie.value = false;
    userInfo.value = null;
    window.$message.error('Cookie测试失败，请检查网络连接');
  } finally {
    testLoading.value = false;
  }
};

/**
 * 清除全局Cookie
 */
const clearGlobalCookie = () => {
  window.$dialog.warning({
    title: '清除全局Cookie',
    content: '确定要清除全局Cookie吗？清除后需要重新设置。',
    positiveText: '确定',
    negativeText: '取消',
    onPositiveClick: () => {
      try {
        // 清除全局存储
        settingStore.clearGlobalCookie();

        // 清除当前会话
        clearAllCookies();

        // 重置本地状态
        globalCookie.value = '';
        userInfo.value = null;
        isValidCookie.value = false;

        window.$message.success('全局Cookie已清除');
      } catch (error) {
        console.error('清除Cookie失败:', error);
        window.$message.error('清除Cookie失败');
      }
    }
  });
};

// 组件挂载时初始化
onMounted(() => {
  // 从全局存储获取Cookie
  const storedCookie = settingStore.getGlobalCookie();
  if (storedCookie) {
    globalCookie.value = storedCookie;
    // 自动测试Cookie有效性
    testCookie();
  }
});
</script>

<style lang="scss" scoped>
.cookie-setting {
  .set-item {
    margin-bottom: 16px;

    .label {
      margin-bottom: 12px;

      .name {
        font-size: 16px;
        font-weight: 600;
        margin-bottom: 4px;
        display: block;
      }

      .tip {
        font-size: 13px;
        line-height: 1.5;
      }
    }

    .user-info {
      padding: 12px;
      background: var(--n-color-target);
      border-radius: 8px;
    }
  }

  :deep(.n-alert) {
    ol, ul {
      margin: 8px 0;
      padding-left: 20px;

      li {
        margin: 4px 0;
        line-height: 1.5;
      }
    }
  }
}
</style>