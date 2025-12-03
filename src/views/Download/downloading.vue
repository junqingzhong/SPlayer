<template>
  <div class="download-downloading">
    <!-- 下载列表 -->
    <div v-if="dataStore.downloadingSongs.length > 0" class="downloading-list">
      <n-card
        v-for="item in dataStore.downloadingSongs"
        :key="item.song.id"
        content-style="padding: 16px;"
        :bordered="false"
        class="download-item"
      >
        <n-flex vertical :size="12">
          <n-flex justify="space-between" align="center">
            <n-flex vertical :size="4" style="flex: 1; min-width: 0;">
              <n-text strong ellipsis>{{ item.song.name }}</n-text>
              <n-flex align="center" :size="8">
                <n-text depth="3" style="font-size: 12px" ellipsis>
                  {{ Array.isArray(item.song.artists) ? item.song.artists.map(a => a.name).join(' / ') : item.song.artists }}
                </n-text>
                <n-tag size="small" :type="getQualityType(songLevelData[item.quality]?.name || item.quality)">
                  {{ songLevelData[item.quality]?.name || item.quality }}
                </n-tag>
              </n-flex>
            </n-flex>
            <n-text depth="3" style="font-size: 12px; margin-left: 12px;">
              {{ item.progress }}%
            </n-text>
          </n-flex>
          <n-progress
            type="line"
            :percentage="item.progress"
            :show-indicator="false"
            processing
            status="success"
            style="height: 6px"
          />
          <n-flex justify="space-between" style="font-size: 12px">
            <n-text depth="3">
              {{ item.transferred }} / {{ item.totalSize }}
            </n-text>
          </n-flex>
        </n-flex>
      </n-card>
    </div>
    <n-empty v-else description="暂无正在下载的任务" class="empty" />
  </div>
</template>

<script setup lang="ts">
import type { SongLevelType } from "@/types/main";
import { useDataStore, useSettingStore } from "@/stores";
import { downloadSong } from "@/utils/download";
import { isElectron } from "@/utils/env";
import { songLevelData } from "@/utils/meta";

const dataStore = useDataStore();
const settingStore = useSettingStore();

// 正在下载的歌曲 ID 集合（用于去重）
const downloadingIds = ref<Set<number>>(new Set());

// 获取音质类型
const getQualityType = (quality: string) => {
  if (quality.includes("Hi-Res") || quality.includes("无损")) return "warning";
  if (quality.includes("高品质")) return "info";
  return "default";
};

// 处理单个下载任务
const processDownload = async (item: typeof dataStore.downloadingSongs[0]) => {
  if (downloadingIds.value.has(item.song.id)) {
    return; // 已在下载中，跳过
  }

  downloadingIds.value.add(item.song.id);

  // 监听下载进度
  let progressHandler: ((_event: any, progress: { percent: number; transferredBytes: number; totalBytes: number }) => void) | null = null;
  if (isElectron) {
    progressHandler = (_event: any, progress: { percent: number; transferredBytes: number; totalBytes: number }) => {
      const { percent, transferredBytes, totalBytes } = progress;
      const transferred = (transferredBytes / 1024 / 1024).toFixed(2) + "MB";
      const total = (totalBytes / 1024 / 1024).toFixed(2) + "MB";
      dataStore.updateDownloadProgress(
        item.song.id,
        Number((percent * 100).toFixed(0)),
        transferred,
        total,
      );
    };
    window.electron.ipcRenderer.on("download-progress", progressHandler);
  }

  try {
    const result = await downloadSong({
      song: item.song,
      quality: item.quality as SongLevelType,
      downloadPath: settingStore.downloadPath,
      skipIfExist: true,
    });

    // 移除进度监听
    if (isElectron && progressHandler) {
      window.electron.ipcRenderer.removeListener("download-progress", progressHandler);
    }

    if (result.success) {
      // 移动到已下载列表
      dataStore.moveToDownloaded(item.song.id);
    } else {
      // 下载失败，从正在下载中移除
      dataStore.removeDownloadingSong(item.song.id);
      window.$message.error(`${item.song.name} 下载失败: ${result.message || "未知错误"}`);
    }
  } catch (error) {
    console.error(`Error downloading song ${item.song.name}:`, error);
    // 移除进度监听
    if (isElectron && progressHandler) {
      window.electron.ipcRenderer.removeListener("download-progress", progressHandler);
    }
    // 下载失败，从正在下载中移除
    dataStore.removeDownloadingSong(item.song.id);
    window.$message.error(`${item.song.name} 下载失败`);
  } finally {
    downloadingIds.value.delete(item.song.id);
  }
};

// 监听下载队列变化
watch(
  () => dataStore.downloadingSongs,
  (newSongs, oldSongs) => {
    // 找出新增的下载任务
    const newTasks = newSongs.filter(
      (item) => !oldSongs.some((old) => old.song.id === item.song.id),
    );

    // 处理新任务
    newTasks.forEach((item) => {
      // 如果进度为0，说明是新任务，开始下载
      if (item.progress === 0 && !downloadingIds.value.has(item.song.id)) {
        processDownload(item);
      }
    });
  },
  { deep: true },
);

// 组件挂载时，处理已有的下载任务
onMounted(() => {
  dataStore.downloadingSongs.forEach((item) => {
    if (item.progress === 0 && !downloadingIds.value.has(item.song.id)) {
      processDownload(item);
    }
  });
});
</script>

<style lang="scss" scoped>
.download-downloading {
  height: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: flex-start;
  overflow-y: auto;
  padding: 20px;
  gap: 12px;
  .download-card {
    width: 100%;
    max-width: 600px;
    :deep(.n-card) {
      box-shadow: 0 8px 32px rgba(0, 0, 0, 0.12);
      border: 1px solid rgba(255, 255, 255, 0.1);
    }
  }
  .downloading-list {
    width: 100%;
    max-width: 600px;
    display: flex;
    flex-direction: column;
    gap: 12px;
    .download-item {
      :deep(.n-card) {
        box-shadow: 0 4px 16px rgba(0, 0, 0, 0.08);
        border: 1px solid rgba(255, 255, 255, 0.1);
        transition: all 0.3s var(--n-bezier);
        &:hover {
          box-shadow: 0 8px 24px rgba(0, 0, 0, 0.12);
          transform: translateY(-2px);
        }
      }
    }
  }
  .empty {
    flex: 1;
    display: flex;
    align-items: center;
    justify-content: center;
  }
}
</style>
