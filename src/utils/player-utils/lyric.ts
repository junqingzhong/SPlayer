import { useMusicStore, useSettingStore, useStatusStore } from "@/stores";
import {
  parsedLyricsData,
  parseLocalLyric,
  parseTTMLToAMLL,
  parseTTMLToYrc,
  resetSongLyric,
} from "../lyric";
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

    // 并发请求：如果 TTML 先到并且有效，则直接采用 TTML，不再等待或覆盖为 LRC
    const lrcPromise = getLyric("lrc", songLyric);
    const ttmlPromise = settingStore.enableTTMLLyric ? getLyric("ttml", songLyricTTML) : null;

    let settled = false; // 是否已采用某一种歌词并结束加载状态
    let ttmlAdopted = false; // 是否已采用 TTML

    const adoptTTML = async () => {
      if (!ttmlPromise) {
        statusStore.usingTTMLLyric = false;
        return;
      }
      try {
        const { lyric: ttmlContent, isLocal: ttmlLocal } = await ttmlPromise;
        if (!ttmlContent) {
          statusStore.usingTTMLLyric = false;
          return;
        }
        // 本地 TTML 使用 parseLocalLyric，在线 TTML 使用原有解析方式
        if (ttmlLocal) {
          parseLocalLyric(ttmlContent, "ttml");
          statusStore.usingTTMLLyric = true;
          ttmlAdopted = true;
          if (!settled) {
            statusStore.lyricLoading = false;
            settled = true;
          }
          console.log("✅ TTML lyrics adopted (prefer TTML)");
          return;
        }
        // 在线 TTML 解析
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

        const updates: Partial<{
          yrcAMData: LyricLine[];
          yrcData: LyricType[];
          lrcData: LyricType[];
          lrcAMData: LyricLine[];
        }> = {};
        if (ttmlLyric?.length) {
          updates.yrcAMData = ttmlLyric;
          // 若当前无 LRC-AM 数据，使用 TTML-AM 作为回退
          if (!musicStore.songLyric.lrcAMData?.length) {
            updates.lrcAMData = ttmlLyric;
          }
        }
        if (ttmlYrcLyric?.length) {
          updates.yrcData = ttmlYrcLyric;
          // 若当前无 LRC 数据，使用 TTML 行级数据作为回退
          if (!musicStore.songLyric.lrcData?.length) {
            updates.lrcData = ttmlYrcLyric;
          }
        }

        if (Object.keys(updates).length) {
          musicStore.setSongLyric(updates);
          statusStore.usingTTMLLyric = true;
          ttmlAdopted = true;
          if (!settled) {
            statusStore.lyricLoading = false;
            settled = true;
          }
          console.log("✅ TTML lyrics adopted (prefer TTML)");
        } else {
          statusStore.usingTTMLLyric = false;
        }
      } catch (err) {
        console.error("❌ Error loading TTML lyrics:", err);
        statusStore.usingTTMLLyric = false;
      }
    };

    const adoptLRC = async () => {
      try {
        const { lyric: lyricRes, isLocal: lyricLocal } = await lrcPromise;
        // 如果 TTML 已采用，则忽略 LRC
        if (ttmlAdopted) return;
        // 如果没有歌词内容，直接返回
        if (!lyricRes) return;
        // 本地歌词使用 parseLocalLyric，在线歌词使用 parsedLyricsData
        if (lyricLocal) {
          parseLocalLyric(lyricRes, "lrc");
        } else {
          parsedLyricsData(lyricRes, !settingStore.enableExcludeLocalLyrics);
        }
        statusStore.usingTTMLLyric = false;
        if (!settled) {
          statusStore.lyricLoading = false;
          settled = true;
        }
        console.log("✅ LRC lyrics adopted");
      } catch (err) {
        console.error("❌ Error loading LRC lyrics:", err);
        if (!settled) statusStore.lyricLoading = false;
      }
    };

    // 启动并发任务：TTML 与 LRC 同时进行，哪个先成功就先用
    void adoptLRC();
    void adoptTTML();
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
