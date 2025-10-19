<template>
  <n-flex :size="8" align="center" class="right-menu">
    <n-badge v-if="isElectron" value="ON" :show="statusStore.showDesktopLyric">
      <div class="menu-icon" @click.stop="player.toggleDesktopLyric">
        <SvgIcon name="DesktopLyric2" :depth="statusStore.showDesktopLyric ? 1 : 3" />
      </div>
    </n-badge>
    <!-- 其他控制 -->
    <n-dropdown :options="controlsOptions" :show-arrow="false">
      <div class="menu-icon">
        <SvgIcon name="Controls" />
      </div>
    </n-dropdown>
    <!-- 播放模式 -->
    <n-dropdown
      v-if="musicStore.playSong.type !== 'radio' && !statusStore.personalFmMode"
      :options="playModeOptions"
      :show-arrow="false"
      @select="(mode) => player.togglePlayMode(mode)"
    >
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
        <n-slider
          v-model:value="statusStore.playVolume"
          :tooltip="false"
          :min="0"
          :max="1"
          :step="0.01"
          vertical
          @update:value="(val) => player.setVolume(val)"
        />
        <n-text class="slider-num">{{ statusStore.playVolumePercent }}%</n-text>
      </div>
    </n-popover>
    <!-- 播放列表 -->
    <n-badge
      v-if="!statusStore.personalFmMode"
      :value="dataStore.playList?.length ?? 0"
      :show="settingStore.showPlaylistCount"
      :max="999"
      :style="{
        marginRight: settingStore.showPlaylistCount ? '12px' : null,
      }"
    >
      <div class="menu-icon" @click.stop="statusStore.playListShow = !statusStore.playListShow">
        <SvgIcon name="PlayList" />
      </div>
    </n-badge>
  </n-flex>
  <!-- 播放速度设置弹窗 -->
  <n-modal
    v-model:show="showRateModal"
    :bordered="false"
    :auto-focus="false"
    :title="`播放速度`"
    style="width: 600px"
    preset="card"
  >
    <n-flex align="center" size="large" vertical>
      <n-flex align="center" justify="center">
        <n-tag
          v-for="(item, index) in [0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2]"
          :type="statusStore.playRate === item ? 'primary' : 'default'"
          :bordered="statusStore.playRate === item"
          :key="index"
          size="large"
          round
          @click="player.setRate(item)"
        >
          {{ item }}x
        </n-tag>
      </n-flex>
      <n-text :depth="3"> 当前播放速度： {{ statusStore.playRate }}x </n-text>
      <n-slider
        v-model:value="statusStore.playRate"
        :step="0.1"
        :min="0.2"
        :max="2"
        :tooltip="false"
        :marks="{
          0.2: '0.2x',
          1: '1x',
          2: '2x',
        }"
        @update:value="(value) => player.setRate(value)"
      />
    </n-flex>
  </n-modal>
</template>

<script setup lang="ts">
import type { DropdownOption } from "naive-ui";
import { useMusicStore, useStatusStore, useDataStore, useSettingStore } from "@/stores";
import { isElectron, renderIcon } from "@/utils/helper";
import player from "@/utils/player";

const dataStore = useDataStore();
const musicStore = useMusicStore();
const statusStore = useStatusStore();
const settingStore = useSettingStore();

// 速度设置弹窗
const showRateModal = ref<boolean>(false);

// 播放模式数据
const playModeOptions = ref([
  {
    label: "列表循环",
    key: "repeat",
    icon: renderIcon("Repeat"),
  },
  {
    label: "单曲循环",
    key: "repeat-once",
    icon: renderIcon("RepeatSong"),
  },
  {
    label: "随机播放",
    key: "shuffle",
    icon: renderIcon("Shuffle"),
  },
]);

// 其他控制：播放速度下拉菜单
const controlsOptions = computed<DropdownOption[]>(() => [
  {
    label: "播放速度",
    key: "rate",
    props: {
      onClick: () => {
        showRateModal.value = true;
      },
    },
  },
]);
</script>

<style scoped lang="scss">
.right-menu {
  .menu-icon {
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
      font-size: 22px;
      color: var(--primary-hex);
    }
    &:hover {
      transform: scale(1.1);
      background-color: rgba(var(--primary), 0.28);
    }
    &:active {
      transform: scale(1);
    }
  }
  :deep(.n-badge-sup) {
    background-color: rgba(var(--primary), 0.28);
    backdrop-filter: blur(20px);
    // font-size: 10px;
    .n-base-slot-machine {
      color: var(--primary-hex);
    }
  }
}
.volume-change {
  padding: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
  .slider-num {
    margin-left: 12px;
    font-size: 13px;
    color: var(--color);
  }
}
</style>
