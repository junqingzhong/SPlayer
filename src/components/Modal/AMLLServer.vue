<template>
  <n-flex vertical size="large">
    <n-alert :show-icon="false" type="warning">
      如果你不清楚这里是做什么的，请不要修改
    </n-alert>

    <n-text>请确保地址正确，并且包含 %s（ 用于替换歌曲 ID ）</n-text>

    <n-input
      v-model:value="serverUrl"
      placeholder="请输入 AMLL TTML DB 地址"
    />

    <n-collapse class="mirrors-collapse">
      <n-collapse-item title="推荐服务器" name="mirrors">
        <n-flex vertical size="medium">
          <n-card
            v-for="mirror in amllDbServers"
            :key="mirror.value"
            @click="serverUrl = mirror.value"
          >
            <n-flex vertical size="small">
              <n-text>{{ mirror.label }}</n-text>
              <n-text depth="3">{{ mirror.description }}</n-text>
              <n-text depth="3" class="mirror-url">{{ mirror.value }}</n-text>
            </n-flex>
          </n-card>
        </n-flex>
      </n-collapse-item>
    </n-collapse>

    <n-flex justify="end">
      <n-button @click="props.onClose()">取消</n-button>
      <n-button type="primary" @click="handleConfirm">确认</n-button>
    </n-flex>
  </n-flex>
</template>

<script setup lang="ts">
import { ref } from "vue";
import { isValidURL } from "@/utils/validate";
import { amllDbServers } from "@/utils/meta";
import { useSettingStore } from "@/stores";

const props = defineProps<{ onClose: () => void }>();

const settingStore = useSettingStore();
const serverUrl = ref(settingStore.amllDbServer);

const handleConfirm = async () => {
  const urlValue = serverUrl.value.trim();
  // 验证 URL 格式和 %s
  if (isValidURL(urlValue) && urlValue.includes("%s")) {
    await window.api.store.set("amllDbServer", urlValue);
    settingStore.amllDbServer = urlValue;
    window.$message.success("AMLL TTML DB 地址已更新");
    props.onClose();
    return true;
  } else {
    window.$message.error("请输入正确的网址格式，需包含 %s");
    return false;
  }
};
</script>

<style scoped lang="scss">
.n-card {
  cursor: pointer;
  transition: border-color 0.3s;

  &:hover {
    border-color: rgba(var(--primary), 0.58);
  }
}

.mirrors-collapse {
  margin-top: 10px;

  .mirror-url {
    font-size: 11px;
    color: var(--n-text-color-3);
    margin-top: 4px;
    padding: 4px 8px;
    background: var(--n-code-color);
    border-radius: 4px;
    font-family: monospace;
    word-break: break-all;
  }
}
</style>
