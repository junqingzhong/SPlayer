import type { SongType, PlayModeType } from "@/types/main";
import type { MessageReactive } from "naive-ui";
import { Howl, Howler } from "howler";
import { cloneDeep } from "lodash-es";
import { useMusicStore, useStatusStore, useDataStore, useSettingStore } from "@/stores";
import { parsedLyricsData, resetSongLyric, parseLocalLyric } from "./lyric";
import { songUrl, unlockSongUrl, songLyric, songChorus } from "@/api/song";
import { getCoverColorData } from "@/utils/color";
import { calculateProgress } from "./time";
import { isElectron, isDev } from "./helper";
import { heartRateList } from "@/api/playlist";
import { formatSongsList } from "./format";
import { isLogin } from "./auth";
import { openUserLogin } from "./modal";
import { personalFm, personalFmToTrash } from "@/api/rec";
import blob from "./blob";

// 播放器核心
// Howler.js

// 允许播放格式
const allowPlayFormat = ["mp3", "flac", "webm", "ogg", "wav"];

class Player {
  // 播放器
  private player: Howl;
  // 定时器
  private playerInterval: ReturnType<typeof setInterval> | undefined;
  // 频谱数据
  private audioContext: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private dataArray: Uint8Array | null = null;
  private source: MediaElementAudioSourceNode | null = null;
  // 其他数据
  private testNumber: number = 0;
  private message: MessageReactive | null = null;
  constructor() {
    // 创建播放器实例
    this.player = new Howl({ src: [""], format: allowPlayFormat, autoplay: false });
    // 初始化媒体会话
    this.initMediaSession();
  }
  /**
   * 重置状态
   */
  resetStatus() {
    const statusStore = useStatusStore();
    const musicStore = useMusicStore();
    // 重置状态
    statusStore.$patch({
      currentTime: 0,
      duration: 0,
      progress: 0,
      chorus: 0,
      currentTimeOffset: 0,
      lyricIndex: -1,
      playStatus: false,
      playLoading: false,
    });
    musicStore.$patch({
      playPlaylistId: 0,
      playSong: {},
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
    console.log(`getPlaySongData: playIndex=${statusStore.playIndex}, 播放列表长度=${playlist.length}`);
    if (statusStore.playIndex < 0 || statusStore.playIndex >= playlist.length) {
      console.log(`getPlaySongData: playIndex超出范围，重置为0`);
      statusStore.playIndex = 0;
    }
    return playlist[statusStore.playIndex];
  }
  /**
   * 获取淡入淡出时间
   * @returns 播放音量
   */
  private getFadeTime(): number {
    const settingStore = useSettingStore();
    const { songVolumeFade, songVolumeFadeTime } = settingStore;
    return songVolumeFade ? songVolumeFadeTime : 0;
  }
  /**
   * 处理播放状态
   */
  private handlePlayStatus() {
    const musicStore = useMusicStore();
    const statusStore = useStatusStore();
    const settingStore = useSettingStore();
    // 清理定时器
    clearInterval(this.playerInterval);
    // 更新播放状态
    this.playerInterval = setInterval(() => {
      if (!this.player.playing()) return;
      const currentTime = this.getSeek();
      const duration = this.player.duration();
      // 计算进度条距离
      const progress = calculateProgress(currentTime, duration);
      // 计算歌词索引
      const hasYrc = !musicStore.songLyric.yrcData.length || !settingStore.showYrc;
      const lyrics = hasYrc ? musicStore.songLyric.lrcData : musicStore.songLyric.yrcData;
      // 歌词实时偏移量
      const currentTimeOffset = statusStore.currentTimeOffset;
      const index = lyrics?.findIndex((v) => v?.time >= currentTime + currentTimeOffset);
      // 歌词跨界处理
      const lyricIndex = index === -1 ? lyrics.length - 1 : index - 1;
      // 更新状态
      statusStore.$patch({ currentTime, duration, progress, lyricIndex });
      // 客户端事件
      if (isElectron) {
        // 歌词变化
        window.electron.ipcRenderer.send("play-lyric-change", {
          index: lyricIndex,
          lyric: cloneDeep(
            settingStore.showYrc && musicStore.songLyric.yrcData?.length
              ? musicStore.songLyric.yrcData
              : musicStore.songLyric.lrcData,
          ),
        });
        // 进度条
        if (settingStore.showTaskbarProgress) {
          window.electron.ipcRenderer.send("set-bar", progress);
        }
      }
    }, 250);
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
    const songIndex = playList.findIndex(song => {
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
          if ((song as any).cachedUnlockUrl &&
              (song as any).cachedUnlockTime &&
              now - (song as any).cachedUnlockTime < cacheExpiry) {
              console.log(`✅ ${id} 已存在解锁链接播放`);
            // 如果是当前播放歌曲，直接返回缓存URL
            if (songIndex === statusStore.playIndex) {
              return (song as any).cachedUnlockUrl;
            }
          }

      // 然后检查普通URL缓存
          if ((song as any).cachedUrl &&
              (song as any).cachedTime &&
              now - (song as any).cachedTime < cacheExpiry) {
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
      const songId = songData.id;
      const artist = Array.isArray(songData.artists) ? songData.artists[0].name : songData.artists;
      const keyWord = songData.name + "-" + artist;
      if (!songId || !keyWord) return null;

      // 检查缓存的解锁URL是否存在且未过期
      const cacheExpiry = 30 * 60 * 1000; // 30分钟
      const now = Date.now();
      // 标记已尝试解锁，避免重复尝试
      if ((songData as any).unlockAttempted && !((songData as any).cachedUnlockTime && now - (songData as any).cachedUnlockTime >= cacheExpiry)) {
        return (songData as any).cachedUnlockUrl || null;
      }

      // 设置解锁尝试标记
      (songData as any).unlockAttempted = true;

      // 优先尝试酷我解锁
      let kuwo: any = null;
      try {
        kuwo = await unlockSongUrl(songId, keyWord, "kuwo");
      } catch (e) {
        console.error("酷我解锁失败", e);
      }

      // 并行尝试其他平台解锁
      const [qq, kugou, netease] = await Promise.all([
        unlockSongUrl(songId, keyWord, "qq"),
        unlockSongUrl(songId, keyWord, "kugou"),
        unlockSongUrl(songId, keyWord, "netease"),
      ]);

      // 优先级：kuwo > qq > kugou > netease
      if (kuwo && kuwo.code === 200 && kuwo.url) {
        (songData as any).cachedUnlockUrl = kuwo.url;
        (songData as any).cachedUnlockTime = Date.now();
        return kuwo.url;
      }
      if (qq && qq.code === 200 && qq.url) {
        (songData as any).cachedUnlockUrl = qq.url;
        (songData as any).cachedUnlockTime = Date.now();
        return qq.url;
      }
      if (kugou && kugou.code === 200 && kugou.url) {
        (songData as any).cachedUnlockUrl = kugou.url;
        (songData as any).cachedUnlockTime = Date.now();
        return kugou.url;
      }
      if (netease && netease.code === 200 && netease.url) {
        (songData as any).cachedUnlockUrl = netease.url;
        (songData as any).cachedUnlockTime = Date.now();
        return netease.url;
      }
      // 所有平台都解锁失败
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
    if (url.startsWith('https://')) {
      // 添加crossOrigin属性在createPlayer方法中已处理
      return url;
    }

    // 如果是HTTP链接，转换为HTTPS
    if (url.startsWith('http://')) {
      return url.replace(/^http:/, "https:");
    }

    // 如果配置了代理服务器，使用代理服务器
    if ((settingStore as any).useProxyServer && (settingStore as any).proxyServerUrl) {
      return `${(settingStore as any).proxyServerUrl}/proxy?url=${encodeURIComponent(url)}`;
    }

    return url;
  }
  /**
   * 创建播放器
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
      }
    });

    // 播放器事件
    this.playerEvent({ seek });
    // 播放设备
    if (!settingStore.showSpectrums) this.toggleOutputDevice();
    // 自动播放
    if (autoPlay) this.play();
    // 获取歌曲附加信息 - 非电台和本地
    if (type !== "radio" && !path) {
      this.getLyricData(id);
      this.getChorus(id);
    } else resetSongLyric();
    // 定时获取状态
    if (!this.playerInterval) this.handlePlayStatus();
    // 新增播放历史
    if (type !== "radio") dataStore.setHistory(musicStore.playSong);
    // 获取歌曲封面主色
    if (!path) this.getCoverColor(musicStore.songCover);
    // 更新 MediaSession
    if (!path) this.updateMediaSession();
    // 预缓存下一首歌曲
    this.preCacheNextSongs();
    // 开发模式
    if (isDev) window.player = this.player;
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
      let currentIndex = statusStore.playIndex;

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

      console.log(`预缓存索引: ${nextIndices.join(', ')}，当前索引: ${currentIndex}`);

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
        const hasValidCache = (
          ((song as any).cachedUrl &&
           (song as any).cachedTime &&
           now - (song as any).cachedTime < cacheExpiry) ||
          ((song as any).cachedUnlockUrl &&
           (song as any).cachedUnlockTime &&
           now - (song as any).cachedUnlockTime < cacheExpiry)
        );

        // 如果歌曲已经有有效的缓存URL，跳过获取
        if (hasValidCache) {
          console.log(`✅ 歌曲已缓存: ${song.name}`);
          continue;
        }
        // 异步获取歌曲URL并预加载
        console.log(`🔄 开始预缓存歌曲: ${song.name}, 索引: ${index}`);
        this.getOnlineUrl(song.id).then(url => {
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
            this.getUnlockSongUrl(song).then(unlockUrl => {
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
            }).catch(err => {
              console.error(`预缓存解锁歌曲失败: ${song.name}, 索引: ${index}`, err);
            });
          }
        }).catch(err => {
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
        audioDom.crossOrigin = "anonymous";
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
    // 跳转进度
    navigator.mediaSession.setActionHandler("seekto", (event) => {
      if (event.seekTime) this.setSeek(event.seekTime);
    });
  }
  /**
   * 更新 MediaSession
   */
  private updateMediaSession() {
    if (!("mediaSession" in navigator)) return;
    const musicStore = useMusicStore();
    const settingStore = useSettingStore();
    // 获取播放数据
    const playSongData = this.getPlaySongData();
    if (!playSongData) return;
    // 播放状态
    const isRadio = playSongData.type === "radio";
    // 获取数据
    const metaData: MediaMetadataInit = {
      title: playSongData.name,
      artist: isRadio
        ? "播客电台"
        : // 非本地歌曲且歌手列表为数组
          Array.isArray(playSongData.artists)
          ? playSongData.artists.map((item) => item.name).join(" / ")
          : String(playSongData.artists),
      album: isRadio
        ? "播客电台"
        : // 是否为对象
          typeof playSongData.album === "object"
          ? playSongData.album.name
          : String(playSongData.album),
      artwork: settingStore.smtcOutputHighQualityCover
        ? [
            {
              src: musicStore.getSongCover("xl"),
              sizes: "1920x1920",
              type: "image/jpeg",
            },
          ]
        : [
            {
              src: musicStore.getSongCover("cover"),
              sizes: "512x512",
              type: "image/jpeg",
            },
            {
              src: musicStore.getSongCover("s"),
              sizes: "100x100",
              type: "image/jpeg",
            },
            {
              src: musicStore.getSongCover("m"),
              sizes: "300x300",
              type: "image/jpeg",
            },
            {
              src: musicStore.getSongCover("l"),
              sizes: "1024x1024",
              type: "image/jpeg",
            },
            {
              src: musicStore.getSongCover("xl"),
              sizes: "1920x1920",
              type: "image/jpeg",
            },
          ],
    };
    // 更新数据
    navigator.mediaSession.metadata = new window.MediaMetadata(metaData);
  }
  // 生成频谱数据
  private generateSpectrumData() {
    const statusStore = useStatusStore();
    if (!this.analyser || !this.dataArray) {
      this.initSpectrumData();
    }
    // 更新频谱数据
    const updateSpectrumData = () => {
      if (this.analyser && this.dataArray) {
        this.analyser.getByteFrequencyData(this.dataArray);
        // 保存数据
        statusStore.spectrumsData = Array.from(this.dataArray);
      }
      requestAnimationFrame(updateSpectrumData);
    };
    updateSpectrumData();
  }
  /**
   * 获取歌词
   * @param id 歌曲id
   */
  private async getLyricData(id: number) {
    if (!id) {
      resetSongLyric();
      return;
    }
    const lyricRes = await songLyric(id);
    parsedLyricsData(lyricRes);
  }
  /**
   * 获取副歌时间
   * @param id 歌曲id
   */
  private async getChorus(id: number) {
    const statusStore = useStatusStore();
    const result = await songChorus(id);
    if (result?.code !== 200 || result?.chorus?.length === 0) {
      statusStore.chorus = 0;
      return;
    }
    // 计算并保存
    const chorus = result?.chorus?.[0]?.startTime;
    const time = ((chorus / 1000 / statusStore.duration) * 100).toFixed(2);
    statusStore.chorus = Number(time);
  }
  /**
   * 播放错误
   * 在播放错误时，播放下一首
   */
  private async errorNext(errCode?: number) {
    const dataStore = useDataStore();
    // 次数加一
    this.testNumber++;
    if (this.testNumber > 5) {
      this.testNumber = 0;
      this.resetStatus();
      window.$message.error("当前重试次数过多，请稍后再试");
      return;
    }
    // 错误 2 通常为网络地址过期
    if (errCode === 2) {
      // 重载播放器
      await this.initPlayer(true, this.getSeek());
      return;
    }
    // 播放下一曲
    if (dataStore.playList.length > 1) {
      await this.nextOrPrev("next");
    } else {
      window.$message.error("当前列表暂无可播放歌曲");
      this.cleanPlayList();
    }
  }
  /**
   * 获取 Audio Dom
   */
  private getAudioDom() {
    const audioDom = (this.player as any)._sounds[0]._node;
    if (!audioDom) {
      throw new Error("Audio Dom is null");
    }
    return audioDom;
  }
  /**
   * 获取本地歌曲元信息
   * @param path 歌曲路径
   */
  private async parseLocalMusicInfo(path: string) {
    try {
      const musicStore = useMusicStore();
      // 获取封面数据
      const coverData = await window.electron.ipcRenderer.invoke("get-music-cover", path);
      if (coverData) {
        const { data, format } = coverData;
        const blobURL = blob.createBlobURL(data, format, path);
        if (blobURL) {
          musicStore.playSong.cover = blobURL;
        }
      } else {
        musicStore.playSong.cover = "/images/song.jpg?assest";
      }
      // 获取主色
      this.getCoverColor(musicStore.playSong.cover);
      // 获取歌词数据
      const lrcData = await window.electron.ipcRenderer.invoke("get-music-lyric", path);
      parseLocalLyric(lrcData);
      // 更新媒体会话
      this.updateMediaSession();
    } catch (error) {
      window.$message.error("获取本地歌曲元信息失败");
      console.error("Failed to parse local music info:", error);
    }
  }
  /**
   * 获取播放信息
   * @param song 歌曲
   * @param sep 分隔符
   * @returns 播放信息
   */
  getPlayerInfo(song?: SongType, sep: string = "/"): string | null {
    const playSongData = song || this.getPlaySongData();
    if (!playSongData) return null;
    // 标题
    const title = `${playSongData.name || "未知歌曲"}`;
    // 歌手
    const artist =
      playSongData.type === "radio"
        ? "播客电台"
        : Array.isArray(playSongData.artists)
          ? playSongData.artists.map((artists: { name: string }) => artists.name).join(sep)
          : String(playSongData?.artists || "未知歌手");
    return `${title} - ${artist}`;
  }
  /**
   * 初始化播放器
   * 核心外部调用
   * @param autoPlay 是否自动播放
   * @param seek 播放位置
   */
  async initPlayer(autoPlay: boolean = true, seek: number = 0) {
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
      console.log(`initPlayer: 准备播放歌曲 ${playSongData.name},当前playIndex=${statusStore.playIndex}, id=${id}`);
      // 更改当前播放歌曲
      musicStore.playSong = playSongData;
      // 更改状态
      statusStore.playLoading = true;
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
        if ((playSongData as any).cachedUnlockUrl &&
            (playSongData as any).cachedUnlockTime &&
            now - (playSongData as any).cachedUnlockTime < cacheExpiry) {
          cachedUrl = (playSongData as any).cachedUnlockUrl;
          isUnlockUrl = true;
          console.log(`✅ 使用缓存解锁链接播放: ${(playSongData as any).cachedUnlockUrl}`);
        }
        // 然后检查普通缓存URL
        else if ((playSongData as any).cachedUrl &&
            (playSongData as any).cachedTime &&
            now - (playSongData as any).cachedTime < cacheExpiry) {
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
    } catch (error) {
      console.error("❌ 初始化音乐播放器出错：", error);
      window.$message.error("播放器遇到错误，请尝试软件热重载");
      // this.errorNext();
    }
  }
  /**
   * 播放
   */
  async play() {
    const statusStore = useStatusStore();
    // 已在播放
    if (this.player.playing()) {
      statusStore.playStatus = true;
      return;
    }
    this.player.play();
    statusStore.playStatus = true;
    // 淡入
    await new Promise<void>((resolve) => {
      this.player.once("play", () => {
        this.player.fade(0, statusStore.playVolume, this.getFadeTime());
        resolve();
      });
    });
  }
  /**
   * 暂停
   * @param changeStatus 是否更改播放状态
   */
  async pause(changeStatus: boolean = true) {
    const statusStore = useStatusStore();

    // 播放器未加载完成
    if (this.player.state() !== "loaded") {
      return;
    }

    // 淡出
    await new Promise<void>((resolve) => {
      this.player.fade(statusStore.playVolume, 0, this.getFadeTime());
      this.player.once("fade", () => {
        this.player.pause();
        if (changeStatus) statusStore.playStatus = false;
        resolve();
      });
    });
  }
  /**
   * 播放或暂停
   */
  async playOrPause() {
    const statusStore = useStatusStore();
    if (statusStore.playStatus) await this.pause();
    else await this.play();
  }
  /**
   * 下一首或上一首
   * @param type 切换类别 next 下一首 prev 上一首
   * @param play 是否立即播放
   */
  async nextOrPrev(type: "next" | "prev" | "auto" = "next", play: boolean = true) {
    try {
      const statusStore = useStatusStore();
      const dataStore = useDataStore();
      const musicStore = useMusicStore();
      // 获取数据
      const { playList } = dataStore;
      const { playSong } = musicStore;
      const { playSongMode, playHeartbeatMode } = statusStore;
      // 列表长度
      const playListLength = playList.length;
      // 播放列表是否为空
      if (playListLength === 0) throw new Error("Play list is empty");
      // 若为私人FM
      if (statusStore.personalFmMode) {
        await this.initPersonalFM(true);
        return;
      }
      // 只有一首歌的特殊处理
      if (playListLength === 1) {
        statusStore.lyricIndex = -1;
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
      } else if (playSongMode !== "repeat" && playSongMode !== "repeat-once" && !playHeartbeatMode && playSong.type !== "radio") {
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
      throw error;
    }
  }
  /**
   * 切换播放模式
   * @param mode 播放模式 repeat / repeat-once / shuffle
   */
  togglePlayMode(mode: PlayModeType | false) {
    const statusStore = useStatusStore();
    // 退出心动模式
    if (statusStore.playHeartbeatMode) this.toggleHeartMode(false);
    // 若传入了指定模式
    if (mode) {
      statusStore.playSongMode = mode;
    } else {
      switch (statusStore.playSongMode) {
        case "repeat":
          statusStore.playSongMode = "repeat-once";
          break;
        case "shuffle":
          statusStore.playSongMode = "repeat";
          break;
        case "repeat-once":
          statusStore.playSongMode = "shuffle";
          break;
        default:
          statusStore.playSongMode = "repeat";
      }
    }
    this.playModeSyncIpc();
  }
  /**
   * 播放模式同步 ipc
   */
  playModeSyncIpc() {
    const statusStore = useStatusStore();
    if (isElectron) {
      window.electron.ipcRenderer.send("play-mode-change", statusStore.playSongMode);
    }
  }
  /**
   * 设置播放进度
   * @param time 播放进度
   */
  setSeek(time: number) {
    const statusStore = useStatusStore();
    this.player.seek(time);
    statusStore.currentTime = time;
  }
  /**
   * 获取播放进度
   * @returns 播放进度
   */
  getSeek(): number {
    return this.player.seek();
  }
  /**
   * 设置播放速率
   * @param rate 播放速率
   */
  setRate(rate: number) {
    const statusStore = useStatusStore();
    this.player.rate(rate);
    statusStore.playRate = rate;
  }
  /**
   * 设置播放音量
   * @param actions 音量
   */
  setVolume(actions: number | "up" | "down" | WheelEvent) {
    const statusStore = useStatusStore();
    const increment = 0.05;
    // 直接设置
    if (typeof actions === "number") {
      actions = Math.max(0, Math.min(actions, 1));
    }
    // 分类调节
    else if (actions === "up" || actions === "down") {
      statusStore.playVolume = Math.max(
        0,
        Math.min(statusStore.playVolume + (actions === "up" ? increment : -increment), 1),
      );
    }
    // 鼠标滚轮
    else {
      const deltaY = actions.deltaY;
      const volumeChange = deltaY > 0 ? -increment : increment;
      statusStore.playVolume = Math.max(0, Math.min(statusStore.playVolume + volumeChange, 1));
    }
    // 调整音量
    this.player.volume(statusStore.playVolume);
  }
  /**
   * 切换静音
   */
  toggleMute() {
    const statusStore = useStatusStore();
    // 是否静音
    const isMuted = statusStore.playVolume === 0;
    // 恢复音量
    if (isMuted) {
      statusStore.playVolume = statusStore.playVolumeMute;
    }
    // 保存当前音量并静音
    else {
      statusStore.playVolumeMute = this.player.volume();
      statusStore.playVolume = 0;
    }
    this.player.volume(statusStore.playVolume);
  }
  /**
   * 获取歌曲封面颜色数据
   * @param coverUrl 歌曲封面地址
   */
  async getCoverColor(coverUrl: string) {
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
  async updatePlayList(
    data: SongType[],
    song?: SongType,
    pid?: number,
    options: {
      showTip?: boolean;
      scrobble?: boolean;
      play?: boolean;
    } = {
      showTip: true,
      scrobble: true,
      play: true,
    },
  ) {
    if (!data || !data.length) return;
    const dataStore = useDataStore();
    const musicStore = useMusicStore();
    const statusStore = useStatusStore();
    // 获取配置
    const { showTip, play } = options;
    // 更新列表
    await dataStore.setPlayList(cloneDeep(data));
    // 关闭特殊模式
    if (statusStore.playHeartbeatMode) this.toggleHeartMode(false);
    if (statusStore.personalFmMode) statusStore.personalFmMode = false;
    // 是否直接播放
    if (song && typeof song === "object" && "id" in song) {
      // 是否为当前播放歌曲
      if (musicStore.playSong.id === song.id) {
        if (play) await this.play();
      } else {
        // 查找索引
        statusStore.playIndex = data.findIndex((item) => item.id === song.id);
        // 播放
        await this.pause(false);
        await this.initPlayer();
      }
    } else {
      statusStore.playIndex =
        statusStore.playSongMode === "shuffle" ? Math.floor(Math.random() * data.length) : 0;
      // 播放
      await this.pause(false);
      await this.initPlayer();
    }
    // 更改播放歌单
    musicStore.playPlaylistId = pid ?? 0;
    if (showTip) window.$message.success("已开始播放");
  }
  /**
   * 添加下一首歌曲
   * @param song 歌曲
   * @param play 是否立即播放
   */
  async addNextSong(song: SongType, play: boolean = false) {
    const dataStore = useDataStore();
    const musicStore = useMusicStore();
    const statusStore = useStatusStore();
    // 关闭特殊模式
    if (statusStore.personalFmMode) statusStore.personalFmMode = false;
    // 是否为当前播放歌曲
    if (musicStore.playSong.id === song.id) {
      this.play();
      window.$message.success("已开始播放");
      return;
    }
    // 尝试添加
    const songIndex = await dataStore.setNextPlaySong(song, statusStore.playIndex);
    // 播放歌曲
    if (songIndex < 0) return;
    if (play) this.togglePlayIndex(songIndex, true);
    else window.$message.success("已添加至下一首播放");
  }
  /**
   * 切换播放索引
   * @param index 播放索引
   * @param play 是否立即播放
   */
  async togglePlayIndex(index: number, play: boolean = false) {
    const dataStore = useDataStore();
    const statusStore = useStatusStore();
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
    // 清理并播放
    this.resetStatus();
    await this.initPlayer();
  }
  /**
   * 移除指定歌曲
   * @param index 歌曲索引
   */
  removeSongIndex(index: number) {
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
  async cleanPlayList() {
    const dataStore = useDataStore();
    const musicStore = useMusicStore();
    const statusStore = useStatusStore();
    // 停止播放
    Howler.unload();
    // 清空数据
    this.resetStatus();
    statusStore.$patch({
      playListShow: false,
      showFullPlayer: false,
      playHeartbeatMode: false,
      personalFmMode: false,
      playIndex: -1,
    });
    musicStore.resetMusicData();
    dataStore.setPlayList([]);
    window.$message.success("已清空播放列表");
  }
  /**
   * 切换输出设备
   * @param deviceId 输出设备
   */
  toggleOutputDevice(deviceId?: string) {
    try {
      const settingStore = useSettingStore();
      // 输出设备
      const devices = deviceId ?? settingStore.playDevice;
      if (!(this.player as any)?._sounds.length) return;
      // 获取音频元素
      const audioDom = this.getAudioDom();
      // 设置输出设备
      if (devices && audioDom?.setSinkId) {
        audioDom.setSinkId(devices);
      }
    } catch (error) {
      console.error("Failed to change audio output device:", error);
    }
  }
  /**
   * 初始化音频可视化
   */
  initSpectrumData() {
    try {
      if (this.audioContext) return;
      // AudioContext
      this.audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
      // 获取音频元素
      const audioDom = this.getAudioDom();
      // 媒体元素源
      this.source = this.audioContext.createMediaElementSource(audioDom);
      // AnalyserNode
      this.analyser = this.audioContext.createAnalyser();
      // 频谱分析器 FFT
      this.analyser.fftSize = 512;
      // 连接源和分析节点
      this.source.connect(this.analyser);
      // 连接分析节点到 AudioContext
      this.analyser.connect(this.audioContext.destination);
      // 配置 AnalyserNode
      const bufferLength = this.analyser.frequencyBinCount;
      this.dataArray = new Uint8Array(bufferLength);
      // 更新频谱数据
      this.generateSpectrumData();
      console.log("🎼 Initialize music spectrum successfully");
    } catch (error) {
      console.error("🎼 Initialize music spectrum failed:", error);
    }
  }
  /**
   * 切换桌面歌词
   */
  toggleDesktopLyric() {
    const statusStore = useStatusStore();
    const show = !statusStore.showDesktopLyric;
    statusStore.showDesktopLyric = show;
    window.electron.ipcRenderer.send("change-desktop-lyric", show);
    window.$message.success(`${show ? "已开启" : "已关闭"}桌面歌词`);
  }
  /**
   * 切换心动模式
   * @param open 是否开启
   */
  async toggleHeartMode(open: boolean = true) {
    try {
      const dataStore = useDataStore();
      const musicStore = useMusicStore();
      const statusStore = useStatusStore();
      if (!open && statusStore.playHeartbeatMode) {
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
      // 获取所需数据
      const playSongData = this.getPlaySongData();
      const likeSongsList: any = await dataStore.getUserLikePlaylist();
      // if (!playSongData || !likeSongsList) {
      //   throw new Error("获取播放数据或喜欢列表失败");
      // }
      const pid =
        musicStore.playPlaylistId && musicStore.playPlaylistId !== 0
          ? musicStore.playPlaylistId
          : likeSongsList?.detail?.id;
      // 开启心动模式
      const result = await heartRateList(playSongData?.id || 0, pid);
      if (result.code === 200) {
        this.message?.destroy();
        const heartRatelists = formatSongsList(result.data);
        // 更新播放列表
        await this.updatePlayList(heartRatelists, heartRatelists[0]);
        // 更改模式
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
  async initPersonalFM(playNext: boolean = false) {
    const musicStore = useMusicStore();
    const statusStore = useStatusStore();
    try {
      // 获取并重置
      const getPersonalFmData = async () => {
        const result = await personalFm();
        const songData = formatSongsList(result.data);
        console.log(`🌐 personal FM:`, songData);
        musicStore.personalFM.list = songData;
        musicStore.personalFM.playIndex = 0;
      };
      // 若为空
      if (musicStore.personalFM.list.length === 0) await getPersonalFmData();
      // 若需播放下一首
      if (playNext) {
        statusStore.personalFmMode = true;
        // 更改索引
        if (musicStore.personalFM.playIndex < musicStore.personalFM.list.length - 1) {
          musicStore.personalFM.playIndex++;
        } else {
          await getPersonalFmData();
        }
        // 清理并播放
        this.resetStatus();
        await this.initPlayer();
      }
    } catch (error) {
      console.error("Failed to initialize personal FM:", error);
    }
  }
  /**
   * 私人FM - 垃圾桶
   * @param id 歌曲id
   */
  async personalFMTrash(id: number) {
    try {
      const statusStore = useStatusStore();
      if (!isLogin()) {
        openUserLogin(true);
        return;
      }
      // 更改模式
      statusStore.personalFmMode = true;
      statusStore.playHeartbeatMode = false;
      // 加入回收站
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
}

export default new Player();
