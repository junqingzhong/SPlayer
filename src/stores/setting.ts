import { defineStore } from "pinia";
import { keywords } from "@/assets/data/exclude";

interface SettingState {
  themeMode: "light" | "dark" | "auto";
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
  themeCustomColor: string;
  themeGlobalColor: boolean;
  themeFollowCover: boolean;
  globalFont: "default" | string;
  LyricFont: "follow" | string;
  showCloseAppTip: boolean;
  closeAppMethod: "exit" | "hide";
  showTaskbarProgress: boolean;
  useOnlineService: boolean;
  checkUpdateOnStart: boolean;
  customGlobalBackgroundImage: string; // 全局自定义背景图片路径
  globalBackgroundOpacity: number; // 全局背景图片透明度
  activitiesApiBaseUrl: string; // 活动列表API域名
  hideVipTag: boolean;
  isMobileMode: boolean; // 是否启用手机模式
  lyricFontSize: number;
  lyricTranFontSize: number;
  lyricRomaFontSize: number;
  lyricFontBold: boolean;
  showYrc: boolean;
  showYrcAnimation: boolean;
  showTran: boolean;
  showRoma: boolean;
  lyricsPosition: "flex-start" | "center" | "flex-end";
  lyricsScrollPosition: "start" | "center";
  downloadPath: string;
  downloadMeta: boolean;
  downloadCover: boolean;
  downloadLyric: boolean;
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
  proxyProtocol: "http" | "https"; // Used when proxyType is 'manual'
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
  playDevice: "default" | string;
  autoPlay: boolean;
  songVolumeFade: boolean;
  songVolumeFadeTime: number;
  useSongUnlock: boolean;
  countDownShow: boolean;
  barLyricShow: boolean;
  playerType: "cover" | "record";
  playerBackgroundType: "none" | "animation" | "blur" | "color" | "custom";
  customBackgroundImage: string; // 自定义背景图片路径
  memoryLastSeek: boolean;
  showPlaylistCount: boolean;
  showSpectrums: boolean;
  smtcOpen: boolean;
  smtcOutputHighQualityCover: boolean;
  lyricsBlur: boolean;
  lrcMousePause: boolean;
  playSongDemo: boolean;
  showSearchHistory: boolean;
  useAMLyrics: boolean;
  useAMSpring: boolean;
  menuShowCover: boolean;
  preventSleep: boolean;
  localFilesPath: string[];
  localSeparators: string[];
  showLocalCover: boolean;
  routeAnimation: "none" | "fade" | "zoom" | "slide" | "up";
  useRealIP: boolean;
  realIP: string;
  fullPlayerCache: boolean;
  scrobbleSong: boolean;
  dynamicCover: boolean;
  useKeepAlive: boolean;
  excludeKeywords: string[];
  showDefaultLocalPath: boolean;
}

export const useSettingStore = defineStore("setting", {
  state: (): SettingState => ({
    // 个性化
    themeMode: "auto", // 明暗模式
    themeColorType: "default", // 主题类别
    themeCustomColor: "#fe7971", // 主题自定义颜色
    themeFollowCover: false, // 主题跟随歌曲封面
    themeGlobalColor: false, // 全局着色
    globalFont: "default", // 全局字体
    LyricFont: "follow", // 歌词区域字体
    hideVipTag: false, // 隐藏 VIP 标签
    showSearchHistory: true, // 显示搜索历史
    menuShowCover: true, // 菜单显示封面
    routeAnimation: "slide", // 路由动画
    isMobileMode: false, // 是否启用手机模式
    // 系统
    useOnlineService: true, // 是否使用在线服务
    showCloseAppTip: true, // 显示关闭应用提示
    closeAppMethod: "hide", // 关闭方式
    showTaskbarProgress: false, // 显示任务栏进度
    checkUpdateOnStart: true, // 启动时检查更新
    customGlobalBackgroundImage: "", // 全局自定义背景图片路径
    globalBackgroundOpacity: 0.5, // 全局背景图片透明度，默认0.5
    activitiesApiBaseUrl: "/api/activities", // 活动列表API域名，默认本地
    preventSleep: false, // 是否禁止休眠
    fullPlayerCache: false, // 全屏播放器缓存
    useKeepAlive: true, // 使用 keep-alive
    // 播放
    songLevel: "exhigh", // 音质
    playDevice: "default", // 播放设备
    autoPlay: false, // 自动播放
    songVolumeFade: true, // 渐入渐出
    songVolumeFadeTime: 300, // 渐入渐出时间
    useSongUnlock: true, // 是否使用解灰
    useSpecificSourceUnlock: true, // 是否启用特定来源解锁音频功能
    unlockSources: {
      netease: true,
      bilibili: true,
      kuwo: true,
      kugou: true,
      qq: true,
    }, // 音频解锁来源平台配置
    countDownShow: true, // 显示倒计时
    barLyricShow: true, // 显示歌词条
    playerType: "cover", // 播放器类型
    playerBackgroundType: "blur", // 背景类型
    customBackgroundImage: "", // 自定义背景图片路径
    memoryLastSeek: true, // 记忆最后进度
    showPlaylistCount: true, // 显示播放列表数量
    showSpectrums: true, // 是否显示音乐频谱
    smtcOpen: true, // 是否开启 SMTC
    smtcOutputHighQualityCover: false, // 是否输出高清封面
    playSongDemo: false, // 是否播放试听歌曲
    scrobbleSong: false, // 是否打卡
    dynamicCover: true, // 动态封面
    // 歌词
    lyricFontSize: 24, // 歌词大小
    lyricTranFontSize: 14, // 歌词翻译大小
    lyricRomaFontSize: 14, // 歌词音译大小
    lyricFontBold: true, // 歌词字体加粗
    useAMLyrics: false, // 是否使用 AM 歌词
    useAMSpring: false, // 是否使用 AM 歌词弹簧效果
    showYrc: true, // 显示逐字歌词
    showYrcAnimation: true, // 显示逐字歌词动画
    showTran: true, // 显示歌词翻译
    showRoma: true, // 显示歌词音译
    lyricsPosition: "flex-start", // 歌词位置
    lyricsBlur: false, // 歌词模糊
    lyricsScrollPosition: "start", // 歌词滚动位置
    lrcMousePause: false, // 鼠标悬停暂停
    excludeKeywords: keywords, // 排除歌词关键字
    // 本地
    localFilesPath: [],
    showDefaultLocalPath: true, // 显示默认本地路径
    localSeparators: ["/", "&"],
    showLocalCover: true,
    // 下载
    downloadPath: "", // 默认下载路径
    downloadMeta: true, // 同时下载元信息
    downloadCover: true, // 同时下载封面
    downloadLyric: true, // 同时下载歌词
    saveMetaFile: false, // 保留为独立文件
    // 网络
    proxyType: "off", // 代理类型
    proxyProtocol: "http", // 代理协议 (for manual)
    proxyServe: "127.0.0.1", // 代理地址 (for manual)
    proxyPort: 80, // 代理端口 (for manual)
    proxyUsername: "", // Optional proxy username
    proxyPassword: "", // Optional proxy password
    pacUrl: "", // PAC URL
    useRealIP: false, // 是否使用真实 IP
    realIP: "116.25.146.177", // 真实IP地址
    // 全局Cookie设置
    autoLoginCookie: "", // 网易云自动登录Cookie（全局使用）
  }),
  getters: {},
  actions: {
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
