<template>
  <n-dropdown
    :x="dropdownX"
    :y="dropdownY"
    :show="dropdownShow"
    :options="dropdownOptions"
    class="song-list-menu"
    placement="bottom-start"
    trigger="manual"
    size="large"
    @select="dropdownShow = false"
    @clickoutside="dropdownShow = false"
  />
</template>

<script setup lang="ts">
import type { SongType } from "@/types/main";
import { NFlex, NText, type DropdownOption } from "naive-ui";
import { getPlayerInfoObj } from "@/utils/format";
import SImage from "../UI/s-image.vue";
import { useSongMenu } from "@/composables/useSongMenu";

const emit = defineEmits<{ removeSong: [index: number[]] }>();

const { getMenuOptions } = useSongMenu();

// 右键菜单数据
const dropdownX = ref<number>(0);
const dropdownY = ref<number>(0);
const dropdownShow = ref<boolean>(false);
const dropdownOptions = ref<DropdownOption[]>([]);

// 开启右键菜单
const openDropdown = (
  e: MouseEvent,
  _data: SongType[],
  song: SongType,
  index: number,
  type: "song" | "radio",
  playListId?: number,
  isDailyRecommend: boolean = false,
) => {
  try {
    e.preventDefault();
    dropdownShow.value = false;

    // 当前歌曲信息
    const songData = getPlayerInfoObj(song);

    // 生成基础菜单选项
    const baseOptions = getMenuOptions(
      song,
      index,
      type,
      playListId || 0,
      isDailyRecommend,
      (event, args) => emit(event, args),
    );

    // 头部信息卡片选项
    const headerOption: DropdownOption = {
      key: "data",
      type: "render",
      render: () =>
        h(
          NFlex,
          {
            align: "center",
            wrap: false,
            class: "song-list-card",
          },
          [
            h(SImage, { src: song.coverSize?.s }),
            h(NFlex, { vertical: true, size: 0 }, [
              h(NText, { class: "text-hidden", depth: 1 }, songData?.name),
              h(
                NText,
                { depth: 3, class: "text-hidden", style: { fontSize: "12px" } },
                songData?.artist,
              ),
            ]),
          ],
        ),
    };

    // 组合菜单
    // 注意：useSongMenu 返回的列表通常不包含分割线，我们需要根据原有的逻辑添加分割线
    // 但为了简化，我们可以直接在合适的位置插入，或者让 useSongMenu 返回更结构化的数据
    // 目前简单处理：头部信息 + 分割线 + 功能选项 (功能选项中可能已经包含了一些逻辑)
    // 观察 useSongMenu 的实现，它包含了很多选项。
    // 原来的实现中，头部卡片后有一个 divider。

    // 我们手动构建最终列表
    nextTick().then(() => {
      dropdownOptions.value = [
        headerOption,
        { key: "header-line", type: "divider" },
        ...baseOptions,
      ];

      // 显示菜单
      dropdownX.value = e.clientX;
      dropdownY.value = e.clientY;
      dropdownShow.value = true;
    });
  } catch (error) {
    console.error("右键菜单出现异常：", error);
    window.$message.error("右键菜单出现异常");
  }
};

defineExpose({ openDropdown });
</script>

<style lang="scss">
.delete-mata {
  display: flex;
}
.song-list-card {
  width: 100%;
  max-width: 180px;
  padding: 4px 10px;
  .s-image {
    border-radius: 6px;
    overflow: hidden;
    width: 40px;
    height: 40px;
    min-width: 40px;
  }
}
</style>
