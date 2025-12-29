import { heartRateList } from "@/api/playlist";
import { useDataStore, useMusicStore, useStatusStore } from "@/stores";
import { type SongType } from "@/types/main";
import { RepeatModeType, ShuffleModeType } from "@/types/shared";
import { RepeatMode } from "@/types/smtc";
import { isLogin } from "@/utils/auth";
import { isElectron, isWin } from "@/utils/env";
import { formatSongsList } from "@/utils/format";
import { shuffleArray } from "@/utils/helper";
import { openUserLogin } from "@/utils/modal";
import * as playerIpc from "./PlayerIpc";

/**
 * 播放模式管理器
 *
 * 负责循环模式、随机模式的切换逻辑及状态同步
 */
export class PlayModeManager {
  /**
   * 切换循环模式
   * @param mode 可选，直接设置目标模式。如果不传，则按 List -> One -> Off 顺序轮转
   */
  public toggleRepeat(mode?: RepeatModeType) {
    const statusStore = useStatusStore();

    if (mode) {
      if (statusStore.repeatMode === mode) return;
      statusStore.repeatMode = mode;
    } else {
      statusStore.toggleRepeat();
    }

    this.syncSmtcPlayMode();

    // const modeText: Record<RepeatModeType, string> = {
    //   list: "列表循环",
    //   one: "单曲循环",
    //   off: "不循环",
    // };
    // window.$message.success(`已切换至：${modeText[statusStore.repeatMode]}`);
  }

  /**
   * 切换随机模式
   * @param mode 可选，直接设置目标模式。如果不传则按 Off -> On -> Heartbeat -> Off 顺序轮转
   * @param playAction 回调函数，用于在心动模式下触发播放。通常你应该传入 PlayerController.play，或者其他类似的方法
   */
  public async toggleShuffle(mode?: ShuffleModeType, playAction?: () => Promise<void>) {
    const dataStore = useDataStore();
    const statusStore = useStatusStore();
    const musicStore = useMusicStore();

    const currentMode = statusStore.shuffleMode;
    let nextMode: ShuffleModeType;

    if (mode) {
      nextMode = mode;
    } else {
      if (currentMode === "off") nextMode = "on";
      else if (currentMode === "on") nextMode = "heartbeat";
      else nextMode = "off";
    }

    if (nextMode === currentMode) return;

    const previousMode = statusStore.shuffleMode;
    statusStore.shuffleMode = nextMode;
    this.syncSmtcPlayMode();

    // 将耗时的数据处理扔到 UI 图标更新后再进行，避免打乱庞大列表导致点击延迟
    setTimeout(async () => {
      try {
        if (nextMode === "on") {
          const currentList = [...dataStore.playList];
          // 备份原始列表
          await dataStore.setOriginalPlayList(currentList);
          // 打乱列表
          const shuffled = shuffleArray(currentList);
          await dataStore.setPlayList(shuffled);
          // 修正当前播放索引
          const idx = shuffled.findIndex((s) => s.id === musicStore.playSong?.id);
          if (idx !== -1) statusStore.playIndex = idx;
        } else if (nextMode === "heartbeat") {
          if (isLogin() !== 1) {
            // 未登录，回滚状态
            statusStore.shuffleMode = previousMode;
            if (isLogin() === 0) {
              openUserLogin(true);
            } else {
              window.$message.warning("该登录模式暂不支持该操作");
            }
            return;
          }

          if (previousMode === "heartbeat") {
            if (playAction) await playAction();
            statusStore.showFullPlayer = true;
            return;
          }

          window.$message.loading("心动模式开启中...");

          try {
            const pid =
              musicStore.playPlaylistId || (await dataStore.getUserLikePlaylist())?.detail?.id || 0;
            const currentSongId = musicStore.playSong?.id || 0;

            if (!currentSongId) throw new Error("无播放歌曲");

            const res = await heartRateList(currentSongId, pid);
            if (res.code !== 200) throw new Error("获取推荐失败");

            const recList = formatSongsList(res.data);

            // 混合列表
            const currentList = [...dataStore.playList];
            const mixedList = interleaveLists(currentList, recList);

            await dataStore.setPlayList(mixedList);

            const idx = mixedList.findIndex((s) => s.id === currentSongId);
            if (idx !== -1) statusStore.playIndex = idx;

            window.$message.success("心动模式已开启");
          } catch (e) {
            console.error(e);
            window.$message.error("心动模式开启失败");
            // 失败回滚
            statusStore.shuffleMode = previousMode;
          }
        } else {
          // 恢复原始列表
          const original = await dataStore.getOriginalPlayList();

          if (original && original.length > 0) {
            await dataStore.setPlayList(original);
            const idx = original.findIndex((s) => s.id === musicStore.playSong?.id);
            statusStore.playIndex = idx !== -1 ? idx : 0;
            await dataStore.clearOriginalPlayList();
          } else {
            const cleaned = cleanRecommendations(dataStore.playList);
            await dataStore.setPlayList(cleaned);
          }
        }
      } catch (e) {
        console.error("切换模式时发生错误:", e);
        // 失败回滚
        statusStore.shuffleMode = previousMode;
        window.$message.error("模式切换出错");
      }
    }, 10);
  }

