<template>
  <div class="streaming-songs">
    <SongList :data="data" :loading="loading" disabled-sort />
  </div>
</template>

<script setup lang="ts">
import type { SongType } from "@/types/main";
import SongList from "@/components/List/SongList.vue";

const props = defineProps<{
  data: SongType[];
  loading: boolean;
}>();
</script>
