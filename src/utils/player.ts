import { type SongType, type PlayModeType } from "@/types/main";
import { type IFormat } from "music-metadata";
import { type MessageReactive } from "naive-ui";
import { cloneDeep } from "lodash-es";
import { useMusicStore, useStatusStore, useDataStore, useSettingStore } from "@/stores";
// import { msToS } from "./time"; // 未使用，后续功能需要时再添加
import { shuffleArray, handleSongQuality } from "./helper";
import { heartRateList } from "@/api/playlist";
import { formatSongsList } from "./format";
import { isLogin } from "./auth";
import { openUserLogin } from "./modal";
import { personalFm, personalFmToTrash } from "@/api/rec";
import songManager, { type NextPrefetchSong } from "./songManager";
import { isElectron, isDev } from "./env";
import audioManager from "./audioManager";
import lyricManager from "./lyricManager";
import blob from "./blob";
import { songUrl, unlockSongUrl } from "@/api/song";

// 导入Howler相关类型定义
declare const Howler: any;
declare const Howl: any;
declare const allowPlayFormat: string[];

/**
 * 播放器核心
 * 基于 AudioManager 实现
 */
class Player {
  /** 自动关闭定时器 */
  private autoCloseInterval: ReturnType<typeof setInterval> | undefined;
  /** 其他数据 */
  private message: MessageReactive | null = null;
  /** 预载下一首歌曲播放地址缓存 */
  // @ts-expect-error - 在多个方法中使用
  private _nextPrefetch: NextPrefetchSong = null;
  /** Howler播放器实例 */
  private player: any = null;
  constructor() {
    // 初始化媒体会话
    this.initMediaSession();
    // 绑定音频事件
    this.bindAudioEvents();
  }
  /**
   * 绑定 AudioManager 事件
   */
  private bindAudioEvents() {
    // 播放
    audioManager.on("play", () => {
      const statusStore = useStatusStore();
      const playSongData = songManager.getPlaySongData();
      const { name, artist } = songManager.getPlayerInfoObj() || {};
      const playTitle = `${name} - ${artist}`;
      window.document.title = `${playTitle} | SPlayer`;
      statusStore.playStatus = true;
      // 重置重试计数
      // IPC 通知
      if (isElectron) {
        window.electron.ipcRenderer.send("play-status-change", true);
        window.electron.ipcRenderer.send("play-song-change", playTitle);
        window.electron.ipcRenderer.send("update-desktop-lyric-data", {
          playName: name,
          artistName: artist,
        });
      }
      console.log("▶️ song play:", playSongData);
    });
    // 暂停
    audioManager.on("pause", () => {
      const statusStore = useStatusStore();
      const playSongData = songManager.getPlaySongData();
      statusStore.playStatus = false;
      if (!isElectron) window.document.title = "SPlayer";
      // IPC 通知
      if (isElectron) {
        window.electron.ipcRenderer.send("play-status-change", false);
      }
      console.log("⏸️ song pause:", playSongData);
    });
  }
  /**
   * 获取当前播放歌曲
   * @returns 当前播放歌曲
   */
  private getPlaySongData(): SongType | null {
    const dataStore = useDataStore();
    const musicStore = useMusicStore();
    const statusStore = useStatusStore();
    // 若为私人FM
    if (statusStore.personalFmMode) {
      return musicStore.personalFMSong;
    }
    // 播放列表
    const playlist = dataStore.playList;
    if (!playlist.length) {
      console.log(`getPlaySongData: 播放列表为空`);
      return null;
    }
    console.log(
      `getPlaySongData: playIndex=${statusStore.playIndex}, 播放列表长度=${playlist.length}`,
    );
    if (statusStore.playIndex < 0 || statusStore.playIndex >= playlist.length) {
      console.log(`getPlaySongData: playIndex超出范围，重置为0`);
      statusStore.playIndex = 0;
    }
    return playlist[statusStore.playIndex];
  }

