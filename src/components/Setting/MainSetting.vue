<template>
  <div class="setting">
    <div class="set-left">
      <n-flex class="title" :size="0" vertical>
        <n-h1>设置</n-h1>
        <n-text :depth="3">个性化与全局设置</n-text>
      </n-flex>
      <!-- 设置菜单 -->
      <n-menu
        v-model:value="activeKey"
        :options="menuOptions"
        :indent="10"
        @update:value="setScrollbar?.scrollTo({ top: 0, behavior: 'smooth' })"
      />
      <!-- 信息 -->
      <div class="power">
        <n-text class="author" :depth="2" @click="toGithub">
          <SvgIcon name="Github" :size="20" />
          {{ packageJson.author }}
        </n-text>
        <n-text class="name">SPlayer</n-text>
        <n-tag v-if="statusStore.isDeveloperMode" class="version" size="small" type="warning" round>
          DEV · v{{ packageJson.version }}
        </n-tag>
        <n-text v-else class="version" depth="3">v{{ packageJson.version }}</n-text>
      </div>
    </div>
    <n-scrollbar
      ref="setScrollbar"
      class="set-content"
      :content-style="{ overflow: 'hidden', padding: '40px 0' }"
    >
      <Transition name="fade" mode="out-in">
        <!-- 常规 -->
        <GeneralSetting v-if="activeKey === 'general'" key="general" />
        <!-- 播放 -->
        <PlaySetting v-else-if="activeKey === 'play'" key="play" />
        <!-- 歌词 -->
        <LyricsSetting v-else-if="activeKey === 'lyrics'" :scroll-to="props.scrollTo" />
        <!-- 快捷键 -->
        <KeyboardSetting v-else-if="activeKey === 'keyboard'" key="keyboard" />
        <!-- 本地 -->
        <LocalSetting v-else-if="activeKey === 'local'" />
        <!-- 第三方 -->
        <ThirdSetting v-else-if="activeKey === 'third'" />
        <!-- 其他 -->
        <OtherSetting v-else-if="activeKey === 'other'" key="other" />
        <!-- 关于 -->
        <AboutSetting v-else-if="activeKey === 'about'" key="about" />
        <!-- 空白 -->
        <n-text v-else class="error" key="error">暂无该设置项</n-text>
      </Transition>
    </n-scrollbar>
  </div>
</template>

<script setup lang="ts">
import type { MenuOption, NScrollbar } from "naive-ui";
import type { SettingType } from "@/types/main";
import { renderIcon } from "@/utils/helper";
import { isElectron } from "@/utils/env";
import { useStatusStore } from "@/stores";
import packageJson from "@/../package.json";

const props = defineProps<{ type: SettingType; scrollTo?: string }>();

const statusStore = useStatusStore();

// 设置内容
const setScrollbar = ref<InstanceType<typeof NScrollbar> | null>(null);

// 菜单数据
const activeKey = ref<SettingType>(props.type);

// 菜单内容
const menuOptions: MenuOption[] = [
  {
    key: "general",
    label: "常规设置",
    icon: renderIcon("SettingsLine"),
  },
  {
    key: "play",
    label: "播放设置",
    icon: renderIcon("Music"),
  },
  {
    key: "lyrics",
    label: "歌词设置",
    icon: renderIcon("Lyrics"),
  },
  {
    key: "keyboard",
    label: "快捷键设置",
    show: isElectron,
    icon: renderIcon("Keyboard"),
  },
  {
    key: "local",
    label: "本地与缓存",
    show: isElectron,
    icon: renderIcon("Storage"),
  },
  {
    key: "third",
    label: "连接与集成",
    icon: renderIcon("Extension"),
  },
  {
    key: "other",
    label: "其他设置",
    icon: renderIcon("SettingsOther"),
  },
  {
    key: "about",
    label: "关于",
    icon: renderIcon("Info"),
  },
];

// 跳转
const toGithub = () => {
  window.open(packageJson.github);
};
</script>

