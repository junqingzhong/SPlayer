import { type SongType } from "@/types/main";
import { useAudioManager } from "./AudioManager";
import { useSongManager } from "./SongManager";
import { useLyricManager } from "./LyricManager";
import { useBlobURLManager } from "@/core/resource/BlobURLManager";
import { isElectron } from "@/utils/env";
import { throttle } from "lodash-es";
import { useDataStore, useMusicStore, useSettingStore, useStatusStore } from "@/stores";
import { calculateProgress, msToS } from "@/utils/time";
import { handleSongQuality } from "@/utils/helper";
import { getCoverColor } from "@/utils/color";

/**
 * 播放器 IPC 服务
 * 用于与主进程通信
 */
const ipcService = {
  /**
   * 发送播放状态
   * @param isPlaying 是否播放
   */
  sendPlayStatus: (isPlaying: boolean) => {
    if (isElectron) window.electron.ipcRenderer.send("play-status-change", isPlaying);
  },
  /**
   * 发送歌曲信息
   * @param title 歌曲标题
   * @param artist 歌手
   * @param name 歌曲名称
   */
  sendSongChange: (title: string, artist: string, name: string) => {
    if (!isElectron) return;
    window.electron.ipcRenderer.send("play-song-change", `${title} | SPlayer`);
    window.electron.ipcRenderer.send("update-desktop-lyric-data", {
      playName: name,
      artistName: artist,
    });
  },
  /**
   * 发送进度
   * @param progress 进度
   */
  sendProgress: throttle((progress: number | "none") => {
    if (isElectron) window.electron.ipcRenderer.send("set-bar", progress);
  }, 1000),
  /**
   * 发送歌词
   * @param data 歌词数据
   */
  sendLyric: throttle((data: unknown) => {
    if (isElectron) window.electron.ipcRenderer.send("play-lyric-change", data);
  }, 500),
  /**
   * 发送喜欢状态
   * @param isLiked 是否喜欢
   */
  sendLikeStatus: (isLiked: boolean) => {
    if (isElectron) window.electron.ipcRenderer.send("like-status-change", isLiked);
  },
  /**
   * 发送桌面歌词开关
   * @param show 是否显示
   */
  toggleDesktopLyric: (show: boolean) => {
    if (isElectron) window.electron.ipcRenderer.send("toggle-desktop-lyric", show);
  },
  /**
   * 发送播放模式
   * @param mode 播放模式
   */
  sendPlayMode: (mode: string) => {
    if (isElectron) window.electron.ipcRenderer.send("play-mode-change", mode);
  },
};

/**
 * 播放器核心类
 * 职责：负责音频生命周期管理、与 AudioManager 交互、调度 Store
 */
class PlayerController {
  /** 状态锁，防止快速切歌导致的竞争条件 */
  private _initializing = false;

  /** 最大重试次数 */
  private readonly MAX_RETRY_COUNT = 3;
  /** 当前曲目重试信息（按歌曲维度） */
  private retryInfo: { songId: number | string; count: number } = { songId: 0, count: 0 };

  constructor() {
    this.bindAudioEvents();
    this.initMediaSession();
  }

  // =========================================================================
  // 核心播放流程 (Refactored)
  // =========================================================================
  /**
   * 初始化并播放歌曲
   * @param song 要播放的歌曲对象，不传，默认使用 playSong
   * @param options 配置
   * @param options.autoPlay 是否自动播放
   * @param options.seek 初始播放进度（毫秒）
   */
  public async playSong(
    song?: SongType,
    options: { autoPlay?: boolean; seek?: number } = { autoPlay: true, seek: 0 },
  ) {
    // 防止快速切歌
    if (this._initializing) return;
    this._initializing = true;

    const musicStore = useMusicStore();
    const statusStore = useStatusStore();
    const songManager = useSongManager();

    const { autoPlay = true, seek = 0 } = options;

    // 要播放的歌曲对象
    const targetSong = song || musicStore.playSong;
    if (!targetSong || !targetSong.id) {
      this._initializing = false;
      return;
    }

    try {
      // 开启加载
      statusStore.playLoading = true;
      // 如果传入了新的歌曲，才更新 Store
      if (musicStore.playSong.id !== targetSong.id) {
        musicStore.playSong = targetSong;
        // 重置播放进度
        statusStore.currentTime = 0;
        statusStore.progress = 0;
        statusStore.lyricIndex = -1;
      }
      // 重置重试计数
      const sid = targetSong.type === "radio" ? targetSong.dj?.id : targetSong.id;
      if (this.retryInfo.songId !== sid) {
        this.retryInfo = { songId: sid || 0, count: 0 };
      }
      // 获取音频源
      const audioSource = await songManager.getAudioSource(targetSong);
      if (!audioSource.url) throw new Error("AUDIO_SOURCE_NOT_FOUND");
      // 更新音质和解锁状态
      statusStore.songQuality = audioSource.quality;
      statusStore.playUblock = audioSource.isUnlocked ?? false;
      // 执行底层播放
      await this.loadAndPlay(audioSource.url, autoPlay, seek);
      // 后置处理
      await this.afterPlaySetup(targetSong);
    } catch (error: any) {
      console.error("❌ 播放初始化失败:", error);
      // 触发错误处理流程
      await this.handlePlaybackError(error?.code || 0, seek);
    } finally {
      this._initializing = false;
    }
  }

