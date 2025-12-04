<template>
  <div class="copy-lyrics">

    <n-scrollbar class="lyrics-list">
      <n-checkbox-group v-model:value="selectedLines">
        <div v-for="line in displayLyrics" :key="line.index" class="lyric-item">
          <n-checkbox :value="line.index" class="lyric-checkbox">
            <div class="lyric-content">
              <div v-if="showOriginal && line.text" class="text">{{ line.text }}</div>
              <div v-if="showTranslation && line.translation" class="translation">
                {{ line.translation }}
              </div>
              <div v-if="showRomaji && line.romaji" class="romaji">{{ line.romaji }}</div>
            </div>
          </n-checkbox>
        </div>
      </n-checkbox-group>
    </n-scrollbar>

    <div class="footer">
      <div class="filters">
        <n-checkbox-group v-model:value="selectedFilters">
          <n-space>
            <n-checkbox value="original" label="原词" />
            <n-checkbox value="translation" label="翻译" />
            <n-checkbox value="romaji" label="音译" />
          </n-space>
        </n-checkbox-group>
      </div>
      <div class="actions">
        <n-button class="action-btn" @click="selectAll">全选</n-button>
        <n-button
          class="action-btn"
          type="primary"
          :disabled="selectedLines.length === 0"
          @click="handleCopy"
        >
          复制 ({{ selectedLines.length }})
        </n-button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { useMusicStore } from "@/stores";
import { useClipboard } from "@vueuse/core";

const props = defineProps<{
  onClose: () => void;
}>();

const musicStore = useMusicStore();
const { copy } = useClipboard();

const selectedFilters = ref<string[]>(["original", "translation", "romaji"]);
const selectedLines = ref<number[]>([]);

const rawLyrics = computed(() => {
  const { songLyric } = musicStore;
  return songLyric.yrcData?.length ? songLyric.yrcData : songLyric.lrcData;
});

const displayLyrics = computed(() => {
  return rawLyrics.value.map((line, index) => {
    // 兼容 lrcData (content) 和 yrcData (words)
    const text =
      line.words?.map((w) => w.word).join("") || (line as any).content || (line as any).text || "";
    const translation = line.translatedLyric || "";
    const romaji = line.romanLyric || line.words?.map((w) => w.romanWord).join("") || "";
    return {
      index,
      text,
      translation,
      romaji,
    };
  });
});

const showOriginal = computed(() => selectedFilters.value.includes("original"));
const showTranslation = computed(() => selectedFilters.value.includes("translation"));
const showRomaji = computed(() => selectedFilters.value.includes("romaji"));

const selectAll = () => {
  if (selectedLines.value.length === displayLyrics.value.length) {
    selectedLines.value = [];
  } else {
    selectedLines.value = displayLyrics.value.map((l) => l.index);
  }
};

const handleCopy = async () => {
  const linesToCopy = displayLyrics.value
    .filter((l) => selectedLines.value.includes(l.index))
    .map((l) => {
      const parts: string[] = [];
      if (showOriginal.value && l.text) parts.push(l.text);
      if (showTranslation.value && l.translation) parts.push(l.translation);
      if (showRomaji.value && l.romaji) parts.push(l.romaji);
      return parts.join("\n");
    })
    .filter((s) => s)
    .join("\n\n");

  if (linesToCopy) {
    await copy(linesToCopy);
    window.$message.success("复制成功");
    props.onClose();
  } else {
    window.$message.warning("没有可复制的内容");
  }
};
</script>

<style lang="scss" scoped>
.copy-lyrics {
  display: flex;
  flex-direction: column;
  height: 60vh;
  width: 100%;
}


.lyrics-list {
  flex: 1;
  padding: 12px 20px;

  .lyric-item {
    margin-bottom: 12px;
    padding: 8px;
    border-radius: 8px;
    transition: background-color 0.2s;

    &:hover {
      background-color: rgba(0, 0, 0, 0.05);
    }

    .lyric-checkbox {
      width: 100%;
      align-items: flex-start;

      :deep(.n-checkbox__label) {
        flex: 1;
      }
    }

    .lyric-content {
      font-size: 14px;
      line-height: 1.6;

      .text {
        font-weight: 500;
      }
      .translation {
        color: var(--n-text-color-3);
        font-size: 13px;
      }
      .romaji {
        color: var(--n-text-color-3);
        font-size: 12px;
        font-style: italic;
      }
    }
  }
}

.footer {
  padding: 16px 20px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  border-top: 1px solid var(--n-border-color);
  
  .filters {
    display: flex;
    align-items: center;
  }

  .actions {
    display: flex;
    gap: 12px;
    .action-btn {
      width: 90px;
    }
  }
}
</style>
