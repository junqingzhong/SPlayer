import { isElectron } from "./env";
import { openSetting, openUpdateApp } from "./modal";
import { useMusicStore, useDataStore, useStatusStore } from "@/stores";
import { toLikeSong } from "./auth";
import { usePlayer } from "./player";
import { cloneDeep } from "lodash-es";
import { getPlayerInfo } from "./player-utils/song";
import { SettingType } from "@/types/main";

// 关闭更新状态
const closeUpdateStatus = () => {
  const statusStore = useStatusStore();
  statusStore.updateCheck = false;
};

// 全局 IPC 事件
const initIpc = () => {
  try {
    if (!isElectron) return;
    const player = usePlayer();
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
    // 播放模式切换
    window.electron.ipcRenderer.on("changeMode", (_, mode) => player.togglePlayMode(mode));
    // 喜欢歌曲
    window.electron.ipcRenderer.on("toogleLikeSong", async () => {
      const dataStore = useDataStore();
      const musicStore = useMusicStore();
      await toLikeSong(musicStore.playSong, !dataStore.isLikeSong(musicStore.playSong.id));
    });
    // 开启设置
    window.electron.ipcRenderer.on("openSetting", (_, type: SettingType) => openSetting(type));
    // 桌面歌词开关
    window.electron.ipcRenderer.on("toogleDesktopLyric", () => player.toggleDesktopLyric());
    // 显式关闭桌面歌词
    window.electron.ipcRenderer.on("closeDesktopLyric", () => player.setDesktopLyricShow(false));
    // 请求歌词数据
    window.electron.ipcRenderer.on("request-desktop-lyric-data", () => {
      const musicStore = useMusicStore();
      const statusStore = useStatusStore();
      if (player) {
        window.electron.ipcRenderer.send(
          "update-desktop-lyric-data",
          cloneDeep({
            playStatus: statusStore.playStatus,
            playName: getPlayerInfo() ?? "未知歌曲",
            currentTime: statusStore.currentTime,
            songId: musicStore.playSong?.id,
            songOffset: statusStore.getSongOffset(musicStore.playSong?.id),
            lrcData: musicStore.songLyric.lrcData ?? [],
            yrcData: musicStore.songLyric.yrcData ?? [],
            lyricIndex: statusStore.lyricIndex,
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
      closeUpdateStatus();
      openUpdateApp(info);
    });
    // 更新错误
    window.electron.ipcRenderer.on("update-error", (_, error) => {
      console.error("Error updating:", error);
      closeUpdateStatus();
      window.$message.error("更新过程出现错误");
    });
  } catch (error) {
    console.log(error);
  }
};

export default initIpc;
