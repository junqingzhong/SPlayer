import type { PlayModeType } from "@/types/main";

interface InternalPlayMode {
  isShuffling: boolean;
  repeatMode: "List" | "Track";
}

/**
 * 负责处理 SMTC 双按钮和 SPlayer 单按钮的映射
 *
 * 映射比较反直觉，因为 SPlayer 连关闭循环模式都没有
 */
export class PlayModeController {
  /**
   * 记录进入随机模式之前的状态，用于恢复
   */
  private lastModeBeforeShuffle: InternalPlayMode | null = null;

  /**
   * 处理 SMTC "随机" 按钮点击
   * @param currentModeStr 当前 SPlayer 播放模式字符串
   */
  public getNextShuffleMode(currentModeStr: PlayModeType): PlayModeType {
    const currentMode = this.toInternal(currentModeStr);
    const { targetMode, nextLastModeBeforeShuffle } = this.calculateNextShuffleMode(currentMode);

    this.lastModeBeforeShuffle = nextLastModeBeforeShuffle;
    return this.toType(targetMode);
  }

  /**
   * 处理 SMTC "循环" 按钮点击
   * @param currentModeStr 当前 SPlayer 播放模式字符串
   */
  public getNextRepeatMode(currentModeStr: PlayModeType): PlayModeType {
    const currentMode = this.toInternal(currentModeStr);
    const targetMode = this.calculateNextRepeatMode(currentMode);

    if (currentMode.isShuffling && !targetMode.isShuffling) {
      this.lastModeBeforeShuffle = null;
    }

    return this.toType(targetMode);
  }

  private calculateNextShuffleMode(currentMode: InternalPlayMode): {
    targetMode: InternalPlayMode;
    nextLastModeBeforeShuffle: InternalPlayMode | null;
  } {
    const isShuffleOn = currentMode.isShuffling;

    const targetMode: InternalPlayMode = isShuffleOn
      ? (this.lastModeBeforeShuffle ?? { isShuffling: false, repeatMode: "List" })
      : { isShuffling: true, repeatMode: "List" };

    const nextLastModeBeforeShuffle = isShuffleOn ? null : currentMode;

    return { targetMode, nextLastModeBeforeShuffle };
  }

  private calculateNextRepeatMode(currentMode: InternalPlayMode): InternalPlayMode {
    if (currentMode.isShuffling) {
      return { isShuffling: false, repeatMode: "List" };
    }

    switch (currentMode.repeatMode) {
      case "List":
        return { isShuffling: false, repeatMode: "Track" };
      case "Track":
        return { isShuffling: false, repeatMode: "List" };
      default:
        return { isShuffling: false, repeatMode: "List" };
    }
  }

  private toInternal(mode: PlayModeType): InternalPlayMode {
    switch (mode) {
      case "shuffle":
        return { isShuffling: true, repeatMode: "List" };
      case "repeat-once":
        return { isShuffling: false, repeatMode: "Track" };
      case "repeat":
      default:
        return { isShuffling: false, repeatMode: "List" };
    }
  }

  private toType(mode: InternalPlayMode): PlayModeType {
    if (mode.isShuffling) return "shuffle";
    if (mode.repeatMode === "Track") return "repeat-once";
    return "repeat";
  }
}
