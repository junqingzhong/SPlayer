import type { SongType, SongLevelType } from "@/types/main";
import { songDownloadUrl, songLyric, songUrl } from "@/api/song";
import { isElectron } from "@/utils/env";
import { saveAs } from "file-saver";
import { useSettingStore } from "@/stores";
import { cloneDeep } from "lodash-es";
import songManager from "@/utils/songManager";
import { songLevelData } from "@/utils/meta";

interface DownloadOptions {
  song: SongType;
  quality: SongLevelType;
  downloadPath?: string;
  skipIfExist?: boolean;
}

export const downloadSong = async ({
  song,
  quality,
  downloadPath,
  skipIfExist,
}: DownloadOptions): Promise<{ success: boolean; skipped?: boolean; message?: string }> => {
  try {
    const settingStore = useSettingStore();
    let url = "";
    let type = "mp3";

    // 获取下载链接
    if (settingStore.usePlaybackForDownload) {
      const levelName = songLevelData[quality].level;
      // @ts-ignore
      const result = await songUrl(song.id, levelName);
      if (result.code !== 200 || !result?.data?.[0]?.url) {
        return { success: false, message: result.message || "获取播放链接失败" };
      }
      url = result.data[0].url;
      type = (result.data[0].type || result.data[0].encodeType || "mp3").toLowerCase();
    } else {
      const result = await songDownloadUrl(song.id, quality);
      if (result.code !== 200 || !result?.data?.url) {
        return { success: false, message: result.message || "获取下载链接失败" };
      }
      url = result.data.url;
      type = result.data.type?.toLowerCase() || "mp3";
    }

    const songName = songManager.getPlayerInfo(song) || "未知曲目";
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
        skipIfExist,
      };

      const result = await window.electron.ipcRenderer.invoke("download-file", url, config);
      if (result.status === "skipped") {
        return { success: true, skipped: true, message: result.message };
      }
      if (result.status === "error") {
        return { success: false, message: result.message || "下载失败" };
      }
    } else {
      saveAs(url, `${songName}.${type}`);
    }

    return { success: true };
  } catch (error) {
    console.error(`Error downloading song ${song.name}:`, error);
    return { success: false, message: "下载过程中出现错误" };
  }
};
