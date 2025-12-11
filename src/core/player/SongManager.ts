import { songUrl, unlockSongUrl } from "@/api/song";
import { useDataStore, useMusicStore, useSettingStore, useStatusStore } from "@/stores";
import type { QualityType, SongType } from "@/types/main";
import { isElectron } from "@/utils/env";
import { getCoverColorData } from "@/utils/color";
import { handleSongQuality } from "@/utils/helper";

/**
 * 歌曲解锁服务器
 */
export enum SongUnlockServer {
  NETEASE = "netease",
  BODIAN = "bodian",
  // KUWO = "kuwo",
  GEQUBAO = "gequbao",
}

/** 歌曲播放地址信息 */
export type AudioSource = {
  /** 歌曲id */
  id: number;
  /** 歌曲播放地址 */
  url?: string;
  /** 是否解锁 */
  isUnlocked?: boolean;
  /** 是否为试听 */
  isTrial?: boolean;
  /** 音质 */
  quality?: QualityType;
};

export class SongManager {
  private static instance: SongManager;
  /** 预载下一首歌曲播放信息 */
  private nextPrefetch: AudioSource | undefined;
  private constructor() {}
  /**
   * SongManager 单例实例
   */
  public static getInstance(): SongManager {
    if (!this.instance) this.instance = new SongManager();
    return this.instance;
  }
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
   * @returns 在线播放信息
   */
  public getOnlineUrl = async (id: number): Promise<AudioSource> => {
    const settingStore = useSettingStore();
    const res = await songUrl(id, settingStore.songLevel);
    console.log(`🌐 ${id} music data:`, res);
    const songData = res.data?.[0];
    // 是否有播放地址
    if (!songData || !songData?.url) return { id, url: undefined };
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
    return { id, url: finalUrl, isTrial, quality };
  };

  /**
   * 获取解锁播放链接
   * @param songData 歌曲数据
   * @returns
   */
  public getUnlockSongUrl = async (song: SongType): Promise<AudioSource> => {
    const settingStore = useSettingStore();
    const songId = song.id;
    const artist = Array.isArray(song.artists) ? song.artists[0].name : song.artists;
    const keyWord = song.name + "-" + artist;
    if (!songId || !keyWord) {
      return { id: songId, url: undefined };
    }

    // 获取音源列表
    const servers = settingStore.songUnlockServer.filter((s) => s.enabled).map((s) => s.key);
    if (servers.length === 0) {
      return { id: songId, url: undefined };
    }

    // 并发执行
    const results = await Promise.allSettled(
      servers.map((server) =>
        unlockSongUrl(songId, keyWord, server).then((result) => ({
          server,
          result,
          success: result.code === 200 && !!result.url,
        })),
      ),
    );

    // 按顺序找成功项
    for (const r of results) {
      if (r.status === "fulfilled" && r.value.success) {
        return {
          id: songId,
          url: r.value?.result?.url,
          isUnlocked: true,
        };
      }
    }
    return { id: songId, url: undefined };
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
  public getNextSongUrl = async (): Promise<AudioSource> => {
    try {
      const dataStore = useDataStore();
      const statusStore = useStatusStore();
      const settingStore = useSettingStore();

      // 无列表或私人FM模式直接跳过
      const playList = dataStore.playList;
      if (!playList?.length || statusStore.personalFmMode) {
        return { id: 0, url: undefined };
      }

      // 计算下一首（循环到首）
      let nextIndex = statusStore.playIndex + 1;
      if (nextIndex >= playList.length) nextIndex = 0;
      const nextSong = playList[nextIndex];
      if (!nextSong) return { id: 0, url: undefined };

      // 本地歌曲跳过
      if (nextSong.path) return { id: Number(nextSong.id), url: `file://${nextSong.path}` };

      // 在线歌曲：优先官方，其次解灰
      const songId = nextSong.type === "radio" ? nextSong.dj?.id : nextSong.id;
      if (!songId) return { id: 0, url: undefined };

      // 是否可解锁
      const canUnlock = isElectron && nextSong.type !== "radio" && settingStore.useSongUnlock;
      // 先请求官方地址
      const { url: officialUrl, isTrial, quality } = await this.getOnlineUrl(songId);
      if (officialUrl && !isTrial) {
        // 官方可播放且非试听
        return { id: songId, url: officialUrl, isUnlocked: false, quality };
      } else if (canUnlock) {
        // 官方失败或为试听时尝试解锁
        const unlockUrl = await this.getUnlockSongUrl(nextSong);
        if (unlockUrl.url) {
          return { id: songId, url: unlockUrl.url, isUnlocked: true };
        } else if (officialUrl && settingStore.playSongDemo) {
          // 解锁失败，若官方为试听且允许试听，保留官方试听地址
          return { id: songId, url: officialUrl };
        } else {
          return { id: songId, url: undefined };
        }
      } else {
        // 不可解锁，仅保留官方结果（可能为空）
        return { id: songId, url: officialUrl };
      }
    } catch (error) {
      console.error("❌ 预加载下一首歌曲地址失败", error);
      return { id: 0, url: undefined };
    }
  };

  /**
   * 获取音频源
   * 始终从此方法获取对应歌曲播放信息
   * @param song 歌曲
   * @returns 音频源
   */
  public getAudioSource = async (song: SongType): Promise<AudioSource> => {
    const settingStore = useSettingStore();

    // 本地文件直接返回
    if (song.path) {
      return {
        id: song.id,
        url: `file://${song.path}`,
        isUnlocked: false,
        quality: undefined, // 本地文件稍后获取音质
      };
    }

    // 在线歌曲
    const songId = song.type === "radio" ? song.dj?.id : song.id;
    if (!songId) return { id: 0, url: undefined, quality: undefined, isUnlocked: false };

    // 检查缓存并返回
    if (this.nextPrefetch && this.nextPrefetch.id === songId && settingStore.useNextPrefetch) {
      console.log("🚀 使用预加载缓存播放");
      return this.nextPrefetch;
    }

    // 在线获取
    try {
      // 是否可解锁
      const canUnlock = isElectron && song.type !== "radio" && settingStore.useSongUnlock;
      // 尝试获取官方链接
      const { url: officialUrl, isTrial, quality } = await this.getOnlineUrl(songId);
      // 如果官方链接有效且非试听（或者用户接受试听）
      if (officialUrl && (!isTrial || (isTrial && settingStore.playSongDemo))) {
        if (isTrial) window.$message.warning("当前歌曲仅可试听");
        return { id: songId, url: officialUrl, quality, isUnlocked: false };
      }
      // 尝试解锁
      if (canUnlock) {
        const unlockUrl = await this.getUnlockSongUrl(song);
        if (unlockUrl.url) {
          console.log("🔓 Song unlock successfully");
          return unlockUrl;
        }
      }
      // 无可用源
      return { id: songId, url: undefined, quality: undefined, isUnlocked: false };
    } catch (e) {
      console.error("获取音频源异常", e);
      return {
        id: songId,
        url: undefined,
        quality: undefined,
        isUnlocked: false,
      };
    }
  };
}
