import { storeLog } from "../logger";
import type { LyricConfig } from "../../../src/types/desktop-lyric";
import Store from "electron-store";

storeLog.info("🌱 Store init");

export interface StoreType {
  window: {
    width: number;
    height: number;
    x?: number;
    y?: number;
    maximized?: boolean;
  };
  lyric: {
    fontSize: number;
    mainColor: string;
    shadowColor: string;
    // 窗口位置
    x?: number;
    y?: number;
    width?: number;
    height?: number;
    // 配置
    config?: LyricConfig;
  };
  proxy: string;
}

/**
 * 使用 Store
 * @returns Store<StoreType>
 */
export const useStore = () => {
  return new Store<StoreType>({
    defaults: {
      window: {
        width: 1280,
        height: 800,
      },
      lyric: {
        fontSize: 30,
        mainColor: "#fff",
        shadowColor: "rgba(0, 0, 0, 0.5)",
        x: 0,
        y: 0,
        width: 800,
        height: 180,
        config: {
          isLock: false,
          playedColor: "#fe7971",
          unplayedColor: "#ccc",
          stroke: "#000",
          strokeWidth: 2,
          fontFamily: "system-ui",
          fontSize: 24,
          isDoubleLine: true,
          position: "both",
          limitBounds: false,
        },
      },
      proxy: "",
    },
  });
};
