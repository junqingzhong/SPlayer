<!--
 * @Author: ZJQ
 * @Date: 2025-12-15 16:09:47
 * @LastEditors: zjq zjq@xkb.com.cn
 * @LastEditTime: 2025-12-15 18:36:55
 * @FilePath: \tea\src\components\Modal\Setting\SongUnlockManager.vue
 * @Description:
 *
 * Copyright (c) 2025 by ${git_name_email}, All Rights Reserved.
-->
<template>
  <div class="song-unlock-manager">
    <n-alert title="免责声明" type="info" :show-icon="false" style="margin-bottom: 16px">
      本功能仅作为测试使用，资源来自网络，若侵犯到您的权益，请及时联系我们删除
    </n-alert>
    
    <!-- Cookie 配置区域 -->
    <n-card title="音源配置" style="margin-bottom: 16px">
      <n-space vertical>
        <n-alert type="warning" :show-icon="false" :bordered="false">
          部分音源（如QQ音乐）需要配置 Cookie 才能获取高音质，普通音质可能不需要
        </n-alert>
        <n-form-item label="QQ音乐 Cookie">
          <n-input
            v-model:value="qqCookie"
            type="textarea"
            placeholder="请输入 QQ 音乐 Cookie（可选）"
            :rows="3"
          />
          <template #feedback>
            设置后可用于解锁 QQ 音乐高音质，留空则使用普通音质
          </template>
        </n-form-item>
        <n-space>
          <n-button @click="saveCookie">保存配置</n-button>
          <n-button text @click="testUnlock">测试解密功能</n-button>
        </n-space>
      </n-space>
    </n-card>

    <!-- 高级设置 -->
    <n-card title="高级设置" style="margin-bottom: 16px">
      <n-space vertical>
        <n-form-item label="请求超时时间 (毫秒)">
          <n-slider
            v-model:value="settingStore.songUnlockTimeout"
            :min="3000"
            :max="20000"
            :step="1000"
            :marks="{ 3000: '3s', 8000: '8s', 15000: '15s' }"
          />
        </n-form-item>
        <n-form-item label="失败重试次数">
          <n-radio-group v-model:value="settingStore.songUnlockRetry">
            <n-space>
              <n-radio :value="0">不重试</n-radio>
              <n-radio :value="1">重试1次</n-radio>
              <n-radio :value="2">重试2次</n-radio>
            </n-space>
          </n-radio-group>
        </n-form-item>
        <n-form-item>
          <n-checkbox v-model:checked="settingStore.songUnlockDebug">开启调试模式（在控制台显示详细日志）</n-checkbox>
        </n-form-item>
      </n-space>
    </n-card>

    <!-- 音源列表 -->
    <n-card title="音源优先级（拖拽排序）">
      <template #header-extra>
        <n-button text type="primary" @click="resetToDefault">恢复默认排序</n-button>
      </template>
      <div ref="sortableRef" class="sortable-list">
        <n-card
          v-for="item in settingStore.songUnlockServer"
          :key="item.key"
          :content-style="{
            display: 'flex',
            alignItems: 'center',
            gap: '12px',
            padding: '12px',
          }"
          class="sortable-item"
          size="small"
        >
          <SvgIcon :depth="3" name="Menu" class="sortable-handle" />
          <n-text class="name">{{ getServerDisplayName(item.key) }}</n-text>
          <n-tag :type="getServerStatus(item.key)" size="small">
            {{ getServerStatusText(item.key) }}
          </n-tag>
          <n-switch v-model:value="item.enabled" :round="false" />
        </n-card>
      </div>
    </n-card>

    <!-- 使用提示 -->
    <n-alert title="使用提示" type="info" style="margin-top: 16px" :show-icon="false">
      <n-ul>
        <n-li>建议同时启用多个音源以提高成功率</n-li>
        <n-li>拖拽可调整音源优先级（从上到下依次尝试）</n-li>
        <n-li>酷狗、酷我相对稳定，可优先启用</n-li>
        <n-li>哔哩哔哩作为最后的备用源</n-li>
      </n-ul>
    </n-alert>
  </div>
</template>

<script setup lang="ts">
import { useSettingStore } from "@/stores";
import { useSortable } from "@vueuse/integrations/useSortable";
import { SongUnlockServer } from "@/core/player/SongManager";
import type { Options } from "sortablejs";
import { useMessage } from "naive-ui";

const settingStore = useSettingStore();
const message = useMessage();

const sortableRef = ref<HTMLElement | null>(null);

// QQ Cookie
const qqCookie = ref(localStorage.getItem("qq-cookie") || "");