<style lang="scss" scoped>
.setting {
  display: flex;
  width: 100%;
  height: 75vh;
  min-height: 75vh;
  @media (max-width: 768px) {
    flex-direction: column;
    height: 100vh;
    min-height: 100vh;
  }
  .set-left {
    display: flex;
    flex-direction: column;
    width: 280px;
    height: 100%;
    padding: 20px;
    background-color: var(--surface-container-hex);
    @media (max-width: 768px) {
      width: 100%;
      height: auto;
      padding: 12px 12px 0;
      border-bottom: 1px solid rgba(var(--outline), 0.12);
    }
    .title {
      margin: 10px 0 20px 10px;
      .n-h1 {
        font-size: 26px;
        font-weight: bold;
        margin-top: 0;
        line-height: normal;
        margin-bottom: 6px;
      }
      @media (max-width: 768px) {
        margin: 4px 0 10px 6px;
        .n-h1 {
          font-size: 20px;
          margin-bottom: 2px;
        }
      }
    }
    .n-menu {
      width: 100%;
      padding: 0;
      @media (max-width: 768px) {
        margin-top: 6px;
      }
    }
    .power {
      margin: auto 0 0 10px;
      @media (max-width: 768px) {
        display: none;
      }
      .name {
        font-weight: bold;
        margin-right: 6px;
      }
      .version {
        pointer-events: none;
      }
      .author {
        display: flex;
        flex-direction: row;
        align-items: center;
        margin-bottom: 4px;
        cursor: pointer;
        .n-icon {
          margin-right: 4px;
        }
      }
    }
  }
}
</style>

<style lang="scss">
.main-setting {
  position: relative;
  width: calc(100vw - 40px);
  max-width: 1024px !important;
  overflow: hidden;
  @media (max-width: 768px) {
    width: 100vw;
    max-width: 100vw !important;
    height: 100vh;
    max-height: 100vh;
  }
  .n-card-header {
    position: absolute;
    top: 0;
    right: 0;
    padding: 20px;
    z-index: 1;
    @media (max-width: 768px) {
      padding: 12px;
    }
  }
  .n-card__content {
    padding: 0;
    .setting-type {
      transition: opacity 0.2s ease-in-out;
    }
    .set-content {
      flex: 1;
      padding: 0 40px;
      background-color: var(--background-hex);
      @media (max-width: 768px) {
        padding: 0 12px;
        height: calc(100vh - 170px);
      }
    }
    .set-list {
      margin-bottom: 30px;
      &:last-child {
        margin-bottom: 0;
      }
    }
    .n-h {
      display: inline-flex;
      flex-direction: row;
      align-items: center;
      gap: 8px;
    }
    .n-collapse-transition {
      margin-bottom: 12px;
      &:last-child {
        margin-bottom: 0;
      }
    }
    .set-item {
      width: 100%;
      border-radius: 8px;
      margin-bottom: 12px;
      transition: margin 0.3s;
      &:last-child {
        margin-bottom: 0;
      }
      .n-card__content {
        display: flex;
        flex-direction: row;
        align-items: center;
        justify-content: space-between;
        padding: 16px;
        @media (max-width: 768px) {
          flex-direction: column;
          align-items: stretch;
          gap: 12px;
        }
      }
      .label {
        display: flex;
        flex-direction: column;
        padding-right: 20px;
        .name {
          font-size: 16px;
        }
        @media (max-width: 768px) {
          padding-right: 0;
          .name {
            font-size: 15px;
          }
        }
      }
      .n-flex {
        flex-flow: nowrap !important;
      }
      .set {
        justify-content: flex-end;
        min-width: 200px;
        width: 200px;
        &.n-switch {
          width: max-content;
        }
        @media (max-width: 768px) {
          width: 100%;
          min-width: 0;
          justify-content: flex-start;
        }
      }
    }
  }
  .n-menu {
    .n-menu-item-content {
      &::before {
        left: 0px;
        right: 0;
        width: 100%;
        border-radius: 6px;
      }
    }
  }
}
</style>
