<template>
  <div class="font-manager">
    <div class="set-list">
      <n-h3 prefix="bar">通用字体</n-h3>
      <n-card v-if="isElectron" class="set-item">
        <div class="label">
          <n-text class="name">自定义 CSS 字体</n-text>
          <n-text class="tip" :depth="3"> 开启后可手动输入字体名称，支持 CSS 字体族 </n-text>
        </div>
        <n-switch v-model:value="settingStore.useCustomFont" class="set" :round="false" />
      </n-card>
      <n-card class="set-item">
        <div class="label">
          <n-text class="name">全局字体</n-text>
          <n-text class="tip" :depth="3">应用到软件内所有非特定区域的字体</n-text>
        </div>
        <n-flex align="center">
          <Transition name="fade" mode="out-in">
            <n-button
              v-if="settingStore.globalFont !== 'default'"
              type="primary"
              strong
              secondary
              @click="settingStore.globalFont = 'default'"
            >
              恢复默认
            </n-button>
          </Transition>
          <s-input
            v-if="settingStore.useCustomFont || !isElectron"
            v-model:value="settingStore.globalFont"
            :update-value-on-input="false"
            placeholder="输入字体名称"
            class="set"
          />
          <n-select
            v-else
            v-model:value="settingStore.globalFont"
            :options="getOptions('globalFont')"
            class="set"
            filterable
          />
        </n-flex>
      </n-card>
    </div>

    <div class="set-list">
      <n-h3 prefix="bar">歌词字体</n-h3>
      <n-card v-for="font in lyricFontConfigs" :key="font.keySetting" class="set-item">
        <div class="label">
          <n-text class="name">{{ font.name }}</n-text>
          <n-text class="tip" :depth="3">{{ font.tip }}</n-text>
        </div>
        <n-flex align="center">
          <Transition name="fade" mode="out-in">
            <n-button
              v-if="settingStore[font.keySetting] !== font.default"
              type="primary"
              strong
              secondary
              @click="settingStore[font.keySetting] = font.default"
            >
              恢复默认
            </n-button>
          </Transition>
          <s-input
            v-if="settingStore.useCustomFont || !isElectron"
            v-model:value="settingStore[font.keySetting]"
            :update-value-on-input="false"
            placeholder="输入字体名称"
            class="set"
          />
          <n-select
            v-else
            v-model:value="settingStore[font.keySetting]"
            :options="getOptions(font.keySetting)"
            class="set"
            filterable
          />
        </n-flex>
      </n-card>
    </div>
  </div>
</template>

<script setup lang="ts">
import { useSettingStore } from "@/stores";
import { isElectron } from "@/utils/env";
import type { SelectOption } from "naive-ui";
import { lyricFontConfigs } from "@/utils/lyricFontConfig";

const settingStore = useSettingStore();

// 系统字体选项
const systemFonts = ref<SelectOption[]>([]);

// 获取下拉选项
const getOptions = (key: string) => {
  const isGlobal = key === "globalFont";
  const defaultLabel = isGlobal ? "系统默认" : "跟随全局";
  const defaultValue = isGlobal ? "default" : "follow";

  return [{ label: defaultLabel, value: defaultValue }, ...systemFonts.value];
};

// 获取全部系统字体
const getAllSystemFonts = async () => {
  if (!isElectron) return;
  try {
    const allFonts = await window.electron.ipcRenderer.invoke("get-all-fonts");
    systemFonts.value = allFonts.map((v: string) => {
      const name = v.replace(/^['"]+|['"]+$/g, "");
      return {
        label: name,
        value: name,
        style: {
          fontFamily: name,
        },
      };
    });
  } catch (error) {
    console.error("Failed to get system fonts:", error);
  }
};

onMounted(() => {
  getAllSystemFonts();
});
</script>

<style lang="scss" scoped>
.font-manager {
  .set-list {
    margin-bottom: 24px;
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
    :deep(.n-card__content) {
      display: flex;
      flex-direction: row;
      align-items: center;
      justify-content: space-between;
      padding: 16px;
    }
    .label {
      display: flex;
      flex-direction: column;
      padding-right: 20px;
      .name {
        font-size: 16px;
      }
    }
    .n-flex {
      flex-flow: nowrap !important;
    }
    .set {
      justify-content: flex-end;
      width: 200px;
      &.n-switch {
        width: max-content;
      }
      @media (max-width: 768px) {
        width: 140px;
        min-width: 140px;
      }
    }
  }
}
</style>
