<template>
  <div class="batch-list">
    <n-data-table
      v-model:checked-row-keys="checkedRowKeys"
      :columns="columnsData"
      :data="tableData"
      :row-key="(row) => row.key"
      max-height="60vh"
      virtual-scroll
      @update:checked-row-keys="tableCheck"
    />
    <n-flex class="batch-footer" justify="space-between" align="center">
      <n-flex align="center">
        <n-text :depth="3" class="count">已选择 {{ checkCount }} 首</n-text>
        <n-popover trigger="click" placement="right">
          <template #trigger>
            <n-button tertiary> 高级筛选 </n-button>
          </template>
          <n-flex :wrap="false" align="center">
            <n-input-number
              v-model:value="startRange"
              class="range-input"
              placeholder="开始"
              :min="1"
              :max="props.data.length"
              size="small"
            />
            <n-text>-</n-text>
            <n-input-number
              v-model:value="endRange"
              class="range-input"
              placeholder="结束"
              :min="1"
              :max="props.data.length"
              size="small"
            />
            <n-button size="small" secondary @click="handleRangeSelect"> 选择 </n-button>
          </n-flex>
        </n-popover>
      </n-flex>
      <n-flex class="menu">
        <!-- 批量下载 -->
        <n-button
          :disabled="!checkCount"
          type="primary"
          strong
          secondary
          @click="handleBatchDownloadClick"
        >
          <template #icon>
            <SvgIcon name="Download" />
          </template>
          批量下载
        </n-button>
        <!-- 批量删除 -->
        <n-button
          v-if="playListId"
          :disabled="!checkCount"
          type="error"
          strong
          secondary
          @click="
            deleteSongs(
              playListId,
              checkSongData.map((item) => item.id),
            )
          "
        >
          <template #icon>
            <SvgIcon name="Delete" />
          </template>
          删除选中的歌曲
        </n-button>
        <!-- 添加到歌单 -->
        <n-button
          :disabled="!checkCount"
          type="primary"
          strong
          secondary
          @click="openPlaylistAdd(checkSongData, props.isLocal)"
        >
          <template #icon>
            <SvgIcon name="AddList" />
          </template>
          添加到歌单
        </n-button>
        <!-- 删除本地歌曲 -->
        <n-button
          v-if="props.isLocal"
          :disabled="!checkCount"
          type="error"
          strong
          secondary
          @click="handleDeleteLocalSongs"
        >
          <template #icon>
            <SvgIcon name="Delete" />
          </template>
          删除歌曲
        </n-button>
      </n-flex>
    </n-flex>

    <!-- 音质选择弹窗 -->
    <n-modal
      v-model:show="showQualityModal"
      preset="card"
      title="批量下载"
      :closable="false"
      :mask-closable="false"
      style="width: 500px"
    >
      <n-alert type="warning" title="请知悉" closable style="margin-top: 20px">
        本软件仅支持从官方途径合法合规的下载歌曲，并用于学习研究用途。本功能将严格按照相应账户的权限来提供基础的下载功能
      </n-alert>
      <n-collapse
        :default-expanded-names="['level', 'path']"
        arrow-placement="right"
        style="margin-top: 20px"
      >
        <n-collapse-item title="音质选择" name="level">
          <n-radio-group v-model:value="selectedQuality" name="quality">
            <n-flex>
              <n-radio v-for="(item, index) in qualityOptions" :key="index" :value="item.value">
                <n-flex>
                  <n-text class="name">{{ item.label }}</n-text>
                </n-flex>
              </n-radio>
            </n-flex>
          </n-radio-group>
          <n-text depth="3" style="font-size: 12px; margin-top: 10px; display: block">
            注意：如果歌曲没有对应的音质，将自动下载最高可用音质
          </n-text>
        </n-collapse-item>
        <n-collapse-item v-if="isElectron" title="下载路径" name="path">
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

      <template #action>
        <n-flex justify="end">
          <n-button @click="showQualityModal = false">取消</n-button>
          <n-button type="primary" @click="startBatchDownload">确认下载</n-button>
        </n-flex>
      </template>
    </n-modal>

    <!-- 批量下载进度通知 -->
    <Teleport to="body">
      <Transition name="slide-fade">
        <div
          v-if="batchDownloadState.isDownloading"
          class="batch-download-notification"
          :class="{ 'is-hovered': isNotificationHovered }"
          @mouseenter="isNotificationHovered = true"
          @mouseleave="isNotificationHovered = false"
        >
          <n-card content-style="padding: 16px;" :bordered="false">
            <n-flex vertical :size="12">
              <n-flex justify="space-between" align="center">
                <n-text strong>批量下载中</n-text>
                <n-text depth="3" style="font-size: 12px">
                  {{ batchDownloadState.processed }}/{{ batchDownloadState.total }}
                </n-text>
              </n-flex>
              
              <n-text style="font-size: 13px" ellipsis>
                正在下载: {{ batchDownloadState.currentSong }}
              </n-text>
              
              <n-progress
                type="line"
                :percentage="batchDownloadState.percent"
                :show-indicator="false"
                processing
                status="success"
                style="height: 6px"
              />
              
              <n-flex justify="space-between" style="font-size: 12px">
                <n-text depth="3">
                  {{ batchDownloadState.transferred }} / {{ batchDownloadState.totalSize }}
                </n-text>
                <n-text depth="3">
                  成功: {{ batchDownloadState.success }}
                </n-text>
              </n-flex>
            </n-flex>
          </n-card>
        </div>
      </Transition>
    </Teleport>
  </div>
