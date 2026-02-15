<template>
  <div class="player-slider-container">
    <n-slider
      v-model:value="sliderProgress"
      :key="musicStore.playSong?.id"
      :step="0.01"
      :min="0"
      :max="statusStore.duration"
      :keyboard="false"
      :format-tooltip="formatTooltip"
      :tooltip="settingStore.progressTooltipShow && props.showTooltip"
      :class="['player-slider', { drag: isDragging }]"
      @dragstart="startDrag"
      @dragend="endDrag"
    />
    <div v-if="showAutomixFx" :key="automixFxKey" class="automix-fx-layer">
      <div class="automix-fx-bar">
        <div class="automix-fx-bar__fill"></div>
      </div>
      <div v-if="props.automixFxText" class="automix-fx-text">
        {{ props.automixFxText }}
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { useMusicStore, useSettingStore, useStatusStore } from "@/stores";
import { msToTime } from "@/utils/time";
import { usePlayerController } from "@/core/player/PlayerController";
import { LyricLine } from "@applemusic-like-lyrics/lyric";

const props = withDefaults(
  defineProps<{ showTooltip?: boolean; automixFxSeq?: number; automixFxText?: string }>(),
  {
    showTooltip: true,
    automixFxSeq: 0,
    automixFxText: "混音",
  },
);

const musicStore = useMusicStore();
const statusStore = useStatusStore();
const settingStore = useSettingStore();

const player = usePlayerController();

const showAutomixFx = ref(false);
const automixFxKey = ref(0);
let automixFxTimer: number | null = null;

const triggerAutomixFx = async (seq: number) => {
  if (automixFxTimer !== null) {
    window.clearTimeout(automixFxTimer);
    automixFxTimer = null;
  }

  showAutomixFx.value = false;
  automixFxKey.value = seq;
  await nextTick();
  showAutomixFx.value = true;
  automixFxTimer = window.setTimeout(() => {
    showAutomixFx.value = false;
    automixFxTimer = null;
  }, 1400);
};

watch(
  () => props.automixFxSeq,
  (seq, prev) => {
    if (!seq || seq === prev) return;
    void triggerAutomixFx(seq);
  },
);

onBeforeUnmount(() => {
  if (automixFxTimer !== null) {
    window.clearTimeout(automixFxTimer);
    automixFxTimer = null;
  }
});

// 拖动时的临时值
const dragValue = ref(0);
// 是否拖动
const isDragging = ref(false);
// 是否显示提示
// const showSliderTooltip = ref(false);

// 实时进度
const sliderProgress = computed({
  // 获取进度
  get: () => (isDragging.value ? dragValue.value : statusStore.currentTime),
  // 设置进度
  set: (value) => {
    // 若为拖动中
    if (isDragging.value) {
      dragValue.value = value;
      return;
    }
    // 结束或者为点击
    useThrottleFn((value: number) => setSeek(value), 30);
  },
});

// 开始拖拽
const startDrag = () => {
  isDragging.value = true;
  // 立即赋值当前时间
  dragValue.value = statusStore.currentTime;
};

// 结束拖拽
const endDrag = () => {
  isDragging.value = false;
  // 直接更改进度
  setSeek(dragValue.value);
};

/**
 * 二分查找当前时间对应的歌词索引
 */
const getLyricIndex = (lyric: LyricLine[], value: number) => {
  let low = 0;
  let high = lyric.length - 1;
  let idx = -1;
  while (low <= high) {
    const mid = Math.floor((low + high) / 2);
    if (lyric[mid].startTime <= value) {
      idx = mid;
      low = mid + 1;
    } else {
      high = mid - 1;
    }
  }
  return idx;
};

/**
 * 获取当前时间最近一句歌词
 * @param value 当前时间
 * @returns 最近一句歌词的开始时间和内容
 */
const getCurrentLyric = (value: number) => {
  const lyric = toRaw(musicStore.songLyric.lrcData);
  if (!lyric?.length) return null;
  const idx = getLyricIndex(lyric, value);
  const nearestLyric = idx !== -1 ? lyric[idx] : null;

  return {
    time: nearestLyric?.startTime,
    text: nearestLyric?.words?.[0]?.word || "",
  };
};

