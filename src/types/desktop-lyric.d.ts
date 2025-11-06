import { LyricType } from "@/types/main";

/** 桌面歌词数据 */
export interface LyricData {
  /** 播放歌曲名称 */
  playName?: string;
  /** 播放状态 */
  playStatus?: boolean;
  /** 播放进度 */
  progress?: number;
  /** 歌词数据 */
  lrcData?: LyricType[];
  yrcData?: LyricType[];
  /** 歌词播放索引 */
  lyricIndex?: number;
}

/** 桌面歌词配置 */
export interface LyricConfig {
  /** 是否锁定歌词 */
  isLock: boolean;
  /** 已播放颜色 */
  playedColor: string;
  /** 未播放颜色 */
  unplayedColor: string;
  /** 阴影颜色 */
  shadowColor: string;
  /** 字体 */
  fontFamily: string;
  /** 字体大小 */
  fontSize: number;
  /** 字体是否加粗 */
  fontIsBold: boolean;
  /** 是否双行 */
  isDoubleLine: boolean;
  /** 文本排版位置 */
  position: "left" | "center" | "right" | "both";
  /** 是否限制在屏幕边界内拖动 */
  limitBounds: boolean;
}

/**
 * 渲染的歌词行
 */
interface RenderLine {
  /** 歌词文本 */
  text: string;
  /** 唯一键 */
  key: string;
  /** 是否高亮 */
  active: boolean;
}
