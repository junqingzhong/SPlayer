<template>
  <div id="app-wrapper" :class="{ 'mobile-mode': settingStore.isMobileMode }">
    <Provider>
      <router-view />
    </Provider>
  </div>
</template>

<script setup lang="ts">
import { useSettingStore } from "@/stores";

const settingStore = useSettingStore();
</script>
