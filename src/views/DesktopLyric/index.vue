<template>
  <n-config-provider :theme="null">
    <div
      ref="desktopLyricRef"
      :class="[
        'desktop-lyric',
        {
          locked: lyricConfig.isLock,
        },
      ]"
    >
      <div class="header" align="center" justify="space-between">
        <n-flex :wrap="false" align="center" justify="flex-start" size="small" @pointerdown.stop>
          <div class="menu-btn" title="返回应用" @click.stop="sendToMain('win-show')">
            <SvgIcon name="Music" />
          </div>
          <span class="song-name">{{ lyricData.playName }}</span>
        </n-flex>
        <n-flex :wrap="false" align="center" justify="center" size="small" @pointerdown.stop>
          <div class="menu-btn" title="上一曲" @click.stop="sendToMainWin('playPrev')">
            <SvgIcon name="SkipPrev" />
          </div>
          <div
            class="menu-btn"
            :title="lyricData.playStatus ? '暂停' : '播放'"
            @click.stop="sendToMainWin('playOrPause')"
          >
            <SvgIcon :name="lyricData.playStatus ? 'Pause' : 'Play'" />
          </div>
          <div class="menu-btn" title="下一曲" @click.stop="sendToMainWin('playNext')">
            <SvgIcon name="SkipNext" />
          </div>
        </n-flex>
        <n-flex :wrap="false" align="center" justify="flex-end" size="small" @pointerdown.stop>
          <div class="menu-btn" title="设置">
            <SvgIcon name="Settings" />
          </div>
          <div class="menu-btn" title="锁定">
            <SvgIcon name="Lock" />
          </div>
          <div class="menu-btn" title="解锁">
            <SvgIcon name="LockOpen" />
          </div>
          <div class="menu-btn" title="关闭" @click.stop="sendToMain('closeDesktopLyric')">
            <SvgIcon name="Close" />
          </div>
        </n-flex>
      </div>
      <n-flex
        :style="{
          fontSize: lyricConfig.fontSize + 'px',
          fontFamily: lyricConfig.fontFamily,
          fontWeight: lyricConfig.fontIsBold ? 'bold' : 'normal',
          textShadow: `0 0 4px ${lyricConfig.shadowColor}`,
        }"
        :class="['lyric-container', lyricConfig.position]"
        :size="0"
        justify="space-around"
        vertical
      >
        <span
          v-for="line in renderLyricLines"
          :key="line.key"
          :class="['lyric-line', { active: line.active }]"
          :style="{
            color: line.active ? lyricConfig.playedColor : lyricConfig.unplayedColor,
          }"
        >
          {{ line.text }}
        </span>
        <!-- 占位 -->
        <span v-if="renderLyricLines.length === 1" class="lyric-line"> &nbsp; </span>
      </n-flex>
    </div>
  </n-config-provider>
</template>

<script setup lang="ts">
import { Position } from "@vueuse/core";
import { LyricConfig, LyricData, RenderLine } from "@/types/desktop-lyric";
import defaultDesktopLyricConfig from "@/assets/data/lyricConfig";

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
  ...defaultDesktopLyricConfig,
});

// 桌面歌词元素
const desktopLyricRef = ref<HTMLElement>();

/**
 * 渲染的歌词行
 * @returns 渲染的歌词行数组
 */