// 调节进度
const setSeek = (value: number) => {
  // 歌词吸附
  if (settingStore.progressAdjustLyric) {
    const lyric = toRaw(musicStore.songLyric.lrcData);
    if (lyric?.length) {
      const currentLineIdx = getLyricIndex(lyric, value);

      // 优先检查下一行（预备开始）
      // 无论当前是否有行，只要下一行够近，就吸附到下一行
      const nextLineIdx = currentLineIdx + 1;
      if (nextLineIdx < lyric.length) {
        const nextLine = lyric[nextLineIdx];
        if (nextLine.startTime - value <= 2500) {
          player.setSeek(nextLine.startTime);
          return;
        }
      }
      // 查当前行（重新开始）
      // 解决纯音乐被拉回的问题：如果距离当前行开头太远（>10s），则视为 Instrumental 或 Gap，不吸附
      if (currentLineIdx !== -1) {
        const currentLine = lyric[currentLineIdx];
        const offset = value - currentLine.startTime;
        if (offset <= 10000) {
          player.setSeek(currentLine.startTime);
          return;
        }
      }
    }
  }
  player.setSeek(value);
};

// 格式化提示
const formatTooltip = (value: number) => {
  const nearestLyric = settingStore.progressLyricShow ? getCurrentLyric(value) : null;
  return nearestLyric?.text?.length
    ? `${msToTime(value)} / ${nearestLyric.text.length > 30 ? nearestLyric.text.slice(0, 30) + "..." : nearestLyric.text}`
    : msToTime(value);
};
</script>

<style scoped lang="scss">
.player-slider-container {
  position: relative;
  width: 100%;
}

.automix-fx-layer {
  position: absolute;
  inset: 0;
  pointer-events: none;
}

.automix-fx-bar {
  position: absolute;
  left: 0;
  right: 0;
  top: 50%;
  transform: translateY(-50%);
  height: 4px;
  border-radius: 999px;
  overflow: hidden;
}

.automix-fx-bar__fill {
  width: 100%;
  height: 100%;
  border-radius: 999px;
  background: rgba(var(--main-cover-color), 0.18);
  box-shadow:
    0 0 14px rgba(var(--main-cover-color), 0.65),
    0 0 28px rgba(var(--main-cover-color), 0.28);
  transform-origin: left center;
  transform: scaleX(0);
  opacity: 0;
  animation: automix-bar 1400ms ease-out forwards;
}

.automix-fx-text {
  position: absolute;
  left: 0;
  right: 0;
  top: 50%;
  transform: translateY(-160%);
  text-align: center;
  font-size: 12px;
  font-weight: 600;
  letter-spacing: 0.2em;
  color: rgba(var(--main-cover-color), 0.95);
  filter: drop-shadow(0 0 10px rgba(var(--main-cover-color), 0.55));
  opacity: 0;
  clip-path: inset(0 100% 0 0);
  animation: automix-text 1400ms ease-out forwards;
}

@keyframes automix-bar {
  0% {
    transform: scaleX(0);
    opacity: 0;
  }
  12% {
    opacity: 1;
  }
  88% {
    opacity: 1;
  }
  100% {
    transform: scaleX(1);
    opacity: 0;
  }
}

@keyframes automix-text {
  0% {
    opacity: 0;
    clip-path: inset(0 100% 0 0);
  }
  22% {
    opacity: 1;
  }
  92% {
    opacity: 1;
    clip-path: inset(0 0 0 0);
  }
  100% {
    opacity: 0;
    clip-path: inset(0 0 0 0);
  }
}

.player-slider {
  width: 100%;
  &:not(.drag) {
    :deep(.n-slider-rail) {
      .n-slider-rail__fill {
        transition: width 0.3s;
      }
      .n-slider-handle-wrapper {
        will-change: left;
        transition: left 0.3s;
      }
    }
  }
  :deep(.n-slider-handles) {
    .n-slider-handle {
      opacity: 0;
      transform: scale(0.6);
    }
  }
  &:hover,
  &.drag {
    :deep(.n-slider-handles) {
      .n-slider-handle {
        opacity: 1;
        transform: scale(1);
      }
    }
  }
}
</style>