</template>

<script setup lang="ts">
import type { DataTableColumns, DataTableRowKey } from "naive-ui";
import type { SongType, SongLevelType } from "@/types/main";
import { isArray, isObject, pick } from "lodash-es";
import { openPlaylistAdd, openSetting } from "@/utils/modal";
import { deleteSongs } from "@/utils/auth";
import {
  NInput,
  NInputNumber,
  NRadioGroup,
  NRadio,
  NCollapse,
  NCollapseItem,
  NInputGroup,
  NButton,
  NAlert,
  NCard,
  NProgress,
  NText,
  NFlex,
} from "naive-ui";
import { useLocalStore, useSettingStore } from "@/stores";
import { isElectron } from "@/utils/env";
import { songLevelData, getSongLevelsData } from "@/utils/meta";
import { downloadSong } from "@/utils/download";

const localStore = useLocalStore();
const settingStore = useSettingStore();

interface DataType {
  key?: number;
  id?: number;
  name?: string;
  artists?: string;
  album?: string;
  // 原始数据
  origin?: SongType;
}

const props = defineProps<{
  data: SongType[];
  isLocal: boolean;
  playListId?: number;
}>();

// 选中数据
const checkCount = ref<number>(0);
const checkSongData = ref<SongType[]>([]);
const checkedRowKeys = ref<DataTableRowKey[]>([]);

// 范围选择
const startRange = ref<number | null>(null);
const endRange = ref<number | null>(null);

// 下载相关
const showQualityModal = ref(false);
const selectedQuality = ref<SongLevelType>("h");
const downloadPath = ref<string>(settingStore.downloadPath);

// 批量下载状态
const batchDownloadState = reactive({
  isDownloading: false,
  total: 0,
  processed: 0,
  success: 0,
  currentSong: "",
  percent: 0,
  transferred: "0MB",
  totalSize: "0MB",
});
const isNotificationHovered = ref(false);

// 音质选项
const qualityOptions = computed(() => {
  // 批量下载时，默认显示所有常用音质选项
  // 这里模拟一个包含所有常用音质的 level 对象
  const levels = pick(songLevelData, ["l", "m", "h", "sq", "hr", "je", "sk", "db", "jm"]);
  return getSongLevelsData(levels).map((item) => ({
    label: item.name,
    value: item.value,
    level: item.level,
  }));
});

// 表头数据
const columnsData = computed<DataTableColumns<DataType>>(() => [
  {
    type: "selection",
    disabled(row: DataType) {
      return !row.id;
    },
  },
  {
    title: "#",
    key: "key",
    width: 80,
  },
  {
    title: "标题",
    key: "name",
    ellipsis: {
      tooltip: true,
    },
  },
  {
    title: "歌手",
    key: "artists",
    ellipsis: {
      tooltip: true,
    },
  },
  {
    title: "专辑",
    key: "album",
    ellipsis: {
      tooltip: true,
    },
  },
]);

