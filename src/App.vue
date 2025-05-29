<template>
  <Provider>
    <!-- 全局背景图片 -->
    <div v-if="settingStore.customGlobalBackgroundImage" class="global-background" :style="{ '--bg-opacity': settingStore.globalBackgroundOpacity }">
      <img :src="settingStore.customGlobalBackgroundImage" alt="background" />
    </div>
    <!-- 主框架 -->
    <n-layout
      id="main"
      :class="{
        'show-player': musicStore.isHasPlayer && statusStore.showPlayBar,
        'show-full-player': statusStore.showFullPlayer,
        'has-background': settingStore.customGlobalBackgroundImage,
      }"
      has-sider
    >
      <!-- 侧边栏 -->
      <n-layout-sider
        id="main-sider"
        :style="{
          height:
            musicStore.isHasPlayer && statusStore.showPlayBar ? 'calc(100vh - 80px)' : '100vh',
        }"
        :content-style="{
          overflow: 'hidden',
          height: '100%',
          padding: '0',
        }"
        :native-scrollbar="false"
        :collapsed="statusStore.menuCollapsed"
        :collapsed-width="64"
        :width="240"
        collapse-mode="width"
        show-trigger="bar"
        bordered
        @collapse="statusStore.menuCollapsed = true"
        @expand="statusStore.menuCollapsed = false"
      >
        <Sider />
      </n-layout-sider>
      <n-layout id="main-layout">
        <!-- 导航栏 -->
        <Nav id="main-header" />
        <n-layout
          ref="contentRef"
          id="main-content"
          :native-scrollbar="false"
          :style="{
            '--layout-height': contentHeight,
          }"
          :content-style="{
            display: 'grid',
            gridTemplateRows: '1fr',
            minHeight: '100%',
            padding: '0 24px',
          }"
          position="absolute"
          embedded
        >
          <!-- 路由页面 -->
          <RouterView v-slot="{ Component }">
            <Transition :name="`router-${settingStore.routeAnimation}`" mode="out-in">
              <KeepAlive v-if="settingStore.useKeepAlive" :max="20" :exclude="['layout']">
                <component :is="Component" class="router-view" />
              </KeepAlive>
              <component v-else :is="Component" class="router-view" />
            </Transition>
          </RouterView>
          <!-- 回顶 -->
          <n-back-top :right="40" :bottom="120">
            <SvgIcon :size="22" name="Up" />
          </n-back-top>
        </n-layout>
      </n-layout>
    </n-layout>
    <!-- 播放列表 -->
    <MainPlayList />
    <!-- 全局播放器 -->
    <MainPlayer />
    <!-- 全屏播放器 -->
    <Teleport to="body">
      <Transition name="up" mode="out-in">
        <FullPlayer
          v-if="
            statusStore.showFullPlayer ||
            (statusStore.fullPlayerActive && settingStore.fullPlayerCache)
          "
        />
      </Transition>
    </Teleport>
  </Provider>
</template>

<script setup lang="ts">
import { useMusicStore, useStatusStore, useSettingStore } from "@/stores";
import init from "@/utils/init";

const musicStore = useMusicStore();
const statusStore = useStatusStore();
const settingStore = useSettingStore();

// 主内容
const contentRef = ref<HTMLElement | null>(null);

// 主内容高度
const { height: contentHeight } = useElementSize(contentRef);

watchEffect(() => {
  statusStore.mainContentHeight = contentHeight.value;
});

onMounted(async () => {
  await init();
});
</script>

<style lang="scss" scoped>
.global-background {
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  z-index: -1;
  overflow: hidden;
  --bg-opacity: 0.5; /* 默认透明度，会被内联样式覆盖 */

  img {
    width: 100%;
    height: 100%;
    object-fit: cover;
    filter: blur(8px);
    transform: scale(1.1);
  }

  &::after {
    content: "";
    position: absolute;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    background-color: rgba(0, 0, 0, var(--bg-opacity));
    backdrop-filter: blur(10px);
  }
}

#main {
  flex: 1;
  height: 100%;
  transition:
    transform 0.3s var(--n-bezier),
    opacity 0.3s var(--n-bezier);
  #main-layout {
    background-color: rgba(var(--background), 0.58);
  }
  #main-content {
    top: 70px;
    background-color: transparent;
    transition: bottom 0.3s;
    .router-view {
      position: relative;
      height: 100%;
      &.n-result {
        display: flex;
        flex-direction: column;
        justify-content: center;
      }
    }
  }
  &.show-player {
    #main-content {
      bottom: 80px;
    }
  }
  &.show-full-player {
    opacity: 0;
    transform: scale(0.9);
    #main-header {
      -webkit-app-region: no-drag;
    }
  }
  &.has-background {
    background-color: transparent;

    :deep(#main-sider) {
      background-color: rgba(var(--background-rgb), 0.7);
      backdrop-filter: blur(10px);
    }

    :deep(#main-header) {
      background-color: rgba(var(--background-rgb), 0.7);
      backdrop-filter: blur(10px);
    }

    :deep(#main-content) {
      background-color: rgba(var(--background-rgb), 0.7);
      backdrop-filter: blur(10px);
    }
  }
}
</style>
