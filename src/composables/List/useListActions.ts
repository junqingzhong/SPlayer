import type { SongType } from "@/types/main";
import { usePlayerController } from "@/core/player/PlayerController";

/**
 * 列表操作逻辑
 */
export const useListActions = () => {
  const player = usePlayerController();

  /**
   * 播放全部歌曲
   */
  const playAllSongs = (songs: SongType[], playListId?: number) => {
    if (!songs?.length) return;
    player.updatePlayList(songs, undefined, playListId);
  };

  return {
    playAllSongs,
  };
};