  /**
   * 同步当前的播放模式到 SMTC
   */
  public syncSmtcPlayMode() {
    const statusStore = useStatusStore();

    if (isElectron && isWin) {
      const smtcShuffle = statusStore.shuffleMode !== "off";

      let smtcRepeat = RepeatMode.None;
      if (statusStore.repeatMode === "list") smtcRepeat = RepeatMode.List;
      if (statusStore.repeatMode === "one") smtcRepeat = RepeatMode.Track;

      playerIpc.sendSmtcPlayMode(smtcShuffle, smtcRepeat);
    }
  }

  /**
   * 专门处理 SMTC 的随机按钮事件
   * @param playAction 播放回调
   */
  public handleSmtcShuffle(playAction?: () => Promise<void>) {
    const statusStore = useStatusStore();
    const nextMode = statusStore.shuffleMode === "off" ? "on" : "off";
    this.toggleShuffle(nextMode, playAction);
  }

  /**
   * 专门处理 SMTC 的循环按钮事件
   */
  public handleSmtcRepeat() {
    this.toggleRepeat();
  }

  /**
   * 同步播放模式给托盘
   */
  public playModeSyncIpc() {
    const statusStore = useStatusStore();
    if (isElectron) {
      playerIpc.sendPlayMode(statusStore.repeatMode, statusStore.shuffleMode);
    }
  }
}

/**
 * 混合列表算法 (用于心动模式)
 *
 * 保持 sourceList 顺序不变，每隔 interval 首插入一个 recommendation
 * @param sourceList 原始用户列表
 * @param recommendationList 推荐歌曲列表
 * @param interval 插入间隔 (例如 2 表示：用户, 用户, 推荐, 用户, 用户, 推荐...)
 */
export const interleaveLists = (
  sourceList: SongType[],
  recommendationList: SongType[],
  interval: number = 2,
): SongType[] => {
  const result: SongType[] = [];
  let recIndex = 0;

  // 标记推荐歌曲
  const taggedRecs = recommendationList.map((song) => ({
    ...song,
    isRecommendation: true,
  }));

  sourceList.forEach((song, index) => {
    result.push(song);
    // 每隔 interval 首，且还有推荐歌时，插入一首
    if ((index + 1) % interval === 0 && recIndex < taggedRecs.length) {
      result.push(taggedRecs[recIndex]);
      recIndex++;
    }
  });

  return result;
};

/**
 * 清理推荐歌曲，
 * 用于退出心动模式时，恢复纯净列表
 */
export const cleanRecommendations = (list: SongType[]): SongType[] => {
  return list.filter((s) => !s.isRecommendation);
};