const renderLyricLines = computed<RenderLine[]>(() => {
  const lyrics = lyricData?.yrcData?.length ? lyricData.yrcData : lyricData.lrcData;
  if (!lyrics?.length) {
    return [{ text: "纯音乐，请欣赏", key: "placeholder", active: true }];
  }
  let idx = lyricData?.lyricIndex ?? -1;
  // 显示歌名
  if (idx < 0) {
    return [{ text: lyricData.playName ?? "未知歌曲", key: "placeholder", active: true }];
  }
  const current = lyrics[idx];
  const next = lyrics[idx + 1];
  if (!current) return [];
  // 有翻译
  if (current.tran && current.tran.trim().length > 0) {
    const lines: RenderLine[] = [
      { text: current.content, key: `${idx}:orig`, active: true },
      { text: current.tran, key: `${idx}:tran`, active: false },
    ];
    return lines.filter((l) => l.text && l.text.trim().length > 0);
  }
  // 单行：仅当前句原文，高亮
  if (!lyricConfig.isDoubleLine) {
    return [{ text: current.content, key: `${idx}:orig`, active: true }].filter(
      (l) => l.text && l.text.trim().length > 0,
    );
  }
  // 双行交替：只高亮当前句所在行
  const isEven = idx % 2 === 0;
  if (isEven) {
    const lines: RenderLine[] = [
      { text: current.content, key: `${idx}:orig`, active: true },
      { text: next?.content ?? "", key: `${idx + 1}:next`, active: false },
    ];
    return lines.filter((l) => l.text && l.text.trim().length > 0);
  }
  const lines: RenderLine[] = [
    { text: next?.content ?? "", key: `${idx + 1}:next`, active: false },
    { text: current.content, key: `${idx}:orig`, active: true },
  ];
  return lines.filter((l) => l.text && l.text.trim().length > 0);
});

// 拖拽窗口状态
const dragState = reactive({
  isDragging: false,
  startX: 0,
  startY: 0,
  startWinX: 0,
  startWinY: 0,
  winWidth: 0,
  winHeight: 0,
});

/**
 * 桌面歌词拖动开始
 * @param _position 拖动位置
 * @param event 指针事件
 */
const lyricDragStart = async (_position: Position, event: PointerEvent) => {
  if (lyricConfig.isLock) return;
  dragState.isDragging = true;
  const { x, y } = await window.electron.ipcRenderer.invoke("get-window-bounds");
  const { width, height } = await window.api.store.get("lyric");
  // 直接限制最大宽高
  window.electron.ipcRenderer.send("toggle-fixed-max-size", {
    width,
    height,
    fixed: true,
  });
  dragState.startX = event?.screenX ?? 0;
  dragState.startY = event?.screenY ?? 0;
  dragState.startWinX = x;
  dragState.startWinY = y;
  dragState.winWidth = width ?? 0;
  dragState.winHeight = height ?? 0;
};

/**
 * 桌面歌词拖动移动
 * @param _position 拖动位置
 * @param event 指针事件
 */
const lyricDragMove = async (_position: Position, event: PointerEvent) => {
  if (!dragState.isDragging || lyricConfig.isLock) return;
  const screenX = event?.screenX ?? 0;
  const screenY = event?.screenY ?? 0;
  let newWinX = Math.round(dragState.startWinX + (screenX - dragState.startX));
  let newWinY = Math.round(dragState.startWinY + (screenY - dragState.startY));
  // 可选：限制在屏幕边界（支持多屏）
  if (lyricConfig.limitBounds) {
    const { minX, minY, maxX, maxY } = await window.electron.ipcRenderer.invoke(
      "get-virtual-screen-bounds",
    );
    newWinX = Math.round(Math.max(minX as number, Math.min(maxX - dragState.winWidth, newWinX)));
    newWinY = Math.round(Math.max(minY as number, Math.min(maxY - dragState.winHeight, newWinY)));
  }
  window.electron.ipcRenderer.send(
    "move-window",
    newWinX,
    newWinY,
    dragState.winWidth,
    dragState.winHeight,
  );
};

// 监听桌面歌词拖动
useDraggable(desktopLyricRef, {
  onStart: (position, event) => {
    lyricDragStart(position, event);
  },
  onMove: (position, event) => {
    lyricDragMove(position, event);
  },
  onEnd: () => {
    // 关闭拖拽状态
    dragState.isDragging = false;
    requestAnimationFrame(() => {
      // 恢复拖拽前宽高
      window.electron.ipcRenderer.send(
        "update-lyric-size",
        dragState.winWidth,
        dragState.winHeight,
      );
      // 根据字体大小恢复一次高度
      const height = fontSizeToHeight(lyricConfig.fontSize);
      if (height) pushWindowHeight(height);
      // 恢复最大宽高
      window.electron.ipcRenderer.send("toggle-fixed-max-size", {
        width: dragState.winWidth,
        height: dragState.winHeight,
        fixed: false,
      });
    });
  },
});

