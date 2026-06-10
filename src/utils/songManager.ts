import { songUrl, unlockSongUrl } from "@/api/song";
import { useDataStore, useMusicStore, useSettingStore, useStatusStore } from "@/stores";
import type { QualityType, SongType } from "@/types/main";
import { isElectron } from "./env";
import { getCoverColorData } from "./color";
import { handleSongQuality } from "./helper";

/**
 * 歌曲解锁服务器
 */
export enum SongUnlockServer {
  NETEASE = "netease",
  BODIAN = "bodian",
  KUWO = "kuwo",
  MIGU = "migu",
}

export type NextPrefetchSong = {
  id: number;
  url: string | null;
  ublock: boolean;
  quality?: QualityType | undefined;
} | null;

class SongManager {
  /**
   * 获取当前播放歌曲
   * @returns 当前播放歌曲
   */
  public getPlaySongData = (): SongType | null => {
    const dataStore = useDataStore();
    const musicStore = useMusicStore();
    const statusStore = useStatusStore();
    // 若为私人FM
    if (statusStore.personalFmMode) {
      return musicStore.personalFMSong;
    }
    // 播放列表
    const playlist = dataStore.playList;
    if (!playlist.length) return null;
    return playlist[statusStore.playIndex];
  };

  /**
   * 获取播放信息对象
   * @param song 歌曲
   * @param sep 分隔符
   * @returns 播放信息对象
   */
  public getPlayerInfoObj = (
    song?: SongType,
    sep: string = "/",
  ): { name: string; artist: string; album: string } | null => {
    const playSongData = song || this.getPlaySongData();
    if (!playSongData) return null;

    // 标题
    const name = `${playSongData.name || "未知歌曲"}`;

    // 歌手
    const artist =
      playSongData.type === "radio"
        ? "播客电台"
        : Array.isArray(playSongData.artists)
          ? playSongData.artists.map((artists: { name: string }) => artists.name).join(sep)
          : String(playSongData?.artists || "未知歌手");

    // 专辑
    const album =
      playSongData.type === "radio"
        ? "播客电台"
        : typeof playSongData.album === "object"
          ? playSongData.album.name
          : String(playSongData.album || "未知专辑");

    return { name, artist, album };
  };

  /**
   * 获取播放信息
   * @param song 歌曲
   * @param sep 分隔符
   * @returns 播放信息
   */
  public getPlayerInfo = (song?: SongType, sep: string = "/"): string | null => {
    const info = this.getPlayerInfoObj(song, sep);
    if (!info) return null;
    return `${info.name} - ${info.artist}`;
  };

  /**
   * 获取在线播放链接
   * @param id 歌曲id
   * @returns { url, isTrial } 播放链接与是否为试听
   */
  public getOnlineUrl = async (
    id: number,
  ): Promise<{ url: string | null; isTrial: boolean; quality?: QualityType | undefined }> => {
    const settingStore = useSettingStore();
    const res = await songUrl(id, settingStore.songLevel);
    console.log(`🌐 ${id} music data:`, res);
    const songData = res.data?.[0];
    // 是否有播放地址
    if (!songData || !songData?.url) return { url: null, isTrial: false };
    // 是否仅能试听
    const isTrial = songData?.freeTrialInfo !== null;
    // 返回歌曲地址
    // 客户端直接返回，网页端转 https, 并转换url以便解决音乐链接cors问题
    const normalizedUrl = isElectron
      ? songData.url
      : songData.url
          .replace(/^http:/, "https:")
          .replace(/m804\.music\.126\.net/g, "m801.music.126.net")
          .replace(/m704\.music\.126\.net/g, "m701.music.126.net");
    // 若为试听且未开启试听播放，则将 url 置为空，仅标记为试听
    const finalUrl = isTrial && !settingStore.playSongDemo ? null : normalizedUrl;
    // 获取音质
    const quality = handleSongQuality(songData, "online");
    console.log(`🎧 ${id} music url:`, finalUrl, quality);
    return { url: finalUrl, isTrial, quality };
  };

