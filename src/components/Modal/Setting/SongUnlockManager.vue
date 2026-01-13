<!--
 * @Author: ZJQ
 * @Date: 2025-12-15 16:09:47
 * @LastEditors: zjq zjq@xkb.com.cn
 * @LastEditTime: 2025-12-15 18:36:55
 * @FilePath: \tea\src\components\Modal\Setting\SongUnlockManager.vue
 * @Description:
 *
 * Copyright (c) 2025 by ${git_name_email}, All Rights Reserved.
-->
<template>
  <div class="song-unlock-manager">
    <n-alert title="免责声明" type="info">
      本功能仅作为测试使用，资源来自网络，若侵犯到您的权益，请及时联系我们删除
    </n-alert>
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
        <SvgIcon :depth="3" name="Menu" />
        <n-text class="name">{{ getServerDisplayName(item.key) }}</n-text>
        <n-switch v-model:value="item.enabled" :round="false" />
      </n-card>
    </div>
  </div>
</template>

<script setup lang="ts">
import { useSettingStore } from "@/stores";
import { useSortable } from "@vueuse/integrations/useSortable";
import { SongUnlockServer } from "@/core/player/SongManager";

const settingStore = useSettingStore();

const sortableRef = ref<HTMLElement | null>(null);

// 获取服务器显示名称
const getServerDisplayName = (key: SongUnlockServer): string => {
  const nameMap: Record<SongUnlockServer, string> = {
    [SongUnlockServer.NETEASE]: "网易云音乐",
    [SongUnlockServer.BODIAN]: "波点音乐",
    [SongUnlockServer.GEQUBAO]: "歌曲宝",
    [SongUnlockServer.QQ]: "QQ音乐",
    [SongUnlockServer.KUGOU]: "酷狗音乐",
    [SongUnlockServer.KUWO]: "酷我音乐",
    [SongUnlockServer.BILIBILI]: "哔哩哔哩",
  };
  return nameMap[key] || key;
};

// 拖拽
useSortable(sortableRef, settingStore.songUnlockServer, {
  animation: 150,
  handle: ".n-icon",
});
</script>

<style scoped lang="scss">
.sortable-list {
  margin-top: 12px;
  display: flex;
  flex-direction: column;
  gap: 12px;
  .sortable-item {
    border-radius: 8px;
    .n-icon {
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
