<template>
  <div :class="[
      'main-player',
      {
        show: musicStore.isHasPlayer && statusStore.showPlayBar,
      },
    ]">
    <!-- 进度条 -->
    <n-slider v-model:value="statusStore.progress" :step="0.01" :min="0" :max="100" :tooltip="false" :keyboard="false"
      :marks="
        statusStore.chorus && statusStore.progress <= statusStore.chorus
          ? { [statusStore.chorus]: '' }
          : undefined
      " class="player-slider" @dragstart="player.pause(false)" @dragend="sliderDragend" />
    <!-- 信息 -->
    <div class="play-data">
      <!-- 封面 -->
      <Transition name="fade" mode="out-in">
        <div :key="musicStore.playSong.cover" class="cover" @click.stop="statusStore.showFullPlayer = true">
          <n-image :src="musicStore.songCover" :alt="musicStore.songCover" class="cover-img" preview-disabled
            @load="coverLoaded">
            <template #placeholder>
              <div class="cover-loading">
                <img src="/images/song.jpg?assest" class="loading-img" alt="loading-img" />
              </div>
            </template>
          </n-image>
          <!-- 打开播放器 -->
          <SvgIcon name="Expand" :size="30" />
        </div>
      </Transition>
      <!-- 信息 -->
      <Transition name="left-sm" mode="out-in">
        <div :key="musicStore.playSong.id" class="info">
          <div class="data">
            <!-- 名称 -->
            <TextContainer :key="musicStore.playSong.name" :text="musicStore.playSong.name" :speed="0.2" class="name" />
            <!-- 喜欢 -->
            <SvgIcon v-if="musicStore.playSong.type !== 'radio'"
              :name="dataStore.isLikeSong(musicStore.playSong.id) ? 'Favorite' : 'FavoriteBorder'" :size="20"
              class="like" @click="
                toLikeSong(musicStore.playSong, !dataStore.isLikeSong(musicStore.playSong.id))
              " />
            <!-- 更多操作 -->
            <n-dropdown :options="songMoreOptions" trigger="click" placement="top-start">
              <SvgIcon name="FormatList" :size="20" :depth="2" class="more" />
            </n-dropdown>
          </div>
          <Transition name="fade" mode="out-in">
            <!-- 歌词 -->
            <TextContainer v-if="isShowLyrics && instantLyrics" :key="instantLyrics" :text="instantLyrics" :speed="0.2"
              :delay="500" class="lyric" />
            <!-- 歌手 -->
            <div v-else class="artists">
              <n-text v-if="musicStore.playSong.type === 'radio'" class="ar-item">播客电台</n-text>
              <template v-else-if="Array.isArray(musicStore.playSong.artists)">
                <n-text v-for="(item, index) in musicStore.playSong.artists" :key="index" class="ar-item"
                  @click="openJumpArtist(musicStore.playSong.artists)">
                  {{ item.name }}
                </n-text>
              </template>
              <n-text v-else class="ar-item" @click="openJumpArtist(musicStore.playSong.artists)">
                {{ musicStore.playSong.artists || "未知艺术家" }}
              </n-text>
            </div>
          </Transition>
        </div>
      </Transition>
    </div>
    <!-- 控制 -->
    <div class="play-control">
      <!-- 不喜欢 -->
      <div v-if="statusStore.personalFmMode" class="play-icon"
        v-debounce="() => player.personalFMTrash(musicStore.personalFMSong?.id)">
        <SvgIcon class="icon" :size="18" name="ThumbDown" />
      </div>
      <!-- 上一曲 -->
      <div v-else class="play-icon" v-debounce="() => player.nextOrPrev('prev')">
        <SvgIcon :size="26" name="SkipPrev" />
      </div>
      <!-- 播放暂停 -->
      <n-button
        :loading="statusStore.playLoading"
        :focusable="false"
        :keyboard="false"
        class="play-pause"
        type="primary"
        strong
        secondary
        circle
        @click.stop="player.playOrPause()"
      >
        <template #icon>
          <Transition name="fade" mode="out-in">
            <SvgIcon :key="statusStore.playStatus ? 'Pause' : 'Play'" :name="statusStore.playStatus ? 'Pause' : 'Play'"
              :size="28" />
          </Transition>
        </template>
      </n-button>
      <!-- 下一曲 -->
      <div class="play-icon" v-debounce="() => player.nextOrPrev('next')">
        <SvgIcon :size="26" name="SkipNext" />
      </div>
    </div>
    <!-- 功能 -->
    <Transition name="fade" mode="out-in">
      <n-flex :key="statusStore.personalFmMode ? 'fm' : 'normal'" :size="[8, 0]" class="play-menu" justify="end">
        <!-- 播放时间 -->
        <div class="time">
          <n-text depth="2">{{ secondsToTime(statusStore.currentTime) }}</n-text>
          <n-text depth="2">{{ secondsToTime(statusStore.duration) }}</n-text>
        </div>
        <!-- 桌面歌词 -->
        <div v-if="isElectron" class="menu-icon" @click.stop="player.toggleDesktopLyric">
          <SvgIcon name="DesktopLyric" :depth="statusStore.showDesktopLyric ? 1 : 3" />
        </div>
        <!-- 播放模式 -->
        <n-dropdown v-if="musicStore.playSong.type !== 'radio' && !statusStore.personalFmMode"
          :options="playModeOptions" :show-arrow="true" @select="(mode) => player.togglePlayMode(mode)">
          <div class="menu-icon" @click.stop="player.togglePlayMode(false)">
            <SvgIcon :name="statusStore.playModeIcon" />
          </div>
        </n-dropdown>
        <!-- 音量调节 -->
        <n-popover :show-arrow="false" :style="{ padding: 0 }">
          <template #trigger>
            <div class="menu-icon" @click.stop="player.toggleMute" @wheel="player.setVolume">
              <SvgIcon :name="statusStore.playVolumeIcon" />
            </div>
          </template>
          <div class="volume-change" @wheel="player.setVolume">
            <n-slider v-model:value="statusStore.playVolume" :tooltip="false" :min="0" :max="1" :step="0.01" vertical
              @update:value="(val) => player.setVolume(val)" />
            <n-text class="slider-num">{{ statusStore.playVolumePercent }}%</n-text>
          </div>
        </n-popover>
        <!-- 播放列表 -->
        <n-badge v-if="!statusStore.personalFmMode" :value="dataStore.playList?.length ?? 0"
          :show="settingStore.showPlaylistCount" :max="999" :style="{
            marginRight: settingStore.showPlaylistCount ? '12px' : null,
          }">
          <div class="menu-icon" @click.stop="statusStore.playListShow = !statusStore.playListShow">
            <SvgIcon name="PlayList" />
          </div>
        </n-badge>
      </n-flex>
    </Transition>
  </div>