// 监听窗口大小变化
const { height: winHeight } = useWindowSize();

/**
 * 根据窗口高度计算字体大小
 * 线性映射并取整，范围 20-96
 */
const computedFontSize = computed(() => {
  const h = Number(winHeight?.value ?? 0);
  const minH = 140;
  const maxH = 360;
  const minF = 20;
  const maxF = 96;
  if (!Number.isFinite(h) || h <= minH) return minF;
  if (h >= maxH) return maxF;
  const ratio = (h - minH) / (maxH - minH);
  return Math.round(minF + ratio * (maxF - minF));
});

// 监听字体大小变化，同步更新窗口高度
watch(
  computedFontSize,
  (size) => {
    if (!Number.isFinite(size)) return;
    if (dragState.isDragging) return;
    if (size === lyricConfig.fontSize) return;
    const next = { fontSize: size };
    window.electron.ipcRenderer.send("update-desktop-lyric-option", next, true);
  },
  { immediate: true },
);

/**
 * 根据字体大小计算窗口高度（20-96 <-> 140-360）
 * @param size 字体大小
 * @returns 窗口高度
 */
const fontSizeToHeight = (size: number) => {
  const minH = 140;
  const maxH = 360;
  const minF = 20;
  const maxF = 96;
  const s = Math.min(Math.max(Math.round(size), minF), maxF);
  const ratio = (s - minF) / (maxF - minF);
  return Math.round(minH + ratio * (maxH - minH));
};

// 防抖推送窗口高度更新，避免频繁抖动
const pushWindowHeight = useDebounceFn((nextHeight: number) => {
  if (!Number.isFinite(nextHeight)) return;
  if (dragState.isDragging) return;
  window.electron.ipcRenderer.send("update-window-height", nextHeight);
}, 100);

// 监听配置中的字体大小变化，同步更新窗口高度
watch(
  () => lyricConfig.fontSize,
  (size) => {
    const height = fontSizeToHeight(size);
    if (height) pushWindowHeight(height);
  },
  { immediate: true },
);

// 发送至主进程
const sendToMain = (eventName: string, ...args: any[]) => {
  window.electron.ipcRenderer.send(eventName, ...args);
};

// 发送至主窗口
const sendToMainWin = (eventName: string, ...args: any[]) => {
  window.electron.ipcRenderer.send("send-to-main", eventName, ...args);
};

onMounted(() => {
  // 接收歌词数据
  window.electron.ipcRenderer.on("update-desktop-lyric-data", (_event, data: LyricData) => {
    Object.assign(lyricData, data);
  });
  window.electron.ipcRenderer.on("update-desktop-lyric-option", (_event, config: LyricConfig) => {
    Object.assign(lyricConfig, config);
    // 根据文字大小改变一次高度
    const height = fontSizeToHeight(config.fontSize);
    if (height) pushWindowHeight(height);
  });
  // 请求歌词数据及配置
  window.electron.ipcRenderer.send("request-desktop-lyric-data");
  window.electron.ipcRenderer.invoke("request-desktop-lyric-option");
});
</script>

<style scoped lang="scss">
.n-config-provider {
  width: 100%;
  height: 100%;
}
.desktop-lyric {
  display: flex;
  flex-direction: column;
  height: 100%;
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
  .lyric-container {
    height: 100%;
    padding: 0 8px;
    .lyric-line {
      width: 100%;
      line-height: normal;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    &.center {
      align-items: center;
      .lyric-line {
        text-align: center;
      }
    }
    &.right {
      align-items: flex-end;
      .lyric-line {
        text-align: right;
      }
    }
    &.both {
      .lyric-line {
        &:nth-child(2n) {
          text-align: right;
        }
      }
    }
  }
  &:hover {
    &:not(.locked) {
      background-color: rgba(0, 0, 0, 0.6);
      .header {
        opacity: 1;
      }
    }
  }
  &.locked {
    pointer-events: none;
    cursor: default;
    .header {
      opacity: 0;
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
