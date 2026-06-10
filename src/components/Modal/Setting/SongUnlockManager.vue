<template>
  <div class="song-unlock-manager">
    <n-alert title="免责声明" type="info">
      本功能仅作为测试使用，资源来自网络，若侵犯到您的权益，请及时联系我们删除
    </n-alert>
    <div class="action-bar">
      <n-button size="small" quaternary @click="resetServerList"> 重置列表 </n-button>
    </div>
    <div ref="sortableRef" class="sortable-list">
      <n-card
        v-for="item in settingStore.songUnlockServer"
        :key="item.key"
        :content-style="{
          display: 'flex',
          alignItems: 'center',
          gap: '12px',
          padding: '16px',
        }"
        class="sortable-item"
      >
        <SvgIcon class="drag-handle" :depth="3" name="Menu" />
        <n-text class="name">{{ serverNameMap[item.key] || item.key }}</n-text>
        <n-switch v-model:value="item.enabled" :round="false" />
      </n-card>
    </div>
  </div>
</template>

<script setup lang="ts">
import { SongUnlockServer } from "@/core/player/SongManager";
import { useSettingStore } from "@/stores";
import { useSortable } from "@vueuse/integrations/useSortable";
import type { Options } from "sortablejs";

const settingStore = useSettingStore();

// 音源名称映射
const serverNameMap: Record<string, string> = {
  [SongUnlockServer.BODIAN]: "波点音乐",
  [SongUnlockServer.NETEASE]: "网易云云盘",
  [SongUnlockServer.MIGU]: "咪咕音乐",
  [SongUnlockServer.KUWO]: "酷我音乐",
};

// 默认音源列表
const defaultServerList = [
  { key: SongUnlockServer.BODIAN, enabled: true },
  { key: SongUnlockServer.NETEASE, enabled: true },
  { key: SongUnlockServer.MIGU, enabled: true },
  { key: SongUnlockServer.KUWO, enabled: false },
];

// 重置音源列表
const resetServerList = () => {
  settingStore.songUnlockServer = defaultServerList.map((s) => ({ ...s }));
};

const sortableRef = ref<HTMLElement | null>(null);

// 拖拽
useSortable(sortableRef, settingStore.songUnlockServer, {
  animation: 150,
  handle: ".drag-handle",
} as Options);
</script>

<style scoped lang="scss">
.action-bar {
  margin-top: 12px;
  display: flex;
  justify-content: flex-end;
}
.sortable-list {
  margin-top: 8px;
  display: flex;
  flex-direction: column;
  gap: 12px;
  .sortable-item {
    border-radius: 8px;
    .drag-handle {
      font-size: 16px;
      cursor: move;
    }
    .name {
      font-size: 16px;
      line-height: normal;
    }
    .n-switch {
      margin-left: auto;
    }
  }
}
</style>
