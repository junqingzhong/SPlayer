import { useMusicStore, useSettingStore } from "@/stores";
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
  if (!id) {
    resetSongLyric();
    return;
  }

  try {
    const musicStore = useMusicStore();
    const settingStore = useSettingStore();
    const [lyricRes, ttmlContent] = await Promise.all([
      songLyric(id),
      settingStore.enableTTMLLyric && songLyricTTML(id),
    ]);
    parsedLyricsData(lyricRes);
    if (ttmlContent) {
      const parsedResult = parseTTML(ttmlContent);
      if (!parsedResult?.lines?.length) return;
      const ttmlLyric = parseTTMLToAMLL(parsedResult);
      const ttmlYrcLyric = parseTTMLToYrc(parsedResult);
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
        musicStore.songLyric = {
          ...musicStore.songLyric,
          ...updates,
        };
      }
    }
  } catch (error) {
    console.error("❌ Error loading lyrics:", error);
    resetSongLyric();
  }
};
