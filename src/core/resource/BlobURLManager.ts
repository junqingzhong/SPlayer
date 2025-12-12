class BlobURLManager {
  /** Blob URL 存储 */
  private blobURLs: Map<string, string>;

  constructor() {
    this.blobURLs = new Map();
  }

  /**
   * 从给定的 Buffer 数据生成 Blob URL
   * @param data - 要转换为 Blob 的二进制数据
   * @param format - 数据的 MIME 类型（'image/jpeg'）
   * @param key - 用于标识 Blob URL 的唯一键（文件路径）
   * @returns Blob URL
   */
  createBlobURL(data: Buffer, format: string, key: string): string {
    try {
      if (this.blobURLs.has(key)) {
        // console.log("🌱 Blob URL already exists:", key);
        return this.blobURLs.get(key)!;
      }
      const blob = new Blob([new Uint8Array(data)], { type: format });
      const blobURL = URL.createObjectURL(blob);
      // 存储 Blob URL
      this.blobURLs.set(key, blobURL);
      return blobURL;
    } catch (error) {
      console.error("❌ Error creating Blob URL:", error);
      throw error;
    }
  }

  /**
   * 清理 Blob URL
   * @param key - 要清理的 Blob URL 对应的键
   */
  revokeBlobURL(key: string): void {
    try {
      const blobURL = this.blobURLs.get(key);
      if (blobURL) {
        URL.revokeObjectURL(blobURL);
        this.blobURLs.delete(key);
      }
    } catch (error) {
      console.error("❌ Error revoking Blob URL:", error);
    }
  }

  /**
   * 清理所有 Blob URL
   */
  revokeAllBlobURLs(): void {
    try {
      this.blobURLs.forEach((blobURL) => {
        URL.revokeObjectURL(blobURL);
      });
      // 清空存储
      this.blobURLs.clear();
    } catch (error) {
      console.error("❌ Error revoking all Blob URLs:", error);
    }
  }
}

let instance: BlobURLManager | null = null;

/**
 * 获取 BlobURLManager 实例
 * @returns BlobURLManager
 */
export const useBlobURLManager = (): BlobURLManager => {
  if (!instance) instance = new BlobURLManager();
  return instance;
};
