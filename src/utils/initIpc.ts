import { usePlayerController } from "@/core/player/PlayerController";
import * as playerIpc from "@/core/player/PlayerIpc";
import { useDataStore, useMusicStore, useSettingStore, useStatusStore } from "@/stores";
import type { SettingType } from "@/types/main";
import { handleProtocolUrl } from "@/utils/protocol";
import { cloneDeep } from "lodash-es";
import { toRaw } from "vue";
import { toLikeSong } from "./auth";
import { isElectron } from "./env";
import { sendTaskbarCoverColor } from "./color";
import { getPlayerInfoObj } from "./format";
import { openSetting, openUpdateApp } from "./modal";

// 关闭更新状态
const closeUpdateStatus = () => {
  const statusStore = useStatusStore();
  statusStore.updateCheck = false;
};

// 全局 IPC 事件
const initIpc = () => {
  try {
    if (!isElectron) return;
    const player = usePlayerController();
    const statusStore = useStatusStore();

    // 播放
    window.electron.ipcRenderer.on("play", () => player.play());
    // 暂停
    window.electron.ipcRenderer.on("pause", () => player.pause());
    // 播放或暂停
    window.electron.ipcRenderer.on("playOrPause", () => player.playOrPause());
    // 上一曲
    window.electron.ipcRenderer.on("playPrev", () => player.nextOrPrev("prev"));
    // 下一曲
    window.electron.ipcRenderer.on("playNext", () => player.nextOrPrev("next"));
    // 音量加
    window.electron.ipcRenderer.on("volumeUp", () => player.setVolume("up"));
    // 音量减
    window.electron.ipcRenderer.on("volumeDown", () => player.setVolume("down"));
    // 快进 / 快退
    window.electron.ipcRenderer.on("seekForward", () => player.seekBy(5000));
    window.electron.ipcRenderer.on("seekBackward", () => player.seekBy(-5000));
    // 播放模式切换
    window.electron.ipcRenderer.on("changeRepeat", (_, mode) => player.toggleRepeat(mode));
    window.electron.ipcRenderer.on("toggleShuffle", (_, mode) => player.toggleShuffle(mode));
    // 喜欢歌曲
    window.electron.ipcRenderer.on("toggle-like-song", async () => {
      const dataStore = useDataStore();
      const musicStore = useMusicStore();
      await toLikeSong(musicStore.playSong, !dataStore.isLikeSong(musicStore.playSong.id));
    });
    // 开启设置
    window.electron.ipcRenderer.on("openSetting", (_, type: SettingType, scrollTo?: string) =>
      openSetting(type, scrollTo),
    );
    // 桌面歌词开关
    window.electron.ipcRenderer.on("desktop-lyric:toggle", () => player.toggleDesktopLyric());
    // 显式关闭桌面歌词
    window.electron.ipcRenderer.on("desktop-lyric:close", () => player.setDesktopLyricShow(false));
    // 任务栏歌词开关
    window.electron.ipcRenderer.on("toggle-taskbar-lyric", () => player.toggleTaskbarLyric());
    // 给任务栏歌词初始数据
    window.electron.ipcRenderer.on("taskbar:request-data", () => {
      const musicStore = useMusicStore();
      const statusStore = useStatusStore();
      const settingStore = useSettingStore();
      const { name, artist } = getPlayerInfoObj() || {};
      const cover = musicStore.getSongCover("s") || "";
      playerIpc.sendTaskbarMetadata({
        title: name || "",
        artist: artist || "",
        cover,
      });
      playerIpc.sendTaskbarState({
        isPlaying: statusStore.playStatus,
      });
      // 发送歌词数据
      playerIpc.sendTaskbarLyrics(musicStore.songLyric);
      // 发送设置
      window.electron.ipcRenderer.send(
        "taskbar:set-show-cover",
        settingStore.taskbarLyricShowCover,
      );
      window.electron.ipcRenderer.send("taskbar:set-max-width", settingStore.taskbarLyricMaxWidth);
      window.electron.ipcRenderer.send("taskbar:set-position", settingStore.taskbarLyricPosition);
      window.electron.ipcRenderer.send(
        "taskbar:set-show-when-paused",
        settingStore.taskbarLyricShowWhenPaused,
      );
      window.electron.ipcRenderer.send(
        "taskbar:set-auto-shrink",
        settingStore.taskbarLyricAutoShrink,
      );
      window.electron.ipcRenderer.send("taskbar:broadcast-settings", {
        animationMode: settingStore.taskbarLyricAnimationMode,
        singleLineMode: settingStore.taskbarLyricSingleLineMode,
        lyricFont: settingStore.LyricFont,
        globalFont: settingStore.globalFont,
        fontWeight: settingStore.taskbarLyricFontWeight,
        showTran: settingStore.showTran,
        showRoma: settingStore.showRoma,
      });
      playerIpc.sendTaskbarProgressData({
        currentTime: statusStore.currentTime * 1000,
        duration: statusStore.duration * 1000,
        offset: statusStore.getSongOffset(musicStore.playSong?.id),
      });
      // 发送封面颜色
      sendTaskbarCoverColor();
    });

    // 请求歌词数据
    window.electron.ipcRenderer.on("desktop-lyric:request-data", () => {
      const musicStore = useMusicStore();
      const statusStore = useStatusStore();
      if (player) {
        const { name, artist } = getPlayerInfoObj() || {};
        window.electron.ipcRenderer.send(
          "desktop-lyric:update-data",
          cloneDeep({
            playStatus: statusStore.playStatus,
            playName: name,
            artistName: artist,
            currentTime: statusStore.currentTime,
            songId: musicStore.playSong?.id,
            songOffset: statusStore.getSongOffset(musicStore.playSong?.id),
            lrcData: musicStore.songLyric.lrcData ?? [],
            yrcData: musicStore.songLyric.yrcData ?? [],
            lyricIndex: statusStore.lyricIndex,
            lyricLoading: statusStore.lyricLoading,
          }),
        );
      }
    });
    // 无更新
    window.electron.ipcRenderer.on("update-not-available", () => {
      closeUpdateStatus();
      window.$message.success("当前已是最新版本");
    });
    // 有更新
    window.electron.ipcRenderer.on("update-available", (_, info) => {
      const isManualCheck = statusStore.updateCheck;
      closeUpdateStatus();
      statusStore.updateAvailable = true;
      statusStore.updateInfo = info;
      statusStore.updateDownloaded = false;
      statusStore.updateDownloading = false;
      statusStore.updateDownloadProgress = 0;
      // 仅在用户主动检查时弹窗
      if (isManualCheck) {
        openUpdateApp(info);
      }
    });
    // 更新下载进度
    window.electron.ipcRenderer.on("download-progress", (_, progress) => {
      statusStore.updateDownloading = true;
      statusStore.updateDownloadProgress = Number((progress?.percent || 0).toFixed(1));
    });
    // 更新下载完成
    window.electron.ipcRenderer.on("update-downloaded", () => {
      statusStore.updateDownloading = false;
      statusStore.updateDownloaded = true;
      statusStore.updateDownloadProgress = 100;
    });
    // 更新错误
    window.electron.ipcRenderer.on("update-error", (_, error) => {
      console.error("Error updating:", error);
      closeUpdateStatus();
      statusStore.updateDownloading = false;
      window.$message.error("更新过程出现错误");
    });
    // 协议数据
    window.electron.ipcRenderer.on("protocol-url", (_, url) => {
      console.log("📡 Received protocol url:", url);
      handleProtocolUrl(url);
    });
    // 请求播放信息
    window.electron.ipcRenderer.on("request-track-info", () => {
      const musicStore = useMusicStore();
      const statusStore = useStatusStore();
      const { name, artist, album } = getPlayerInfoObj() || {};
      // 获取原始对象
      const playSong = toRaw(musicStore.playSong);
      const songLyric = statusStore.lyricLoading
        ? { lrcData: [], yrcData: [] }
        : toRaw(musicStore.songLyric);
      window.electron.ipcRenderer.send(
        "return-track-info",
        cloneDeep({
          playStatus: statusStore.playStatus,
          playName: name,
          artistName: artist,
          albumName: album,
          currentTime: statusStore.currentTime,
          // 音量及播放速率
          volume: statusStore.playVolume,
          playRate: statusStore.playRate,
          ...playSong,
          // 歌词及加载状态
          lyricLoading: statusStore.lyricLoading,
          lyricIndex: statusStore.lyricIndex,
          ...songLyric,
        }),
      );
    });
  } catch (error) {
    console.log(error);
  }
};

export default initIpc;
