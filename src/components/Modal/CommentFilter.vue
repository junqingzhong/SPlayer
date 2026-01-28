<template>
  <div class="comment-filter-modal">
    <n-flex vertical size="large">
      <n-card class="switch-card" size="small">
        <n-flex align="center" justify="space-between">
          <n-text>启用评论排除</n-text>
          <n-switch v-model:value="enableExcludeComments" :round="false" />
        </n-flex>
      </n-card>
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
            <n-button secondary @click="importFilters"> 导入 </n-button>
            <n-button secondary @click="exportFilters"> 导出 </n-button>
          </n-flex>
          <n-flex>
            <n-button @click="handleClose">取消</n-button>
            <n-button type="primary" @click="saveFilter">保存</n-button>
          </n-flex>
        </n-flex>
      </n-flex>
    </n-flex>
  </div>
</template>

<script setup lang="ts">
import { useSettingStore } from "@/stores";

const emit = defineEmits(["close"]);

const settingStore = useSettingStore();

const enableExcludeComments = ref(settingStore.enableExcludeComments);
const filterKeywords = ref<string[]>([]);
const filterRegexes = ref<string[]>([]);

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
          filterKeywords.value = data.keywords;
        }
        if (data.regexes && Array.isArray(data.regexes)) {
          filterRegexes.value = data.regexes;
        }
        window.$message.success("规则导入成功");
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
  settingStore.enableExcludeComments = enableExcludeComments.value;
  settingStore.excludeCommentKeywords = filterKeywords.value;
  settingStore.excludeCommentRegexes = filterRegexes.value;
  window.$message.success("设置已保存");
  handleClose();
};

const handleClose = () => {
  emit("close");
};

onMounted(() => {
  enableExcludeComments.value = settingStore.enableExcludeComments;
  filterKeywords.value = [...(settingStore.excludeCommentKeywords || [])];
  filterRegexes.value = [...(settingStore.excludeCommentRegexes || [])];
});
</script>

<style scoped lang="scss">
.comment-filter-modal {
  padding: 0;
  .switch-card {
    width: 100%;
    border-radius: 8px;
  }
}
</style>
