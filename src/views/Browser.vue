<template>
  <div class="browser">
    <div class="browser-header">
      <n-flex align="center" class="nav-bar">
        <n-button-group>
          <n-button :disabled="!canGoBack" @click="goBack">
            <template #icon>
              <SvgIcon name="ArrowLeft" />
            </template>
          </n-button>
          <n-button :disabled="!canGoForward" @click="goForward">
            <template #icon>
              <SvgIcon name="ArrowRight" />
            </template>
          </n-button>
          <n-button @click="refresh">
            <template #icon>
              <SvgIcon name="Refresh" />
            </template>
          </n-button>
        </n-button-group>

        <n-input
          v-model:value="currentUrl"
          class="url-input"
          placeholder="请输入网址"
          @keyup.enter="navigateToUrl"
        >
          <template #prefix>
            <SvgIcon name="Link" />
          </template>
        </n-input>

        <n-button type="primary" @click="navigateToUrl">
          访问
        </n-button>

        <n-button @click="goHome">
          <template #icon>
            <SvgIcon name="Home" />
          </template>
          主页
        </n-button>

        <n-button @click="toggleFullscreen">
          <template #icon>
            <SvgIcon :name="isFullscreen ? 'FullscreenExit' : 'Fullscreen'" />
          </template>
          {{ isFullscreen ? '退出全屏' : '全屏' }}
        </n-button>
      </n-flex>
    </div>

    <div class="browser-content" :class="{ 'fullscreen': isFullscreen }">
      <n-spin
        class="loading-spinner"
        :show="isLoading"
        description="页面加载中..."
        size="large"
      >
        <iframe
          ref="browserFrame"
          :src="frameUrl"
          class="browser-frame"
          sandbox="allow-forms allow-scripts allow-same-origin allow-modals allow-pointer-lock allow-presentation allow-top-navigation-by-user-activation allow-popups allow-popups-to-escape-sandbox"
          referrerpolicy="no-referrer"
          @load="onFrameLoad"
        />
      </n-spin>

      <!-- 全屏模式下的退出按钮 -->
      <n-button
        v-if="isFullscreen"
        class="exit-fullscreen-btn"
        type="primary"
        @click="toggleFullscreen"
      >
        <template #icon>
          <SvgIcon name="FullscreenExit" />
        </template>
        退出全屏
      </n-button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { useSettingStore } from "@/stores";
import { setCookies, clearAllCookies } from "@/utils/cookie";
import { NSpin } from "naive-ui";

const settingStore = useSettingStore();

// 浏览器状态
const browserFrame = ref<HTMLIFrameElement | null>(null);
const currentUrl = ref<string>(settingStore.browserHomepage || 'https://music.163.com');
const frameUrl = ref<string>(currentUrl.value);
const isFullscreen = ref<boolean>(false);

// 导航历史
const history: string[] = [];
const historyIndex = ref(-1);
const canGoBack = ref<boolean>(false);
const canGoForward = ref<boolean>(false);
const isLoading = ref<boolean>(true);

/**
 * 导航到指定URL
 */
const navigateToUrl = () => {
  let url = currentUrl.value.trim();

  if (!url) {
    window.$message.warning('请输入有效的网址');
    return;
  }

  // 如果没有协议，自动添加https://
  if (!url.startsWith('http://') && !url.startsWith('https://')) {
    url = 'https://' + url;
  }

  // 更新导航历史
  if (frameUrl.value && frameUrl.value !== url) {
    // 如果当前不是在历史记录的最后，则清除后面的历史
    if (historyIndex.value < history.length - 1) {
      history.splice(historyIndex.value + 1);
    }

    // 添加当前URL到历史记录
    history.push(url);
    historyIndex.value = history.length - 1;
  } else if (history.length === 0) {
    // 如果历史为空，添加第一个记录
    history.push(url);
    historyIndex.value = 0;
  }

  // 更新URL并显示加载状态
  frameUrl.value = url;
  currentUrl.value = url;
  isLoading.value = true;

  // 更新导航状态
  updateNavigationState();

  // 设置超时检测
  setTimeout(() => {
    if (isLoading.value) {
      // 如果5秒后仍在加载，提示用户可能需要较长时间
      window.$message.info('页面加载中，请稍候...');
    }
  }, 5000);
};

/**
 * 返回上一页
 */
const goBack = () => {
  if (canGoBack.value && historyIndex.value > 0) {
    historyIndex.value--;
    const previousUrl = history[historyIndex.value];

    // 直接更新iframe的src，不经过navigateToUrl以避免重复添加历史记录
    frameUrl.value = previousUrl;
    currentUrl.value = previousUrl;
    isLoading.value = true;

    // 更新导航状态
    updateNavigationState();
  }
};

/**
 * 前进到下一页
 */
const goForward = () => {
  if (canGoForward.value && historyIndex.value < history.length - 1) {
    historyIndex.value++;
    const nextUrl = history[historyIndex.value];

    // 直接更新iframe的src，不经过navigateToUrl以避免重复添加历史记录
    frameUrl.value = nextUrl;
    currentUrl.value = nextUrl;
    isLoading.value = true;

    // 更新导航状态
    updateNavigationState();
  }
};

