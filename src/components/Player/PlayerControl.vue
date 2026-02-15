<template>
  <div class="player-control">
    <Transition name="fade" mode="out-in">
      <div v-show="statusStore.playerMetaShow" class="control-content" @click.stop>
        <n-flex class="left" align="center">
          <!-- 收起 -->
          <div class="menu-icon" @click.stop="statusStore.showFullPlayer = false">
            <SvgIcon name="Down" />
          </div>
          <!-- 喜欢歌曲 -->
          <div
            v-if="
              musicStore.playSong.type !== 'radio' && settingStore.fullscreenPlayerElements.like
            "
            class="menu-icon"
            @click="toLikeSong(musicStore.playSong, !dataStore.isLikeSong(musicStore.playSong.id))"
          >
            <SvgIcon
              :name="dataStore.isLikeSong(musicStore.playSong.id) ? 'Favorite' : 'FavoriteBorder'"
            />
          </div>
          <!-- 添加到歌单 -->
          <div
            v-if="settingStore.fullscreenPlayerElements.addToPlaylist"
            class="menu-icon"
            @click.stop="openPlaylistAdd([musicStore.playSong], !!musicStore.playSong.path)"
          >
            <SvgIcon name="AddList" />
          </div>
          <!-- 下载 -->
          <div
            class="menu-icon"
            v-if="
              !musicStore.playSong.path &&
              statusStore.isDeveloperMode &&
              settingStore.fullscreenPlayerElements.download
            "
            @click.stop="openDownloadSong(musicStore.playSong)"
          >
            <SvgIcon name="Download" />
          </div>
          <!-- 显示评论 -->
          <div
            v-if="
              !musicStore.playSong.path &&
              !statusStore.pureLyricMode &&
              settingStore.fullscreenPlayerElements.comments
            "
            class="menu-icon"
            @click.stop="statusStore.showPlayerComment = !statusStore.showPlayerComment"
          >
            <SvgIcon :depth="statusStore.showPlayerComment ? 1 : 3" name="Message" />
          </div>
        </n-flex>
        <div class="center">
          <div class="btn">
            <!-- 随机按钮 -->
            <template v-if="musicStore.playSong.type !== 'radio' && !statusStore.personalFmMode">
              <div class="btn-icon mode-icon" @click.stop="player.toggleShuffle()">
                <SvgIcon
                  :name="statusStore.shuffleIcon"
                  :size="20"
                  :depth="statusStore.shuffleMode === 'off' ? 3 : 1"
                />
              </div>
            </template>
            <!-- 不喜欢 -->
            <div
              v-if="statusStore.personalFmMode"
              class="btn-icon"
              v-debounce="() => songManager.personalFMTrash(musicStore.personalFMSong?.id)"
            >
              <SvgIcon class="icon" :size="18" name="ThumbDown" />
            </div>
            <!-- 上一曲 -->
            <div v-else class="btn-icon" v-debounce="() => player.nextOrPrev('prev')">
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
                  <SvgIcon
                    :key="statusStore.playStatus ? 'Pause' : 'Play'"
                    :name="statusStore.playStatus ? 'Pause' : 'Play'"
                    :size="28"
                  />
                </Transition>
              </template>
            </n-button>
            <!-- 下一曲 -->
            <div class="btn-icon" v-debounce="() => player.nextOrPrev('next')">
              <SvgIcon :size="26" name="SkipNext" />
            </div>
            <!-- 循环按钮 -->
            <template v-if="musicStore.playSong.type !== 'radio' && !statusStore.personalFmMode">
              <div class="btn-icon mode-icon" @click.stop="player.toggleRepeat()">
                <SvgIcon
                  :name="statusStore.repeatIcon"
                  :size="20"
                  :depth="statusStore.repeatMode === 'off' ? 3 : 1"
                />
              </div>
            </template>
          </div>
          <!-- 进度条 -->
          <div :class="['slider', { 'automix-active': showAutomixFx }]" @animationend="onFxAnimationEnd">
            <span @click="toggleTimeFormat">{{ timeDisplay[0] }}</span>
            <PlayerSlider :show-tooltip="false" />
            <span @click="toggleTimeFormat">{{ timeDisplay[1] }}</span>
            <div v-if="showAutomixFx" :key="automixFxKey" class="automix-fx-text">混音</div>
          </div>
        </div>
        <n-flex class="right" align="center" justify="end">
          <!-- 功能区 -->
          <PlayerRightMenu />
        </n-flex>
      </div>
    </Transition>
  </div>
</template>

<script setup lang="ts">
import { usePlayerController } from "@/core/player/PlayerController";
import { useSongManager } from "@/core/player/SongManager";
import { useDataStore, useMusicStore, useStatusStore, useSettingStore } from "@/stores";
import { toLikeSong } from "@/utils/auth";
import { useTimeFormat } from "@/composables/useTimeFormat";
import { openDownloadSong, openPlaylistAdd } from "@/utils/modal";