  /**
   * 获取在线播放链接
   * @param id 歌曲id
   * @returns 播放链接
   */
  private async getOnlineUrl(id: number): Promise<string | null> {
    const settingStore = useSettingStore();
    const dataStore = useDataStore();
    const statusStore = useStatusStore();
    const songUnData = this.getPlaySongData();

    // 查找当前歌曲在播放列表中的位置
    const { playList } = dataStore;
    const songIndex = playList.findIndex((song) => {
      const songId = song.type === "radio" ? song.dj?.id : song.id;
      return songId === id;
    });

    // 如果找到了歌曲，检查是否有缓存的URL
    if (songIndex !== -1) {
      const song = playList[songIndex];
      // 检查缓存URL是否存在且未过期（默认30分钟有效期）
      const cacheExpiry = 30 * 60 * 1000; // 30分钟
      const now = Date.now();

      // 优先检查解锁URL缓存
      if (
        (song as any).cachedUnlockUrl &&
        (song as any).cachedUnlockTime &&
        now - (song as any).cachedUnlockTime < cacheExpiry
      ) {
        console.log(`✅ ${id} 已存在解锁链接播放`);
        // 如果是当前播放歌曲，直接返回缓存URL
        if (songIndex === statusStore.playIndex) {
          return (song as any).cachedUnlockUrl;
        }
      }

      // 然后检查普通URL缓存
      if (
        (song as any).cachedUrl &&
        (song as any).cachedTime &&
        now - (song as any).cachedTime < cacheExpiry
      ) {
        console.log(`✅ ${id} 使用缓存链接播放`);
        // 如果是当前播放歌曲，直接返回缓存URL
        if (songIndex === statusStore.playIndex) {
          return (song as any).cachedUrl;
        }
      }
    }

    // 1. 优先尝试使用解锁链接（提前尝试解锁，不等待网易云返回）
    if (isElectron && songUnData && settingStore.useSongUnlock) {
      try {
        const unlockUrl = await this.getUnlockSongUrl(songUnData);
        if (unlockUrl) {
          console.log(`🔓 ${id} 使用解锁链接播放`);
          // 保存解锁URL到歌曲对象中
          if (songIndex !== -1) {
            const song = playList[songIndex];
            (song as any).cachedUnlockUrl = unlockUrl;
            (song as any).cachedUnlockTime = Date.now();
          }
          // 如果是当前播放歌曲，返回解锁URL
          if (songIndex === statusStore.playIndex) {
            return unlockUrl;
          }
        }
      } catch (error) {
        console.error("尝试解锁失败，将使用原始链接", error);
      }
    }

    // 2. 尝试获取网易云官方链接
    const res = await songUrl(id, settingStore.songLevel);
    console.log(`🌐 ${id} music data:`, res);
    const songData = res.data?.[0];

    // 是否仅能试听
    if (songData?.freeTrialInfo !== null) {
      if (settingStore.playSongDemo) {
        window.$message.warning("当前歌曲仅可试听，请开通会员后重试");
      } else {
        // 4. 如果是试听版本，尝试解锁（确保之前没有尝试过）
        if (songUnData && (!settingStore.useSongUnlock || !(songUnData as any).unlockAttempted)) {
          const unlockUrl = await this.getUnlockSongUrl(songUnData);
          if (unlockUrl) {
            console.log(`🔓 ${id} 试听版本，使用解锁链接播放`);
            // 保存解锁URL到歌曲对象中
            if (songIndex !== -1) {
              const song = playList[songIndex];
              (song as any).cachedUnlockUrl = unlockUrl;
              (song as any).cachedUnlockTime = Date.now();
              // 同时更新通用缓存URL
              (song as any).cachedUrl = unlockUrl;
              (song as any).cachedTime = Date.now();
            }
            // 如果是当前播放歌曲，返回解锁URL
            if (songIndex === statusStore.playIndex) {
              return unlockUrl;
            }
          }
        }
        return null;
      }
    }

    // 保存获取到的URL到歌曲对象中
    if (songIndex !== -1) {
      const song = playList[songIndex];
      (song as any).cachedUnlockUrl = songData.url;
      (song as any).cachedUnlockTime = Date.now();
    }
    return songData.url;
  }
  /**
   * 获取解锁播放链接
   * @param songData 歌曲数据
   * @returns 解锁后的播放链接
   */
  private async getUnlockSongUrl(songData: SongType): Promise<string | null> {
    try {
      const settingStore = useSettingStore();

      const songId = songData.id;
      const artist = Array.isArray(songData.artists) ? songData.artists[0].name : songData.artists;
      const keyWord = songData.name + "-" + artist;
      if (!songId || !keyWord) return null;

      // 检查缓存的解锁URL是否存在且未过期
      const cacheExpiry = 30 * 60 * 1000; // 30分钟
      const now = Date.now();
      // 标记已尝试解锁，避免重复尝试
      if (
        (songData as any).unlockAttempted &&
        !(
          (songData as any).cachedUnlockTime &&
          now - (songData as any).cachedUnlockTime >= cacheExpiry
        )
      ) {
        return (songData as any).cachedUnlockUrl || null;
      }

      // 设置解锁尝试标记
      (songData as any).unlockAttempted = true;

      // 获取用户配置的音源解锁服务器列表（按优先级排序）
      const { songUnlockServer } = settingStore;

      // 过滤出启用的音源并按配置顺序排序
      const enabledSources: string[] = songUnlockServer
        .filter((server) => server.enabled)
        .map((server) => server.key);

      // 如果没有选择任何平台，直接返回null
      if (enabledSources.length === 0) {
        console.log("没有选择任何音频解锁来源");
        return null;
      }

      console.log(`🎵 按优先级搜索音源: ${enabledSources.join(" → ")}`);

      // 获取用户设置的音质等级
      const { songLevel } = settingStore;

      // 音质优先级映射（数值越大优先级越高）
      const qualityPriority = {
        jm: 9, // 超清母带
        db: 8, // 杜比全景声
        hr: 7, // Hi-Res
        sq: 6, // 无损音质
        h: 5, // 极高音质
        m: 4, // 较高音质
        l: 3, // 标准音质
      };

      // 收集所有平台的结果进行比较
      const availableUrls: Array<{
        url: string;
        source: string;
        quality: string;
        priority: number;
        isFlac: boolean;
        duration?: number;
      }> = [];

      // 遍历所有启用的平台，每个平台只使用用户设置的音质等级
      for (const source of enabledSources) {
        console.log(`🔍 正在 ${source} 平台搜索歌曲（${songLevel}音质）...`);

        try {
          const result = await unlockSongUrl(
            songId,
            keyWord,
            source as "qq" | "kugou" | "kuwo" | "netease" | "bilibili",
            songLevel,
          );
          if (result && result.code === 200 && result.url) {
            // 检测是否为FLAC格式
            const urlLower = result.url.toLowerCase();
            const isFlac =
              urlLower.includes(".flac") ||
              urlLower.includes("flac") ||
              urlLower.includes("lossless") ||
              urlLower.includes("ape");

            // 计算优先级：音质等级 + FLAC奖励
            const basePriority = qualityPriority[songLevel as keyof typeof qualityPriority] || 0;
            const flacBonus = isFlac ? 10 : 0;
            const finalPriority = basePriority + flacBonus;

            availableUrls.push({
              url: result.url,
              source,
              quality: songLevel,
              priority: finalPriority,
              isFlac,
              duration: result.duration,
            });

            console.log(
              `🔍 ${source} 平台发现可用链接: ${songLevel}音质 ${isFlac ? "(FLAC)" : ""} - 优先级: ${finalPriority}`,
            );
          } else {
            console.log(`❌ ${source} 平台未找到${songLevel}音质的链接`);
          }
        } catch (error) {
          console.error(`${source} 平台 ${songLevel}音质解锁失败:`, error);
        }
      }

      // 按用户配置的音源优先级选择第一个可用的链接
      if (availableUrls.length > 0) {
        // 按用户配置的顺序选择第一个可用的音源
        let selectedUrl: {
          url: string;
          source: string;
          quality: string;
          priority: number;
          isFlac: boolean;
          duration?: number;
        } | null = null;
        for (const source of enabledSources) {
          const urlData = availableUrls.find((item) => item.source === source);
          if (urlData) {
            selectedUrl = urlData;
            break;
          }
        }

        // 如果没找到按顺序的，就按音质优先级选择最佳的
        if (!selectedUrl) {
          availableUrls.sort((a, b) => b.priority - a.priority);
          selectedUrl = availableUrls[0];
        }

        if (selectedUrl) {
          (songData as any).cachedUnlockUrl = selectedUrl.url;
          (songData as any).cachedUnlockTime = Date.now();

          console.log(
            `✅ 选择链接: ${selectedUrl.source} - ${selectedUrl.quality}音质 ${selectedUrl.isFlac ? "(FLAC)" : ""} - 优先级: ${selectedUrl.priority}`,
          );

          return selectedUrl.url;
        }
      }

      // 所有选中的平台都解锁失败
      console.log(`❌ 所有选中的平台都解锁失败: ${enabledSources.join(" → ")}`);
      return null;
    } catch (error) {
      console.error("Error in getUnlockSongUrl", error);
      return null;
    }
  }

