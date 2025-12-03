<template>
  <div class="download-downloaded">
    <SongList
      :data="dataStore.downloadedSongs"
      :loading="loading"
    />
  </div>
</template>

<script setup lang="ts">
import type { SongType } from "@/types/main";
import { useDataStore } from "@/stores";
import SongList from "@/components/List/SongList.vue";

const dataStore = useDataStore();

defineProps<{
  data: SongType[];
  loading: boolean;
}>();
</script>

<style lang="scss" scoped>
.download-downloaded {
  height: 100%;
}
</style>
