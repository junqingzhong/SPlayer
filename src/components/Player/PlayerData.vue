<template>
  <div :class="['player-data', settingStore.playerType, { center, light }]">
    <!-- 名称 -->
    <div class="name">
      <span class="name-text text-hidden">{{ musicStore.playSong.name || "未知曲目" }}</span>
      <!-- 额外信息 -->
      <n-flex
        v-if="statusStore.playUblock || musicStore.playSong.pc"
        class="extra-info"
        align="center"
      >
        <n-popover :show-arrow="false" placement="right" raw>
          <template #trigger>
            <SvgIcon
              :depth="3"
              :name="musicStore.playSong.pc ? 'Cloud' : 'CloudLockOpen'"
              size="22"
            />
          </template>
          <div class="player-tip">
            {{
              musicStore.playSong.pc
                ? "云盘歌曲，由用户上传"
                : "该歌曲暂时无法播放，为您采用其他音源，可能会与原曲存在差别"
            }}
          </div>
        </n-popover>
      </n-flex>
    </div>
    <!-- 别名 -->
    <span v-if="musicStore.playSong.alia" class="alia text-hidden">
      {{ musicStore.playSong.alia }}
    </span>
    <n-flex :align="center ? 'center' : undefined" size="small" vertical>
      <!-- 播放状态 -->
      <n-flex
        v-if="settingStore.showPlayMeta && !light"
        class="play-meta"
        size="small"
        align="center"
      >
        <!-- 音质 -->
        <n-dropdown
          :options="qualityOptions"
          :show-arrow="false"
          :class="{ player: statusStore.showFullPlayer }"
          :disabled="qualityLoading || !!musicStore.playSong.path || statusStore.playUblock"
          @select="handleQualitySelect"
        >
          <span
            class="meta-item clickable"
            :class="{ loading: qualityLoading }"
            @mouseenter="handleQualityHover"
            @click="handleQualityHover"
          >
            <template v-if="qualityLoading">加载中...</template>
            <template v-else>
              {{ statusStore.playUblock || !statusStore.songQuality ? "未知音质" : statusStore.songQuality }}
            </template>
          </span>
        </n-dropdown>
        <!-- 歌词模式 -->
        <span class="meta-item">{{ lyricMode }}</span>
        <!-- 是否在线 -->
        <span class="meta-item">
          {{ musicStore.playSong.path ? "LOCAL" : "ONLINE" }}
        </span>
      </n-flex>
      <!-- 歌手 -->
      <div v-if="musicStore.playSong.type !== 'radio'" class="artists">
        <SvgIcon :depth="3" name="Artist" size="20" />
        <div v-if="Array.isArray(musicStore.playSong.artists)" class="ar-list">
          <span
            v-for="ar in musicStore.playSong.artists"
            :key="ar.id"
            class="ar"
            @click="jumpPage({ name: 'artist', query: { id: ar.id } })"
          >
            {{ ar.name }}
          </span>
        </div>
        <div v-else class="ar-list">
          <span class="ar">{{ musicStore.playSong.artists || "未知艺术家" }}</span>
        </div>
      </div>
      <div v-else class="artists">
        <SvgIcon :depth="3" name="Artist" size="20" />
        <div class="ar-list">
          <span class="ar">{{ musicStore.playSong.dj?.creator || "未知艺术家" }}</span>
        </div>
      </div>
      <!-- 专辑 -->
      <div v-if="musicStore.playSong.type !== 'radio'" class="album">
        <SvgIcon :depth="3" name="Album" size="20" />
        <span
          v-if="isObject(musicStore.playSong.album)"
          class="name-text text-hidden"
          @click="jumpPage({ name: 'album', query: { id: musicStore.playSong.album.id } })"
        >
          {{ musicStore.playSong.album?.name || "未知专辑" }}
        </span>
        <span v-else class="name-text text-hidden">
          {{ musicStore.playSong.album || "未知专辑" }}
        </span>
      </div>
      <!-- 电台 -->
      <div
        v-if="musicStore.playSong.type === 'radio'"
        class="dj"
        @click="jumpPage({ name: 'dj', query: { id: musicStore.playSong.dj?.id } })"
      >
        <SvgIcon :depth="3" name="Podcast" size="20" />
        <span class="name-text text-hidden">{{ musicStore.playSong.dj?.name || "播客电台" }}</span>
      </div>
    </n-flex>
  </div>