  /**
   * 处理跨域问题
   * @param url 音频URL
   * @returns 处理后的URL
   */
  private handleCrossDomain(url: string): string {
    const settingStore = useSettingStore();

    // 如果是客户端，不需要处理跨域
    if (isElectron) return url;

    // 如果URL已经是HTTPS，尝试直接使用
    if (url.startsWith("https://")) {
      // 添加crossOrigin属性在createPlayer方法中已处理
      return url;
    }

    // 如果是HTTP链接，转换为HTTPS
    if (url.startsWith("http://")) {
      return url.replace(/^http:/, "https:");
    }

    // 如果配置了代理服务器，使用代理服务器
    if ((settingStore as any).useProxyServer && (settingStore as any).proxyServerUrl) {
      return `${(settingStore as any).proxyServerUrl}/proxy?url=${encodeURIComponent(url)}`;
    }

    return url;
  }
  /**
   * 创建播放器并播放
   * @param src 播放地址
   * @param autoPlay 是否自动播放
   * @param seek 播放位置
   */
  private async createPlayer(src: string, autoPlay: boolean = true, seek: number = 0) {
    // 获取数据
    const dataStore = useDataStore();
    const musicStore = useMusicStore();
    const statusStore = useStatusStore();
    const settingStore = useSettingStore();
    // 播放信息
    const { id, path, type } = musicStore.playSong;
    console.log(`createPlayer: 创建播放器，歌曲ID=${id}, playIndex=${statusStore.playIndex}`);
    // 清理播放器
    Howler.unload();

    // 处理跨域问题
    const processedSrc = this.handleCrossDomain(src);

    // 创建播放器
    this.player = new Howl({
      src: processedSrc,
      format: allowPlayFormat,
      html5: true,
      autoplay: autoPlay,
      preload: "metadata",
      pool: 1,
      volume: statusStore.playVolume,
      rate: statusStore.playRate,
      xhr: {
        // 添加跨域支持
        withCredentials: false,
      },
    });

    // 播放器事件
    this.playerEvent({ seek });
    // 播放设备
    if (!settingStore.showSpectrums) this.toggleOutputDevice();
    // 加载并播放
    try {
      await audioManager.play(src, { fadeIn: false, autoPlay });
      // 恢复进度
      if (seek && seek > 0) {
        audioManager.seek(seek / 1000);
      }
    } catch (e) {
      console.error("Player create failed", e);
    }
    // 获取歌词数据
    lyricManager.handleLyric(id, path);
    // 新增播放历史
    if (type !== "radio") dataStore.setHistory(musicStore.playSong);
    // 获取歌曲封面主色
    if (!path) songManager.getCoverColor(musicStore.songCover);
    // 更新 MediaSession
    if (!path) this.updateMediaSession();
    // 预缓存下一首歌曲
    this.preCacheNextSongs();
    // 开发模式
    if (isDev) (window as any).player = this.player;
  }

