<template>
  <div class="streaming">
    <Transition name="fade" mode="out-in">
      <div :key="pageTitle" class="title">
        <n-text class="keyword">{{ pageTitle }}</n-text>
        <n-flex v-if="isConnected" class="status">
          <n-text class="item">
            <SvgIcon name="Music" :depth="3" />
            <n-number-animation :from="0" :to="songsCount" /> 首歌曲
          </n-text>
          <n-text class="item server-info">
            <SvgIcon name="Cloud" :depth="3" />
            {{ serverName }}
          </n-text>
        </n-flex>
      </div>
    </Transition>
    <n-flex class="menu" justify="space-between">
      <n-flex class="left" align="flex-end">
        <n-button
          :focusable="false"
          :disabled="!streamingStore.isConnected || loading"
          :loading="loading"
          type="primary"
          strong
          secondary
          round
          v-debounce="handlePlay"
        >
          <template #icon>
            <SvgIcon name="Play" />
          </template>
          播放
        </n-button>
        <n-button
          :disabled="!streamingStore.isConnected || loading"
          :loading="loading"
          :focusable="false"
          class="more"
          strong
          secondary
          circle
          @click="handleRefresh"
        >
          <template #icon>
            <SvgIcon name="Refresh" />
          </template>
        </n-button>
        <!-- 更多 -->
        <n-dropdown :options="moreOptions" trigger="click" placement="bottom-start">
          <n-button :focusable="false" class="more" circle strong secondary>
            <template #icon>
              <SvgIcon name="List" />
            </template>
          </n-button>
        </n-dropdown>
      </n-flex>
      <n-flex class="right" justify="end">
        <!-- Tab 切换 -->
        <n-dropdown
          v-if="!isLargeDesktop"
          :options="tabDropdownOptions"
          :value="streamingType"
          trigger="click"
          placement="bottom-end"
          @select="handleTabUpdate"
        >
          <n-button :disabled="tabsDisabled" :focusable="false" strong secondary round>
            {{ currentTabLabel }}
            <template #icon>
              <SvgIcon name="Down" />
            </template>
          </n-button>
        </n-dropdown>
        <n-tabs
          v-else
          v-model:value="streamingType"
          class="tabs"
          type="segment"
          @update:value="handleTabUpdate"
        >
          <n-tab :disabled="tabsDisabled" name="streaming-songs"> 单曲 </n-tab>
          <n-tab :disabled="tabsDisabled" name="streaming-artists"> 歌手 </n-tab>
          <n-tab :disabled="tabsDisabled" name="streaming-albums"> 专辑 </n-tab>
          <n-tab :disabled="tabsDisabled" name="streaming-playlists"> 歌单 </n-tab>
        </n-tabs>
      </n-flex>
    </n-flex>
    <!-- 路由 -->
    <RouterView v-if="!showEmptyState" v-slot="{ Component }">
      <Transition :name="`router-${settingStore.routeAnimation}`" mode="out-in">
        <KeepAlive v-if="settingStore.useKeepAlive">
          <component :is="Component" :data="listData" :loading="loading" class="router-view" />
        </KeepAlive>
        <component v-else :is="Component" :data="listData" :loading="loading" class="router-view" />
      </Transition>
    </RouterView>
    <!-- 空状态 -->
    <n-flex v-else align="center" justify="center" vertical class="router-view">
      <n-empty size="large" :description="emptyDescription">
        <template #extra>
          <n-button type="primary" strong secondary @click="serverConfigShow = true">
            <template #icon>
              <SvgIcon name="Cloud" />
            </template>
            绑定流媒体服务
          </n-button>
        </template>
      </n-empty>
    </n-flex>
    <!-- 服务器配置弹窗 -->
    <n-modal
      v-model:show="serverConfigShow"
      :close-on-esc="false"
      :mask-closable="false"
      preset="card"
      title="流媒体服务配置"
      transform-origin="center"
      style="width: 500px"
    >
      <n-form
        ref="formRef"
        :model="serverForm"
        :rules="formRules"
        label-placement="left"
        label-width="auto"
        require-mark-placement="right-hanging"
      >
        <n-form-item label="服务类型" path="type">
          <n-select
            v-model:value="serverForm.type"
            :options="serverTypeOptions"
            placeholder="选择服务类型"
          />
        </n-form-item>
        <n-form-item label="服务器名称" path="name">
          <n-input
            v-model:value="serverForm.name"
            placeholder="为服务器取个名字（如：我的音乐库）"
          />
        </n-form-item>
        <n-form-item label="服务器地址" path="url">
          <n-input v-model:value="serverForm.url" placeholder="https://music.example.com" />
        </n-form-item>
        <n-form-item label="用户名" path="username">
          <n-input v-model:value="serverForm.username" placeholder="输入用户名" />
        </n-form-item>
        <n-form-item label="密码" path="password">
          <n-input
            v-model:value="serverForm.password"
            type="password"
            show-password-on="click"
            placeholder="输入密码"
          />
        </n-form-item>
      </n-form>
      <template #footer>
        <n-flex justify="space-between">
          <n-button v-if="isConnected" type="error" secondary @click="handleDisconnect">
            断开连接
          </n-button>
          <div v-else></div>
          <n-flex>
            <n-button @click="serverConfigShow = false">取消</n-button>
            <n-button type="primary" :loading="connecting" @click="handleConnect">
              {{ editingServerId ? "保存并连接" : "添加并连接" }}
            </n-button>
          </n-flex>
        </n-flex>
      </template>
    </n-modal>
  </div>
