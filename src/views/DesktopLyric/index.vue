<template>
  <n-config-provider :theme="null">
    <div
      ref="desktopLyricsRef"
      :class="[
        'desktop-lyrics',
        {
          locked: lyricConfig.isLock,
        },
      ]"
    >
      <div class="header" align="center" justify="space-between">
        <n-flex :wrap="false" align="center" justify="flex-start" size="small">
          <div class="menu-btn" title="返回应用">
            <SvgIcon name="Music" />
          </div>
          <div class="menu-btn" title="增加字体大小">
            <SvgIcon :offset="-1" name="TextSizeAdd" />
          </div>
          <div class="menu-btn" title="减少字体大小">
            <SvgIcon :offset="-1" name="TextSizeReduce" />
          </div>
          <span class="song-name">{{ lyricData.playName }}</span>
        </n-flex>
        <n-flex :wrap="false" align="center" justify="center" size="small">
          <div class="menu-btn" title="上一曲">
            <SvgIcon name="SkipPrev" />
          </div>
          <div class="menu-btn" :title="lyricData.playStatus ? '暂停' : '播放'">
            <SvgIcon :name="lyricData.playStatus ? 'Pause' : 'Play'" />
          </div>
          <div class="menu-btn" title="下一曲">
            <SvgIcon name="SkipNext" />
          </div>
        </n-flex>
        <n-flex :wrap="false" align="center" justify="flex-end" size="small">
          <div class="menu-btn" title="锁定">
            <SvgIcon name="Lock" />
          </div>
          <div class="menu-btn" title="解锁">
            <SvgIcon name="LockOpen" />
          </div>
          <div class="menu-btn" title="关闭">
            <SvgIcon name="Close" />
          </div>
        </n-flex>
      </div>
      <div
        :style="{
          fontSize: lyricConfig.fontSize + 'px',
          fontFamily: lyricConfig.fontFamily,
          lineHeight: lyricConfig.lineHeight + 'px',
        }"
        class="lyrics-container"
      >
        <span v-for="(item, index) in displayLyricLines" :key="index" class="lyric-line">
          {{ item }}
        </span>
      </div>
    </div>
  </n-config-provider>
</template>

<script setup lang="ts">
import { Position } from "@vueuse/core";
import { LyricConfig, LyricData } from ".";

// 桌面歌词数据
const lyricData = reactive<LyricData>({
  playName: "未知歌曲",
  playStatus: false,
  progress: 0,
  lrcData: [],
  yrcData: [],
  lyricIndex: -1,
});

// 桌面歌词配置
const lyricConfig = reactive<LyricConfig>({
  isLock: false,
  playedColor: "#fff",
  unplayedColor: "#ccc",
  stroke: "#000",
  strokeWidth: 2,
  fontFamily: "system-ui",
  fontSize: 24,
  lineHeight: 48,
  isDoubleLine: false,
  position: "center",
});

// 桌面歌词元素
const desktopLyricsRef = useTemplateRef<HTMLElement>("desktopLyricsRef");

// 需要显示的歌词行
const displayLyricLines = computed<string[]>(() => {
  // 优先使用逐字歌词，无则使用普通歌词
  const lyrics = lyricData.yrcData.length ? lyricData.yrcData : lyricData.lrcData;
  if (!lyrics.length) return ["纯音乐，请欣赏"];
  // 当前播放歌词索引
  let idx = lyricData.lyricIndex;
  if (idx < 0) idx = 0; // 开头之前按首句处理
  // 当前与下一句
  const current = lyrics[idx];
  const next = lyrics[idx + 1];
  if (!current) return [];
  // 若当前句有翻译，无论单/双行设置都显示两行：原文 + 翻译
  if (current.tran && current.tran.trim().length > 0) {
    return [current.content, current.tran];
  }
  // 单行：仅返回当前句原文
  if (!lyricConfig.isDoubleLine) {
    return [current.content];
  }
  // 双行：两行内容交替
  const isEven = idx % 2 === 0;
  if (isEven) {
    // 偶数句：第一行当前句，第二行下一句
    return [current.content, next?.content ?? ""];
  }
  // 奇数句：第一行下一句，第二行当前句
  return [next?.content ?? "", current.content];
});

// 桌面歌词拖动
const lyricDragMove = (position: Position) => {
  console.log(position);
};

// 监听桌面歌词拖动
useDraggable(desktopLyricsRef, {
  onMove: lyricDragMove,
});

onMounted(() => {
  // 接收歌词配置
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
  .header {
    opacity: 0;
    margin-bottom: 12px;
    transition: opacity 0.3s;
    // 子内容三等分grid
    display: grid;
    grid-template-columns: 1fr 1fr 1fr;
    grid-gap: 12px;
    > * {
      min-width: 0;
    }
    .song-name {
      font-size: 1em;
      text-align: left;
      flex: 1 1 auto;
      line-height: 36px;
      padding: 0 8px;
      min-width: 0;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .menu-btn {
      display: flex;
      align-items: center;
      justify-content: center;
      flex: 0 0 auto;
      padding: 6px;
      border-radius: 8px;
      will-change: transform;
      transition:
        background-color 0.3s,
        transform 0.3s;
      cursor: pointer;
      .n-icon {
        font-size: 24px;
      }
      &:hover {
        background-color: rgba(255, 255, 255, 0.3);
      }
      &:active {
        transform: scale(0.98);
      }
    }
  }
  &:hover {
    &:not(.lock) {
      background-color: rgba(0, 0, 0, 0.3);
      .header {
        opacity: 1;
      }
    }
  }
}
</style>

<style>
body {
  background-color: transparent !important;
  /* background-image: url("https://picsum.photos/1920/1080"); */
}
</style>