  /**
   * 预缓存下一首和下下首歌曲
   * 每次缓存两首歌，减少播放时的卡顿
   */
  private async preCacheNextSongs() {
    try {
      const dataStore = useDataStore();
      const statusStore = useStatusStore();
      const settingStore = useSettingStore();

      // 如果是私人FM模式或单曲循环模式，不进行预缓存
      if (statusStore.personalFmMode || statusStore.playSongMode === "repeat-once") {
        return;
      }

      // 获取播放列表
      const { playList } = dataStore;
      const playListLength = playList.length;

      // 如果播放列表少于2首歌，不需要预缓存
      if (playListLength <= 1) return;

      // 计算需要预缓存的索引
      const nextIndices: number[] = [];
      const currentIndex = statusStore.playIndex;

      // 预缓存下一首歌曲
      const nextIndex = (currentIndex + 1) % playListLength;
      // nextIndices.push(nextIndex);

      // 根据播放模式决定是否预缓存其他歌曲
      if (statusStore.playSongMode === "repeat" || statusStore.playHeartbeatMode) {
        // 列表循环或心动模式，预缓存下下首
        nextIndices.push((currentIndex + 1) % playListLength);
      } else if (statusStore.playSongMode === "shuffle") {
        // 随机播放模式，随机选择一首不同的歌曲
        let randomIndex;
        do {
          randomIndex = Math.floor(Math.random() * playListLength);
        } while (randomIndex === currentIndex || randomIndex === nextIndex);

        nextIndices.push(randomIndex);
      }

      // 预缓存上一首歌曲（用于向前切换）
      const prevIndex = currentIndex <= 0 ? playListLength - 1 : currentIndex - 1;
      if (!nextIndices.includes(prevIndex) && prevIndex !== currentIndex) {
        nextIndices.push(prevIndex);
      }

      console.log(`预缓存索引: ${nextIndices.join(", ")}，当前索引: ${currentIndex}`);

      // 预缓存歌曲（异步进行，不阻塞主播放流程）
      for (const index of nextIndices) {
        const song = playList[index];
        if (!song) continue;

        // 本地歌曲不需要预缓存
        if (song.path) continue;

        const { id, dj, type } = song;
        const songId = type === "radio" ? dj?.id : id;

        if (!songId) continue;

        // 检查缓存URL是否存在且未过期
        const cacheExpiry = 30 * 60 * 1000; // 30分钟
        const now = Date.now();

        // 检查是否有有效的缓存URL
        const hasValidCache =
          ((song as any).cachedUrl &&
            (song as any).cachedTime &&
            now - (song as any).cachedTime < cacheExpiry) ||
          ((song as any).cachedUnlockUrl &&
            (song as any).cachedUnlockTime &&
            now - (song as any).cachedUnlockTime < cacheExpiry);

        // 如果歌曲已经有有效的缓存URL，跳过获取
        if (hasValidCache) {
          console.log(`✅ 歌曲已缓存: ${song.name}`);
          continue;
        }
        // 异步获取歌曲URL并预加载
        console.log(`🔄 开始预缓存歌曲: ${song.name}, 索引: ${index}`);
        this.getOnlineUrl(song.id)
          .then((url) => {
            if (url) {
              // 保存URL到歌曲对象中
              (song as any).cachedUrl = url;
              (song as any).cachedTime = Date.now();

              // 创建一个新的Howl实例进行预加载，但不播放
              new Howl({
                src: [url],
                format: allowPlayFormat,
                html5: true,
                autoplay: false,
                preload: "metadata", // 只预加载元数据，减少内存占用
              });
              console.log(`✅ 预缓存成功: ${song.name}, 索引: ${song.id}`);
            } else if (isElectron && type !== "radio" && settingStore.useSongUnlock) {
              // 尝试解锁歌曲
              this.getUnlockSongUrl(song)
                .then((unlockUrl) => {
                  if (unlockUrl) {
                    // 保存解锁URL到歌曲对象中
                    (song as any).cachedUnlockUrl = unlockUrl;
                    (song as any).cachedUnlockTime = Date.now();

                    new Howl({
                      src: [unlockUrl],
                      format: allowPlayFormat,
                      html5: true,
                      autoplay: false,
                      preload: "metadata",
                    });
                    console.log(`✅ 预缓存解锁成功: ${song.name}, 索引: ${index}`);
                  }
                })
                .catch((err) => {
                  console.error(`预缓存解锁歌曲失败: ${song.name}, 索引: ${index}`, err);
                });
            }
          })
          .catch((err) => {
            console.error(`预缓存歌曲失败: ${song.name}, 索引: ${index}`, err);
          });
      }
    } catch (error) {
      console.error("预缓存歌曲出错:", error);
    }
  }
  /**
   * 播放器事件
   */
  private playerEvent(
    options: {
      // 恢复进度
      seek?: number;
    } = { seek: 0 },
  ) {
    // 获取数据
    const dataStore = useDataStore();
    const statusStore = useStatusStore();
    const settingStore = useSettingStore();
    const playSongData = this.getPlaySongData();
    // 获取配置
    const { seek } = options;
    // 初次加载
    this.player.once("load", () => {
      // 允许跨域
      if (settingStore.showSpectrums) {
        const audioDom = this.getAudioDom();
        if (audioDom) {
          audioDom.crossOrigin = "anonymous";
        }
      }
      // 恢复进度（ 需距离本曲结束大于 2 秒 ）
      if (seek && statusStore.duration - statusStore.currentTime > 2) this.setSeek(seek);
      // 更新状态
      statusStore.playLoading = false;
      // ipc
      if (isElectron) {
        window.electron.ipcRenderer.send("play-song-change", this.getPlayerInfo());
        window.electron.ipcRenderer.send(
          "like-status-change",
          dataStore.isLikeSong(playSongData?.id || 0),
        );
      }
    });
    // 播放
    this.player.on("play", () => {
      window.document.title = this.getPlayerInfo() || "SPlayer";
      // ipc
      if (isElectron) {
        window.electron.ipcRenderer.send("play-status-change", true);
        window.electron.ipcRenderer.send("play-song-change", this.getPlayerInfo());
      }
      console.log("▶️ song play:", playSongData);
    });
    // 暂停
    this.player.on("pause", () => {
      if (!isElectron) window.document.title = "SPlayer";
      // ipc
      if (isElectron) window.electron.ipcRenderer.send("play-status-change", false);
      console.log("⏸️ song pause:", playSongData);
    });
    // 结束
    this.player.on("end", () => {
      // statusStore.playStatus = false;
      console.log("⏹️ song end:", playSongData);
      console.log(`歌曲播放结束，准备切换到下一首，当前playIndex=${statusStore.playIndex}`);
      this.nextOrPrev("auto");
    });
    // 错误
    this.player.on("loaderror", (sourceid, err: any) => {
      this.errorNext(err);
      console.error("❌ song error:", sourceid, playSongData, err);
    });
  }
  /**
   * 初始化 MediaSession
   */
  private initMediaSession() {
    if (!("mediaSession" in navigator)) return;
    navigator.mediaSession.setActionHandler("play", () => this.play());
    navigator.mediaSession.setActionHandler("pause", () => this.pause());
    navigator.mediaSession.setActionHandler("previoustrack", () => this.nextOrPrev("prev"));
    navigator.mediaSession.setActionHandler("nexttrack", () => this.nextOrPrev("next"));
    navigator.mediaSession.setActionHandler("seekto", (event) => {
      const seekTime = event.seekTime ? Number(event.seekTime) * 1000 : 0;
      if (seekTime) this.setSeek(seekTime);
    });
  }
  /** 更新 MediaSession */
  private updateMediaSession() {
    if (!("mediaSession" in navigator)) return;
    const musicStore = useMusicStore();
    // 获取播放数据
    const playSongData = songManager.getPlaySongData();
    if (!playSongData) return;
    // 播放状态
    const isRadio = playSongData.type === "radio";
    // 获取数据
    const metaData: MediaMetadataInit = {
      title: playSongData.name,
      artist: isRadio
        ? "播客电台"
        : Array.isArray(playSongData.artists)
          ? playSongData.artists.map((item) => item.name).join(" / ")
          : String(playSongData.artists),
      album: isRadio
        ? "播客电台"
        : typeof playSongData.album === "object"
          ? playSongData.album.name
          : String(playSongData.album),
      artwork: [
        { src: musicStore.getSongCover("cover"), sizes: "512x512", type: "image/jpeg" },
        { src: musicStore.getSongCover("s"), sizes: "100x100", type: "image/jpeg" },
        { src: musicStore.getSongCover("m"), sizes: "300x300", type: "image/jpeg" },
        { src: musicStore.getSongCover("l"), sizes: "1024x1024", type: "image/jpeg" },
        { src: musicStore.getSongCover("xl"), sizes: "1920x1920", type: "image/jpeg" },
      ],
    };
    navigator.mediaSession.metadata = new window.MediaMetadata(metaData);
  }
  /**
   * 实时更新 MediaSession
   * @param duration 歌曲总时长（毫秒）
   * @param currentTime 当前播放时间（毫秒）
   */
  /**
   * 获取频谱数据
   */
  getSpectrumData(): Uint8Array | null {
    return audioManager.getFrequencyData();
  }
  /**
   * 获取本地歌曲元信息
   * @param path 歌曲路径
   */
  private async parseLocalMusicInfo(path: string) {
    try {
      const musicStore = useMusicStore();
      const statusStore = useStatusStore();
      // 清理旧的 blob URL（如果存在）
      const oldCover = musicStore.playSong.cover;
      const oldPath = musicStore.playSong.path;
      if (oldCover && oldCover.startsWith("blob:") && oldPath && oldPath !== path) {
        blob.revokeBlobURL(oldPath);
      }
      // 获取封面数据
      const coverData = await window.electron.ipcRenderer.invoke("get-music-cover", path);
      if (coverData) {
        const { data, format } = coverData;
        const blobURL = blob.createBlobURL(data, format, path);
        if (blobURL) musicStore.playSong.cover = blobURL;
      } else {
        musicStore.playSong.cover = "/images/song.jpg?assest";
      }
      // 更新媒体会话
      this.updateMediaSession();
      // 获取元数据
      const infoData: { format: IFormat } = await window.electron.ipcRenderer.invoke(
        "get-music-metadata",
        path,
      );
      // 更新音质
      statusStore.songQuality = handleSongQuality(infoData.format.bitrate ?? 0);
      // 获取主色
      songManager.getCoverColor(musicStore.playSong.cover);
    } catch (error) {
      window.$message.error("获取本地歌曲元信息失败");
      console.error("Failed to parse local music info:", error);
    }
  }
  /**
   * 重置状态
   */
  public resetStatus() {
    this._nextPrefetch = null;
    const musicStore = useMusicStore();
    const statusStore = useStatusStore();
    const settingStore = useSettingStore();
    // 重置状态
    statusStore.$patch({
      currentTime: 0,
      duration: 0,
      progress: 0,
      lyricIndex: -1,
      playStatus: false,
      playLoading: false,
    });
    musicStore.playPlaylistId = 0;
    musicStore.resetMusicData();
    if (settingStore.showTaskbarProgress) {
      window.electron.ipcRenderer.send("set-bar", "none");
    }
  }
  /**
   * 初始化播放器
   * 核心外部调用
   * @param autoPlay 是否自动播放
   * @param seek 播放位置
   */
  public async initPlayer(autoPlay: boolean = true, seek: number = 0) {
    const dataStore = useDataStore();
    const musicStore = useMusicStore();
    const statusStore = useStatusStore();
    const settingStore = useSettingStore();
    try {
      // 获取播放数据
      const playSongData = this.getPlaySongData();
      if (!playSongData) {
        console.log(`initPlayer: 无法获取播放数据，可能是playIndex无效`);
        return;
      }

      const { id, dj, path, type } = playSongData;
      console.log(
        `initPlayer: 准备播放歌曲 ${playSongData.name},当前playIndex=${statusStore.playIndex}, id=${id}`,
      );
      // 更改当前播放歌曲
      musicStore.playSong = playSongData;
      statusStore.playLoading = true;
      // 停止当前播放
      audioManager.stop();
      // 本地歌曲
      if (path) {
        await this.createPlayer(path, autoPlay, seek);
        // 获取歌曲元信息
        await this.parseLocalMusicInfo(path);
        // 预缓存下一首和下下首歌曲
        this.preCacheNextSongs();
      }
      // 在线歌曲
      else if (id && dataStore.playList.length) {
        const songId = type === "radio" ? dj?.id : id;
        if (!songId) throw new Error("Get song id error");

        // 检查是否有缓存的URL
        const cacheExpiry = 30 * 60 * 1000; // 30分钟
        const now = Date.now();
        let cachedUrl = null;
        let isUnlockUrl = false;
        // 检查是否有缓存的URL（优先检查解锁URL）
        if (
          (playSongData as any).cachedUnlockUrl &&
          (playSongData as any).cachedUnlockTime &&
          now - (playSongData as any).cachedUnlockTime < cacheExpiry
        ) {
          cachedUrl = (playSongData as any).cachedUnlockUrl;
          isUnlockUrl = true;
          console.log(`✅ 使用缓存解锁链接播放: ${(playSongData as any).cachedUnlockUrl}`);
        }
        // 然后检查普通缓存URL
        else if (
          (playSongData as any).cachedUrl &&
          (playSongData as any).cachedTime &&
          now - (playSongData as any).cachedTime < cacheExpiry
        ) {
          cachedUrl = (playSongData as any).cachedUrl;
          console.log(`✅ 使用原链接播放: ${(playSongData as any).cachedUrl}`);
        }
        // 如果有缓存的URL，直接使用
        if (cachedUrl) {
          statusStore.playUblock = isUnlockUrl;
          await this.createPlayer(cachedUrl, autoPlay, seek);
          // 预缓存下一首和下下首歌曲
          this.preCacheNextSongs();
        } else {
          // 没有缓存，获取新URL
          console.log(`🔄 获取新的URL: ${playSongData.name}, songId=${songId}`);
          const url = await this.getOnlineUrl(songId);
          // 正常播放地址
          if (url) {
            statusStore.playUblock = false;
            // 保存URL到歌曲对象中
            (playSongData as any).cachedUrl = url;
            (playSongData as any).cachedTime = Date.now();

            await this.createPlayer(url, autoPlay, seek);
            // 预缓存下一首和下下首歌曲
            this.preCacheNextSongs();
          }
          // 尝试解灰
          else if (type !== "radio" && settingStore.useSongUnlock) {
            const unlockUrl = await this.getUnlockSongUrl(playSongData);
            if (unlockUrl) {
              statusStore.playUblock = true;
              console.log("🎼 Song unlock successfully:", unlockUrl);

              // 保存解锁URL到歌曲对象中
              (playSongData as any).cachedUnlockUrl = unlockUrl;
              (playSongData as any).cachedUnlockTime = Date.now();

              await this.createPlayer(unlockUrl, autoPlay, seek);
              // 预缓存下一首和下下首歌曲
              this.preCacheNextSongs();
            } else {
              statusStore.playUblock = false;
              // 是否为最后一首
              if (statusStore.playIndex === dataStore.playList.length - 1) {
                statusStore.$patch({ playStatus: false, playLoading: false });
                window.$message.warning("当前列表歌曲无法播放，请更换歌曲");
              } else {
                window.$message.error("该歌曲暂无音源，跳至下一首");
                this.nextOrPrev("next");
              }
            }
          } else {
            if (dataStore.playList.length === 1) {
              this.resetStatus();
              window.$message.warning("当前播放列表已无可播放歌曲，请更换");
              return;
            } else {
              window.$message.error("该歌曲无法播放，跳至下一首");
              this.nextOrPrev();
              return;
            }
          }
        }
      }
    } catch (err) {
      console.error("❌ 初始化音乐播放器出错：", err);
      window.$message.error("播放遇到错误，尝试下一首");
      await this.nextOrPrev("next");
    }
  }
  /**
   * 播放
   */
  async play() {
    const statusStore = useStatusStore();
    const settingStore = useSettingStore();
    // 检查播放器状态
    if (!audioManager.src) {
      window.$message.warning("播放器未就绪，请稍后重试");
      return;
    }
    // 已在播放
    if (!audioManager.paused) {
      statusStore.playStatus = true;
      return;
    }
    const fadeTime = settingStore.getFadeTime ? settingStore.getFadeTime / 1000 : 0;
    await audioManager.play(undefined, { fadeIn: !!fadeTime, fadeDuration: fadeTime });
  }
  /**
   * 暂停
   * @param changeStatus 是否更改播放状态
   */
  public async pause(changeStatus: boolean = true) {
    const statusStore = useStatusStore();
    const settingStore = useSettingStore();
    if (!audioManager.src) return;
    if (changeStatus) statusStore.playStatus = false;
    // 淡出
    const fadeTime = settingStore.getFadeTime ? settingStore.getFadeTime / 1000 : 0;
    audioManager.pause({ fadeOut: !!fadeTime, fadeDuration: fadeTime });
  }
  /**
   * 播放或暂停
   */
  public async playOrPause() {
    const statusStore = useStatusStore();
    if (statusStore.playStatus) await this.pause();
    else await this.play();
  }
  /**
   * 下一首或上一首
   * @param type 切换类别 next 下一首 prev 上一首
   * @param play 是否立即播放
   * @param autoEnd 是否为歌曲自动播放结束
   */
  async nextOrPrev(type: "next" | "prev" | "auto" = "next", play: boolean = true) {
    // 获取store
    const statusStore = useStatusStore();
    const dataStore = useDataStore();
    const musicStore = useMusicStore();
    try {
      // 立即更新UI状态，防止用户重复点击
      statusStore.playLoading = true;
      statusStore.playStatus = false;
      // 获取数据
      const { playList } = dataStore;
      const { playSong } = musicStore;
      const { playSongMode, playHeartbeatMode } = statusStore;
      // 若为私人FM
      if (statusStore.personalFmMode) {
        await this.initPersonalFM(true);
        return;
      }
      // 列表长度
      const playListLength = playList.length;
      // 播放列表是否为空
      if (playListLength === 0) {
        window.$message.error("播放列表为空，请添加歌曲");
        return;
      }
      // 只有一首歌的特殊处理
      if (playListLength === 1) {
        statusStore.playLoading = false;
        this.setSeek(0);
        await this.play();
        return; // 添加return，避免继续执行下面的代码
      }

      // 单曲循环模式处理
      if (playSongMode === "repeat-once" && type === "auto") {
        statusStore.lyricIndex = -1;
        this.setSeek(0);
        await this.play();
        return;
      }

      // 记录当前索引，用于后续检查是否真的切换了歌曲
      const oldIndex = statusStore.playIndex;
      console.log(`nextOrPrev: 开始切换歌曲，当前索引=${oldIndex}, 播放模式=${playSongMode}`);

      // 强制更新索引，确保切换歌曲
      if (type === "next" || type === "auto") {
        // 下一首
        statusStore.playIndex = (oldIndex + 1) % playListLength;
      } else {
        // 上一首
        statusStore.playIndex = oldIndex <= 0 ? playListLength - 1 : oldIndex - 1;
      }

      // 随机播放模式下，再次随机选择一首歌
      if (playSongMode === "shuffle" && !playHeartbeatMode && playSong.type !== "radio") {
        let newIndex: number;
        // 确保不会随机到同一首
        do {
          newIndex = Math.floor(Math.random() * playListLength);
        } while (newIndex === oldIndex);
        statusStore.playIndex = newIndex;
        console.log(`nextOrPrev: 随机模式，重新随机索引=${statusStore.playIndex}`);
      } else if (
        playSongMode !== "repeat" &&
        playSongMode !== "repeat-once" &&
        !playHeartbeatMode &&
        playSong.type !== "radio"
      ) {
        // 处理其他未知的播放模式
        console.log(`nextOrPrev: 未知播放模式 ${playSongMode}，使用默认列表循环逻辑`);
      }
      // 检查是否真的切换了歌曲
      if (oldIndex === statusStore.playIndex) {
        // 如果索引没变，只需要重置播放位置
        console.log(`索引未变化，重置当前歌曲播放位置`);
        statusStore.lyricIndex = -1;
        this.setSeek(0);
        if (play) await this.play();
        return;
      }
      console.log(`索引已变化，准备初始化新歌曲`);

      // 暂停
      await this.pause(false);
      // 初始化播放器
      await this.initPlayer(play);

      // 切换歌曲后，触发预缓存下一首歌曲
      this.preCacheNextSongs();
    } catch (error) {
      console.error("Error in nextOrPrev:", error);
      statusStore.playLoading = false;
      throw error;
    }
  }
  /**
   * 切换播放模式
   */
  public async togglePlayMode(mode: PlayModeType | false) {
    this._nextPrefetch = null;
    const statusStore = useStatusStore();
    const dataStore = useDataStore();
    const musicStore = useMusicStore();
    // 退出心动模式
    if (statusStore.playHeartbeatMode) this.toggleHeartMode(false);
    // 计算目标模式
    let targetMode: PlayModeType;
    if (mode) {
      targetMode = mode;
    } else {
      switch (statusStore.playSongMode) {
        case "repeat":
          targetMode = "repeat-once";
          break;
        case "shuffle":
          targetMode = "repeat";
          break;
        case "repeat-once":
          targetMode = "shuffle";
          break;
        default:
          targetMode = "repeat";
      }
    }
    // 进入随机模式：保存原顺序并打乱当前歌单
    if (targetMode === "shuffle" && statusStore.playSongMode !== "shuffle") {
      const currentList = dataStore.playList;
      if (currentList && currentList.length > 1) {
        const currentSongId = musicStore.playSong?.id;
        await dataStore.setOriginalPlayList(currentList);
        const shuffled = shuffleArray(currentList);
        await dataStore.setPlayList(shuffled);
        if (currentSongId) {
          const newIndex = shuffled.findIndex((s) => s?.id === currentSongId);
          if (newIndex !== -1) useStatusStore().playIndex = newIndex;
        }
      }
    }
    // 离开随机模式：恢复到原顺序
    if (
      statusStore.playSongMode === "shuffle" &&
      (targetMode === "repeat" || targetMode === "repeat-once")
    ) {
      const original = await dataStore.getOriginalPlayList();
      if (original && original.length) {
        const currentSongId = musicStore.playSong?.id;
        await dataStore.setPlayList(original);
        if (currentSongId) {
          const origIndex = original.findIndex((s) => s?.id === currentSongId);
          useStatusStore().playIndex = origIndex !== -1 ? origIndex : 0;
        } else {
          useStatusStore().playIndex = 0;
        }
        await dataStore.clearOriginalPlayList();
      }
    }
    // 应用模式
    statusStore.playSongMode = targetMode;
    this.playModeSyncIpc();
  }
  /**
   * 播放模式同步 ipc
   */
  public playModeSyncIpc() {
    const statusStore = useStatusStore();
    if (isElectron) {
      window.electron.ipcRenderer.send("play-mode-change", statusStore.playSongMode);
    }
  }
  /**
   * 设置播放进度
   * @param time 播放进度（单位：毫秒）
   */
  public setSeek(time: number) {
    const statusStore = useStatusStore();
    if (time < 0 || time > this.getDuration()) {
      time = Math.max(0, Math.min(time, this.getDuration()));
    }
    audioManager.seek(time / 1000);
    statusStore.currentTime = time;
  }
  /**
   * 获取播放进度
   * @returns 播放进度（单位：毫秒）
   */
  public getSeek(): number {
    return Math.floor(audioManager.currentTime * 1000);
  }
  /**
   * 获取播放时长
   * @returns 播放时长（单位：毫秒）
   */
  public getDuration(): number {
    return Math.floor(audioManager.duration * 1000);
  }
  /**
   * 设置播放速率
   */
  public setRate(rate: number) {
    const statusStore = useStatusStore();
    audioManager.setRate(rate);
    statusStore.playRate = rate;
  }

