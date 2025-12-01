import type { SongType, SongLevelType } from "@/types/main";
import { songDownloadUrl, songLyric } from "@/api/song";
import { isElectron } from "@/utils/env";
import { saveAs } from "file-saver";
import { getPlayerInfo } from "@/utils/player-utils/song";
import { useSettingStore } from "@/stores";
import { cloneDeep } from "lodash-es";

interface DownloadOptions {
  song: SongType;
  quality: SongLevelType;
  downloadPath?: string;
}

export const downloadSong = async ({
  song,
  quality,
  downloadPath,
}: DownloadOptions): Promise<{ success: boolean; message?: string }> => {
  try {
    const settingStore = useSettingStore();
    // 获取下载链接
    const result = await songDownloadUrl(song.id, quality);
    if (result.code !== 200 || !result?.data?.url) {
      return { success: false, message: result.message || "获取下载链接失败" };
    }

    const { url, type = "mp3" } = result.data;
    const songName = getPlayerInfo(song) || "未知曲目";
    const finalPath = downloadPath || settingStore.downloadPath;

    // 校验下载路径
    if (finalPath === "" && isElectron) {
      return { success: false, message: "请配置下载目录" };
    }

    if (isElectron) {
      const { downloadMeta, downloadCover, downloadLyric, saveMetaFile } = settingStore;
      let lyric = "";
      if (downloadLyric) {
        const lyricResult = await songLyric(song.id);
        lyric = lyricResult?.lrc?.lyric || "";
      }

      const config = {
        fileName: songName.replace(/[/:*?"<>|]/g, "&"),
        fileType: type.toLowerCase(),
        path: finalPath,
        downloadMeta,
        downloadCover,
        downloadLyric,
        saveMetaFile,
        songData: cloneDeep(song),
        lyric,
      };

      const isSuccess = await window.electron.ipcRenderer.invoke("download-file", url, config);
      if (!isSuccess) return { success: false, message: "下载失败" };
    } else {
      saveAs(url, `${songName}.${type}`);
    }

    return { success: true };
  } catch (error) {
    console.error(`Error downloading song ${song.name}:`, error);
    return { success: false, message: "下载过程中出现错误" };
  }
};