// 表格数据
const tableData = computed<DataType[]>(() =>
  props.data.map((song, index) => ({
    key: index + 1,
    id: song?.id,
    name: song?.name || "未知曲目",
    artists: isArray(song?.artists)
      ? // 拼接歌手
        song?.artists.map((ar: { name: string }) => ar.name).join(" / ")
      : song?.artists || "未知歌手",
    album: isObject(song?.album) ? song?.album.name : song?.album || "未知专辑",
    // 原始数据
    origin: song,
  })),
);

// 表格勾选
const tableCheck = (keys: DataTableRowKey[]) => {
  checkedRowKeys.value = keys;
  // 更改选中数量
  checkCount.value = keys.length;
  // 更改选中歌曲
  const selectedRows = tableData.value.filter((row) => row.key && keys.includes(row.key));
  checkSongData.value = selectedRows.map((row) => row.origin).filter((song) => song) as SongType[];
};

// 范围选择处理
const handleRangeSelect = () => {
  if (startRange.value === null || endRange.value === null) {
    window.$message.warning("请输入起始和结束序号");
    return;
  }

  const start = Math.max(1, Math.min(startRange.value, props.data.length));
  const end = Math.max(1, Math.min(endRange.value, props.data.length));

  if (start > end) {
    window.$message.warning("起始序号不能大于结束序号");
    return;
  }

  const selectedRows = tableData.value.slice(start - 1, end).filter((row) => row.id);

  checkedRowKeys.value = selectedRows.map((row) => row.key as DataTableRowKey);
  checkCount.value = selectedRows.length;
  checkSongData.value = selectedRows.map((row) => row.origin).filter((song) => song) as SongType[];
};

// 删除本地歌曲
const handleDeleteLocalSongs = () => {
  const confirmText = ref("");
  window.$dialog.warning({
    title: "删除歌曲",
    content: () =>
      h("div", { style: { marginTop: "20px" } }, [
        h(
          "div",
          { style: { marginBottom: "12px" } },
          "确定删除选中的歌曲吗？该操作将永久删除文件且无法撤销！",
        ),
        h(
          "div",
          { style: { marginBottom: "12px", fontSize: "12px", opacity: 0.8 } },
          "请输入：确认删除",
        ),
        h(NInput, {
          value: confirmText.value,
          placeholder: "确认删除",
          onUpdateValue: (v) => {
            confirmText.value = v;
          },
        }),
      ]),
    positiveText: "删除",
    negativeText: "取消",
    onPositiveClick: async () => {
      if (confirmText.value !== "确认删除") {
        window.$message.error("输入内容不正确");
        return false;
      }

      const loading = window.$message.loading("正在删除...", { duration: 0 });
      try {
        const deletePromises = checkSongData.value.map(async (song) => {
          if (song.path) {
            const result = await window.electron.ipcRenderer.invoke("delete-file", song.path);
            return { id: song.id, success: result };
          }
          return { id: song.id, success: false };
        });

        const results = await Promise.all(deletePromises);
        const successIds = results.filter((r) => r.success).map((r) => r.id);
        const failCount = results.length - successIds.length;

        // 更新本地数据
        if (successIds.length > 0) {
          // 从 localStore 中移除
          const newLocalSongs = localStore.localSongs.filter(
            (song) => !successIds.includes(song.id),
          );
          localStore.updateLocalSong(newLocalSongs);

          window.$message.success(
            `成功删除 ${successIds.length} 首歌曲` + (failCount > 0 ? `，${failCount} 首失败` : ""),
          );
          // 刷新列表
          const localEventBus = useEventBus("local");
          localEventBus.emit();
        } else {
          window.$message.error("删除失败，请重试");
        }
      } catch (error) {
        console.error("批量删除失败:", error);
        window.$message.error("删除过程中出现错误");
      } finally {
        loading.destroy();
      }
      return true;
    },
  });
};

// 批量下载处理
const handleBatchDownloadClick = () => {
  if (settingStore.downloadPath) downloadPath.value = settingStore.downloadPath;
  showQualityModal.value = true;
};

// 更改下载路径
const changeDownloadPath = async () => {
  const path = await window.electron.ipcRenderer.invoke("choose-path");
  if (path) downloadPath.value = path;
};

const startBatchDownload = () => {
  showQualityModal.value = false;
  executeBatchDownload(checkSongData.value);
};