  /**
   * 设置播放音量
   */
  public setVolume(actions: number | "up" | "down" | WheelEvent) {
    const statusStore = useStatusStore();
    const increment = 0.05;

    if (typeof actions === "number") {
      actions = Math.max(0, Math.min(actions, 1));
      statusStore.playVolume = actions;
    } else if (actions === "up" || actions === "down") {
      statusStore.playVolume = Math.max(
        0,
        Math.min(statusStore.playVolume + (actions === "up" ? increment : -increment), 1),
      );
    } else {
      const deltaY = actions.deltaY;
      const volumeChange = deltaY > 0 ? -increment : increment;
      statusStore.playVolume = Math.max(0, Math.min(statusStore.playVolume + volumeChange, 1));
    }

    audioManager.setVolume(statusStore.playVolume);
  }

  /**
   * 切换静音
   */
  public toggleMute() {
    const statusStore = useStatusStore();
    const isMuted = statusStore.playVolume === 0;

    if (isMuted) {
      statusStore.playVolume = statusStore.playVolumeMute;
    } else {
      statusStore.playVolumeMute = audioManager.getVolume();
      statusStore.playVolume = 0;
    }
    audioManager.setVolume(statusStore.playVolume);
  }

  /**
   * 更新播放列表
   * @param data 播放列表
   * @param song 当前播放歌曲
   * @param pid 播放列表id
   * @param options 配置
   * @param options.showTip 是否显示提示
   * @param options.scrobble 是否打卡
   * @param options.play 是否直接播放
   */
  public async updatePlayList(
    data: SongType[],
    song?: SongType,
    pid?: number,
    options: {
      showTip?: boolean;
      scrobble?: boolean;
      play?: boolean;
      keepHeartbeatMode?: boolean;
    } = {
      showTip: true,
      scrobble: true,
      play: true,
    },
  ) {
    this._nextPrefetch = null;
    if (!data || !data.length) return;
    const dataStore = useDataStore();
    const musicStore = useMusicStore();
    const statusStore = useStatusStore();
    // 获取配置
    const { showTip, play } = options;
    // 处理随机播放模式
    let processedData = cloneDeep(data);
    if (statusStore.playSongMode === "shuffle") {
      // 保存原始播放列表
      await dataStore.setOriginalPlayList(cloneDeep(data));
      // 随机排序
      processedData = shuffleArray(processedData);
    }
    // 更新列表
    await dataStore.setPlayList(processedData);
    // 关闭特殊模式
    if (statusStore.playHeartbeatMode && !options.keepHeartbeatMode) {
      this.toggleHeartMode(false);
    }
    if (statusStore.personalFmMode) statusStore.personalFmMode = false;
    // 是否直接播放
    if (song && typeof song === "object" && "id" in song) {
      // 是否为当前播放歌曲
      if (musicStore.playSong.id === song.id) {
        if (play) await this.play();
      } else {
        // 查找索引（在处理后的列表中查找）
        statusStore.playIndex = processedData.findIndex((item) => item.id === song.id);
        // 播放
        await this.initPlayer();
      }
    } else {
      statusStore.playIndex =
        statusStore.playSongMode === "shuffle"
          ? Math.floor(Math.random() * processedData.length)
          : 0;
      await this.initPlayer();
    }
    musicStore.playPlaylistId = pid ?? 0;
    if (showTip) window.$message.success("已开始播放");
  }

