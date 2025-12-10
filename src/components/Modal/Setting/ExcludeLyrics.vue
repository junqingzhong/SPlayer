<template>
  <div class="exclude">
    <n-alert :show-icon="false">请勿添加过多，以免影响歌词的正常显示</n-alert>

    <n-tabs type="line" v-model:value="page" animated>
      <n-tab-pane name="keywords" tab="关键词">
        <n-dynamic-tags v-model:value="settingStore.excludeKeywords" />
      </n-tab-pane>
      <n-tab-pane name="regexes" tab="正则表达式">
        <n-dynamic-tags v-model:value="settingStore.excludeRegexes" />
      </n-tab-pane>

      <template #suffix>
        <n-flex>
          <n-button type="primary" strong secondary @click="clear">清空此页</n-button>
          <n-button type="primary" strong secondary @click="reset">重置此页</n-button>
        </n-flex>
      </template>
    </n-tabs>
  </div>
</template>

<script setup lang="ts">
import { useSettingStore } from "@/stores";
import { keywords, regexes } from "@/assets/data/exclude";

const settingStore = useSettingStore();

const page = ref("keywords");

const clear = () => {
  const pageName = page.value === "keywords" ? "关键词" : "正则表达式";
  window.$dialog.warning({
    title: "清空确认",
    content: `确认清空${pageName}列表？该操作不可撤销！`,
    positiveText: "确认",
    negativeText: "取消",
    onPositiveClick: () => {
      switch (page.value) {
        case "keywords":
          settingStore.excludeKeywords = [];
          break;
        case "regexes":
          settingStore.excludeRegexes = [];
          break;
      }
      window.$message.success(`${pageName}列表已清空`);
    }
  });
};

const reset = () => {
  const pageName = page.value === "keywords" ? "关键词" : "正则表达式";
  window.$dialog.warning({
    title: "重置确认",
    content: `确认重置${pageName}列表为默认值？该操作不可撤销！`,
    positiveText: "确认",
    negativeText: "取消",
    onPositiveClick: () => {
      switch (page.value) {
        case "keywords":
          settingStore.excludeKeywords = keywords;
          break;
        case "regexes":
          settingStore.excludeRegexes = regexes;
          break;
      }
      window.$message.success(`${pageName}列表已重置为默认值`);
    }
  });
};
</script>

<style lang="scss" scoped>
.exclude {
  .n-alert {
    margin-bottom: 20px;
  }
}
</style>