</template>

<script setup lang="ts">
import type { DropdownOption } from "naive-ui";
import { useMusicStore, useStatusStore, useDataStore, useSettingStore } from "@/stores";
import { renderIcon, coverLoaded, copyData } from "@/utils/helper";
import { toLikeSong } from "@/utils/auth";
import {
  openDownloadSong,
  openJumpArtist,
  openPlaylistAdd,
} from "@/utils/modal";
import { usePlayer } from "@/utils/player";

const router = useRouter();
const player = usePlayer();
const dataStore = useDataStore();
const musicStore = useMusicStore();
const statusStore = useStatusStore();
const settingStore = useSettingStore();

// 歌曲更多操作
const songMoreOptions = computed<DropdownOption[]>(() => {
  // 当前状态
  const song = musicStore.playSong;
  const isHasMv = !!song?.mv && song.mv !== 0;
  const isSong = song.type === "song";
  const isLocal = !!song?.path;
  return [
    {
      key: "more",
      label: "更多操作",
      icon: renderIcon("Menu", { size: 18 }),
      children: [
        {
          key: "code-name",
          label: `复制${song.type === "song" ? "歌曲" : "节目"}名称`,
          props: {
            onClick: () => copyData(song.name),
          },
          icon: renderIcon("Copy", { size: 18 }),
        },
        {
          key: "code-id",
          label: `复制${song.type === "song" ? "歌曲" : "节目"} ID`,
          show: !isLocal,
          props: {
            onClick: () => copyData(song.id),
          },
          icon: renderIcon("Copy", { size: 18 }),
        },
        {
          key: "share",
          label: `分享${song.type === "song" ? "歌曲" : "节目"}链接`,
          show: !isLocal,
          props: {
            onClick: () =>
              copyData(
                `https://music.163.com/#/${song.type}?id=${song.id}`,
                "已复制分享链接到剪切板",
              ),
          },
          icon: renderIcon("Share", { size: 18 }),
        },
      ],
    },
    {
      key: "search",
      label: "同名搜索",
      props: {
        onClick: () => router.push({ name: "search", query: { keyword: song.name } }),
      },
      icon: renderIcon("Search"),
    },
    {
      key: "line",
      type: "divider",
    },
    {
      key: "playlist-add",
      label: "添加到歌单",
      props: {
        onClick: () => openPlaylistAdd([song], isLocal),
      },
      icon: renderIcon("AddList"),
    },
    {
      key: "mv",
      label: "观看 MV",
      show: isSong && isHasMv,
      props: {
        onClick: () =>
          router.push({ name: "video", query: { id: musicStore.playSong.mv, type: "mv" } }),
      },
      icon: renderIcon("Video", { size: 18 }),
    },
    {
      key: "download",
      label: "下载歌曲",
      show: !isLocal && isSong,
      props: { onClick: () => openDownloadSong(musicStore.playSong) },
      icon: renderIcon("Download"),
    },
    {
      key: "comment",
      label: "查看评论",
      show: !isLocal,
      props: {
        onClick: () => {
          statusStore.$patch({
            showFullPlayer: true,
            showPlayerComment: true,
          });
        },
      },
      icon: renderIcon("Message"),
    },
  ];
});

