<template>
  <div class="batch-list">
    <n-data-table
      :columns="columnsData"
      :data="tableData"
      max-height="60vh"
      virtual-scroll
      @update:checked-row-keys="tableCheck"
    />
    <n-flex class="batch-footer" justify="space-between" align="center">
      <n-text :depth="3" class="count">已选择 {{ checkCount }} 首</n-text>
      <n-flex class="menu">
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
  </div>
</template>

<script setup lang="ts">
import type { DataTableColumns, DataTableRowKey } from "naive-ui";
import type { SongType } from "@/types/main";
import { isArray, isObject } from "lodash-es";
import { openPlaylistAdd } from "@/utils/modal";
import { deleteSongs } from "@/utils/auth";
import { NInput } from "naive-ui";
import { useLocalStore } from "@/stores";

const localStore = useLocalStore();

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
const tableCheck = (keys: DataTableRowKey[], rows: DataType[]) => {
  // 更改选中数量
  checkCount.value = keys.length;
  // 更改选中歌曲
  checkSongData.value = rows.map((row) => row.origin).filter((song) => song) as SongType[];
};

// 删除本地歌曲
const handleDeleteLocalSongs = () => {
  const confirmText = ref("");
  window.$dialog.warning({
    title: "删除歌曲",
    content: () =>
      h("div", { style: { marginTop: "20px" } }, [
        h("div", { style: { marginBottom: "12px" } }, "确定删除选中的歌曲吗？该操作将永久删除文件且无法撤销！"),
        h("div", { style: { marginBottom: "12px", fontSize: "12px", opacity: 0.8 } }, "请输入：确认删除"),
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
        const successIds = results.filter(r => r.success).map(r => r.id);
        const failCount = results.length - successIds.length;

        // 更新本地数据
        if (successIds.length > 0) {
          // 从 localStore 中移除
          const newLocalSongs = localStore.localSongs.filter(song => !successIds.includes(song.id));
          localStore.updateLocalSong(newLocalSongs);
          
          window.$message.success(`成功删除 ${successIds.length} 首歌曲` + (failCount > 0 ? `，${failCount} 首失败` : ""));
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
</script>

<style lang="scss" scoped>
.batch-footer {
  margin-top: 20px;
}
</style>