  /**
   * 添加下一首歌曲
   * @param song 歌曲
   * @param play 是否立即播放
   */
  public async addNextSong(song: SongType, play: boolean = false) {
    const dataStore = useDataStore();
    const musicStore = useMusicStore();
    const statusStore = useStatusStore();
    // 关闭特殊模式
    if (statusStore.personalFmMode) statusStore.personalFmMode = false;

    if (musicStore.playSong.id === song.id) {
      this.play();
      window.$message.success("已开始播放");
      return;
    }
    // 尝试添加
    const currentSongId = musicStore.playSong.id;
    const songIndex = await dataStore.setNextPlaySong(song, statusStore.playIndex);
    // 播放歌曲
    if (songIndex < 0) return;
    if (play) {
      this.togglePlayIndex(songIndex, true);
    } else {
      // 修正当前播放索引
      const newCurrentIndex = dataStore.playList.findIndex((s) => s.id === currentSongId);
      if (newCurrentIndex !== -1 && newCurrentIndex !== statusStore.playIndex) {
        statusStore.playIndex = newCurrentIndex;
      }
      window.$message.success("已添加至下一首播放");
    }
  }
  /**
   * 切换播放索引
   * @param index 播放索引
   * @param play 是否立即播放
   */
  public async togglePlayIndex(index: number, play: boolean = false) {
    const dataStore = useDataStore();
    const statusStore = useStatusStore();
    try {
      // 立即更新UI状态，防止用户重复点击
      statusStore.playLoading = true;
      statusStore.playStatus = false;
      // 获取数据
      const { playList } = dataStore;
      // 若超出播放列表
      if (index >= playList.length) return;
      // 相同
      if (!play && statusStore.playIndex === index) {
        this.play();
        return;
      }
      // 更改状态
      statusStore.playIndex = index;
      // 重置播放进度（切换歌曲时必须重置）
      statusStore.currentTime = 0;
      statusStore.progress = 0;
      statusStore.lyricIndex = -1;
      await this.initPlayer(true, 0);
    } catch (error) {
      console.error("Error in togglePlayIndex:", error);
      statusStore.playLoading = false;
      throw error;
    }
  }
  /**
   * 移除指定歌曲
   * @param index 歌曲索引
   */
  public removeSongIndex(index: number) {
    const dataStore = useDataStore();
    const statusStore = useStatusStore();
    // 获取数据
    const { playList } = dataStore;
    // 若超出播放列表
    if (index >= playList.length) return;
    // 仅剩一首
    if (playList.length === 1) {
      this.cleanPlayList();
      return;
    }
    // 是否为当前播放歌曲
    const isCurrentPlay = statusStore.playIndex === index;
    // 深拷贝，防止影响原数据
    const newPlaylist = cloneDeep(playList);
    // 若将移除最后一首
    if (index === playList.length - 1) {
      statusStore.playIndex = 0;
    }
    // 若为当前播放之后
    else if (statusStore.playIndex > index) {
      statusStore.playIndex--;
    }
    // 移除指定歌曲
    newPlaylist.splice(index, 1);
    dataStore.setPlayList(newPlaylist);
    // 若为当前播放
    if (isCurrentPlay) {
      this.initPlayer(statusStore.playStatus);
    }
  }
  /**
   * 清空播放列表
   */
  public async cleanPlayList() {
    const dataStore = useDataStore();
    const statusStore = useStatusStore();
    audioManager.stop();
    this.resetStatus();
    statusStore.$patch({
      playListShow: false,
      showFullPlayer: false,
      playHeartbeatMode: false,
      personalFmMode: false,
      playIndex: -1,
    });
    await dataStore.setPlayList([]);
    await dataStore.clearOriginalPlayList();
  }
  /**
   * 切换输出设备
   * @param deviceId 输出设备
   */
  public toggleOutputDevice(deviceId?: string) {
    try {
      const settingStore = useSettingStore();
      const device = deviceId ?? settingStore.playDevice;
      if (device) {
        audioManager.setSinkId(device);
      }
    } catch (error) {
      console.error("Failed to change audio output device:", error);
    }
  }
  /**
   * 启用/更新均衡器
   * @param options 均衡器选项
   */
  public enableEq(options?: {
    bands?: number[];
    preamp?: number;
    q?: number;
    frequencies?: number[];
  }) {
    // 暂未完全适配 preamp 和 q 的动态调整，仅处理 bands
    if (options?.bands) {
      options.bands.forEach((val, idx) => audioManager.setFilterGain(idx, val));
    }
  }
  /**
   * 更新均衡器
   * @param options 均衡器选项
   */
  public updateEq(options: { bands?: number[]; preamp?: number; q?: number }) {
    this.enableEq(options);
  }
  /**
   * 禁用均衡器并恢复直出（保持频谱可用）
   */
  public disableEq() {
    // 将所有频段增益设为 0
    for (let i = 0; i < 10; i++) {
      audioManager.setFilterGain(i, 0);
    }
  }
  /**
   * 切换桌面歌词
   */
  public toggleDesktopLyric() {
    const statusStore = useStatusStore();
    const show = !statusStore.showDesktopLyric;
    statusStore.showDesktopLyric = show;
    window.electron.ipcRenderer.send("toggle-desktop-lyric", show);
    window.$message.success(`${show ? "已开启" : "已关闭"}桌面歌词`);
  }
  /**
   * 显式设置桌面歌词显示/隐藏
   * @param show 是否显示
   */
  public setDesktopLyricShow(show: boolean) {
    const statusStore = useStatusStore();
    if (statusStore.showDesktopLyric === show) return;
    statusStore.showDesktopLyric = show;
    window.electron.ipcRenderer.send("toggle-desktop-lyric", show);
    window.$message.success(`${show ? "已开启" : "已关闭"}桌面歌词`);
  }
  /**
   * 切换心动模式
   * @param open 是否开启
   */
  public async toggleHeartMode(open: boolean = true) {
    try {
      const dataStore = useDataStore();
      const musicStore = useMusicStore();
      const statusStore = useStatusStore();
      if (!open && statusStore.playHeartbeatMode) {
        this._nextPrefetch = null;
        statusStore.playHeartbeatMode = false;
        window.$message.success("已退出心动模式");
        return;
      }
      if (isLogin() !== 1) {
        if (isLogin() === 0) {
          openUserLogin(true);
        } else {
          window.$message.warning("该登录模式暂不支持该操作");
        }
        return;
      }
      if (statusStore.playHeartbeatMode) {
        window.$message.warning("已处于心动模式");
        this.play();
        return;
      }
      this.message?.destroy();
      this.message = window.$message.loading("心动模式开启中", { duration: 0 });
      const playSongData = songManager.getPlaySongData();
      const likeSongsList = await dataStore.getUserLikePlaylist();
      const pid =
        musicStore.playPlaylistId && musicStore.playPlaylistId !== 0
          ? musicStore.playPlaylistId
          : (likeSongsList?.detail?.id ?? 0);
      // 获取心动模式歌曲列表
      const result = await heartRateList(playSongData?.id || 0, pid);
      if (result.code === 200) {
        this.message?.destroy();
        const heartRatelists = formatSongsList(result.data);
        this._nextPrefetch = null;
        statusStore.playIndex = 0;
        // 先更新播放列表，再设置心动模式标志
        await this.updatePlayList(heartRatelists, heartRatelists[0], undefined, {
          showTip: true,
          scrobble: true,
          play: true,
          keepHeartbeatMode: true,
        });
        statusStore.playHeartbeatMode = true;
      } else {
        this.message?.destroy();
        window.$message.error(result.message || "心动模式开启出错，请重试");
      }
    } catch (error) {
      console.error("Failed to toggle heart mode:", error);
      this.message?.destroy();
      window.$message.error("心动模式开启出错，请重试");
    } finally {
      this.message?.destroy();
    }
  }
  /**
   * 初始化私人FM
   * @param playNext 是否播放下一首
   */
  public async initPersonalFM(playNext: boolean = false) {
    this._nextPrefetch = null;
    const musicStore = useMusicStore();
    const statusStore = useStatusStore();
    try {
      const getPersonalFmData = async () => {
        const result = await personalFm();
        const songData = formatSongsList(result.data);
        console.log(`🌐 personal FM:`, songData);
        musicStore.personalFM.list = songData;
        musicStore.personalFM.playIndex = 0;
      };
      // 若列表为空或已播放到最后，获取新列表
      if (musicStore.personalFM.list.length === 0) await getPersonalFmData();
      if (playNext) {
        statusStore.personalFmMode = true;
        if (musicStore.personalFM.playIndex < musicStore.personalFM.list.length - 1) {
          musicStore.personalFM.playIndex++;
        } else {
          await getPersonalFmData();
        }
        await this.initPlayer();
      }
    } catch (error) {
      console.error("Failed to initialize personal FM:", error);
    }
  }
  /**
   * 私人FM - 垃圾桶
   * @param id 歌曲ID
   */
  public async personalFMTrash(id: number) {
    try {
      const statusStore = useStatusStore();
      if (!isLogin()) {
        openUserLogin(true);
        return;
      }
      statusStore.personalFmMode = true;
      statusStore.playHeartbeatMode = false;
      const result = await personalFmToTrash(id);
      if (result.code === 200) {
        window.$message.success("已移至垃圾桶");
        this.nextOrPrev("next");
      }
    } catch (error) {
      console.error("Error adding to trash:", error);
      window.$message.error("移至垃圾桶失败，请重试");
    }
  }
  /**
   * 开始定时关闭
   */
  public startAutoCloseTimer(time: number, remainTime: number) {
    const statusStore = useStatusStore();
    if (!time || !remainTime) return;
    if (this.autoCloseInterval) {
      clearInterval(this.autoCloseInterval);
      this.autoCloseInterval = undefined;
    }
    Object.assign(statusStore.autoClose, {
      enable: true,
      time,
      remainTime,
    });
    this.autoCloseInterval = setInterval(() => {
      if (statusStore.autoClose.remainTime <= 0) {
        clearInterval(this.autoCloseInterval);
        this.autoCloseInterval = undefined;
        if (!statusStore.autoClose.waitSongEnd) {
          this.executeAutoClose();
        }
        return;
      }
      statusStore.autoClose.remainTime--;
    }, 1000);
  }
  /**
   * 获取音频DOM元素
   */
  private getAudioDom(): HTMLAudioElement | null {
    return audioManager.audioElement || null;
  }

  /**
   * 获取播放器信息
   */
  private getPlayerInfo(): string {
    const playSongData = this.getPlaySongData();
    if (!playSongData) return "";
    const { name, artist } = songManager.getPlayerInfoObj() || {};
    return `${name} - ${artist}`;
  }

  /**
   * 处理播放错误
   */
  private errorNext(err: any) {
    console.error("播放错误处理:", err);
    // 这里可以添加错误处理逻辑，比如跳到下一首
    this.nextOrPrev("next");
  }

  /**
   * 执行自动关闭
   */
  private executeAutoClose() {
    console.log("🔄 执行自动关闭");
    this.pause();
    const { autoClose } = useStatusStore();
    autoClose.enable = false;
    autoClose.remainTime = autoClose.time * 60;
  }
}

let _player: Player | null = null;

/**
 * 获取播放器实例
 * @returns Player
 */
export const usePlayer = (): Player => {
  if (!_player) _player = new Player();
  return _player;
};
