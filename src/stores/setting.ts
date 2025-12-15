import { defineStore } from "pinia";
import { keywords, regexes } from "@/assets/data/exclude";
import { SongUnlockServer } from "@/utils/songManager";
// 导入类型但未使用，添加ts-ignore注释
// @ts-ignore - 类型导入用于类型检查
import type { SongLevelType } from "@/types/main";
import { defaultAMLLDbServer } from "@/utils/meta";
import {
  CURRENT_SETTING_SCHEMA_VERSION,
  migrateSettingState,
} from "./migrations/settingMigrations";

export interface SettingState {
  /** Schema 版本号（可选，用于数据迁移） */
  schemaVersion?: number;
  /** 明暗模式 */
  themeMode: "light" | "dark" | "auto";
  /** 主题类别 */
  themeColorType:
    | "default"
    | "orange"
    | "blue"
    | "pink"
    | "brown"
    | "indigo"
    | "green"
    | "purple"
    | "yellow"
    | "teal"
    | "custom";
  /** 主题自定义颜色 */
  themeCustomColor: string;
  /** 全局着色 */
  themeGlobalColor: boolean;
  /** 主题跟随封面 */
  themeFollowCover: boolean;
  /** 全局字体 */
  globalFont: "default" | string;
  /** 歌词区域字体 */
  LyricFont: "follow" | string;
  /** 日语歌词字体 */
  japaneseLyricFont: "follow" | string;
  /** 隐藏 VIP 标签 */
  showCloseAppTip: boolean;
  /** 关闭应用方式 */
  closeAppMethod: "exit" | "hide";
  /** 显示任务栏进度 */
  showTaskbarProgress: boolean;
  /** 是否使用在线服务 */
  useOnlineService: boolean;
  /** 启动时检查更新 */
  checkUpdateOnStart: boolean;
  /** 隐藏 VIP 标签 */
  hideVipTag: boolean;
  /** 歌词字体大小 */
  lyricFontSize: number;
  /** 歌词翻译字体大小 */
  lyricTranFontSize: number;
  /** 歌词音译字体大小 */
  lyricRomaFontSize: number;
  /** 歌词字体加粗 */
  lyricFontBold: boolean;
  /** 显示逐字歌词 */
  showYrc: boolean;
  /** 显示逐字歌词动画 */
  showYrcAnimation: boolean;
  /** 显示逐字歌词长音发光效果 */
  showYrcLongEffect: boolean;
  /** 显示歌词翻译 */
  showTran: boolean;
  /** 显示歌词音译 */
  showRoma: boolean;
  /** 歌词位置 */
  lyricsPosition: "flex-start" | "center" | "flex-end";
  /** 歌词滚动位置 */
  lyricsScrollPosition: "start" | "center";
  /** 下载路径 */
  downloadPath: string;
  /** 音乐命名格式 */
  fileNameFormat: "title" | "artist-title" | "title-artist";
  /** 文件智能分类 */
  folderStrategy: "none" | "artist" | "artist-album";
  /** 下载元信息 */
  downloadMeta: boolean;
  /** 下载封面 */
  downloadCover: boolean;
  /** 下载歌词 */
  downloadLyric: boolean;
  /** 下载歌词翻译 */
  downloadLyricTranslation: boolean;
  /** 下载歌词音译 */
  downloadLyricRomaji: boolean;
  /** 模拟播放下载 */
  usePlaybackForDownload: boolean;
  /** 保存元信息文件 */
  saveMetaFile: boolean;
  useSpecificSourceUnlock: boolean; // 是否启用特定来源解锁音频功能
  unlockSources: {
    netease: boolean;
    bilibili: boolean;
    kuwo: boolean;
    kugou: boolean;
    qq: boolean;
  }; // 音频解锁来源平台配置
  // Proxy settings
  proxyType: "off" | "system" | "manual" | "pac";
  proxyProtocol: "http" | "https" | "off"; // Used when proxyType is 'manual'
  proxyServe: string; // Used when proxyType is 'manual'
  proxyPort: number; // Used when proxyType is 'manual'
  proxyUsername?: string; // Optional, for manual proxy
  proxyPassword?: string; // Optional, for manual proxy
  pacUrl?: string; // Used when proxyType is 'pac'
  autoLoginCookie: string;
  songLevel:
    | "standard"
    | "higher"
    | "exhigh"
    | "lossless"
    | "hires"
    | "jyeffect"
    | "sky"
    | "jymaster";
  /** 播放设备 */
  playDevice: "default" | string;
  /** 自动播放 */
  autoPlay: boolean;
  /** 预载下一首 */
  useNextPrefetch: boolean;
  /** 渐入渐出 */
  songVolumeFade: boolean;
  /** 渐入渐出时间 */
  songVolumeFadeTime: number;
  /** 是否使用解灰 */
  useSongUnlock: boolean;
  /** 歌曲解锁音源 */
  songUnlockServer: { key: SongUnlockServer; enabled: boolean }[];
  /** 显示倒计时 */
  countDownShow: boolean;
  /** 显示歌词条 */
  barLyricShow: boolean;
  /** 播放器类型 */
  playerType: "cover" | "record";
  /** 背景类型 */
  playerBackgroundType: "none" | "animation" | "blur" | "color";
  /** 背景动画帧率 */
  playerBackgroundFps: number;
  /** 背景动画流动速度 */
  playerBackgroundFlowSpeed: number;
  /** 记忆最后进度 */
  memoryLastSeek: boolean;
  /** 显示播放列表数量 */
  showPlaylistCount: boolean;
  /** 是否显示音乐频谱 */
  showSpectrums: boolean;
  /** 是否开启 SMTC */
  smtcOpen: boolean;
  /** 歌词模糊 */
  lyricsBlur: boolean;
  /** 鼠标悬停暂停 */
  lrcMousePause: boolean;
  /** 播放试听 */
  playSongDemo: boolean;
  /** 显示搜索历史 */
  showSearchHistory: boolean;
  /** 是否使用 AM 歌词 */
  useAMLyrics: boolean;
  /** 是否使用 AM 歌词弹簧效果 */
  useAMSpring: boolean;
  /** 是否启用在线 TTML 歌词 */
  enableTTMLLyric: boolean;
  /** AMLL DB 服务地址 */
  amllDbServer: string;
  /** 菜单显示封面 */
  menuShowCover: boolean;
  /** 菜单展开项 */
  menuExpandedKeys: string[];
  /** 是否禁止休眠 */
  preventSleep: boolean;
  /** 本地文件路径 */
  localFilesPath: string[];
  /** 本地歌词路径 */
  localLyricPath: string[];
  /** 本地文件分隔符 */
  localSeparators: string[];
  /** 显示本地封面 */
  showLocalCover: boolean;
  /** 路由动画 */
  routeAnimation: "none" | "fade" | "zoom" | "slide" | "up";
  /** 是否使用真实 IP */
  useRealIP: boolean;
  /** 真实 IP 地址 */
  realIP: string;
  /** 是否打卡歌曲 */
  scrobbleSong: boolean;
  /** 动态封面 */
  dynamicCover: boolean;
  /** 是否使用 keep-alive */
  useKeepAlive: boolean;
  /** 是否启用排除歌词 */
  enableExcludeLyrics: boolean;
  /** 「排除歌词」是否适用于 TTML */
  enableExcludeTTML: boolean;
  /** 「排除歌词」是否适用于本地歌词 */
  enableExcludeLocalLyrics: boolean;
  /** 排除歌词关键字 */
  excludeKeywords: string[];
  /** 排除歌词正则表达式 */
  excludeRegexes: string[];
  /** 显示默认本地路径 */
  showDefaultLocalPath: boolean;
  /** 展示当前歌曲歌词状态信息 */
  showPlayMeta: boolean;
  /** 显示歌曲音质 */
  showSongQuality: boolean;
  /** 显示歌曲特权标签 */
  showSongPrivilegeTag: boolean;
  /** 显示原唱翻唱标签 */
  showSongOriginalTag: boolean;
  /** 隐藏发现音乐 */
  hideDiscover: boolean;
  /** 隐藏私人漫游 */
  hidePersonalFM: boolean;
  /** 隐藏播客电台 */
  hideRadioHot: boolean;
  /** 隐藏我的收藏 */
  hideLike: boolean;
  /** 隐藏我的云盘 */
  hideCloud: boolean;
  /** 隐藏下载管理 */
  hideDownload: boolean;
  /** 隐藏本地歌曲 */
  hideLocal: boolean;
  /** 隐藏最近播放 */
  hideHistory: boolean;
  /** 隐藏创建的歌单 */
  hideUserPlaylists: boolean;
  /** 隐藏收藏的歌单 */
  hideLikedPlaylists: boolean;
  /** 隐藏心动模式 */
  hideHeartbeatMode: boolean;
  /** 启用搜索关键词获取 */
  enableSearchKeyword: boolean;
  /** 下载音质 */
  downloadSongLevel: SongLevelType;
  /** 手机模式 */
  isMobileMode: boolean;
  /** 自定义背景图片 */
  customBackgroundImage: string;
  /** 自定义全局背景图片 */
  customGlobalBackgroundImage: string;
  /** 全局背景透明度 */
  globalBackgroundOpacity: number;
  /** 活动API基础URL */
  activitiesApiBaseUrl: string;
  /** 隐藏 Star 弹窗 */
  hideStarPopup: boolean;
  /** 首页栏目顺序和显示配置 */
  homePageSections: Array<{
    key: "playlist" | "radar" | "artist" | "video" | "radio" | "album";
    name: string;
    visible: boolean;
    order: number;
  }>;
  /** 自定义协议注册 **/
  registryProtocol: {
    orpheus: boolean;
  };
  /** 应用启动次数 */
  appLaunchCount: number;
}