/**
 * 刷新页面
 */
const refresh = () => {
  if (browserFrame.value) {
    browserFrame.value.src = frameUrl.value;
    isLoading.value = true;
  }
};

/**
 * 回到主页
 */
const goHome = () => {
  currentUrl.value = settingStore.browserHomepage;
  navigateToUrl();
};

/**
 * 切换全屏模式
 */
const toggleFullscreen = () => {
  isFullscreen.value = !isFullscreen.value;
};

/**
 * 页面加载完成
 */
const onFrameLoad = () => {
  isLoading.value = false;

  // 应用全局登录Cookie（仅在网易云音乐域名下）
  const globalCookie = settingStore.getGlobalCookie();
  if (globalCookie && frameUrl.value.includes('music.163.com')) {
    try {
      // 尝试设置Cookie到iframe的document
      const iframeDoc = browserFrame.value?.contentDocument;
      if (iframeDoc) {
        setCookies(globalCookie);
        console.log('已应用全局登录Cookie到网易云音乐');
      }
    } catch (error) {
      console.warn('无法设置iframe Cookie (跨域限制):', error);
      // 尝试在主文档中设置Cookie
      try {
        setCookies(globalCookie);
        console.log('已在主文档中应用全局登录Cookie');
      } catch (mainError) {
        console.warn('主文档Cookie设置也失败:', mainError);
      }
    }
  }

  // 更新当前URL显示
  try {
    const iframeDoc = browserFrame.value?.contentDocument;
    if (iframeDoc && iframeDoc.URL !== 'about:blank') {
      const actualUrl = iframeDoc.URL;

      // 如果实际URL与当前frameUrl不同，可能是重定向导致的
      if (actualUrl !== frameUrl.value) {
        console.log(`URL已更新: ${frameUrl.value} -> ${actualUrl}`);

        // 更新当前URL显示
        currentUrl.value = actualUrl;

        // 如果是重定向，更新历史记录中的当前URL
        if (historyIndex.value >= 0 && historyIndex.value < history.length) {
          history[historyIndex.value] = actualUrl;
        }
      }
    }
  } catch (error) {
    console.warn('无法获取iframe URL (跨域限制):', error);
  }

  // 更新导航状态
  updateNavigationState();
};

/**
 * 更新导航状态
 */
const updateNavigationState = () => {
  // 根据历史记录索引更新导航按钮状态
  canGoBack.value = historyIndex.value > 0;
  canGoForward.value = historyIndex.value < history.length - 1;

  // 调试信息
  console.log(`导航状态: 历史长度=${history.length}, 当前索引=${historyIndex.value}, 可后退=${canGoBack.value}, 可前进=${canGoForward.value}`);
};

// 组件挂载时应用全局Cookie
onMounted(() => {
  const globalCookie = settingStore.getGlobalCookie();
  if (globalCookie) {
    try {
      setCookies(globalCookie);
      console.log('组件挂载时已应用全局登录Cookie');
    } catch (error) {
      console.warn('组件挂载时Cookie设置失败:', error);
    }
  }
});
</script>

<style lang="scss" scoped>
.browser {
  display: flex;
  flex-direction: column;
  height: 100%; // 改为 100% 以确保继承父容器高度
  width: 100%;  // 改为 100% 以确保继承父容器宽度
  overflow: hidden;

  .browser-header {
    padding: 8px 12px;
    border-bottom: 1px solid var(--n-border-color);
    background: var(--n-card-color);
    flex-shrink: 0;
    z-index: 10;

    .nav-bar {
      gap: 8px;
      align-items: center;

      .url-input {
        flex: 1;
        min-width: 200px;
      }
    }
  }

  .browser-content {
    flex: 1;
    position: relative;
    overflow: hidden; // 确保内容区不会意外溢出
    min-height: 0;
    width: 100%;
    transition: all 0.3s ease;
    transform-origin: top left; // 设置缩放基点

    &:not(.fullscreen) {
      // 非全屏状态下的样式，启用按比例缩小
      transform: scale(0.95); // 缩小到95%，可根据需要调整
      width: calc(100% / 0.95); // 调整宽度以适应缩放
      height: calc(100% / 0.95); // 调整高度以适应缩放
    }

    &.fullscreen {
      position: fixed;
      top: 0;
      left: 0;
      width: 100vw;
      height: 100vh;
      z-index: 1000;
      transform: scale(1); // 全屏时恢复原始大小
    }

    .loading-spinner {
      position: absolute;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      display: flex;
      justify-content: center;
      align-items: center;
      z-index: 5;
    }

    .browser-frame {
      position: absolute;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      border: none;
      background: white; // 确保有背景色
      display: block;
      // overflow: auto; /* iframe 自身滚动由其内容决定，这里不需要 */
    }
    .exit-fullscreen-btn {
      position: absolute;
      top: 10px;
      right: 10px;
      z-index: 100;
      opacity: 0.7;
      transition: opacity 0.3s ease;

      &:hover {
        opacity: 1;
      }
    }
  }
}
</style>