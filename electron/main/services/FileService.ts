import { app, dialog, shell } from "electron";
import { access, mkdir, unlink, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";
import { ipcLog } from "../logger";

export class FileService {
  async fileExists(path: string): Promise<boolean> {
    try {
      await access(path);
      return true;
    } catch {
      return false;
    }
  }

  async saveFile(path: string, content: string, encoding?: BufferEncoding): Promise<boolean> {
    try {
      const dir = dirname(path);
      await mkdir(dir, { recursive: true });
      await writeFile(path, content, { encoding: encoding || "utf-8" });
      return true;
    } catch (err) {
      ipcLog.error("Failed to save file:", err);
      throw err;
    }
  }

  getDefaultDir(type: "documents" | "downloads" | "pictures" | "music" | "videos"): string {
    return app.getPath(type);
  }

  async deleteFile(path: string): Promise<boolean> {
    try {
      const resolvedPath = resolve(path);
      try {
        await access(resolvedPath);
      } catch {
        throw new Error("❌ File not found");
      }
      await unlink(resolvedPath);
      return true;
    } catch (error) {
      ipcLog.error("❌ File delete error", error);
      return false;
    }
  }

  async openFolder(path: string): Promise<void> {
    try {
      const resolvedPath = resolve(path);
      try {
        await access(resolvedPath);
      } catch {
        throw new Error("❌ Folder not found");
      }
      shell.showItemInFolder(resolvedPath);
    } catch (error) {
      ipcLog.error("❌ Folder open error", error);
      throw error;
    }
  }

  async chooseImage(): Promise<string | null> {
    try {
      const { filePaths } = await dialog.showOpenDialog({
        properties: ["openFile"],
        filters: [{ name: "Images", extensions: ["jpg", "jpeg", "png"] }],
      });
      if (!filePaths || filePaths.length === 0) return null;
      return filePaths[0];
    } catch (error) {
      ipcLog.error("❌ Image choose error", error);
      return null;
    }
  }

  async choosePath(title: string, multiSelect: boolean = false): Promise<string | string[] | null> {
    try {
      const properties: ("openDirectory" | "createDirectory" | "multiSelections")[] = [
        "openDirectory",
        "createDirectory",
      ];
      if (multiSelect) {
        properties.push("multiSelections");
      }
      const { filePaths } = await dialog.showOpenDialog({
        title: title ?? "选择文件夹",
        defaultPath: app.getPath("downloads"),
        properties,
        buttonLabel: "选择文件夹",
      });
      if (!filePaths || filePaths.length === 0) return null;
      return multiSelect ? filePaths : filePaths[0];
    } catch (error) {
      ipcLog.error("❌ Path choose error", error);
      return null;
    }
  }

  checkIfSamePath(localFilesPath: string[], selectedDir: string): boolean {
    const resolvedSelectedDir = resolve(selectedDir);
    const allPaths = localFilesPath.map((p) => resolve(p));
    return allPaths.some((existingPath) => existingPath === resolvedSelectedDir);
  }

  checkIfSubfolder(localFilesPath: string[], selectedDir: string): boolean {
    const resolvedSelectedDir = resolve(selectedDir);
    const allPaths = localFilesPath.map((p) => resolve(p));
    return allPaths.some((existingPath) => {
      const relativePath = relative(existingPath, resolvedSelectedDir);
      return relativePath && !relativePath.startsWith("..") && !isAbsolute(relativePath);
    });
  }

  async saveFileContent(options: {
    path: string;
    fileName: string;
    content: string;
    encoding?: string;
  }): Promise<{ success: boolean; message?: string }> {
    try {
      const { path, fileName, content, encoding = "utf-8" } = options;
      const dirPath = resolve(path);
      try {
        await access(dirPath);
      } catch {
        await mkdir(dirPath, { recursive: true });
      }
      const filePath = join(dirPath, fileName);

      if (encoding !== "utf-8") {
        try {
          const { encode } = await import("iconv-lite");
          const buffer = encode(content, encoding);
          await writeFile(filePath, buffer);
        } catch (e) {
          ipcLog.error(`❌ ${encoding} encoding failed:`, e);
          await writeFile(filePath, content, "utf-8");
        }
      } else {
        await writeFile(filePath, content, "utf-8");
      }

      return { success: true };
    } catch (error) {
      ipcLog.error("❌ Error saving file content:", error);
      return {
        success: false,
        message: error instanceof Error ? error.message : "Unknown error",
      };
    }
  }
}