const dataStore = useDataStore();
const musicStore = useMusicStore();
const statusStore = useStatusStore();
const settingStore = useSettingStore();

const songManager = useSongManager();
const player = usePlayerController();

const { timeDisplay, toggleTimeFormat } = useTimeFormat();

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
  () => statusStore.automixFxSeq,
  (seq, prev) => {
    if (!seq || seq === prev) return;
    void triggerAutomixFx(seq);
  },
);

const onFxAnimationEnd = () => {
  if (automixFxTimer !== null) {
    window.clearTimeout(automixFxTimer);
    automixFxTimer = null;
  }
  showAutomixFx.value = false;
};

onBeforeUnmount(() => {
  if (automixFxTimer !== null) {
    window.clearTimeout(automixFxTimer);
    automixFxTimer = null;
  }
});
</script>

<style lang="scss" scoped>
.player-control {
  position: absolute;
  bottom: 0;
  width: 100%;
  height: 80px;
  overflow: hidden;
  .control-content {
    width: 100%;
    height: 100%;
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    align-items: center;
  }
  .left,
  .right {
    opacity: 1;
    height: 100%;
    padding: 0 30px;
    transition: opacity 0.3s;
    :deep(.menu-icon) {
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 8px;
      border-radius: 8px;
      transition:
        background-color 0.3s,
        transform 0.3s;
      cursor: pointer;
      .n-icon {
        font-size: 24px;
        color: rgb(var(--main-cover-color));
      }
      &:hover {
        transform: scale(1.1);
        background-color: rgba(var(--main-cover-color), 0.14);
      }
      &:active {
        transform: scale(1);
      }
    }
    :deep(.right-menu) {
      .n-badge-sup {
        background-color: rgba(var(--main-cover-color), 0.14);
        .n-base-slot-machine {
          color: rgb(var(--main-cover-color));
        }
      }
      .quality-tag {
        color: rgb(var(--main-cover-color));
        background-color: transparent !important;
        border-color: rgba(var(--main-cover-color), 0.1) !important;
      }
    }
  }
  .center {
    height: 100%;
    max-height: 80px;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    .btn {
      display: flex;
      flex-direction: row;
      align-items: center;
      .btn-icon {
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
        margin: 0 4px;
        .n-icon {
          color: rgb(var(--main-cover-color));
        }
        &:hover {
          transform: scale(1.1);
          background-color: rgba(var(--main-cover-color), 0.14);
        }
        &:active {
          transform: scale(1);
        }
      }
      .play-pause {
        --n-width: 44px;
        --n-height: 44px;
        --n-color: rgba(var(--main-cover-color), 0.14);
        --n-color-hover: rgba(var(--main-cover-color), 0.2);
        --n-color-focus: rgba(var(--main-cover-color), 0.2);
        --n-color-pressed: rgba(var(--main-cover-color), 0.12);
        margin: 0 12px;
        transition:
          background-color 0.3s,
          transform 0.3s;
        .n-icon {
          color: rgb(var(--main-cover-color));
          transition: opacity 0.1s ease-in-out;
        }
        :deep(.n-base-loading) {
          color: rgb(var(--main-cover-color));
        }
        &:hover {
          transform: scale(1.1);
        }
        &:active {
          transform: scale(1);
        }
      }
    }
    .slider {
      display: flex;
      flex-direction: row;
      align-items: center;
      width: 100%;
      max-width: 480px;
      font-size: 12px;
      position: relative;
      .n-slider {
        margin: 6px 8px;
        --n-handle-size: 12px;
        --n-rail-height: 4px;
      }
      span {
        opacity: 0.6;
        cursor: pointer;
      }
    }
    .slider.automix-active {
      :deep(.n-slider-rail) {
        position: relative;
        overflow: hidden;
      }
      :deep(.n-slider-rail)::after {
        content: "";
        position: absolute;
        inset: 0;
        border-radius: 999px;
        background: rgba(var(--main-cover-color), 0.18);
        box-shadow:
          0 0 14px rgba(var(--main-cover-color), 0.65),
          0 0 28px rgba(var(--main-cover-color), 0.28);
        opacity: 0;
        clip-path: inset(0 100% 0 0);
        animation: automix-rail 1400ms ease-out forwards;
      }
      .automix-fx-text {
        position: absolute;
        left: 50%;
        top: 50%;
        transform: translate(-50%, -160%);
        text-align: center;
        font-size: 12px;
        font-weight: 600;
        letter-spacing: 0.2em;
        color: rgba(var(--main-cover-color), 0.95);
        filter: drop-shadow(0 0 10px rgba(var(--main-cover-color), 0.55));
        opacity: 0;
        clip-path: inset(0 100% 0 0);
        animation: automix-text 1400ms ease-out forwards;
        pointer-events: none;
      }
    }
  }
  &:hover {
    .left,
    .right {
      opacity: 1;
    }
  }
}

@keyframes automix-rail {
  0% {
    opacity: 0;
    clip-path: inset(0 100% 0 0);
  }
  14% {
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
</style>