  /**
   * 加载音频流并播放
   */
  private async loadAndPlay(url: string, autoPlay: boolean, seek: number) {
    const statusStore = useStatusStore();
    const settingStore = useSettingStore();
    const audioManager = useAudioManager();
    // 设置基础参数
    audioManager.setVolume(statusStore.playVolume);
    audioManager.setRate(statusStore.playRate);
    // 切换输出设备
    if (!settingStore.showSpectrums) audioManager.toggleOutputDevice();
    // 停止上一首
    audioManager.stop();
    // 播放
    // fadeIn 只在非 seek 且需要自动播放时启用
    await audioManager.play(url, { fadeIn: false, autoPlay });
    // 恢复进度
    if (seek > 0) audioManager.seek(seek / 1000);
  }

  /**
   * 播放成功后的后续设置
   * @param song 歌曲
   * @param url 音频源
   */
  private async afterPlaySetup(song: SongType) {
    const dataStore = useDataStore();
    const musicStore = useMusicStore();
    const settingStore = useSettingStore();
    const songManager = useSongManager();
    const lyricManager = useLyricManager();

    // 获取歌词
    lyricManager.handleLyric(song.id, song.path);
    // 记录播放历史 (非电台)
    if (song.type !== "radio") dataStore.setHistory(song);
    // 更新歌曲数据
    if (!song.path) {
      this.updateMediaSession();
      getCoverColor(musicStore.songCover);
    }
    // 本地文件额外处理
    else {
      await this.parseLocalMusicInfo(song.path);
    }

    // 预载下一首
    if (settingStore.useNextPrefetch) songManager.getNextSongUrl();
  }

  /**
   * 解析本地歌曲元信息
   * @param path 歌曲路径
   */
  private async parseLocalMusicInfo(path: string) {
    try {
      const musicStore = useMusicStore();
      const statusStore = useStatusStore();
      const blobURLManager = useBlobURLManager();

      // Blob URL 清理
      const oldCover = musicStore.playSong.cover;
      const oldPath = musicStore.playSong.path;
      if (oldCover && oldCover.startsWith("blob:") && oldPath && oldPath !== path) {
        blobURLManager.revokeBlobURL(oldPath);
      }

      // 获取封面数据
      const coverData = await window.electron.ipcRenderer.invoke("get-music-cover", path);
      if (coverData) {
        const blobURL = blobURLManager.createBlobURL(coverData.data, coverData.format, path);
        if (blobURL) musicStore.playSong.cover = blobURL;
      } else {
        musicStore.playSong.cover = "/images/song.jpg?assest";
      }

      // 获取元数据
      const infoData = await window.electron.ipcRenderer.invoke("get-music-metadata", path);
      statusStore.songQuality = handleSongQuality(infoData.format?.bitrate ?? 0, "local");
      // 获取主色
      getCoverColor(musicStore.playSong.cover);
      // 更新媒体会话
      this.updateMediaSession();
    } catch (error) {
      console.error("❌ 解析本地歌曲元信息失败:", error);
    }
  }

  // =========================================================================
  // 事件系统 (Event System)
  // =========================================================================

