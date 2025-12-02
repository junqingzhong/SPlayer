<template>
  <div class="download-downloading">
    <div v-if="dataStore.batchDownload.isDownloading" class="download-card">
      <n-card content-style="padding: 16px;" :bordered="false">
        <n-flex vertical :size="12">
          <n-flex justify="space-between" align="center">
            <n-text strong>批量下载中</n-text>
            <n-text depth="3" style="font-size: 12px">
              {{ dataStore.batchDownload.processed }}/{{ dataStore.batchDownload.total }}
            </n-text>
          </n-flex>
          <n-text style="font-size: 13px" ellipsis>
            正在下载: {{ dataStore.batchDownload.currentSong }}
          </n-text>
          <n-progress
            type="line"
            :percentage="dataStore.batchDownload.percent"
            :show-indicator="false"
            processing
            status="success"
            style="height: 6px"
          />
          <n-flex justify="space-between" style="font-size: 12px">
            <n-text depth="3">
              {{ dataStore.batchDownload.transferred }} / {{ dataStore.batchDownload.totalSize }}
            </n-text>
            <n-text depth="3">
              成功: {{ dataStore.batchDownload.success }}
            </n-text>
          </n-flex>
        </n-flex>
      </n-card>
    </div>
    <n-empty v-else description="暂无正在下载的任务" class="empty" />
  </div>
</template>

<script setup lang="ts">
import { useDataStore } from "@/stores";

const dataStore = useDataStore();
</script>

<style lang="scss" scoped>
.download-downloading {
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  .download-card {
    width: 400px;
    :deep(.n-card) {
      box-shadow: 0 8px 32px rgba(0, 0, 0, 0.12);
      border: 1px solid rgba(255, 255, 255, 0.1);
    }
  }
}
</style>
