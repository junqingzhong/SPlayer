<template>
  <div class="streaming-playlists">
    <!-- 歌单列表 -->
    <CoverList
      :data="playlistData"
      :loading="loading"
      type="playlist"
      :show-size="false"
      empty-description="暂无歌单"
    />
  </div>
</template>

<script setup lang="ts">
import type { CoverType } from "@/types/main";
import { useStreamingStore } from "@/stores";
import CoverList from "@/components/List/CoverList.vue";

const streamingStore = useStreamingStore();

const loading = ref<boolean>(false);

// 歌单数据
const playlistData = computed<CoverType[]>(() => {
  return streamingStore.playlists.value.map((playlist) => ({
    id: Number(playlist.id) || 0,
    name: playlist.name,
    cover: playlist.cover || "/images/album.jpg?asset",
    description: playlist.description,
    count: playlist.songCount || 0,
  }));
});

// 初始化加载
onMounted(async () => {
  if (streamingStore.isConnected.value) {
    loading.value = true;
    await streamingStore.fetchPlaylists();
    loading.value = false;
  }
});
</script>

<style lang="scss" scoped>
.streaming-playlists {
  height: 100%;
  padding-bottom: 20px;
  overflow-y: auto;
  .cover-list {
    padding: 4px;
  }
  .empty {
    margin-top: 100px;
  }
}
</style>