  /**
   * 统一音频事件绑定
   */
  private bindAudioEvents() {
    const songManager = useSongManager();
    const audioManager = useAudioManager();
    const lyricManager = useLyricManager();

    // 清理旧事件
    audioManager.offAll();

    // 播放开始
    audioManager.on("play", () => {
      const statusStore = useStatusStore();

      const { name, artist } = songManager.getPlayerInfoObj() || {};
      const playTitle = `${name} - ${artist}`;

      // 更新状态
      statusStore.playStatus = true;
      window.document.title = `${playTitle} | SPlayer`;

      // 只有真正播放了才重置重试计数
      if (this.retryInfo.count > 0) this.retryInfo.count = 0;

      // IPC 通知
      ipcService.sendPlayStatus(true);
      ipcService.sendSongChange(playTitle, artist || "", name || "");

      console.log("▶️ song play:", name);
    });

    // 暂停
    audioManager.on("pause", () => {
      const statusStore = useStatusStore();
      statusStore.playStatus = false;
      if (!isElectron) window.document.title = "SPlayer";

      ipcService.sendPlayStatus(false);
      console.log("⏸️ song pause");
    });

    // 播放结束
    const handleTimeUpdate = throttle(() => {
      const musicStore = useMusicStore();
      const statusStore = useStatusStore();
      const settingStore = useSettingStore();

      const currentTime = Math.floor(audioManager.currentTime * 1000);
      const duration = Math.floor(audioManager.duration * 1000) || statusStore.duration;

      // 更新 Store (限制频率以免阻塞 UI 线程)
      if (Math.abs(currentTime - statusStore.currentTime) > 200) {
        statusStore.$patch({
          currentTime,
          duration,
          progress: calculateProgress(currentTime, duration),
          lyricIndex: lyricManager.calculateLyricIndex(currentTime),
        });
      }

      // 更新系统 MediaSession
      this.updateMediaSessionState(duration, currentTime);

      // 更新桌面歌词
      ipcService.sendLyric({
        lyricIndex: statusStore.lyricIndex,
        currentTime,
        songId: musicStore.playSong?.id,
        songOffset: statusStore.getSongOffset(musicStore.playSong?.id),
      });
      // 进度条
      if (settingStore.showTaskbarProgress) {
        ipcService.sendProgress(statusStore.progress);
      }
    }, 200);
    audioManager.on("timeupdate", handleTimeUpdate);

    // 错误处理
    audioManager.on("error", (e: any) => {
      // 从 Event 中提取错误码
      let errCode: number | undefined;
      if ("detail" in e && e.detail) {
        errCode = (e.detail as { errorCode?: number }).errorCode;
      }
      this.handlePlaybackError(errCode, this.getSeek());
    });

    // 加载状态
    audioManager.on("loadstart", () => {
      useStatusStore().playLoading = true;
    });

    // 加载完成
    audioManager.on("canplay", () => {
      const statusStore = useStatusStore();
      const dataStore = useDataStore();
      const playSongData = songManager.getPlaySongData();

      // 结束加载
      statusStore.playLoading = false;

      // 恢复 EQ
      if (isElectron && statusStore.eqEnabled) {
        const bands = statusStore.eqBands;
        if (bands && bands.length === 10) {
          bands.forEach((val, idx) => audioManager.setFilterGain(idx, val));
        }
      }

      // 更新喜欢状态
      ipcService.sendLikeStatus(dataStore.isLikeSong(playSongData?.id || 0));
    });
  }

  /**
   * 统一错误处理策略
   * @param errCode 错误码
   * @param currentSeek 当前播放位置 (用于恢复)
   */
  private async handlePlaybackError(errCode: number | undefined, currentSeek: number = 0) {
    const dataStore = useDataStore();

    this.retryInfo.count++;
    console.warn(
      `⚠️ 播放出错 (Code: ${errCode}), 重试: ${this.retryInfo.count}/${this.MAX_RETRY_COUNT}`,
    );

    // 用户主动中止 (Code 1) - 不重试
    if (errCode === 1) {
      this.retryInfo.count = 0;
      return;
    }

    // 达到最大重试次数 -> 切歌
    if (this.retryInfo.count > this.MAX_RETRY_COUNT) {
      console.error("❌ 超过最大重试次数，跳过当前歌曲");
      window.$message.error("播放失败，已自动跳过");
      this.retryInfo.count = 0;

      if (dataStore.playList.length > 1) {
        await this.nextOrPrev("next");
      } else {
        this.cleanPlayList();
      }
      return;
    }

    // 尝试重试 (延迟给网络缓冲)
    setTimeout(async () => {
      // 只有第一次重试时提示用户
      if (this.retryInfo.count === 1) {
        window.$message.warning("播放异常，正在尝试恢复...");
      }
      // 重新调用 playSong，尝试恢复进度
      // 注意：这里我们不直接调 loadAndPlay，而是调 playSong 走全流程
      // 这样如果是因为 URL 过期 (Code 2)，playSong 会重新获取新的 URL
      await this.playSong(undefined, { autoPlay: true, seek: currentSeek });
    }, 2000);
  }

