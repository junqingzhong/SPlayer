import { useMusicStore, useSettingStore, useStatusStore } from "@/stores";
import { parsedLyricsData, parseTTMLToAMLL, parseTTMLToYrc, resetSongLyric } from "../lyric";
import { songLyric, songLyricTTML } from "@/api/song";
import { parseTTML } from "@applemusic-like-lyrics/lyric";
import { LyricLine } from "@applemusic-like-lyrics/core";
import { LyricType } from "@/types/main";

/**
 * 获取歌词
 * @param id 歌曲id
 */
export const getLyricData = async (id: number) => {
  const musicStore = useMusicStore();
  const settingStore = useSettingStore();
  const statusStore = useStatusStore();
  // 切歌或重新获取时，先标记为加载中
  statusStore.lyricLoading = true;

  if (!id) {
    statusStore.usingTTMLLyric = false;
    resetSongLyric();
    statusStore.lyricLoading = false;
    return;
  }

  try {
    // 检测本地歌词覆盖
    const getLyric = getLyricFun(settingStore.localLyricPath, id);
    // 先加载 LRC，不阻塞到 TTML 完成
    const lrcPromise = getLyric("lrc", songLyric);
    const ttmlPromise = settingStore.enableTTMLLyric ? getLyric("ttml", songLyricTTML) : null;

    const { lyric: lyricRes, isLocal: lyricLocal } = await lrcPromise;
    parsedLyricsData(lyricRes, lyricLocal && !settingStore.enableExcludeLocalLyrics);
    // LRC 到达后即可认为加载完成
    statusStore.lyricLoading = false;

    // TTML 并行加载，完成后增量更新，不阻塞整体流程
    if (ttmlPromise) {
      statusStore.usingTTMLLyric = false;
      void ttmlPromise
        .then(({ lyric: ttmlContent, isLocal: ttmlLocal }) => {
          if (!ttmlContent) {
            statusStore.usingTTMLLyric = false;
            return;
          }
          const parsedResult = parseTTML(ttmlContent);
          if (!parsedResult?.lines?.length) {
            statusStore.usingTTMLLyric = false;
            return;
          }
          const skipExcludeLocal = ttmlLocal && !settingStore.enableExcludeLocalLyrics;
          const skipExcludeTTML = !settingStore.enableExcludeTTML;
          const skipExclude = skipExcludeLocal || skipExcludeTTML;
          const ttmlLyric = parseTTMLToAMLL(parsedResult, skipExclude);
          const ttmlYrcLyric = parseTTMLToYrc(parsedResult, skipExclude);
          console.log("TTML lyrics:", ttmlLyric, ttmlYrcLyric);
          // 合并数据
          const updates: Partial<{ yrcAMData: LyricLine[]; yrcData: LyricType[] }> = {};
          if (ttmlLyric?.length) {
            updates.yrcAMData = ttmlLyric;
            console.log("✅ TTML AMLL lyrics success");
          }
          if (ttmlYrcLyric?.length) {
            updates.yrcData = ttmlYrcLyric;
            console.log("✅ TTML Yrc lyrics success");
          }
          if (Object.keys(updates).length) {
            musicStore.setSongLyric(updates);
            statusStore.usingTTMLLyric = true;
          } else {
            statusStore.usingTTMLLyric = false;
          }
        })
        .catch((err) => {
          console.error("❌ Error loading TTML lyrics:", err);
          statusStore.usingTTMLLyric = false;
        });
    } else {
      statusStore.usingTTMLLyric = false;
    }

    console.log("Lyrics: ", musicStore.songLyric);
  } catch (error) {
    console.error("❌ Error loading lyrics:", error);
    statusStore.usingTTMLLyric = false;
    resetSongLyric();
    statusStore.lyricLoading = false;
  }
};

/**
 * 获取歌词函数生成器
 * @param paths 本地歌词路径数组
 * @param id 歌曲ID
 * @returns 返回一个函数，该函数接受扩展名和在线获取函数作为参数
 */
const getLyricFun =
  (paths: string[], id: number) =>
  async (
    ext: string,
    getOnline?: (id: number) => Promise<string | null>,
  ): Promise<{ lyric: string | null; isLocal: boolean }> => {
    for (const path of paths) {
      const lyric = await window.electron.ipcRenderer.invoke("read-local-lyric", path, id, ext);
      if (lyric) return { lyric, isLocal: true };
    }
    return { lyric: getOnline ? await getOnline(id) : null, isLocal: false };
  };
