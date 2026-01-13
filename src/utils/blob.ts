/**
 * Blob URL 管理器
 * 提供Blob URL的创建和销毁功能
 */

class BlobManager {
  private blobUrls: Map<string, string> = new Map();
  
  /**
   * 创建Blob URL
   * @param data 数据
   * @param format 格式
   * @param path 路径
   * @returns Blob URL
   */
  createBlobURL(data: ArrayBuffer | Blob, format: string, path: string): string | null {
    try {
      let blob: Blob;
      
      if (data instanceof ArrayBuffer) {
        blob = new Blob([data], { type: format });
      } else {
        blob = data;
      }
      
      const blobUrl = URL.createObjectURL(blob);
      this.blobUrls.set(path, blobUrl);
      
      console.log('Created blob URL:', path, blobUrl);
      return blobUrl;
    } catch (error) {
      console.error('Failed to create blob URL:', error);
      return null;
    }
  }
  
  /**
   * 销毁Blob URL
   * @param path 路径
   */
  revokeBlobURL(path: string): void {
    const blobUrl = this.blobUrls.get(path);
    if (blobUrl) {
      URL.revokeObjectURL(blobUrl);
      this.blobUrls.delete(path);
      console.log('Revoked blob URL:', path, blobUrl);
    }
  }
  
  /**
   * 销毁所有Blob URL
   */
  revokeAllBlobURLs(): void {
    for (const [path, blobUrl] of this.blobUrls) {
      URL.revokeObjectURL(blobUrl);
      console.log('Revoked blob URL:', path, blobUrl);
    }
    this.blobUrls.clear();
  }
  
  /**
   * 获取Blob URL
   * @param path 路径
   * @returns Blob URL
   */
  getBlobURL(path: string): string | undefined {
    return this.blobUrls.get(path);
  }
  
  /**
   * 检查是否有Blob URL
   * @param path 路径
   * @returns 是否有Blob URL
   */
  hasBlobURL(path: string): boolean {
    return this.blobUrls.has(path);
  }
}

// 创建单例实例
const blob = new BlobManager();

export default blob;