  // =========================================================================
  // 播放控制 (Control)
  // =========================================================================

  /** 播放 */
  async play() {
    const statusStore = useStatusStore();
    const settingStore = useSettingStore();
    const audioManager = useAudioManager();

    // 如果没有源，尝试重新初始化当前歌曲
    if (!audioManager.src) {
      await this.playSong();
      return;
    }

    // 如果正在播放，则更新状态
    if (audioManager.paused) {
      const fadeTime = settingStore.getFadeTime ? settingStore.getFadeTime / 1000 : 0;
      await audioManager.play(undefined, { fadeIn: !!fadeTime, fadeDuration: fadeTime });
      statusStore.playStatus = true;
    }
  }

  /** 暂停 */
  async pause(changeStatus: boolean = true) {
    const statusStore = useStatusStore();
    const settingStore = useSettingStore();
    const audioManager = useAudioManager();

    if (!audioManager.src) return;

    const fadeTime = settingStore.getFadeTime ? settingStore.getFadeTime / 1000 : 0;
    audioManager.pause({ fadeOut: !!fadeTime, fadeDuration: fadeTime });

    if (changeStatus) statusStore.playStatus = false;
  }

  /** 播放/暂停切换 */
  async playOrPause() {
    const statusStore = useStatusStore();
    if (statusStore.playStatus) await this.pause();
    else await this.play();
  }

  /**
   * 切歌：上一首/下一首
   * @param type 方向
   * @param play 是否立即播放
   * @param autoEnd 是否是自动结束触发的
   */
  public async nextOrPrev(
    type: "next" | "prev" = "next",
    play: boolean = true,
    autoEnd: boolean = false,
  ) {
    const dataStore = useDataStore();
    const statusStore = useStatusStore();

    const songManager = useSongManager();

    // 先暂停
    await this.pause();

    // 私人FM
    if (statusStore.personalFmMode) {
      await songManager.initPersonalFM(true);
      await this.playSong();
      return;
    }
    // 播放列表是否为空
    const playListLength = dataStore.playList.length;
    if (playListLength === 0) {
      window.$message.error("播放列表为空，请添加歌曲");
      return;
    }
    // 单曲循环
    // 如果是自动结束触发的单曲循环，则重播当前歌曲
    if (statusStore.playSongMode === "repeat-once" && autoEnd && !statusStore.playHeartbeatMode) {
      this.setSeek(0);
      await this.play();
      return;
    }
    // 计算索引 (委托给 DataStore 逻辑会更好，但为了保持此文件完整性，在此计算)
    let nextIndex = statusStore.playIndex;
    nextIndex += type === "next" ? 1 : -1;
    // 边界处理 (索引越界)
    if (nextIndex >= playListLength) nextIndex = 0;
    if (nextIndex < 0) nextIndex = playListLength - 1;
    // 更新状态并播放
    statusStore.playIndex = nextIndex;
    await this.playSong(undefined, { autoPlay: play });
  }

  /** 获取总时长 (ms) */
  public getDuration(): number {
    const audioManager = useAudioManager();
    return Math.floor(audioManager.duration * 1000);
  }

  /** 获取当前播放位置 (ms) */
  public getSeek(): number {
    const audioManager = useAudioManager();
    return Math.floor(audioManager.currentTime * 1000);
  }

  /** 设置进度 */
  public setSeek(time: number) {
    const statusStore = useStatusStore();
    const audioManager = useAudioManager();
    // 边界检查
    const safeTime = Math.max(0, Math.min(time, this.getDuration()));
    audioManager.seek(safeTime / 1000);
    statusStore.currentTime = safeTime;
  }

