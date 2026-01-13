/**
 * 歌词管理器
 * 提供歌词加载和处理功能
 */

export interface LyricData {
  id: number;
  path?: string;
  content?: string;
  time?: number;
}

class LyricManager {
  private currentLyric: LyricData | null = null;
  
  /**
   * 处理歌词
   * @param id 歌曲ID
   * @param path 歌词路径
   */
  async handleLyric(id: number, path?: string): Promise<void> {
    console.log('Handling lyric:', id, path);
    
    this.currentLyric = {
      id,
      path,
      content: '',
      time: 0
    };
    
    // 这里可以添加实际的歌词加载逻辑
    if (path) {
      try {
        // 模拟歌词加载
        this.currentLyric.content = `[00:00.00]歌词加载中...
[00:01.00]歌曲ID: ${id}`;
      } catch (error) {
        console.error('Failed to load lyric:', error);
      }
    }
  }
  
  /**
   * 获取当前歌词
   */
  getCurrentLyric(): LyricData | null {
    return this.currentLyric;
  }
  
  /**
   * 清除当前歌词
   */
  clear(): void {
    this.currentLyric = null;
  }
}

// 创建单例实例
const lyricManager = new LyricManager();

export default lyricManager;