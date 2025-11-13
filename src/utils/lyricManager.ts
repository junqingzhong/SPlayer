import { useStatusStore, useMusicStore } from "@/stores";
import { SongLyric } from "@/types/lyric";

// TODO: 实现歌词统一管理类
// 先区分是在线还是本地
// 然后检查本地歌词覆盖
// 如果本地没有覆盖，进行在线请求
// 然后处理并格式化
// 然后根据配置的歌词排除内容来处理
// 然后写入 store
class LyricManager {
  // Store
  private musicStore = useMusicStore();
  private statusStore = useStatusStore();
  /**
   * 重置当前歌曲的歌词数据
   * 包括清空歌词数据、重置歌词索引、关闭 TTMLL 歌词等
   */
  private resetSongLyric() {
    // 重置歌词数据
    this.musicStore.setSongLyric({}, true);
    this.statusStore.usingTTMLLyric = false;
    // 重置歌词索引
    this.statusStore.lyricIndex = -1;
  }
  /**
   * 处理在线歌词
   * @param id 歌曲 ID
   * @returns 歌词数据
   */
  private async handleOnlineLyric(id: number): Promise<SongLyric> {
    console.log("处理在线歌词", id);
    return {
      lrcData: [],
      yrcData: [],
    };
  }
  /**
   * 处理本地歌词
   * @param id 歌曲 ID
   * @param path 本地歌词路径
   * @returns 歌词数据
   */
  private async handleLocalLyric(id: number, path: string): Promise<SongLyric> {
    console.log("处理本地歌词", id, path);
    return {
      lrcData: [],
      yrcData: [],
    };
  }
  // 处理歌词
  public async handleLyric(id: number, path?: string) {
    try {
      // 歌词加载状态
      this.statusStore.lyricLoading = true;
      // 重置歌词
      this.resetSongLyric();
      // 开始获取歌词
      let lyricData: Partial<SongLyric> = {};
      if (path) {
        lyricData = await this.handleLocalLyric(id, path);
      } else {
        lyricData = await this.handleOnlineLyric(id);
      }
      console.log("歌词数据", lyricData);
    } catch (error) {
    } finally {
      // 歌词加载状态
      this.statusStore.lyricLoading = false;
    }
  }
}

export default new LyricManager();