</template>

<script setup lang="ts">
import type { RouteLocationRaw } from "vue-router";
import type { DropdownOption } from "naive-ui";
import type { SongLevelDataType } from "@/types/main";
import { useMusicStore, useStatusStore, useSettingStore } from "@/stores";
import { debounce, isObject } from "lodash-es";
import { songQuality } from "@/api/song";
import { songLevelData, getSongLevelsData } from "@/utils/meta";
import { formatFileSize } from "@/utils/helper";
import { usePlayerController } from "@/core/player/PlayerController";

defineProps<{
  center?: boolean;
  // 少量数据模式
  light?: boolean;
}>();

const router = useRouter();
const musicStore = useMusicStore();
const statusStore = useStatusStore();
const settingStore = useSettingStore();

// 音质选择菜单状态
const qualityLoading = ref(false);
const availableQualities = ref<SongLevelDataType[]>([]);

// 音质选项（用于 n-dropdown）
const qualityOptions = computed<DropdownOption[]>(() => {
  if (availableQualities.value.length === 0) {
    return [{ label: "点击加载音质列表", key: "load", disabled: true }];
  }
  return availableQualities.value.map((item) => ({
    label: () =>
      h(
        "div",
        {
          style: {
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            width: "100%",
            minWidth: "180px",
          },
        },
        [
          h("span", item.name),
          item.size
            ? h("span", { style: { opacity: 0.6, marginLeft: "16px" } }, formatFileSize(item.size))
            : null,
        ],
      ),
    key: item.level,
    props: {
      class: settingStore.songLevel === item.level ? "active-quality" : "",
    },
  }));
});

// 当前歌词模式
const lyricMode = computed(() => {
  if (settingStore.showYrc) {
    if (statusStore.usingTTMLLyric) return "TTML";
    if (musicStore.isHasYrc) return "YRC";
  }
  return musicStore.isHasLrc ? "LRC" : "NO-LRC";
});

/**
 * 加载可用音质列表
 * @param isPreload 是否为预加载模式（静默加载，无错误提示）
 */
const loadQualities = async (isPreload = false) => {
  // 本地歌曲或解锁歌曲不支持切换
  if (musicStore.playSong.path || statusStore.playUblock) return;
  // 如果已经加载过，不重复加载
  if (availableQualities.value.length > 0) return;

  const songId = musicStore.playSong.id;
  if (!songId) return;

  if (!isPreload) {
    qualityLoading.value = true;
  }

  try {
    const res = await songQuality(songId);
    if (res.data) {
      const levels = getSongLevelsData(songLevelData, res.data);
      availableQualities.value = levels;
    } else if (!isPreload) {
      window.$message.warning("获取音质信息失败");
    }
  } catch (error) {
    console.error(`获取音质详情失败${isPreload ? " (预加载)" : ""}:`, error);
    if (!isPreload) {
      window.$message.error("获取音质信息失败");
    }
  } finally {
    if (!isPreload) {
      qualityLoading.value = false;
    }
  }
};

// 鼠标悬浮音质标签 - 自动加载可用音质
const handleQualityHover = () => loadQualities(false);

// 预加载音质列表（静默加载，无错误提示）
const preloadQualities = () => loadQualities(true);

// 选择音质
const handleQualitySelect = async (key: string) => {
  // 如果选择的和当前一样，不处理
  if (settingStore.songLevel === key) {
    return;
  }

  const item = availableQualities.value.find((q) => q.level === key);
  if (!item) return;

  // 更新设置中的音质
  settingStore.songLevel = key as typeof settingStore.songLevel;

  // 切换音质，保持当前进度，不重新加载歌词
  const playerController = usePlayerController();
  const currentTime = statusStore.currentTime;

  // 使用 switchQuality 切换，不触发歌词加载
  await playerController.switchQuality(currentTime);

  // 切换成功提示
  window.$message.success(`已切换至${item.name}`);
};

