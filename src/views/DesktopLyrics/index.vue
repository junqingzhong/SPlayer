<template>
  <n-config-provider :theme="null">
    <div ref="desktopLyricsRef" class="desktop-lyrics">
      {{ lyricData.playName }}
      {{ lyricConfig }}
      456456
      <n-flex class="menu" align="center" justify="space-between">
        <n-flex class="name">
          <div class="menu-btn">
            <SvgIcon name="Logo" />
          </div>
        </n-flex>
      </n-flex>
    </div>
  </n-config-provider>
</template>

<script setup lang="ts">
import type { LyricType } from "@/types/main";
import { Position } from "@vueuse/core";

// 桌面歌词数据
const lyricData = reactive<{
  playName: string;
  playStatus: boolean;
  progress: number;
  lrcData: LyricType[];
  yrcData: LyricType[];
  lyricIndex: number;
}>({
  playName: "未知歌曲",
  playStatus: false,
  progress: 0,
  lrcData: [],
  yrcData: [],
  lyricIndex: -1,
});

// 桌面歌词配置
const lyricConfig = reactive<{
  fontSize: number;
  lineHeight: number;
}>({
  fontSize: 24,
  lineHeight: 48,
});

// 桌面歌词元素
const desktopLyricsRef = useTemplateRef<HTMLElement>("desktopLyricsRef");

// 桌面歌词拖动
const lyricDragMove = (position: Position) => {
  console.log(position);
};

// 监听桌面歌词拖动
useDraggable(desktopLyricsRef, {
  onMove: lyricDragMove,
});
</script>

<style scoped lang="scss">
.desktop-lyrics {
  color: #fff;
  background-color: transparent;
  padding: 12px;
  border-radius: 12px;
  overflow: hidden;
  transition: background-color 0.3s;
  cursor: move;
  &:hover {
    &:not(.lock) {
      background-color: rgba(0, 0, 0, 0.3);
    }
  }
}
</style>

<!-- <style>
body {
  background-image: url("https://picsum.photos/1920/1080");
}
</style> -->
