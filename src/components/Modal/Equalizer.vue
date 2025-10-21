<template>
  <div class="equalizer">
    <n-flex align="center" justify="space-between" :size="8">
      <n-flex wrap :size="8" class="eq-presets">
        <n-tag
          v-for="(preset, key) in presetList"
          :key="key"
          :type="currentPreset === key ? 'primary' : 'default'"
          :bordered="currentPreset === key"
          :disabled="!enabled"
          round
          @click="applyPreset(key as PresetKey)"
        >
          {{ preset.label }}
        </n-tag>
      </n-flex>
      <n-switch v-model:value="enabled" :round="false" :disabled="!isElectron" />
    </n-flex>

    <div class="eq-sliders">
      <div v-for="(freq, i) in frequencies" :key="freq" class="eq-col">
        <div class="eq-freq">{{ freqLabels[i] }}</div>
        <n-slider
          v-model:value="bands[i]"
          :min="-12"
          :max="12"
          :step="0.5"
          :tooltip="false"
          vertical
          :disabled="!enabled || !isElectron"
          @update:value="onBandChange(i, $event)"
        />
        <div class="eq-value">{{ formatDb(bands[i]) }}</div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { isElectron } from "@/utils/helper";
import { useStatusStore } from "@/stores";
import player from "@/utils/player";

const statusStore = useStatusStore();

type PresetKey = keyof typeof presetList;

// 10 段中心频率
const frequencies = [31, 62, 125, 250, 500, 1000, 2000, 4000, 8000, 16000];
const freqLabels = [
  "31Hz",
  "62Hz",
  "125Hz",
  "250Hz",
  "500Hz",
  "1kHz",
  "2kHz",
  "4kHz",
  "8kHz",
  "16kHz",
];

// 预设（单位 dB），范围建议在 [-12, 12]
const presetList = {
  acoustic: { label: "原声", bands: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0] },
  pop: { label: "流行", bands: [0, 2, 4, 4, 1, -1, -1, 1, 2, 2] },
  rock: { label: "摇滚", bands: [4, 3, 2, 0, -1, 1, 2, 3, 3, 2] },
  classical: { label: "古典", bands: [0, 0, 1, 2, 3, 3, 2, 1, 0, 0] },
  jazz: { label: "爵士", bands: [0, 2, 3, 2, 0, 1, 2, 2, 1, 0] },
  vocal: { label: "人声", bands: [-2, -1, 0, 2, 4, 4, 2, 0, -1, -2] },
  dance: { label: "舞曲", bands: [5, 4, 3, 1, -1, 0, 2, 3, 3, 2] },
  custom: { label: "自定义", bands: [] as number[] },
} as const;

const enabled = ref<boolean>(statusStore.eqEnabled);
const currentPreset = ref<PresetKey>((statusStore.eqPreset as PresetKey) || "custom");
const bands = ref<number[]>(
  statusStore.eqBands?.length === 10 ? [...statusStore.eqBands] : Array(10).fill(0),
);

/** 格式化 dB 文本 */
const formatDb = (v: number) => `${v >= 0 ? "+" : ""}${v}dB`;

/**
 * 应用预设
 */
const applyPreset = (key: PresetKey) => {
  if (!enabled.value) return;
  currentPreset.value = key;
  statusStore.setEqPreset(key);
  // 自定义不覆盖当前频段
  if (key !== "custom") {
    const arr = presetList[key].bands;
    bands.value = [...arr];
    statusStore.setEqBands(bands.value);
    if (enabled.value) player.updateEq({ bands: bands.value });
  }
};

/**
 * 根据当前开关状态应用/移除 EQ
 */
const applyEq = () => {
  if (!isElectron) return;
  statusStore.setEqEnabled(enabled.value);
  statusStore.setEqBands(bands.value);
  if (enabled.value) {
    player.enableEq({ bands: bands.value, frequencies });
  } else {
    player.disableEq();
  }
};

/**
 * 单段变更处理：实时更新 EQ
 */
const onBandChange = (index: number, value: number) => {
  bands.value[index] = value;
  statusStore.setEqBands(bands.value);
  // 任何手动拖动都切换为自定义
  if (currentPreset.value !== "custom") {
    currentPreset.value = "custom";
    statusStore.setEqPreset("custom");
  }
  if (enabled.value) player.updateEq({ bands: bands.value });
};

watch(enabled, () => applyEq());

onMounted(() => {
  // 初始状态：若持久化为开启，则直接应用
  if (isElectron && enabled.value) player.enableEq({ bands: bands.value, frequencies });
});
</script>

<style scoped lang="scss">
.equalizer {
  .eq-sliders {
    display: grid;
    grid-template-columns: repeat(10, 1fr);
    gap: 12px;
    margin-top: 20px;
    .eq-col {
      display: flex;
      flex-direction: column;
      align-items: center;
      .eq-freq {
        height: 20px;
        font-size: 12px;
        opacity: 0.75;
        margin-bottom: 6px;
      }
      :deep(.n-slider) {
        height: 160px;
      }
      .eq-value {
        margin-top: 6px;
        font-size: 12px;
        opacity: 0.8;
        white-space: nowrap;
      }
    }
  }
}
</style>