  /**
   * 设置音量
   * @param actions 音量值或滚动事件
   */
  public setVolume(actions: number | "up" | "down" | WheelEvent) {
    const statusStore = useStatusStore();
    const audioManager = useAudioManager();
    // 增量
    const increment = 0.05;
    // 直接设置音量
    if (typeof actions === "number") {
      actions = Math.max(0, Math.min(actions, 1));
      statusStore.playVolume = actions;
    }
    // 音量加减
    else if (actions === "up" || actions === "down") {
      statusStore.playVolume = Math.max(
        0,
        Math.min(statusStore.playVolume + (actions === "up" ? increment : -increment), 1),
      );
    }
    // 滚动事件
    else {
      const deltaY = actions.deltaY;
      const volumeChange = deltaY > 0 ? -increment : increment;
      statusStore.playVolume = Math.max(0, Math.min(statusStore.playVolume + volumeChange, 1));
    }

    audioManager.setVolume(statusStore.playVolume);
  }

  /** 切换静音 */
  public toggleMute() {
    const statusStore = useStatusStore();
    const audioManager = useAudioManager();

    // 是否静音
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
   * 设置播放速率
   * @param rate 速率 (0.5 - 2.0)
   */
  public setRate(rate: number) {
    const statusStore = useStatusStore();
    const audioManager = useAudioManager();

    statusStore.playRate = rate;
    audioManager.setRate(rate);
  }

  /**
   * 清空播放列表
   */
  public async cleanPlayList() {
    const dataStore = useDataStore();
    const statusStore = useStatusStore();
    const musicStore = useMusicStore();
    const audioManager = useAudioManager();

    audioManager.stop();

    // 重置状态
    statusStore.$patch({
      currentTime: 0,
      duration: 0,
      progress: 0,
      lyricIndex: -1,
      playStatus: false,
      playLoading: false,
      playListShow: false,
      showFullPlayer: false,
      playHeartbeatMode: false,
      personalFmMode: false,
      playIndex: -1,
    });
    musicStore.playPlaylistId = 0;
    musicStore.resetMusicData();

    await dataStore.setPlayList([]);
    await dataStore.clearOriginalPlayList();

    ipcService.sendProgress("none");
  }

  /** MediaSession: 初始化 */
  private initMediaSession() {
    const settingStore = useSettingStore();
    if (!settingStore.smtcOpen || !("mediaSession" in navigator)) return;
    const nav = navigator.mediaSession;
    nav.setActionHandler("play", () => this.play());
    nav.setActionHandler("pause", () => this.pause());
    nav.setActionHandler("previoustrack", () => this.nextOrPrev("prev"));
    nav.setActionHandler("nexttrack", () => this.nextOrPrev("next"));
    nav.setActionHandler("seekto", (e) => {
      if (e.seekTime) this.setSeek(e.seekTime * 1000);
    });
  }

  /** MediaSession: 更新元数据 */
  private updateMediaSession() {
    if (!("mediaSession" in navigator)) return;
    const musicStore = useMusicStore();
    const songManager = useSongManager();

    // 获取播放数据
    const song = songManager.getPlaySongData();
    if (!song) return;
    const isRadio = song.type === "radio";
    // 更新元数据
    navigator.mediaSession.metadata = new window.MediaMetadata({
      title: song.name,
      artist: isRadio
        ? "播客电台"
        : Array.isArray(song.artists)
          ? song.artists.map((a) => a.name).join("/")
          : String(song.artists),
      album: isRadio
        ? "播客电台"
        : typeof song.album === "object"
          ? song.album.name
          : String(song.album),
      artwork: [
        { src: musicStore.getSongCover("s"), sizes: "100x100", type: "image/jpeg" },
        { src: musicStore.getSongCover("m"), sizes: "300x300", type: "image/jpeg" },
        { src: musicStore.getSongCover("cover"), sizes: "512x512", type: "image/jpeg" },
        { src: musicStore.getSongCover("l"), sizes: "1024x1024", type: "image/jpeg" },
        { src: musicStore.getSongCover("xl"), sizes: "1920x1920", type: "image/jpeg" },
      ],
    });
  }

  /** MediaSession: 更新状态 */
  private updateMediaSessionState(duration: number, position: number) {
    const settingStore = useSettingStore();
    if (!settingStore.smtcOpen || !("mediaSession" in navigator)) return;
    navigator.mediaSession.setPositionState({
      duration: msToS(duration),
      position: msToS(position),
    });
  }
}

let instance: PlayerController | null = null;

/**
 * 获取 PlayerController 实例
 * @returns PlayerController
 */
export const usePlayerController = (): PlayerController => {
  if (!instance) instance = new PlayerController();
  return instance;
};
