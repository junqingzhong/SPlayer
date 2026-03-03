import type { LyricLine } from "@applemusic-like-lyrics/lyric";

export type Milliseconds = number;

export interface TaskbarConfig {
  /** 模式 */
  mode: "taskbar" | "floating";
  /** 最大宽度 */
  maxWidth: number;
  /** 位置 */
  position: "automatic" | "left" | "right";
  /** 自动收缩 */
  autoShrink: boolean;
  /** 边距 */
  margin: number;
  /** 最小宽度 */
  minWidth: number;
  /** 悬浮对齐 */
  floatingAlign: "left" | "right";
  /** 悬浮自动宽度 */
  floatingAutoWidth: boolean;
  /** 悬浮宽度 */
  floatingWidth: number;
  /** 悬浮高度 */
  floatingHeight: number;
  /** 悬浮置顶 */
  floatingAlwaysOnTop: boolean;
  /** 是否启用 */
  enabled: boolean;
  /** 暂停时显示 */
  showWhenPaused: boolean;
  /** 显示封面 */
  showCover: boolean;
  /** 主题模式 */
  themeMode: "light" | "dark" | "auto";
  /** 字体 */
  fontFamily: string;
  /** 字重 */
  fontWeight: number;
  /** 动画模式 */
  animationMode: "slide-blur" | "left-sm";
  /** 单行模式 */
  singleLineMode: boolean;
  /** 显示逐字歌词 */
  showWordLyrics: boolean;
  /** 显示翻译 */
  showTranslation: boolean;
  /** 任务栏模式行间距 */
  taskbarLineHeight: number;
  /** 独立窗口行间距 */
  floatingLineHeight: number;
  /** 任务栏模式字体大小 */
  taskbarFontSize: number;
  /** 独立窗口字体大小 */
  floatingFontSize: number;
  /** 任务栏模式主歌词缩放比例 */
  taskbarMainScale: number;
  /** 独立窗口主歌词缩放比例 */
  floatingMainScale: number;
  /** 任务栏模式副歌词缩放比例 */
  taskbarSubScale: number;
  /** 独立窗口副歌词缩放比例 */
  floatingSubScale: number;
}

export interface TrackData {
  title: string;
  artist: string;
  cover: string;
}

export interface PlaybackState {
  isPlaying: boolean;
}

export interface LyricData {
  lines: LyricLine[];
  type: "line" | "word";
}

export interface ThemeColorData {
  light: string;
  dark: string;
}

/**
 * 格式: [currentTime, duration, offset]
 */
export type SyncTickPayload = [Milliseconds, Milliseconds, Milliseconds];

export type SyncStatePayload =
  | {
      type: "full-hydration";
      data: {
        track: TrackData;
        playback: PlaybackState & { tick: SyncTickPayload };
        lyrics: LyricData;
        config: TaskbarConfig;
        lyricLoading: boolean;
        themeColor: ThemeColorData | null;
      };
    }
  | {
      type: "track-change";
      data: TrackData;
    }
  | {
      type: "playback-state";
      data: PlaybackState;
    }
  | {
      type: "lyrics-loaded";
      data: LyricData;
    }
  | {
      type: "config-update";
      data: Partial<TaskbarConfig>;
    }
  | {
      type: "theme-color";
      data: ThemeColorData | null;
    }
  | {
      type: "system-theme";
      data: { isDark: boolean };
    };

/** 默认任务栏歌词配置 */
export const DEFAULT_TASKBAR_CONFIG: TaskbarConfig = {
  mode: "taskbar",
  maxWidth: 30,
  position: "automatic",
  autoShrink: false,
  margin: 10,
  minWidth: 10,
  floatingAlign: "right",
  floatingAutoWidth: true,
  floatingWidth: 300,
  floatingHeight: 48,
  floatingAlwaysOnTop: false,
  enabled: false,
  showWhenPaused: true,
  showCover: true,
  themeMode: "auto",
  fontFamily: "system-ui",
  fontWeight: 400,
  animationMode: "slide-blur",
  singleLineMode: false,
  showWordLyrics: true,
  showTranslation: true,
  taskbarLineHeight: 1.1,
  floatingLineHeight: 1.1,
  taskbarFontSize: 14,
  floatingFontSize: 14,
  taskbarMainScale: 1.0,
  floatingMainScale: 1.0,
  taskbarSubScale: 0.8,
  floatingSubScale: 0.8,
};

export const TASKBAR_IPC_CHANNELS = {
  /**
   * 渲染进程 -> 主进程 (设置，增量)
   */
  UPDATE_CONFIG: "taskbar:update-config",
  /**
   * 主进程 handle，获取完整配置
   */
  GET_OPTION: "taskbar:get-option",
  /**
   * 渲染进程 -> 主进程，设置配置（同桌面歌词，支持增量合并）
   */
  SET_OPTION: "taskbar:set-option",
  /**
   * 主进程 -> 渲染进程 (状态)
   */
  SYNC_STATE: "taskbar:sync-state",
  /**
   * 主进程 -> 渲染进程 (进度)
   */
  SYNC_TICK: "taskbar:sync-tick",
  /**
   * 渲染进程 -> 主进程 (初始化握手)
   */
  REQUEST_DATA: "taskbar:request-data",
} as const;
