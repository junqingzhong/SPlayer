<!-- 播放器 - 评论 -->
<template>
  <div class="player-comment">
    <n-flex :wrap="false" align="center" class="song-data">
      <n-image
        :src="musicStore.songCover"
        :alt="musicStore.songCover"
        class="cover-img"
        preview-disabled
        @load="coverLoaded"
      >
        <template #placeholder>
          <div class="cover-loading">
            <img src="/images/song.jpg?asset" class="loading-img" alt="loading-img" />
          </div>
        </template>
      </n-image>
      <n-flex :size="2" class="song-info" vertical>
        <span class="title text-hidden">{{
          settingStore.hideLyricBrackets
            ? removeBrackets(musicStore.playSong.name)
            : musicStore.playSong.name
        }}</span>
        <span class="artist text-hidden">
          {{
            Array.isArray(musicStore.playSong.artists)
              ? musicStore.playSong.artists.map((item) => item.name).join(" / ")
              : String(musicStore.playSong.artists)
          }}
        </span>
      </n-flex>
      <div class="actions">
        <n-flex
          class="close"
          align="center"
          justify="center"
          @click="showFilterModal = true"
        >
          <SvgIcon name="Tag" :size="20" />
        </n-flex>
        <n-flex
          class="close"
          align="center"
          justify="center"
          @click="statusStore.showPlayerComment = false"
        >
          <SvgIcon name="Music" :size="24" />
        </n-flex>
      </div>
    </n-flex>
    <n-scrollbar ref="commentScroll" class="comment-scroll">
      <template v-if="filteredCommentHotData && filteredCommentHotData.length > 0">
        <div class="placeholder">
          <div class="title">
            <SvgIcon name="Fire" />
            <span>热门评论</span>
          </div>
        </div>
        <CommentList
          :data="filteredCommentHotData"
          :loading="commentHotData?.length === 0"
          :type="songType"
          :res-id="songId"
          transparent
        />
      </template>
      <div class="placeholder">
        <div class="title">
          <SvgIcon name="Message" />
          <span>全部评论</span>
        </div>
      </div>
      <CommentList
        :data="filteredCommentData"
        :loading="commentLoading"
        :type="songType"
        :loadMore="commentHasMore"
        :res-id="songId"
        transparent
        @loadMore="loadMoreComment"
      />
      <div class="placeholder" />
    </n-scrollbar>

    <!-- 过滤弹窗 -->
    <n-modal
      v-model:show="showFilterModal"
      preset="card"
      title="评论关键词过滤"
      class="filter-modal"
      :style="{ width: '500px' }"
    >
      <n-flex vertical>
        <n-text depth="3">关键词过滤（支持普通文本匹配）</n-text>
        <n-dynamic-tags v-model:value="filterKeywords" />
        <n-divider style="margin: 12px 0" />
        <n-text depth="3">正则过滤（支持 JavaScript 正则表达式）</n-text>
        <n-dynamic-tags v-model:value="filterRegexes" />
        <n-flex justify="space-between" style="margin-top: 12px">
          <n-flex>
            <n-popconfirm @positive-click="clearFilter">
              <template #trigger>
                <n-button type="error" secondary>
                  <template #icon>
                    <SvgIcon name="DeleteSweep" />
                  </template>
                  清空
                </n-button>
              </template>
              确定要清空所有过滤规则吗？
            </n-popconfirm>
            <n-button secondary @click="importFilters">
              导入
            </n-button>
            <n-button secondary @click="exportFilters">
              导出
            </n-button>
          </n-flex>
          <n-flex>
            <n-button @click="showFilterModal = false">取消</n-button>
            <n-button type="primary" @click="saveFilter">保存</n-button>
          </n-flex>
        </n-flex>
      </n-flex>
    </n-modal>
  </div>
</template>

<script setup lang="ts">
import type { CommentType } from "@/types/main";
import { useMusicStore, useStatusStore, useSettingStore } from "@/stores";
import { getComment, getHotComment } from "@/api/comment";
import { isEmpty } from "lodash-es";
import { formatCommentList, removeBrackets } from "@/utils/format";
import { NScrollbar } from "naive-ui";
import { coverLoaded } from "@/utils/helper";

const musicStore = useMusicStore();
const statusStore = useStatusStore();
const settingStore = useSettingStore();

const commentScroll = ref<InstanceType<typeof NScrollbar> | null>(null);

// 是否展示
const isShowComment = computed<boolean>(() => statusStore.showPlayerComment);

// 歌曲 id
const songId = computed<number>(() => musicStore.playSong.id);

