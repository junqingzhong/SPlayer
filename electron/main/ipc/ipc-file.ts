import { BrowserWindow, ipcMain, WebContents } from "electron";
import { LocalMusicService } from "../services/LocalMusicService";
import { MusicFileService } from "../services/MusicFileService";
import { DownloadService } from "../services/DownloadService";
import { FileService } from "../services/FileService";

/**
 * 文件相关 IPC
 */
const initFileIpc = (): void => {
  const localMusicService = new LocalMusicService();
  const musicFileService = new MusicFileService();
  const downloadService = new DownloadService();
  const fileService = new FileService();

  // Map to track which WebContents requested which download
  const downloadMap = new Map<number, WebContents>();

  // Listen for progress events from DownloadService
  downloadService.on("progress", (data) => {
    const sender = downloadMap.get(data.id);
    if (sender && !sender.isDestroyed()) {
      sender.send("download-progress", data);
    }
  });

  // 检查文件是否存在
  ipcMain.handle("file-exists", async (_, path: string) => {
    return fileService.fileExists(path);
  });

  // 保存文件
  ipcMain.handle(
    "save-file",
    async (_, args: { path: string; content: string; encoding?: BufferEncoding }) => {
      const success = await fileService.saveFile(args.path, args.content, args.encoding);
      return { success };
    },
  );

  // 默认文件夹
  ipcMain.handle(
    "get-default-dir",
    (_event, type: "documents" | "downloads" | "pictures" | "music" | "videos"): string => {
      return fileService.getDefaultDir(type);
    },
  );

  // 本地音乐同步（批量流式传输）
  ipcMain.handle("local-music-sync", async (event, dirs: string[]) => {
    try {
      const result = await localMusicService.syncLibrary(
        dirs,
        (current, total) => {
          event.sender.send("music-sync-progress", { current, total });
        },
        (chunk) => {
          event.sender.send("music-sync-tracks-batch", chunk);
        },
      );

      event.sender.send("music-sync-complete", {
        success: true,
      });

      return result;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "Unknown error";
      // 错误信号
      event.sender.send("music-sync-complete", { success: false, message: errorMessage });
      return { success: false, message: errorMessage };
    }
  });

  // 遍历音乐文件
  ipcMain.handle("get-music-files", async (_, dirPath: string) => {
    return musicFileService.getMusicFiles(dirPath);
  });

  // 获取音乐元信息
  ipcMain.handle("get-music-metadata", async (_, path: string) => {
    return musicFileService.getMusicMetadata(path);
  });

  // 修改音乐元信息
  ipcMain.handle("set-music-metadata", async (_, path: string, metadata: any) => {
    return musicFileService.setMusicMetadata(path, metadata);
  });

  // 获取音乐歌词
  ipcMain.handle("get-music-lyric", async (_, musicPath: string) => {
    return musicFileService.getMusicLyric(musicPath);
  });

  // 获取音乐封面
  ipcMain.handle("get-music-cover", async (_, path: string) => {
    return musicFileService.getMusicCover(path);
  });

  // 读取本地歌词
  ipcMain.handle("read-local-lyric", async (_, lyricDirs: string[], id: number) => {
    return musicFileService.readLocalLyric(lyricDirs, id);
  });

  // 删除文件
  ipcMain.handle("delete-file", async (_, path: string) => {
    return fileService.deleteFile(path);
  });

  // 打开文件夹
  ipcMain.on("open-folder", async (_, path: string) => {
    await fileService.openFolder(path);
  });

  // 图片选择窗口
  ipcMain.handle("choose-image", async () => {
    return fileService.chooseImage();
  });

  // 路径选择窗口
  ipcMain.handle("choose-path", async (_, title: string, multiSelect: boolean = false) => {
    return fileService.choosePath(title, multiSelect);
  });

  // 下载文件
  ipcMain.handle("download-file", async (event, url: string, options: any) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (!win) return { status: "error", message: "Window not found" };

    // Set default options if not provided
    const downloadOptions = {
      fileName: "未知文件名",
      fileType: "mp3",
      path: fileService.getDefaultDir("downloads"),
      ...options,
    };

    const downloadId = downloadOptions.songData?.id;
    if (downloadId) {
      downloadMap.set(downloadId, event.sender);
    }

    try {
      return await downloadService.downloadFile(url, downloadOptions);
    } finally {
      if (downloadId) {
        downloadMap.delete(downloadId);
      }
    }
  });

  // 取消下载
  ipcMain.handle("cancel-download", async (_, songId: number) => {
    return downloadService.cancelDownload(songId);
  });

  // 检查是否是相同的路径
  ipcMain.handle("check-if-same-path", (_, localFilesPath: string[], selectedDir: string) => {
    return fileService.checkIfSamePath(localFilesPath, selectedDir);
  });

  // 检查是否是子文件夹
  ipcMain.handle("check-if-subfolder", (_, localFilesPath: string[], selectedDir: string) => {
    return fileService.checkIfSubfolder(localFilesPath, selectedDir);
  });

  // 保存文件内容
  ipcMain.handle("save-file-content", async (_, options: any) => {
    return fileService.saveFileContent(options);
  });
};



export default initFileIpc;
