import { isElectron } from "@/utils/env";
import { openSetting, openUpdateApp } from "@/utils/modal";
import { useMusicStore, useDataStore, useStatusStore } from "@/stores";
import { toLikeSong } from "@/utils/auth";
import { usePlayerController } from "@/core/player/PlayerController";
import { PlayModeType, SettingType } from "@/types/main";
import { handleProtocolUrl } from "@/utils/protocol";
import { getPlayerInfoObj } from "@/utils/format";

/**
 * IPC 事件监听 Hook
 */
export const useIpcEvents = () => {
  if (!isElectron) return;

  const player = usePlayerController();
  const ipc = window.electron.ipcRenderer;

  // 全部ipc监听器
  const unbinds: Array<() => void> = [];

  const handlePlay = () => player.play();
  const handlePause = () => player.pause();
  const handlePlayOrPause = () => player.playOrPause();
  const handlePrev = () => player.nextOrPrev("prev");
  const handleNext = () => player.nextOrPrev("next");
  const handleVolumeUp = () => player.setVolume("up");
  const handleVolumeDown = () => player.setVolume("down");
  const handleChangeMode = (_: any, mode: PlayModeType) => player.togglePlayMode(mode);
  const handleOpenSetting = (_: any, type: SettingType, scrollTo?: string) =>
    openSetting(type, scrollTo);
  const handleToggleDesktopLyric = () => player.toggleDesktopLyric();
  const handleCloseDesktopLyric = () => player.setDesktopLyricShow(false);

  // 喜欢歌曲
  const handleToggleLike = async () => {
    const dataStore = useDataStore();
    const musicStore = useMusicStore();
    if (musicStore.playSong) {
      await toLikeSong(musicStore.playSong, !dataStore.isLikeSong(musicStore.playSong.id));
    }
  };

  // 歌词数据请求
  const handleLyricRequest = () => {
    const musicStore = useMusicStore();
    const statusStore = useStatusStore();

    if (player) {
      const { name, artist } = getPlayerInfoObj() || {};
      const lrcDataRaw = toRaw(musicStore.songLyric.lrcData) ?? [];
      const yrcDataRaw = toRaw(musicStore.songLyric.yrcData) ?? [];

      ipc.send("update-desktop-lyric-data", {
        playStatus: statusStore.playStatus,
        playName: name,
        artistName: artist,
        currentTime: statusStore.currentTime,
        songId: musicStore.playSong?.id,
        songOffset: statusStore.getSongOffset(musicStore.playSong?.id),
        lrcData: lrcDataRaw,
        yrcData: yrcDataRaw,
        lyricIndex: statusStore.lyricIndex,
      });
    }
  };

  // 检查更新相关
  const closeUpdateStatus = () => {
    const statusStore = useStatusStore();
    statusStore.updateCheck = false;
  };

  const handleUpdateNotAvailable = () => {
    closeUpdateStatus();
    window.$message.success("当前已是最新版本");
  };

  const handleUpdateAvailable = (_: any, info: any) => {
    closeUpdateStatus();
    openUpdateApp(info);
  };

  const handleUpdateError = (_: any, error: any) => {
    console.error("Error updating:", error);
    closeUpdateStatus();
    window.$message.error("更新过程出现错误");
  };

  const handleProtocolUrlEvent = (_: any, url: string) => {
    console.log("📡 Received protocol url:", url);
    handleProtocolUrl(url);
  };

  // 注册监听器
  const bindEvents = () => {
    try {
      const eventMap: Array<[string, any]> = [
        ["play", handlePlay],
        ["pause", handlePause],
        ["playOrPause", handlePlayOrPause],
        ["playPrev", handlePrev],
        ["playNext", handleNext],
        ["volumeUp", handleVolumeUp],
        ["volumeDown", handleVolumeDown],
        ["changeMode", handleChangeMode],
        ["toogleLikeSong", handleToggleLike],
        ["openSetting", handleOpenSetting],
        ["toogleDesktopLyric", handleToggleDesktopLyric],
        ["closeDesktopLyric", handleCloseDesktopLyric],
        ["request-desktop-lyric-data", handleLyricRequest],
        ["update-not-available", handleUpdateNotAvailable],
        ["update-available", handleUpdateAvailable],
        ["update-error", handleUpdateError],
        ["protocol-url", handleProtocolUrlEvent],
      ];

      eventMap.forEach(([channel, listener]) => {
        // 接收返回值
        const unbind = ipc.on(channel, listener);
        if (typeof unbind === "function") {
          unbinds.push(unbind);
        }
      });
      console.log(`IPC Listeners Initialized (${unbinds.length} events)`);
    } catch (error) {
      console.error("Error binding IPC events:", error);
    }
  };

  // 执行清理
  const removeEvents = () => {
    if (unbinds.length > 0) {
      console.log("Cleaning up IPC listeners...");
      // 遍历执行所有的清理函数
      unbinds.forEach((unbind) => unbind());
      // 清空数组
      unbinds.length = 0;
    }
  };

  onMounted(() => {
    bindEvents();
  });

  onUnmounted(() => {
    removeEvents();
  });
};