const executeBatchDownload = async (songs: SongType[]) => {
  if (!songs.length) return;

  // 重置状态
  batchDownloadState.isDownloading = true;
  batchDownloadState.total = songs.length;
  batchDownloadState.processed = 0;
  batchDownloadState.success = 0;
  batchDownloadState.percent = 0;
  batchDownloadState.transferred = "0MB";
  batchDownloadState.totalSize = "0MB";

  let failCount = 0;
  const failedSongs: SongType[] = [];

  // 监听下载进度
  const onProgress = (_event: any, progress: { percent: number; transferredBytes: number; totalBytes: number }) => {
    const { percent, transferredBytes, totalBytes } = progress;
    batchDownloadState.percent = Number((percent * 100).toFixed(0));
    batchDownloadState.transferred = (transferredBytes / 1024 / 1024).toFixed(2) + "MB";
    batchDownloadState.totalSize = (totalBytes / 1024 / 1024).toFixed(2) + "MB";
  };

  if (isElectron) {
    window.electron.ipcRenderer.on("download-progress", onProgress);
  }

  try {
    for (const song of songs) {
      batchDownloadState.currentSong = song.name;
      try {
        const result = await downloadSong({
          song,
          quality: selectedQuality.value,
          downloadPath: downloadPath.value,
          skipIfExist: true,
        });

        if (result.success) {
          batchDownloadState.success++;
          if (result.skipped) {
            window.$notification.create({
              title: "已跳过重复文件",
              content: `${song.name} 已存在`,
              duration: 2000,
            });
          }
          if (!isElectron) {
            // Browser download delay
            await new Promise((resolve) => setTimeout(resolve, 500));
          }
        } else {
          console.error(`Failed to download song ${song.name}: ${result.message}`);
          failCount++;
          failedSongs.push(song);
        }
      } catch (err) {
        console.error(`Error downloading song ${song.name}:`, err);
        failCount++;
        failedSongs.push(song);
      } finally {
        batchDownloadState.processed++;
        // Reset progress for next song
        batchDownloadState.percent = 0;
        batchDownloadState.transferred = "0MB";
        batchDownloadState.totalSize = "0MB";
      }
    }

    if (failCount > 0) {
      window.$dialog.warning({
        title: "下载完成，但有部分失败",
        content: () => h("div", [
          h("div", { style: "margin-bottom: 10px" }, `${batchDownloadState.success} 首下载成功，${failCount} 首下载失败。`),
          h("div", { style: "max-height: 200px; overflow-y: auto; background: rgba(0,0,0,0.05); padding: 8px; border-radius: 4px;" }, [
             h("div", { style: "font-weight: bold; margin-bottom: 4px" }, "失败列表："),
             ...failedSongs.map(s => h("div", { style: "font-size: 12px" }, `${s.name} - ${isArray(s.artists) ? s.artists[0]?.name : s.artists || '未知歌手'}`))
          ])
        ]),
        positiveText: "重试失败歌曲",
        negativeText: "取消",
        onPositiveClick: () => {
          executeBatchDownload(failedSongs);
        },
      });
    } else {
      window.$message.success(`批量下载完成，共 ${batchDownloadState.success} 首`);
    }
  } catch (error) {
    console.error("Batch download error:", error);
    window.$message.error("批量下载过程中出现错误");
  } finally {
    if (isElectron) {
      window.electron.ipcRenderer.removeListener("download-progress", onProgress);
    }
    batchDownloadState.isDownloading = false;
  }
};
</script>

<style lang="scss" scoped>
.batch-footer {
  margin-top: 20px;
}
.range-input {
  width: 100px;
}

.batch-download-notification {
  position: fixed;
  bottom: 24px;
  right: 24px;
  z-index: 9999;
  width: 320px;
  transition: all 0.3s ease;
  
  &.is-hovered {
    opacity: 0;
    transform: translateY(10px);
    pointer-events: none;
  }
  
  :deep(.n-card) {
    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.12);
    border: 1px solid rgba(255, 255, 255, 0.1);
  }
}

.slide-fade-enter-active,
.slide-fade-leave-active {
  transition: all 0.3s ease;
}

.slide-fade-enter-from,
.slide-fade-leave-to {
  transform: translateY(20px);
  opacity: 0;
}
</style>
