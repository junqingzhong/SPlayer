import { type SongType } from "@/types/main";
import { AudioManager } from "./AudioManager";
import { LyricManager } from "./LyricManager";
import { SongManager } from "./SongManager";
import { isElectron } from "@/utils/env";
import { throttle } from "lodash-es";
import { useDataStore, useMusicStore, useSettingStore, useStatusStore } from "@/stores";
import { calculateProgress } from "@/utils/time";

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
  sendProgress: throttle((progress: number) => {
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
export class Player {
  /** 单例实例 */
  private static instance: Player;

  /** 状态锁，防止快速切歌导致的竞争条件 */
  private _initializing = false;

  /** 最大重试次数 */
  private readonly MAX_RETRY_COUNT = 3;
  /** 当前曲目重试信息（按歌曲维度） */
  private retryInfo: { songId: number | string; count: number } = { songId: 0, count: 0 };
  /** 私有构造函数 */
  private constructor() {}
  /** Player 单例实例 */
  public static getInstance(): Player {
    if (!this.instance) this.instance = new Player();
    return this.instance;
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
    options: { autoPlay: boolean; seek: number } = { autoPlay: true, seek: 0 },
  ) {
    // 防止快速切歌
    if (this._initializing) return;
    this._initializing = true;

    const musicStore = useMusicStore();
    const statusStore = useStatusStore();
    const songManager = SongManager.getInstance();

    const { autoPlay, seek } = options;

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
      // 后置处理 (歌词、历史记录、MediaSession、解析本地元数据)
      await this.afterPlaySetup(targetSong, audioSource.url);
    } catch (error: any) {
      console.error("❌ 播放初始化失败:", error);
      // 触发错误处理流程
      await this.handlePlaybackError(error?.code || 0, seek);
    } finally {
      this._initializing = false;
    }
  }

  /**
   * 内部方法：加载音频流并播放
   */
  private async loadAndPlay(url: string, autoPlay: boolean, seek: number) {
    const statusStore = useStatusStore();
    const settingStore = useSettingStore();
    const audioManager = AudioManager.getInstance();
    // 设置基础参数
    audioManager.setVolume(statusStore.playVolume);
    audioManager.setRate(statusStore.playRate);
    // 切换输出设备
    if (!settingStore.showSpectrums) this.toggleOutputDevice();
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
   */
  private async afterPlaySetup(song: SongType) {
    const dataStore = useDataStore();
    const musicStore = useMusicStore();
    const settingStore = useSettingStore();

    const songManager = SongManager.getInstance();
    const lyricManager = LyricManager.getInstance();

    // 获取歌词
    lyricManager.handleLyric(song.id, song.path);
    // 记录播放历史 (非电台)
    if (song.type !== "radio") dataStore.setHistory(song);
    // 提取封面颜色
    if (!song.path) {
      songManager.getCoverColor(musicStore.songCover);
      this.updateMediaSession();
    } else {
      // 本地文件额外处理：解析元数据
      await this.parseLocalMusicInfo(song.path);
    }

    // 4. 预载下一首 (如果在设置中开启)
    // [建议重构] 移至观察者模式，监听当前歌曲变化后触发预载
    if (settingStore.useNextPrefetch) {
      this.nextPrefetch = await songManager.getNextSongUrl();
    } else {
      this.nextPrefetch = null;
    }
  }

  // =========================================================================
  // 事件系统 (Event System)
  // =========================================================================

  /**
   * 统一音频事件绑定
   */
  private bindAudioEvents() {
    const songManager = SongManager.getInstance();
    const audioManager = AudioManager.getInstance();
    const lyricManager = LyricManager.getInstance();

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

    // 3. 尝试重试 (延迟 1s 给网络缓冲)
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
    const audioManager = AudioManager.getInstance();

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
    const audioManager = AudioManager.getInstance();

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
}