</template>

<script setup lang="ts">
import type { StreamingServerType } from "@/types/streaming";
import type { SongType } from "@/types/main";
import type { DropdownOption, FormInst, FormRules } from "naive-ui";
import { useStreamingStore, useSettingStore } from "@/stores";
import { useMobile } from "@/composables/useMobile";
import { renderIcon } from "@/utils/helper";
import { usePlayerController } from "@/core/player/PlayerController";

const router = useRouter();
const streamingStore = useStreamingStore();
const settingStore = useSettingStore();
const player = usePlayerController();
const { isLargeDesktop } = useMobile();

const loading = ref<boolean>(false);
const connecting = ref<boolean>(false);

// 路由类型
const streamingType = ref<string>((router.currentRoute.value?.name as string) || "streaming-songs");

// 服务器配置弹窗
const serverConfigShow = ref<boolean>(false);
const formRef = ref<FormInst | null>(null);
const editingServerId = ref<string | null>(null);

// 服务器表单
const serverForm = reactive({
  type: "navidrome" as StreamingServerType,
  name: "",
  url: "",
  username: "",
  password: "",
});

// 服务器类型选项
const serverTypeOptions = [
  { label: "Navidrome", value: "navidrome" },
  { label: "Jellyfin", value: "jellyfin" },
  { label: "OpenSubsonic", value: "opensubsonic" },
];

// 表单验证规则
const formRules: FormRules = {
  type: { required: true, message: "请选择服务类型" },
  name: { required: true, message: "请输入服务器名称" },
  url: { required: true, message: "请输入服务器地址" },
  username: { required: true, message: "请输入用户名" },
  password: { required: true, message: "请输入密码" },
};

// 页面标题
const pageTitle = computed<string>(() => "流媒体");

// 连接状态（用于模板）
const isConnected = computed<boolean>(() => streamingStore.isConnected.value);

// 歌曲数量（用于模板）
const songsCount = computed<number>(() => streamingStore.songs.value?.length || 0);

// 服务器名称（用于模板）
const serverName = computed<string>(() => streamingStore.connectionStatus.value?.serverName || "");

// Tab 状态
const tabsDisabled = computed<boolean>(() => !streamingStore.isConnected.value);

// 空状态描述
const emptyDescription = computed<string>(() => {
  if (!streamingStore.hasServer.value) {
    return "尚未配置流媒体服务";
  }
  if (!isConnected.value) {
    return "未连接到流媒体服务器";
  }
  return "当前没有歌曲";
});

// 是否显示空状态
const showEmptyState = computed<boolean>(() => {
  const routeName = router.currentRoute.value?.name as string;
  return (
    routeName === "streaming-songs" &&
    (!streamingStore.isConnected.value || streamingStore.songs.value.length === 0)
  );
});

// 列表数据
const listData = computed<SongType[]>(() => {
  return streamingStore.songs.value;
});

// Tab 标签映射
const tabLabels: Record<string, string> = {
  "streaming-songs": "单曲",
  "streaming-artists": "歌手",
  "streaming-albums": "专辑",
  "streaming-playlists": "歌单",
};

// Tab 下拉选项
const tabDropdownOptions = computed<DropdownOption[]>(() => [
  { label: "单曲", key: "streaming-songs", icon: renderIcon("Music") },
  { label: "歌手", key: "streaming-artists", icon: renderIcon("Artist") },
  { label: "专辑", key: "streaming-albums", icon: renderIcon("Album") },
  { label: "歌单", key: "streaming-playlists", icon: renderIcon("MusicList") },
]);

// 当前 Tab 标签
const currentTabLabel = computed(() => tabLabels[streamingType.value] || "单曲");

// 更多操作
const moreOptions = computed<DropdownOption[]>(() => [
  {
    label: "服务器配置",
    key: "config",
    props: {
      onClick: () => openServerConfig(),
    },
    icon: renderIcon("Cloud"),
  },
  {
    label: "断开连接",
    key: "disconnect",
    disabled: !streamingStore.isConnected.value,
    props: {
      onClick: () => handleDisconnect(),
    },
    icon: renderIcon("CloudOff"),
  },
]);