// 歌曲类型
const songType = computed<0 | 1 | 7 | 2 | 3 | 4 | 5 | 6>(() =>
  musicStore.playSong.type === "radio" ? 4 : 0,
);

// 评论数据
const commentLoading = ref<boolean>(true);
const commentData = ref<CommentType[]>([]);
const commentHotData = ref<CommentType[] | null>([]);
const commentPage = ref<number>(1);
const commentHasMore = ref<boolean>(true);

// 过滤相关
const showFilterModal = ref(false);
const filterKeywords = ref<string[]>([]);
const filterRegexes = ref<string[]>([]);

// 初始化过滤关键词
watch(
  () => showFilterModal.value,
  (val) => {
    if (val) {
      filterKeywords.value = [...(settingStore.excludeCommentKeywords || [])];
      filterRegexes.value = [...(settingStore.excludeCommentRegexes || [])];
    }
  },
);

// 清空过滤
const clearFilter = () => {
  filterKeywords.value = [];
  filterRegexes.value = [];
};

// 导出规则
const exportFilters = () => {
  const data = {
    keywords: settingStore.excludeCommentKeywords || [],
    regexes: settingStore.excludeCommentRegexes || [],
  };
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "splayer-comment-filters.json";
  a.click();
  URL.revokeObjectURL(url);
  window.$message.success("规则导出成功");
};

// 导入规则
const importFilters = () => {
  const input = document.createElement("input");
  input.type = "file";
  input.accept = ".json";
  input.onchange = (e: any) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = JSON.parse(e.target?.result as string);
        if (data.keywords && Array.isArray(data.keywords)) {
          settingStore.excludeCommentKeywords = data.keywords;
        }
        if (data.regexes && Array.isArray(data.regexes)) {
          settingStore.excludeCommentRegexes = data.regexes;
        }
        window.$message.success("规则导入成功");
        // 刷新弹窗数据（如果弹窗开着）
        if (showFilterModal.value) {
          filterKeywords.value = [...(settingStore.excludeCommentKeywords || [])];
          filterRegexes.value = [...(settingStore.excludeCommentRegexes || [])];
        }
      } catch (error) {
        console.error("Import filters error:", error);
        window.$message.error("规则文件解析失败");
      }
    };
    reader.readAsText(file);
  };
  input.click();
};

// 保存过滤
const saveFilter = () => {
  settingStore.excludeCommentKeywords = filterKeywords.value;
  settingStore.excludeCommentRegexes = filterRegexes.value;
  showFilterModal.value = false;
  window.$message.success("设置已保存");
};

// 过滤后的数据
const filterComments = (comments: CommentType[] | null) => {
  if (!comments) return [];
  const keywords = settingStore.excludeCommentKeywords || [];
  const regexes = settingStore.excludeCommentRegexes || [];

  if (!keywords.length && !regexes.length) return comments;

  return comments.filter((item) => {
    // 关键词过滤
    const hasKeyword = keywords.some((keyword) => item.content.includes(keyword));
    if (hasKeyword) return false;

    // 正则过滤
    const hasRegex = regexes.some((regexStr) => {
      try {
        const regex = new RegExp(regexStr);
        return regex.test(item.content);
      } catch (e) {
        return false;
      }
    });
    if (hasRegex) return false;

    return true;
  });
};

const filteredCommentData = computed(() => filterComments(commentData.value));
const filteredCommentHotData = computed(() => filterComments(commentHotData.value));

// 获取热门评论
const getHotCommentData = async () => {
  if (!songId.value) return;
  // 获取评论
  const result = await getHotComment(songId.value);
  // 处理数据
  const formatData = formatCommentList(result.hotComments);
  commentHotData.value = formatData?.length > 0 ? formatData : null;
  // 滚动到顶部
  commentScroll.value?.scrollTo({ top: 0, behavior: "smooth" });
};

// 获取歌曲评论
const getAllComment = async () => {
  if (!songId.value) return;
  commentLoading.value = true;
  // 分页参数
  const cursor =
    commentPage.value > 1 && commentData.value?.length > 0
      ? commentData.value[commentData.value.length - 1]?.time
      : undefined;
  // 获取评论
  const result = await getComment(songId.value, songType.value, commentPage.value, 20, 3, cursor);
  if (isEmpty(result.data?.comments)) {
    commentHasMore.value = false;
    commentLoading.value = false;
    return;
  }
  // 处理数据
  const formatData = formatCommentList(result.data.comments);
  commentData.value = commentData.value.concat(formatData);
  // 是否还有
  commentHasMore.value = result.data.hasMore;
  commentLoading.value = false;
};