// 是否展示歌词
const isShowLyrics = computed(() => {
  const isHasLrc = musicStore.isHasLrc;
  return (
    isHasLrc &&
    !statusStore.lyricLoading &&
    settingStore.barLyricShow &&
    musicStore.playSong.type !== "radio" &&
    statusStore.playStatus &&
    statusStore.lyricIndex !== -1
  );
});

// 当前实时歌词
const instantLyrics = computed(() => {
  const isYrc = musicStore.songLyric.yrcData?.length && settingStore.showYrc;
  const content = isYrc
    ? musicStore.songLyric.yrcData[statusStore.lyricIndex]
    : musicStore.songLyric.lrcData[statusStore.lyricIndex];
  const contentStr = content?.words?.map((v) => v.word).join("") || "";
  return content?.translatedLyric && settingStore.showTran
    ? `${contentStr}（ ${content?.translatedLyric} ）`
    : contentStr || "";
});

// 滑块拖拽结束
const sliderDragend = () => {
  player.play();
};

// 秒转时间
const secondsToTime = (seconds: number) => {
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = Math.floor(seconds % 60);
  return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
};

// 是否 Electron 环境
const isElectron = window.electron !== undefined;

// 播放模式选项
const playModeOptions = [
  { label: "列表循环", value: "repeat" },
  { label: "单曲循环", value: "repeatOnce" },
  { label: "随机播放", value: "shuffle" },
];
</script>