// 打开服务器配置
const openServerConfig = () => {
  // 如果已有服务器，填充表单
  if (streamingStore.activeServer.value) {
    const server = streamingStore.activeServer.value;
    editingServerId.value = server.id;
    serverForm.type = server.type;
    serverForm.name = server.name;
    serverForm.url = server.url;
    serverForm.username = server.username;
    serverForm.password = server.password;
  } else if (streamingStore.servers.value.length > 0) {
    const server = streamingStore.servers.value[0];
    editingServerId.value = server.id;
    serverForm.type = server.type;
    serverForm.name = server.name;
    serverForm.url = server.url;
    serverForm.username = server.username;
    serverForm.password = server.password;
  } else {
    editingServerId.value = null;
    serverForm.type = "navidrome";
    serverForm.name = "";
    serverForm.url = "";
    serverForm.username = "";
    serverForm.password = "";
  }
  serverConfigShow.value = true;
};

// 处理连接
const handleConnect = async () => {
  await formRef.value?.validate();

  connecting.value = true;
  try {
    let serverId: string;

    if (editingServerId.value) {
      // 更新现有服务器
      await streamingStore.updateServer(editingServerId.value, {
        type: serverForm.type,
        name: serverForm.name,
        url: serverForm.url,
        username: serverForm.username,
        password: serverForm.password,
      });
      serverId = editingServerId.value;
    } else {
      // 添加新服务器
      const newServer = await streamingStore.addServer({
        type: serverForm.type,
        name: serverForm.name,
        url: serverForm.url,
        username: serverForm.username,
        password: serverForm.password,
      });
      serverId = newServer.id;
    }

    // 连接到服务器
    const success = await streamingStore.connectToServer(serverId);

    if (success) {
      window.$message.success("连接成功");
      serverConfigShow.value = false;
      // 加载数据
      await loadData();
    } else {
      window.$message.error(streamingStore.connectionStatus.value.error || "连接失败");
    }
  } catch (error) {
    window.$message.error("连接失败：" + (error instanceof Error ? error.message : "未知错误"));
  } finally {
    connecting.value = false;
  }
};

// 断开连接
const handleDisconnect = () => {
  streamingStore.disconnect();
  serverConfigShow.value = false;
  window.$message.info("已断开连接");
};

// 加载数据
const loadData = async () => {
  loading.value = true;
  try {
    await streamingStore.fetchRandomSongs(100);
  } catch (error) {
    console.error("Failed to load data:", error);
  } finally {
    loading.value = false;
  }
};

// 刷新
const handleRefresh = async () => {
  if (!streamingStore.isConnected.value) return;
  await loadData();
};

// 播放
const handlePlay = () => {
  if (!listData.value.length) return;
  // 将流媒体歌曲转换为播放器可用的格式
  const songs = listData.value.map((song) => ({
    ...song,
    id: song.id,
  }));
  player.updatePlayList(songs);
};

// 处理 Tab 切换
const handleTabUpdate = (name: string) => {
  if (tabsDisabled.value) return;
  router.push({ name });
};

// 监听路由变化
watch(
  () => router.currentRoute.value.name,
  (name) => {
    if (name && typeof name === "string" && name.startsWith("streaming")) {
      streamingType.value = name;
    }
  },
  { immediate: true },
);

// 初始化
onMounted(async () => {
  // 尝试连接到已保存的服务器
  if (streamingStore.servers.value.length > 0 && !streamingStore.isConnected.value) {
    const lastServer =
      streamingStore.servers.value.find((s) => s.lastConnected) || streamingStore.servers.value[0];
    const success = await streamingStore.connectToServer(lastServer.id);
    if (success) {
      await loadData();
    }
  } else if (streamingStore.isConnected.value) {
    await loadData();
  }
});
</script>

<style lang="scss" scoped>
.streaming {
  display: flex;
  flex-direction: column;
  .title {
    display: flex;
    align-items: flex-end;
    line-height: normal;
    margin-top: 12px;
    margin-bottom: 20px;
    height: 40px;
    .keyword {
      font-size: 30px;
      font-weight: bold;
      margin-right: 12px;
      line-height: normal;
    }
    .status {
      font-size: 15px;
      font-weight: normal;
      line-height: 30px;
      .item {
        display: flex;
        align-items: center;
        opacity: 0.9;
        .n-icon {
          margin-right: 4px;
        }
      }
      .server-info {
        color: var(--n-text-color-3);
      }
    }
  }
  .menu {
    width: 100%;
    margin-bottom: 20px;
    height: 40px;
    .n-button {
      height: 40px;
      transition: all 0.3s var(--n-bezier);
    }
    .more {
      width: 40px;
    }
    .search {
      height: 40px;
      width: 130px;
      display: flex;
      align-items: center;
      border-radius: 25px;
      transition: all 0.3s var(--n-bezier);
      &.n-input--focus {
        width: 200px;
      }
    }
    .n-tabs {
      width: 260px;
      --n-tab-border-radius: 25px !important;
      :deep(.n-tabs-rail) {
        outline: 1px solid var(--n-tab-color-segment);
      }
    }
    @media (max-width: 678px) {
      .search {
        display: none;
      }
    }
  }
  .router-view {
    flex: 1;
    overflow: hidden;
    max-height: calc((var(--layout-height) - 132) * 1px);
  }
  @media (max-width: 512px) {
    .status {
      display: none !important;
    }
  }
}
</style>