export const useSettingStore = defineStore("setting", {
  state: (): SettingState => ({
    schemaVersion: CURRENT_SETTING_SCHEMA_VERSION,
    themeMode: "auto",
    themeColorType: "default",
    themeCustomColor: "#fe7971",
    themeFollowCover: false,
    themeGlobalColor: false,
    globalFont: "default",
    LyricFont: "follow",
    japaneseLyricFont: "follow",
    hideVipTag: false,
    showSearchHistory: true,
    menuShowCover: true,
    menuExpandedKeys: [],
    routeAnimation: "slide",
    useOnlineService: true,
    showCloseAppTip: true,
    closeAppMethod: "hide",
    showTaskbarProgress: false,
    checkUpdateOnStart: true,
    preventSleep: false,
    useKeepAlive: true,
    songLevel: "exhigh",
    playDevice: "default",
    autoPlay: false,
    useNextPrefetch: true,
    songVolumeFade: true,
    songVolumeFadeTime: 300,
    useSongUnlock: true,
    songUnlockServer: [
      { key: SongUnlockServer.BODIAN, enabled: true },
      { key: SongUnlockServer.GEQUBAO, enabled: true },
      { key: SongUnlockServer.NETEASE, enabled: true },
    ],
    useSpecificSourceUnlock: true, // 是否启用特定来源解锁音频功能
    unlockSources: {
      netease: true,
      bilibili: true,
      kuwo: true,
      kugou: true,
      qq: true,
    }, // 音
    countDownShow: true,
    barLyricShow: true,
    playerType: "cover",
    playerBackgroundType: "blur",
    playerBackgroundFps: 30,
    playerBackgroundFlowSpeed: 4,
    memoryLastSeek: true,
    showPlaylistCount: true,
    showSpectrums: false,
    smtcOpen: true,
    playSongDemo: false,
    scrobbleSong: false,
    dynamicCover: false,
    lyricFontSize: 46,
    lyricTranFontSize: 22,
    lyricRomaFontSize: 18,
    lyricFontBold: true,
    useAMLyrics: false,
    useAMSpring: false,
    enableTTMLLyric: false,
    amllDbServer: defaultAMLLDbServer,
    showYrc: true,
    showYrcAnimation: true,
    showYrcLongEffect: true,
    showTran: true,
    showRoma: true,
    lyricsPosition: "flex-start",
    lyricsBlur: false,
    lyricsScrollPosition: "start",
    lrcMousePause: false,
    enableExcludeLyrics: true,
    enableExcludeTTML: false,
    enableExcludeLocalLyrics: false,
    excludeKeywords: keywords,
    excludeRegexes: regexes,
    localFilesPath: [],
    localLyricPath: [],
    showDefaultLocalPath: true,
    localSeparators: ["/", "&"],
    showLocalCover: true,
    downloadPath: "",
    fileNameFormat: "title-artist",
    folderStrategy: "none",
    downloadMeta: true,
    downloadCover: true,
    downloadLyric: true,
    downloadLyricTranslation: true,
    downloadLyricRomaji: false,
    usePlaybackForDownload: false,
    saveMetaFile: false,
    downloadSongLevel: "h",
    isMobileMode: false,
    customBackgroundImage: "",
    customGlobalBackgroundImage: "",
    globalBackgroundOpacity: 0.8,
    activitiesApiBaseUrl: "",
    appLaunchCount: 0,
    proxyType: "off",
    autoLoginCookie: "",
    proxyProtocol: "off",
    proxyServe: "127.0.0.1",
    proxyPort: 80,
    useRealIP: false,
    realIP: "",
    showPlayMeta: false,
    showSongQuality: true,
    showSongPrivilegeTag: true,
    showSongOriginalTag: true,
    hideDiscover: false,
    hidePersonalFM: false,
    hideRadioHot: false,
    hideLike: false,
    hideCloud: false,
    hideDownload: false,
    hideLocal: false,
    hideHistory: false,
    hideUserPlaylists: false,
    hideLikedPlaylists: false,
    hideHeartbeatMode: false,
    enableSearchKeyword: true,
    hideStarPopup: true,
    homePageSections: [
      { key: "playlist", name: "专属歌单", visible: true, order: 0 },
      { key: "radar", name: "雷达歌单", visible: true, order: 1 },
      { key: "artist", name: "歌手推荐", visible: true, order: 2 },
      { key: "video", name: "推荐 MV", visible: true, order: 3 },
      { key: "radio", name: "推荐播客", visible: true, order: 4 },
      { key: "album", name: "新碟上架", visible: true, order: 5 },
    ],
    registryProtocol: {
      orpheus: false,
    },
  }),
  getters: {
    /**
     * 获取淡入淡出时间
     * @returns 淡入淡出时间
     */
    getFadeTime(state): number {
      return state.songVolumeFade ? state.songVolumeFadeTime : 0;
    },
  },
  actions: {
    /**
     * 检查并执行数据迁移
     * 应在应用启动时调用
     */
    checkAndMigrate() {
      const currentVersion = this.schemaVersion ?? 0;
      const targetVersion = CURRENT_SETTING_SCHEMA_VERSION;

      if (currentVersion !== targetVersion) {
        console.log(`[Setting Migration] 检测到版本差异: ${currentVersion} -> ${targetVersion}`);
        // 保存当前完整状态
        const currentState = { ...this.$state } as Partial<SettingState>;
        // 执行迁移，保留所有原有字段，只更新需要的字段
        const migratedState = migrateSettingState(currentState, currentVersion, targetVersion);
        // 应用迁移后的状态
        Object.assign(this, migratedState);
        // 确保版本号已更新
        this.schemaVersion = targetVersion;
        console.log(`[Setting Migration] 迁移完成，已更新到版本 ${targetVersion}`);
      }
    },
    // 更换明暗模式
    setThemeMode(mode?: "auto" | "light" | "dark") {
      // 若未传入
      if (mode === undefined) {
        if (this.themeMode === "auto") {
          this.themeMode = "light";
        } else if (this.themeMode === "light") {
          this.themeMode = "dark";
        } else {
          this.themeMode = "auto";
        }
      } else {
        this.themeMode = mode;
      }
      window.$message.info(
        `已切换至
        ${
          this.themeMode === "auto"
            ? "跟随系统"
            : this.themeMode === "light"
              ? "浅色模式"
              : "深色模式"
        }`,
        {
          showIcon: false,
        },
      );
    },

    /**
     * 设置全局登录Cookie
     */
    setGlobalCookie(cookie: string) {
      this.autoLoginCookie = cookie;
      console.log('已更新全局登录Cookie');
    },

    /**
     * 清除全局登录Cookie
     */
    clearGlobalCookie() {
      this.autoLoginCookie = "";
      console.log('已清除全局登录Cookie');
    },

    /**
     * 获取全局登录Cookie
     */
    getGlobalCookie(): string {
      return this.autoLoginCookie;
    },

    /**
     * 切换手机模式
     * @param mode 是否启用手机模式，不传则切换当前状态
     */
    toggleMobileMode(mode?: boolean) {
      if (mode === undefined) {
        this.isMobileMode = !this.isMobileMode;
      } else {
        this.isMobileMode = mode;
      }
      window.$message.info(
        `已切换至${this.isMobileMode ? '手机模式' : 'PC模式'}`,
        {
          showIcon: false,
        },
      );
    },
  },
  // 持久化
  persist: {
    key: "setting-store",
    storage: localStorage,
  },
});