  /**
   * 获取解锁播放链接
   * @param songData 歌曲数据
   * @returns
   */
  public getUnlockSongUrl = async (songData: SongType): Promise<string | null> => {
    try {
      const songId = songData.id;
      const artist = Array.isArray(songData.artists) ? songData.artists[0].name : songData.artists;
      const keyWord = songData.name + "-" + artist;
      if (!songId || !keyWord) return null;
      // 获取音源列表
      const settingStore = useSettingStore();
      const servers = settingStore.songUnlockServer
        .filter((server) => server.enabled)
        .map((server) => server.key);
      if (servers.length === 0) return null;
      // 并发请求
      const promises = servers.map((server) => {
        return unlockSongUrl(songId, keyWord, server, songData.name, String(artist))
          .then((result) => ({
            server,
            result,
            success: result.code === 200 && !!result.url,
          }))
          .catch((err) => {
            console.error(`Unlock failed with server ${server}:`, err);
            return { server, result: null, success: false };
          });
      });
      // 按优先级顺序处理结果
      for (const p of promises) {
        try {
          const item = await p;
          if (item.success && item.result) {
            return item.result.url;
          }
        } catch {
          continue;
        }
      }
      return null;
    } catch (error) {
      console.error("Error in getUnlockSongUrl", error);
      return null;
    }
  };

  /**
   * 获取歌曲封面颜色数据
   * @param coverUrl 歌曲封面地址
   */
  public getCoverColor = async (coverUrl: string) => {
    if (!coverUrl) return;
    const statusStore = useStatusStore();
    // 创建图像元素
    const image = new Image();
    image.crossOrigin = "Anonymous";
    image.src = coverUrl;
    // 图像加载完成
    image.onload = () => {
      // 获取图片数据
      const coverColorData = getCoverColorData(image);
      if (coverColorData) statusStore.songCoverTheme = coverColorData;
      // 移除元素
      image.remove();
    };
  };

  /**
   * 预载下一首歌曲播放地址
   * @returns 预载数据
   */
  public getNextSongUrl = async (): Promise<NextPrefetchSong> => {
    try {
      const dataStore = useDataStore();
      const statusStore = useStatusStore();
      const settingStore = useSettingStore();

      // 无列表或私人FM模式直接跳过
      const playList = dataStore.playList;
      if (!playList?.length || statusStore.personalFmMode) {
        return null;
      }

      // 计算下一首（循环到首）
      let nextIndex = statusStore.playIndex + 1;
      if (nextIndex >= playList.length) nextIndex = 0;
      const nextSong = playList[nextIndex];
      if (!nextSong) {
        return null;
      }

      // 本地歌曲：直接缓存 file URL
      if (nextSong.path) {
        const songId = nextSong.type === "radio" ? nextSong.dj?.id : nextSong.id;
        return {
          id: Number(songId || nextSong.id),
          url: `file://${nextSong.path}`,
          ublock: false,
        };
      }

      // 在线歌曲：优先官方，其次解灰
      const songId = nextSong.type === "radio" ? nextSong.dj?.id : nextSong.id;
      if (!songId) {
        return null;
      }
      const canUnlock = isElectron && nextSong.type !== "radio" && settingStore.useSongUnlock;
      // 先请求官方地址
      const { url: officialUrl, isTrial, quality } = await this.getOnlineUrl(songId);
      if (officialUrl && !isTrial) {
        // 官方可播放且非试听
        return { id: songId, url: officialUrl, ublock: false, quality };
      } else if (canUnlock) {
        // 官方失败或为试听时尝试解锁
        const unlockUrl = await this.getUnlockSongUrl(nextSong);
        if (unlockUrl) {
          return { id: songId, url: unlockUrl, ublock: true };
        } else if (officialUrl && settingStore.playSongDemo) {
          // 解锁失败，若官方为试听且允许试听，保留官方试听地址
          return { id: songId, url: officialUrl, ublock: false };
        } else {
          return { id: songId, url: null, ublock: false };
        }
      } else {
        // 不可解锁，仅保留官方结果（可能为空）
        return { id: songId, url: officialUrl, ublock: false };
      }
    } catch (error) {
      console.error("Error prefetching next song url:", error);
      return null;
    }
  };
}

export default new SongManager();
