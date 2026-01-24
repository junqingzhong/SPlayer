<template>
  <div class="scaling-modal">
    <div class="tip">
      <n-text depth="3" class="value">可调节范围：50% - 200%</n-text>
    </div>
    <n-input-number
      v-model:value="zoomPercentage"
      :min="50"
      :max="200"
      :step="5"
      button-placement="both"
      class="scaling-input"
    >
      <template #suffix>%</template>
    </n-input-number>
    <n-button size="small" secondary type="primary" @click="resetZoom"> 恢复默认 </n-button>
  </div>
</template>

<script setup lang="ts">
import { ref, watch, onMounted } from "vue";

const zoomFactor = ref(1.0);
const zoomPercentage = ref(100);

// 监听 zoomFactor 变化更新 zoomPercentage 并应用缩放
watch(zoomFactor, (newVal) => {
  zoomPercentage.value = Math.round(newVal * 100);
  window.electron.ipcRenderer.invoke("set-zoom-factor", newVal);
});

// 监听 zoomPercentage 变化更新 zoomFactor
watch(zoomPercentage, (newVal) => {
  if (newVal) {
    zoomFactor.value = newVal / 100;
  }
});

const resetZoom = () => {
  zoomFactor.value = 1.0;
};

onMounted(async () => {
  const currentZoom = await window.electron.ipcRenderer.invoke("get-zoom-factor");
  zoomFactor.value = currentZoom;
});
</script>

<style lang="scss" scoped>
.scaling-modal {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 24px;
  padding: 24px 0;

  .scaling-input {
    width: 200px;
    text-align: center;
    :deep(.n-input__input-el) {
      text-align: center;
    }
  }

  .tip {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 8px;
    .value {
      font-size: 13px;
    }
  }
}
</style>
