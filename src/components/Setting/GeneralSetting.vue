<!-- 常规设置 -->
<template>
  <div class="setting-type">
    <div class="set-list">
      <n-h3 prefix="bar"> 主题设置 </n-h3>
      <n-card class="set-item">
        <div class="label">
          <n-text class="name">主题模式</n-text>
          <n-text class="tip" :depth="3">调整全局主题明暗模式</n-text>
        </div>
        <n-select
          v-model:value="settingStore.themeMode"
          class="set"
          :options="[
            {
              label: '跟随系统',
              value: 'auto',
            },
            {
              label: '浅色模式',
              value: 'light',
            },
            {
              label: '深色模式',
              value: 'dark',
            },
          ]"
        />
      </n-card>
      <n-card class="set-item">
        <div class="label">
          <n-text class="name">全局主题色</n-text>
          <n-text class="tip" :depth="3">更改全局主题色</n-text>
        </div>
        <n-select
          v-model:value="settingStore.themeColorType"
          class="set"
          :disabled="settingStore.themeFollowCover"
          :options="themeColorOptions"
        />
      </n-card>
      <n-collapse-transition
        :show="settingStore.themeColorType === 'custom' && !settingStore.themeFollowCover"
      >
        <n-card class="set-item">
          <div class="label">
            <n-text class="name">自定义主题色</n-text>
            <n-text class="tip" :depth="3">可在此处自定义全局主题色</n-text>
          </div>
          <n-color-picker
            v-model:value="settingStore.themeCustomColor"
            class="set"
            :show-alpha="false"
            :modes="['hex']"
          />
        </n-card>
      </n-collapse-transition>
      <n-card class="set-item">
        <div class="label">
          <n-text class="name">全局着色</n-text>
          <n-text class="tip" :depth="3">是否将主题色应用至所有元素</n-text>
        </div>
        <n-switch
          v-model:value="settingStore.themeGlobalColor"
          class="set"
          :round="false"
          @update:value="themeGlobalColorChange"
        />
      </n-card>
      <n-card class="set-item">
        <div class="label">
          <n-text class="name">全局动态取色</n-text>
          <n-text class="tip" :depth="3">主题色是否跟随封面，目前感觉不好看</n-text>
        </div>
        <n-switch
          v-model:value="settingStore.themeFollowCover"
          :disabled="isEmpty(statusStore.songCoverTheme)"
          class="set"
          :round="false"
        />
      </n-card>
    </div>
    <div class="set-list">
      <n-h3 prefix="bar"> 杂项设置 </n-h3>
      <n-card class="set-item">
        <div class="label">
          <n-text class="name">手机模式</n-text>
          <n-text class="tip" :depth="3">切换至iPhone 13 Pro尺寸的手机模式</n-text>
        </div>
        <n-switch class="set" v-model:value="settingStore.isMobileMode" :round="false" @update:value="toggleMobileMode" />
      </n-card>
      <n-card class="set-item">
        <div class="label">
          <n-text class="name">显示搜索历史</n-text>
        </div>
        <n-switch class="set" v-model:value="settingStore.showSearchHistory" :round="false" />
      </n-card>
      <n-card class="set-item">
        <div class="label">
          <n-text class="name">侧边栏显示封面</n-text>
          <n-text class="tip" :depth="3">是否显示歌单的封面，如果有</n-text>
        </div>
        <n-switch class="set" v-model:value="settingStore.menuShowCover" :round="false" />
      </n-card>
      <n-card class="set-item">
        <div class="label">
          <n-text class="name">开启页面缓存</n-text>
          <n-text class="tip" :depth="3">是否开启部分页面的缓存，这将会增加内存占用</n-text>
        </div>
        <n-switch class="set" v-model:value="settingStore.useKeepAlive" :round="false" />
      </n-card>
      <n-card class="set-item">
        <div class="label">
          <n-text class="name">页面切换动画</n-text>
          <n-text class="tip" :depth="3">选择页面切换时的动画效果</n-text>
        </div>
        <n-select
          v-model:value="settingStore.routeAnimation"
          :options="[
            {
              label: '无动画',
              value: 'none',
            },
            {
              label: '淡入淡出',
              value: 'fade',
            },
            {
              label: '缩放',
              value: 'zoom',
            },
            {
              label: '滑动',
              value: 'slide',
            },
            {
              label: '上浮',
              value: 'up',
            },
          ]"
          class="set"
        />
      </n-card>
    </div>
    <div v-if="isElectron" class="set-list">
      <n-h3 prefix="bar"> 系统设置 </n-h3>
      <n-card class="set-item">
        <div class="label">
          <n-text class="name">在线服务</n-text>
          <n-text class="tip" :depth="3">是否开启软件的在线服务</n-text>
        </div>
        <n-switch
          class="set"
          :disabled="true"
          :value="useOnlineService"
          :round="false"
          @update:value="modeChange"
        />
      </n-card>
      <n-card class="set-item">
        <div class="label">
          <n-text class="name">自定义字体</n-text>
          <n-text class="tip" :depth="3"> 更改软件内全局字体 </n-text>
        </div>
        <n-flex>
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
          <n-select v-model:value="settingStore.globalFont" :options="allFontsData" class="set" />
        </n-flex>
      </n-card>
      <n-card class="set-item">
        <div class="label">
          <n-text class="name">歌词区域字体</n-text>
          <n-text class="tip" :depth="3"> 是否独立更改歌词区域字体 </n-text>
        </div>
        <n-flex>
          <Transition name="fade" mode="out-in">
            <n-button
              v-if="settingStore.LyricFont !== 'follow'"
              type="primary"
              strong
              secondary
              @click="settingStore.LyricFont = 'follow'"
            >
              恢复默认
            </n-button>
          </Transition>
          <n-select
            v-model:value="settingStore.LyricFont"
            :options="[
              { label: '跟随全局', value: 'follow' },
              ...allFontsData.filter((v) => v.value !== 'default'),
            ]"
            class="set"
          />
        </n-flex>
      </n-card>
      <n-card class="set-item">
        <div class="label">
          <n-text class="name">关闭软件时</n-text>
          <n-text class="tip" :depth="3">选择关闭软件的方式</n-text>
        </div>
        <n-select
          v-model:value="settingStore.closeAppMethod"
          :disabled="settingStore.showCloseAppTip"
          :options="[
            {
              label: '最小化到任务栏',
              value: 'hide',
            },
            {
              label: '直接退出',
              value: 'close',
            },
          ]"
          class="set"
        />
      </n-card>
      <n-card class="set-item">
        <div class="label">
          <n-text class="name">每次关闭前都进行提醒</n-text>
        </div>
        <n-switch v-model:value="settingStore.showCloseAppTip" class="set" :round="false" />
      </n-card>
      <n-card class="set-item">
        <div class="label">
          <n-text class="name">任务栏显示播放进度</n-text>
          <n-text class="tip" :depth="3"> 是否在任务栏显示歌曲播放进度 </n-text>
        </div>
        <n-switch
          v-model:value="settingStore.showTaskbarProgress"
          class="set"
          :round="false"
          @update:value="closeTaskbarProgress"
        />
      </n-card>
      <n-card class="set-item">
        <div class="label">
          <n-text class="name">阻止系统息屏</n-text>
          <n-text class="tip" :depth="3">是否在播放界面阻止系统息屏</n-text>
        </div>
        <n-switch v-model:value="settingStore.preventSleep" class="set" :round="false" />
      </n-card>
      <n-card class="set-item">
        <div class="label">
          <n-text class="name">自动检查更新</n-text>
          <n-text class="tip" :depth="3">在每次开启软件时自动检查更新</n-text>
        </div>
        <n-switch v-model:value="settingStore.checkUpdateOnStart" class="set" :round="false" />
      </n-card>
      <n-card class="set-item">
        <div class="label">
          <n-text class="name">全局背景图片</n-text>
          <n-text class="tip" :depth="3">设置应用全局背景图片</n-text>
        </div>
        <n-flex vertical justify="center" align="center" class="custom-bg-container">
          <n-image
            v-if="settingStore.customGlobalBackgroundImage"
            :src="settingStore.customGlobalBackgroundImage"
            width="200"
            height="120"
            object-fit="cover"
            preview-disabled
            class="custom-bg-preview"
          />
          <n-flex justify="center" align="center" class="custom-bg-actions">
            <n-button type="primary" @click="chooseBackgroundImage">
              <template #icon>
                <SvgIcon name="Upload" />
              </template>
              选择图片
            </n-button>
            <n-button
              v-if="settingStore.customGlobalBackgroundImage"
              type="error"
              @click="clearBackgroundImage"
            >
              <template #icon>
                <SvgIcon name="Delete" />
              </template>
              清除图片
            </n-button>
          </n-flex>
          <n-card v-if="settingStore.customGlobalBackgroundImage" class="set-item nested" style="width: 100%; margin-top: 16px;">
            <div class="label">
              <n-text class="name">背景图透明度</n-text>
              <n-text class="tip" :depth="3">调整背景图片的透明度</n-text>
            </div>
            <n-slider
              v-model:value="settingStore.globalBackgroundOpacity"
              :min="0"
              :max="1"
              :step="0.01"
              :tooltip="true"
              :format-tooltip="value => `${Math.round(value * 100)}%`"
            />
          </n-card>
        </n-flex>
      </n-card>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { SelectOption } from "naive-ui";
