<!--
 * @Author: ZJQ
 * @Date: 2025-05-23 10:50:52
 * @LastEditors: zjq zjq@xkb.com.cn
 * @LastEditTime: 2026-01-26 16:54:18
 * @FilePath: \tea\src\App.vue
 * @Description:
 *
 * Copyright (c) 2026 by ${git_name_email}, All Rights Reserved.
-->
<template>
<template>
  <div id="app-wrapper" :class="{ 'mobile-mode': !isDesktop }" v-if="!isDesktopLyric">
    <Provider>
      <router-view />
    </Provider>
  </div>
  <router-view v-else />
</template>

<script setup lang="ts">
import { useSettingStore } from "@/stores";
import { useMobile } from "@/composables/useMobile";
import { onMounted } from "vue";

const settingStore = useSettingStore();
const { isDesktop } = useMobile();
const isDesktopLyric = location.hash.includes("desktop-lyric");

/**
 * 应用挂载时初始化
 * 检查并执行设置迁移，确保配置数据结构最新
 */
onMounted(() => {
  settingStore.checkAndMigrate();
});
</script>

<style scoped>
#app-wrapper {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
}
</style>