// 获取服务器显示名称
const getServerDisplayName = (key: SongUnlockServer): string => {
  const nameMap: Record<SongUnlockServer, string> = {
    [SongUnlockServer.NETEASE]: "网易云音乐",
    [SongUnlockServer.BODIAN]: "波点音乐",
    [SongUnlockServer.GEQUBAO]: "歌曲宝",
    [SongUnlockServer.QQ]: "QQ音乐",
    [SongUnlockServer.KUGOU]: "酷狗音乐",
    [SongUnlockServer.KUWO]: "酷我音乐",
    [SongUnlockServer.BILIBILI]: "哔哩哔哩",
    [SongUnlockServer.XIAOWAI]: "小歪音乐",
    [SongUnlockServer.PILI]: "PILI音乐",
  };
  return nameMap[key] || key;
};

// 获取服务器状态
const getServerStatus = (key: SongUnlockServer): "success" | "warning" | "error" => {
  const statusMap: Record<SongUnlockServer, "success" | "warning" | "error"> = {
    [SongUnlockServer.NETEASE]: "warning",
    [SongUnlockServer.BODIAN]: "warning",
    [SongUnlockServer.GEQUBAO]: "error",
    [SongUnlockServer.QQ]: "warning",
    [SongUnlockServer.KUGOU]: "success",
    [SongUnlockServer.KUWO]: "success",
    [SongUnlockServer.BILIBILI]: "warning",
    [SongUnlockServer.XIAOWAI]: "success",
    [SongUnlockServer.PILI]: "success",
  };
  return statusMap[key] || "warning";
};

// 获取服务器状态文本
const getServerStatusText = (key: SongUnlockServer): string => {
  const statusTextMap: Record<SongUnlockServer, string> = {
    [SongUnlockServer.NETEASE]: "一般",
    [SongUnlockServer.BODIAN]: "不稳定",
    [SongUnlockServer.GEQUBAO]: "易失效",
    [SongUnlockServer.QQ]: "需配置",
    [SongUnlockServer.KUGOU]: "较稳定",
    [SongUnlockServer.KUWO]: "较稳定",
    [SongUnlockServer.BILIBILI]: "备用",
    [SongUnlockServer.XIAOWAI]: "推荐",
    [SongUnlockServer.PILI]: "推荐",
  };
  return statusTextMap[key] || "一般";
};

// 保存Cookie
const saveCookie = () => {
  if (qqCookie.value) {
    localStorage.setItem("qq-cookie", qqCookie.value);
    message.success("QQ音乐 Cookie 已保存");
  } else {
    localStorage.removeItem("qq-cookie");
    message.info("已清除 Cookie");
  }
};

// 测试解密功能
const testUnlock = async () => {
  message.info("解密功能测试：播放一首灰色歌曲时会自动尝试解密");
};

// 恢复默认排序
const resetToDefault = () => {
  const defaultOrder = [
    { key: SongUnlockServer.XIAOWAI, enabled: true },
    { key: SongUnlockServer.KUGOU, enabled: true },
    { key: SongUnlockServer.KUWO, enabled: true },
    { key: SongUnlockServer.PILI, enabled: true },
    { key: SongUnlockServer.QQ, enabled: false },
    { key: SongUnlockServer.NETEASE, enabled: false },
    { key: SongUnlockServer.BODIAN, enabled: false },
    { key: SongUnlockServer.GEQUBAO, enabled: false },
    { key: SongUnlockServer.BILIBILI, enabled: false },
  ];
  settingStore.songUnlockServer = defaultOrder;
  message.success("已恢复默认排序");
};

// 拖拽排序
useSortable(sortableRef, settingStore.songUnlockServer, {
  animation: 150,
  handle: ".sortable-handle",
  ghostClass: "sortable-ghost",
  chosenClass: "sortable-chosen",
  dragClass: "sortable-drag",
} as Options);
</script>

<style scoped lang="scss">
.sortable-list {
  margin-top: 12px;
  display: flex;
  flex-direction: column;
  gap: 12px;
  .sortable-item {
    border-radius: 8px;
    transition: all 0.2s ease;
    .sortable-handle {
      font-size: 16px;
      cursor: move;
      padding: 4px;
      border-radius: 4px;
      &:hover {
        background-color: var(--n-close-color-hover);
      }
    }
    .name {
      font-size: 16px;
      line-height: normal;
      flex: 1;
    }
    .n-switch {
      margin-left: 8px;
    }
  }
  .sortable-ghost {
    opacity: 0.5;
    background-color: var(--n-close-color-hover);
  }
  .sortable-chosen {
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
  }
}
</style>