import { useMusicStore, useSettingStore, useStatusStore } from "@/stores";
import { isElectron } from "@/utils/helper";
import { isEmpty } from "lodash-es";
import themeColor from "@/assets/data/themeColor.json";
import player from "@/utils/player";

// 切换手机模式
const toggleMobileMode = (val: boolean) => {
  settingStore.toggleMobileMode(val);
};

const musicStore = useMusicStore();
const settingStore = useSettingStore();
const statusStore = useStatusStore();

// 全部字体
const allFontsData = ref<SelectOption[]>([]);

// 是否开启在线服务
const useOnlineService = ref(settingStore.useOnlineService);

// 全局主题色配置
const themeColorOptions: SelectOption[] = [
  // { label: "关闭主题色", value: "close" },
  ...Object.keys(themeColor).map((key) => ({
    value: key,
    label: themeColor[key].name,
    style: {
      color: themeColor[key].color,
    },
  })),
];

// 关闭任务栏进度
const closeTaskbarProgress = (val: boolean) => {
  if (!val) window.electron.ipcRenderer.send("set-bar", "none");
};

// 获取全部系统字体
const getAllSystemFonts = async () => {
  const allFonts = await window.electron.ipcRenderer.invoke("get-all-fonts");
  allFonts.map((v: string) => {
    // 去除前后的引号
    v = v.replace(/^['"]+|['"]+$/g, "");
    allFontsData.value.push({
      label: v,
      value: v,
      style: {
        fontFamily: v,
      },
    });
  });
  // 添加默认选项
  allFontsData.value.unshift({
    label: "系统默认",
    value: "default",
    style: {
      fontFamily:
        "v-sans, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif, 'Apple Color Emoji', 'Segoe UI Emoji', 'Segoe UI Symbol'",
    },
  });
};

// 在线模式切换
const modeChange = (val: boolean) => {
  if (val) {
    window.$dialog.warning({
      title: "开启在线服务",
      content: "确定开启软件的在线服务？更改将在重启后生效！",
      positiveText: "开启",
      negativeText: "取消",
      onPositiveClick: () => {
        useOnlineService.value = true;
        settingStore.useOnlineService = true;
      },
    });
  } else {
    window.$dialog.warning({
      title: "关闭在线服务",
      content:
        "确定关闭软件的在线服务？将关闭包括搜索、登录、在线音乐播放等在内的全部在线服务，软件将会变为本地播放器！更改将在软件重启后生效！",
      positiveText: "关闭",
      negativeText: "取消",
      onPositiveClick: () => {
        useOnlineService.value = false;
        settingStore.useOnlineService = false;
        // 重启
        window.electron.ipcRenderer.send("win-reload");
      },
      onNegativeClick: () => {
        useOnlineService.value = true;
        settingStore.useOnlineService = true;
      },
    });
  }
};

// 全局着色更改
const themeGlobalColorChange = (val: boolean) => {
  if (val) player.getCoverColor(musicStore.songCover);
};

// 选择背景图片
const chooseBackgroundImage = async () => {
  if (!isElectron) {
    window.$message.warning("该功能仅在桌面版可用");
    return;
  }
  try {
    const imagePath = await window.electron.ipcRenderer.invoke("choose-image");
    if (imagePath) {
      settingStore.customGlobalBackgroundImage = imagePath;
      window.$message.success("背景图片设置成功");
    }
  } catch (error) {
    console.error("选择背景图片失败", error);
    window.$message.error("选择背景图片失败");
  }
};

// 清除背景图片
const clearBackgroundImage = () => {
  settingStore.customGlobalBackgroundImage = "";
  window.$message.success("已清除背景图片");
};

onMounted(() => {
  if (isElectron) {
    getAllSystemFonts();
  }
});
</script>

<style lang="scss" scoped>
.custom-bg-container {
  width: 100%;
  margin-top: 16px;

  .custom-bg-preview {
    margin-bottom: 16px;
    border-radius: 8px;
    overflow: hidden;
  }

  .custom-bg-actions {
    gap: 16px;
  }
}
</style>
