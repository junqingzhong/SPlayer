<template>
  <div class="download-downloading">
    <Transition name="fade" mode="out-in">
      <div v-if="dataStore.downloadingSongs.length > 0" class="download-list">
        <!-- 列表头 -->
        <div class="list-header sticky-header">
          <n-text class="num">#</n-text>
          <n-text class="title">标题</n-text>
          <n-text class="status">下载状态</n-text>
          <n-text class="actions">操作</n-text>
        </div>

        <!-- 列表内容 -->
        <n-scrollbar class="virtual-list">
          <div
            v-for="(item, index) in sortedDownloadingSongs"
            :key="item.song.id"
            class="download-item"
          >
            <!-- 序号 -->
            <div class="num">
              <n-text depth="3">{{ index + 1 }}</n-text>
            </div>
            <!-- 标题 (封面 + 信息) -->
            <div class="title">
              <s-image :src="item.song.coverSize?.s || item.song.cover" class="cover" />
              <div class="info">
                <div class="name">
                  <n-text class="name-text" ellipsis>{{ item.song.name }}</n-text>
                </div>
                <div class="artists text-hidden">
                  <n-text depth="3">
                    {{
                      Array.isArray(item.song.artists)
                        ? item.song.artists.map((a) => a.name).join(" / ")
                        : item.song.artists
                    }}
                  </n-text>
                </div>
              </div>
            </div>
            <!-- 状态 -->
            <div class="status">
              <n-flex v-if="item.status === 'downloading'" vertical :size="6" style="width: 100%">
                <n-flex justify="space-between">
                  <n-text depth="3" style="font-size: 12px">{{ item.progress }}%</n-text>
                  <n-text depth="3" style="font-size: 12px">
                    {{ item.transferred }} / {{ item.totalSize }}
                  </n-text>
                </n-flex>
                <div class="custom-progress">
                  <div class="bar" :style="{ width: item.progress + '%' }" />
                  <div
                    class="light"
                    v-if="item.status === 'downloading'"
                    :style="{ left: item.progress + '%' }"
                  />
                </div>
              </n-flex>
              <n-flex v-else-if="item.status === 'waiting'" vertical :size="6" style="width: 100%">
                <n-text depth="3" style="font-size: 12px">等待下载...</n-text>
                <n-progress
                  type="line"
                  :percentage="0"
                  :show-indicator="false"
                  style="height: 4px"
                />
              </n-flex>
              <n-flex v-else vertical :size="6" style="width: 100%">
                <n-text type="error" style="font-size: 12px">下载失败</n-text>
                <n-progress
                  type="line"
                  :percentage="0"
                  :show-indicator="false"
                  status="error"
                  style="height: 4px"
                />
              </n-flex>
            </div>
            <!-- 操作 -->
            <div class="actions">
              <n-button
                type="primary"
                secondary
                strong
                style="margin-right: 12px"
                @click="DownloadManager.retryDownload(item.song.id)"
              >
                <template #icon>
                  <SvgIcon name="Refresh" />
                </template>
              </n-button>
              <n-button
                type="error"
                secondary
                strong
                @click="DownloadManager.removeDownload(item.song.id)"
              >
                <template #icon>
                  <SvgIcon name="Close" />
                </template>
              </n-button>
            </div>
          </div>
        </n-scrollbar>
      </div>
      <n-empty v-else description="暂无正在下载的任务" class="empty" />
    </Transition>
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { useDataStore } from "@/stores";
import DownloadManager from "@/utils/downloadManager";

const dataStore = useDataStore();

const sortedDownloadingSongs = computed(() => {
  return [...dataStore.downloadingSongs].sort((a, b) => {
    // 优先级: 下载中 (1) > 等待中 (2) > 失败 (3)
    const getPriority = (status: string) => {
      if (status === "downloading") return 1;
      if (status === "waiting") return 2;
      return 3;
    };
    return getPriority(a.status) - getPriority(b.status);
  });
});
</script>

<style lang="scss" scoped>
.download-downloading {
  height: 100%;

  .download-list {
    height: 100%;
    display: flex;
    flex-direction: column;

    .list-header {
      display: flex;
      align-items: center;
      padding: 0 12px;
      height: 40px;
      background-color: var(--background-hex);
      font-weight: normal;

      .n-text {
        opacity: 0.6;
      }

      &.sticky-header {
        position: sticky;
        top: 0;
        z-index: 10;
      }

      .num {
        width: 60px;
        text-align: center;
      }
      .title {
        flex: 1;
        padding-left: 12px;
      }
      .status {
        flex: 1;
        padding-left: 12px;
      }
      .actions {
        width: 120px;
        text-align: center;
      }
    }

    .virtual-list {
      height: calc(100% - 40px) !important;

      .download-item {
        display: flex;
        align-items: center;
        padding: 12px;
        border-radius: 12px;
        border: 2px solid rgba(var(--primary), 0.12);
        background-color: var(--surface-container-hex);
        margin-bottom: 12px;
        transition: border-color 0.3s;

        &:hover {
          border-color: rgba(var(--primary), 0.58);
        }

        .num {
          width: 60px;
          display: flex;
          justify-content: center;
          align-items: center;
          min-width: 60px;
        }

        .title {
          flex: 1;
          display: flex;
          align-items: center;
          overflow: hidden;
          padding-right: 20px;
          padding-left: 12px;

          .cover {
            display: flex;
            align-items: center;
            justify-content: center;
            overflow: hidden;
            width: 50px;
            height: 50px;
            border-radius: 8px;
            margin-right: 12px;
            min-width: 50px;
          }

          .info {
            display: flex;
            flex-direction: column;
            overflow: hidden;
            flex: 1;

            .name {
              display: flex;
              align-items: center;
              margin-bottom: 4px;
              overflow: hidden;

              .name-text {
                font-size: 16px;
                margin-right: 8px;
              }
            }

            .artists {
              font-size: 12px;
            }
          }
        }

        .status {
          flex: 1;
          padding-right: 20px;
          padding-left: 12px;
        }

        .actions {
          width: 120px;
          display: flex;
          justify-content: center;
          min-width: 120px;
        }
      }
      .custom-progress {
        position: relative;
        width: 100%;
        height: 6px;
        margin-top: 4px;
        background-color: var(--surface-variant-hex);
        border-radius: 3px;
        overflow: hidden;

        .bar {
          height: 100%;
          border-radius: 3px;
          background: rgb(var(--primary));
          background: linear-gradient(
            90deg,
            rgba(var(--primary), 0.7) 0%,
            rgba(var(--primary), 1) 100%
          );
          transition: width 0.3s ease-out;
        }

        .light {
          position: absolute;
          top: 0;
          bottom: 0;
          width: 15px;
          transform: skewX(-20deg) translateX(-50%);
          background: rgba(255, 255, 255, 0.4);
          filter: blur(2px);
          transition: left 0.3s ease-out;
          pointer-events: none;
        }
      }
    }
  }

  .empty {
    margin-top: 60px;
  }
}
</style>
