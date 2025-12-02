<template>
  <div class="download-song">
    <n-collapse-transition :show="!songData">
      <n-text class="loading"> 正在加载歌曲信息... </n-text>
    </n-collapse-transition>
    <n-collapse-transition :show="!!songData">
      <n-alert
        :type="isCloudSong ? 'info' : 'warning'"
        :title="isCloudSong ? undefined : '请知悉'"
        closable
      >
        {{
          isCloudSong
            ? "当前为云盘歌曲，下载的文件均为上传时的源文件"
            : "本软件仅支持从官方途径合法合规的下载歌曲，并用于学习研究用途。本功能将严格按照相应账户的权限来提供基础的下载功能"
        }}
      </n-alert>
      <SongDataCard :data="songData" />
      <n-collapse :default-expanded-names="['path']" arrow-placement="right">
        <n-collapse-item title="音质选择" name="level">
          <!-- 音质选择 -->
          <n-radio-group v-model:value="songLevelChoosed" name="level">
            <n-flex>
              <n-radio v-for="(item, index) in songLevelRadioData" :key="index" :value="item.value">
                <n-flex>
                  <n-text class="name">{{ item.name }}</n-text>
                  <!-- 文件预估大小 -->
                  <n-text depth="3">{{ formatFileSize(item.size || 0) }}</n-text>
                </n-flex>
              </n-radio>
            </n-flex>
          </n-radio-group>
        </n-collapse-item>
        <n-collapse-item v-if="isElectron" title="本次下载路径" name="path">
          <n-input-group>
            <n-input :value="downloadPath || '未配置下载目录'" disabled>
              <template #prefix>
                <SvgIcon name="Folder" />
              </template>
            </n-input>
            <n-button type="primary" strong secondary @click="changeDownloadPath">
              <template #icon>
                <SvgIcon name="Folder" />
              </template>
            </n-button>
            <n-button type="primary" strong secondary @click="openSetting('local')">
              <template #icon>
                <SvgIcon name="Settings" />
              </template>
              更多设置
            </n-button>
          </n-input-group>
        </n-collapse-item>
      </n-collapse>
    </n-collapse-transition>
    <n-flex class="menu" justify="end">
      <n-button strong secondary @click="emit('close')"> 取消 </n-button>
      <n-button :loading="loading" type="primary" @click="download"> 下载歌曲 </n-button>
    </n-flex>
  </div>
</template>

<script setup lang="ts">
import type { SongLevelType, SongLevelDataType, SongType } from "@/types/main";
import { songDetail, songQuality } from "@/api/song";
import { useSettingStore } from "@/stores";
import { songLevelData, getLevelsUpTo } from "@/utils/meta";
import { formatSongsList } from "@/utils/format";
import { reduce } from "lodash-es";
import { formatFileSize } from "@/utils/helper";
import { openSetting } from "@/utils/modal";
import { isElectron } from "@/utils/env";
import { downloadSong } from "@/utils/download";

const props = defineProps<{ id: number }>();
const emit = defineEmits<{ close: [] }>();

const settingStore = useSettingStore();

// 歌曲数据
const songData = ref<SongType | null>(null);

// 下载数据
const loading = ref<boolean>(false);
const downloadPath = ref<string>(settingStore.downloadPath);
const songLevelChoosed = ref<SongLevelType>("h");
const songLevelRadioData = ref<SongLevelDataType[]>([]);

// 是否为云盘歌曲
const isCloudSong = computed(() => songData.value && songData.value?.pc);

// 获取歌曲详情
const getSongDetail = async (): Promise<any> => {
  if (!props.id) return;
  const result = await songDetail(props.id);
  songData.value = formatSongsList(result.songs)[0];
  // 获取音质信息
  const quality = await songQuality(props.id);
  console.log(quality);
  // 获取下载信息
  const level = getLevelsUpTo(result?.privileges?.[0]?.downloadMaxBrLevel);
  if (!level) return window.$message.error("获取下载信息失败，请重试");
  songLevelRadioData.value = getSongLevelsData(level, quality?.data);
};

// 获取音质列表
const getSongLevelsData = (
  level: Partial<typeof songLevelData>,
  quality: Record<string, any>,
): SongLevelDataType[] => {
  if (!level || !quality) return [];
  return reduce(
    level,
    (result, value, key) => {
      if (quality[key] && value) {
        result.push({
          name: value.name,
          level: value.level,
          value: key as SongLevelType,
          br: quality[key]?.br,
          size: quality[key]?.size,
        });
      }
      return result;
    },
    [] as SongLevelDataType[],
  );
};

// 更改下载路径
const changeDownloadPath = async () => {
  const path = await window.electron.ipcRenderer.invoke("choose-path");
  if (path) downloadPath.value = path;
};

// 下载歌曲
const download = async () => {
  if (!songData.value) return;
  loading.value = true;

  try {
    const result = await downloadSong({
      song: songData.value,
      quality: songLevelChoosed.value,
      downloadPath: downloadPath.value,
    });

    if (result.success) {
      emit("close");
      window.$message.success("歌曲下载成功");
    } else {
      window.$message.error(result.message || "下载歌曲出现错误，请重试");
    }
  } catch (error) {
    console.error("Error downloading song:", error);
    window.$message.error("下载歌曲出现错误，请重试");
  } finally {
    loading.value = false;
  }
};

onMounted(() => getSongDetail());
</script>

<style lang="scss" scoped>
.download-song {
  .n-alert {
    margin-bottom: 20px;
  }
  .n-collapse {
    margin-top: 20px;
  }
  .menu {
    margin-top: 20px;
  }
}
</style>