<style lang="scss" scoped>
.main-player {
  position: fixed;
  left: 0;
  bottom: -90px;
  height: 122px;
  padding: 0 15px;
  width: 100%;
  background-color: var(--surface-container-hex);
  // background-color: rgba(var(--surface-container), 0.28);
  display: grid;
  grid-template-columns: 1fr auto 1fr;
  align-items: center;
  transition: bottom 0.3s;
  z-index: 10;
  /* 为iOS设备底部控制键保留安全区域 */
  padding-bottom: 10px;
  &.show {
    bottom: 0;
  }
  .player-slider {
    position: absolute;
    width: 100%;
    height: 16px;
    top: 0;
    left: 0;
    margin: 0;
    --n-rail-height: 3px;
    --n-handle-size: 14px;
    // :deep(.n-slider-rail) {
    //   .n-slider-rail__fill {
    //     transition: width 0.3s;
    //   }
    //   .n-slider-handle-wrapper {
    //     transition: left 0.3s;
    //   }
    // }
  }
  .play-data {
    display: flex;
    flex-direction: row;
    overflow: hidden;
    max-width: 640px;
    .cover {
      position: relative;
      display: flex;
      align-items: center;
      justify-content: center;
      width: 55px;
      height: 55px;
      min-width: 55px;
      border-radius: 8px;
      overflow: hidden;
      margin-right: 12px;
      transition: opacity 0.2s;
      cursor: pointer;
      :deep(img) {
        width: 55px;
        height: 55px;
        opacity: 0;
        transition:
          transform 0.3s,
          opacity 0.3s,
          filter 0.3s;
      }
      .n-icon {
        position: absolute;
        color: #eee;
        opacity: 0;
        transform: scale(0.6);
        transition:
          opacity 0.3s,
          transform 0.3s;
      }
      &:hover {
        :deep(img) {
          transform: scale(1.2);
          filter: brightness(0.6) blur(2px);
        }
        .n-icon {
          opacity: 1;
          transform: scale(1);
        }
      }
      &:active {
        .n-icon {
          transform: scale(1.2);
        }
      }
    }
    .info {
      display: flex;
      flex-direction: column;
      flex: 1;
      min-width: 0;
      .data {
        display: flex;
        align-items: center;
        margin-top: 2px;
        .name {
          font-weight: bold;
          font-size: 16px;
          flex: 0 1 auto;
          width: auto;
          min-width: 0;
          transition: color 0.3s;
        }
        .n-tag {
          margin-left: 8px;
          flex-shrink: 0;
        }
        .like {
          color: var(--primary-hex);
          margin-left: 8px;
          transition: transform 0.3s;
          cursor: pointer;
          flex-shrink: 0;
          &:hover {
            transform: scale(1.15);
          }
          &:active {
            transform: scale(1);
          }
        }
        .more {
          margin-left: 8px;
          cursor: pointer;
          flex-shrink: 0;
        }
      }
      .artists {
        margin-top: 2px;
        display: -webkit-box;
        line-clamp: 1;
        -webkit-box-orient: vertical;
        -webkit-line-clamp: 1;
        overflow: hidden;
        word-break: break-all;
        .ar-item {
          display: inline-flex;
          transition: color 0.3s;
          cursor: pointer;
          &::after {
            content: "/";
            margin: 0 6px;
            opacity: 0.6;
            transition: none;
          }
          &:last-child {
            &::after {
              display: none;
            }
          }
          &:hover {
            color: var(--primary-hex);
            &::after {
              color: var(--n-close-icon-color);
            }
          }
        }
      }
      .lyric {
        margin-top: 2px;
      }
    }
  }
  .play-control {
    display: flex;
    flex-direction: row;
    justify-content: center;
    align-items: center;
    margin: 0 40px;
    .play-pause {
      --n-width: 44px;
      --n-height: 44px;
      margin: 0 12px;
      transition:
        background-color 0.3s,
        transform 0.3s;
      .n-icon {
        transition: opacity 0.1s ease-in-out;
      }
      &:hover {
        transform: scale(1.1);
      }
      &:active {
        transform: scale(1);
      }
    }
    .play-icon {
      display: flex;
      align-items: center;
      justify-content: center;
      width: 38px;
      height: 38px;
      border-radius: 50%;
      will-change: transform;
      transition:
        background-color 0.3s,
        transform 0.3s;
      cursor: pointer;
      .n-icon {
        color: var(--primary-hex);
      }
      &:hover {
        transform: scale(1.1);
        background-color: rgba(var(--primary), 0.16);
      }
      &:active {
        transform: scale(1);
      }
    }
  }
  .play-menu {
    margin-left: auto;
    max-width: 640px;
    .time-container {
      margin-right: 8px;
      .n-tag {
        justify-content: center;
        font-size: 12px;
      }
    }
    .time {
      display: flex;
      align-items: center;
      font-size: 12px;
      .n-text {
        color: var(--primary-hex);
        opacity: 0.8;
        &:nth-of-type(1) {
          &::after {
            content: "/";
            margin: 0 4px;
          }
        }
      }
    }
  }
}
</style>
