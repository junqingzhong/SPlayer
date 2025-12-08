import type { SongLevelType } from "@/types/main";
import type { ImageRenderToolbarProps } from "naive-ui";
import { compact, findKey, keys, pick, takeWhile, reduce } from "lodash-es";

// 音质数据
export const songLevelData = {
  l: {
    level: "standard",
    name: "标准音质",
  },
  m: {
    level: "higher",
    name: "较高音质",
  },
  h: {
    level: "exhigh",
    name: "极高音质",
  },
  sq: {
    level: "lossless",
    name: "无损音质",
  },
  hr: {
    level: "hires",
    name: "Hi-Res",
  },
  je: {
    level: "jyeffect",
    name: "高清环绕声",
  },
  sk: {
    level: "sky",
    name: "沉浸环绕声",
  },
  db: {
    level: "dolby",
    name: "杜比全景声",
  },
  jm: {
    level: "jymaster",
    name: "超清母带",
  },
};

/**
 * 根据传入的 level，筛选出包含该 level 及之前的音质数据
 * @param level 音质等级名称
 * @returns 包含指定 level 及之前音质数据的部分 songLevelData
 */
export function getLevelsUpTo(level: string): Partial<typeof songLevelData> {
  // 从数组中取出符合条件的所有元素
  const resultKeys = takeWhile(
    keys(songLevelData),
    (key) => songLevelData[key as SongLevelType].level !== level,
  );
  // 包含传入的 level
  const levelKey = findKey(songLevelData, { level });
  if (levelKey) resultKeys.push(levelKey);
  // 过滤空值
  return pick(songLevelData, compact(resultKeys));
}

/**
 * 获取音质列表
 * @param level 音质等级数据
 * @param quality 歌曲音质详情
 * @returns 格式化后的音质列表
 */
export const getSongLevelsData = (
  level: Partial<typeof songLevelData>,
  quality?: Record<string, any>,
): {
  name: string;
  level: string;
  value: SongLevelType;
  br?: number;
  size?: number;
}[] => {
  if (!level) return [];
  return reduce(
    level,
    (
      result: {
        name: string;
        level: string;
        value: SongLevelType;
        br?: number;
        size?: number;
      }[],
      value,
      key,
    ) => {
      // 如果没有 quality 数据，则默认显示所有 level
      // 如果有 quality 数据，则只显示 quality 中存在的 level
      if (value && (!quality || quality[key])) {
        result.push({
          name: value.name,
          level: value.level,
          value: key as SongLevelType,
          br: quality?.[key]?.br,
          size: quality?.[key]?.size,
        });
      }
      return result;
    },
    [],
  );
};

// 排序选项
export const sortOptions = {
  default: { name: "默认排序", show: "all", icon: "Sort" },
  titleAZ: { name: "标题升序（ A - Z ）", show: "all", icon: "SortAZ" },
  titleZA: { name: "标题降序（ Z - A ）", show: "all", icon: "SortZA" },
  arAZ: { name: "歌手升序（ A - Z ）", show: "song", icon: "SortAZ" },
  arZA: { name: "歌手降序（ Z - A ）", show: "song", icon: "SortZA" },
  timeUp: { name: "时长升序", show: "all", icon: "SortClockUp" },
  timeDown: { name: "时长降序", show: "all", icon: "SortClockDown" },
  dateUp: { name: "日期升序", show: "radio", icon: "SortDateUp" },
  dateDown: { name: "日期降序", show: "radio", icon: "SortDateDown" },
} as const;

// 自定义图片工具栏
export const renderToolbar = ({ nodes }: ImageRenderToolbarProps) => {
  return [
    nodes.prev,
    nodes.next,
    nodes.rotateCounterclockwise,
    nodes.rotateClockwise,
    nodes.resizeToOriginalSize,
    nodes.zoomOut,
    nodes.zoomIn,
    nodes.close,
  ];
};

// 默认 AMLL TTML DB Server
export const defaultAMLLDbServer = "https://raw.githubusercontent.com/Steve-xmh/amll-ttml-db/refs/heads/main/ncm-lyrics/%s.ttml";