// 加载更多
const loadMoreComment = () => {
  commentPage.value += 1;
  getAllComment();
};

// 歌曲id变化
watch(
  () => songId.value,
  () => {
    commentData.value = [];
    commentHotData.value = [];
    commentPage.value = 1;
    commentHasMore.value = true;
    if (!isShowComment.value) return;
    getHotCommentData();
    getAllComment();
  },
);

// 是否展示
watch(
  () => isShowComment.value,
  (newVal) => {
    if (!newVal) return;
    // 若不存在数据，重新获取
    if (!commentData.value?.length) {
      getHotCommentData();
      getAllComment();
    }
  },
);

onMounted(() => {
  if (!isShowComment.value) return;
  getHotCommentData();
  getAllComment();
});
</script>

<style lang="scss" scoped>
.player-comment {
  position: absolute;
  right: 0;
  width: 60%;
  flex: 1;
  width: 100%;
  height: calc(100vh - 160px);
  overflow: hidden;
  :deep(.n-text),
  :deep(.n-icon),
  :deep(.n-button) {
    color: rgb(var(--main-cover-color)) !important;
  }
  .song-data {
    height: 90px;
    margin: 0 60px 12px;
    padding: 0 16px;
    border-radius: 12px;
    background-color: rgba(var(--main-cover-color), 0.08);
    .cover-img {
      width: 60px;
      height: 60px;
      border-radius: 12px;
      margin-right: 4px;
    }
    .title {
      font-size: 20px;
      font-weight: bold;
    }
    .artist {
      opacity: 0.8;
    }
    .actions {
      margin-left: auto;
      display: flex;
      gap: 12px;
      .close {
        width: 40px;
        height: 40px;
        background-color: rgba(var(--main-cover-color), 0.08);
        border-radius: 8px;
        transition: background-color 0.3s;
        cursor: pointer;
        &:hover {
          background-color: rgba(var(--main-cover-color), 0.29);
        }
      }
    }
    // 强制把 close 挤到右边，但因为有两个 close（其中一个是 filter），这里需要微调
    // 原来的 .close { margin-left: auto; } 会让第一个 .close (filter) 占满中间空间
    // 我们需要让 filter 靠右，close 也靠右。
    // 可以给第一个 close 加 .ml-auto
  }
  
  // 修正 .close 样式，确保它们靠右
  // 由于我不能直接改 css 结构太乱，我会在 template 里用 n-flex 的 spacing 配合 margin-left: auto
  // 但是 n-flex 默认是 flex-start.
  // 我需要让第一个 .close 有 margin-left: auto
  
  // 实际上我在 replace_file_content 里无法太细致地调整 CSS 除非完全重写 style
  // 让我们看看原有的 scss
  /*
    .close {
      width: 40px;
      height: 40px;
      margin-left: auto;
      ...
    }
  */
  // 如果有两个 .close，第一个会有 margin-left: auto，会把前面的挤开。第二个紧随其后。
  // 这样是可以的。
  
  :deep(.comment-scroll) {
    height: calc(100vh - 262px);
    filter: drop-shadow(0px 4px 6px rgba(0, 0, 0, 0.2));
    mask: linear-gradient(
      180deg,
      hsla(0, 0%, 100%, 0) 0,
      hsla(0, 0%, 100%, 0.6) 2%,
      #fff 5%,
      #fff 90%,
      hsla(0, 0%, 100%, 0.6) 95%,
      hsla(0, 0%, 100%, 0)
    );
    .n-scrollbar-content {
      padding: 0 60px;
    }
    .n-skeleton {
      background-color: rgba(var(--main-cover-color), 0.08);
    }
  }
  .comment-list {
    margin: 0 auto;
    :deep(.comments) {
      .text {
        &::selection {
          color: rgb(var(--main-cover-color));
          background-color: rgba(var(--main-cover-color), 0.2);
        }
      }
    }
  }
  .placeholder {
    width: 100%;
    height: 100px;
    padding-bottom: 20px;
    display: flex;
    align-items: flex-end;
    &:last-child {
      height: 0;
      padding-top: 50%;
    }
    .title {
      display: flex;
      align-items: center;
      font-size: 22px;
      font-weight: bold;
      .n-icon {
        margin-right: 6px;
      }
    }
  }
}
/* Modal 样式需要全局或者 deep，这里直接在 scoped 里写可能需要 :deep 或者放在最外层 */
/* 但是 n-modal teleport 到 body，所以 scoped 样式通常无效，除非用全局样式或者 n-modal 自带的 style 属性 */
/* 我上面用了 class="filter-modal" */
</style>