// 当切换歌曲时清空已加载的音质列表
watch(() => musicStore.playSong.id, () => {
  availableQualities.value = [];
});

// 打开全屏播放器时预加载音质列表
watch(() => statusStore.showFullPlayer, (show) => {
  if (show) {
    preloadQualities();
  }
});

const jumpPage = debounce(
  (go: RouteLocationRaw) => {
    if (!go) return;
    statusStore.showFullPlayer = false;
    router.push(go);
  },
  300,
  {
    leading: true,
    trailing: false,
  },
);
</script>

<style lang="scss" scoped>
.player-data {
  display: flex;
  flex-direction: column;
  width: 70%;
  max-width: 50vh;
  margin-top: 24px;
  padding: 0 2px;
  .n-icon {
    color: rgb(var(--main-cover-color));
  }
  .name {
    position: relative;
    display: flex;
    align-items: center;
    margin-left: 4px;
    .name-text {
      font-size: 26px;
      font-weight: bold;
      line-clamp: 2;
      -webkit-line-clamp: 2;
    }
    .n-icon {
      margin-left: 12px;
      transform: translateY(1px);
      cursor: pointer;
    }
  }
  .alia {
    margin: 6px 0 6px 4px;
    opacity: 0.6;
    font-size: 18px;
    line-clamp: 1;
    -webkit-line-clamp: 1;
  }
  .artists {
    display: flex;
    align-items: center;
    .n-icon {
      margin-right: 4px;
    }
    .ar-list {
      display: -webkit-box;
      line-clamp: 2;
      -webkit-box-orient: vertical;
      -webkit-line-clamp: 2;
      overflow: hidden;
      word-break: break-all;
      .ar {
        font-size: 16px;
        opacity: 0.7;
        display: inline-flex;
        transition: opacity 0.3s;
        cursor: pointer;
        &::after {
          content: "/";
          margin: 0 4px;
          transition: none;
        }
        &:last-child {
          &::after {
            display: none;
          }
        }
        &:hover {
          opacity: 1;
        }
      }
    }
  }
  .album,
  .dj {
    font-size: 16px;
    display: flex;
    align-items: center;
    .n-icon {
      margin-right: 4px;
    }
    .name-text {
      opacity: 0.7;
      transition: opacity 0.3s;
      line-clamp: 1;
      -webkit-line-clamp: 1;
      cursor: pointer;
      &:hover {
        opacity: 1;
      }
    }
  }
  .play-meta {
    padding: 4px 4px;
    opacity: 0.6;
    .meta-item {
      font-size: 12px;
      border-radius: 8px;
      padding: 2px 6px;
      border: 1px solid rgba(var(--main-cover-color), 0.6);
      &.clickable {
        cursor: pointer;
        transition: all 0.2s ease;
        &:hover {
          background-color: rgba(var(--main-cover-color), 0.08);
          border-color: rgb(var(--main-cover-color));
        }
        &.loading {
          opacity: 0.6;
          cursor: wait;
        }
      }
    }
  }
  &.record {
    width: 100%;
    padding: 0 80px 0 24px;
    .name {
      .name-text {
        font-size: 30px;
      }
      .extra-info {
        position: absolute;
        right: -34px;
        display: flex;
        align-items: center;
        justify-content: center;
      }
    }
  }
  &.center {
    align-items: center;
    padding: 0 2px;
    .name {
      text-align: center;
    }
  }
  &.light {
    .name {
      .name-text {
        line-clamp: 1;
        -webkit-line-clamp: 1;
      }
      .extra-info {
        display: none;
      }
    }
    .alia {
      display: none;
    }
  }
}
.player-tip {
  max-width: 240px;
  padding: 12px 20px;
  border-radius: 12px;
  color: rgb(var(--main-cover-color));
  background-color: rgba(var(--main-cover-color), 0.18);
  backdrop-filter: blur(10px);
}
// 音质选项当前选中的高亮样式
:deep(.active-quality) {
  background-color: rgba(var(--primary), 0.1) !important;
  &::after {
    content: " ✓";
  }
}
</style>

