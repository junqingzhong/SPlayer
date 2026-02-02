// 渲染进程日志 IPC 处理
import { dialog, ipcMain, shell, type IpcMainEvent } from "electron";
import log from "electron-log";
import { appendFile, copyFile } from "fs/promises";
import { basename } from "path";
import { rendererLog } from "../logger";
import mainWindow from "../windows/main-window";

type LogLevel = "info" | "warn" | "error" | "debug";

/**
 * 初始化渲染进程日志 IPC
 */
const initRendererLogIpc = (): void => {
  ipcMain.on("renderer-log", (_event, level: LogLevel, message: string, args: unknown[]) => {
    const logMethod = rendererLog[level];
    if (typeof logMethod === "function") {
      if (args && args.length > 0) {
        logMethod(message, ...args);
      } else {
        logMethod(message);
      }
    }
  });

  /**
   * 获取渲染进程控制台日志
   */
  const getRendererConsoleLogs = async (): Promise<string[]> => {
    const mainWin = mainWindow.getWin();
    if (!mainWin || mainWin.isDestroyed() || mainWin.webContents.isDestroyed()) return [];
    return new Promise((resolve) => {
      const timeout = setTimeout(() => {
        ipcMain.removeListener("return-renderer-console-logs", listener);
        resolve([]);
      }, 2000);
      const listener = (_event: IpcMainEvent, logs: unknown) => {
        clearTimeout(timeout);
        if (!Array.isArray(logs)) {
          resolve([]);
          return;
        }
        resolve(logs.filter((item) => typeof item === "string"));
      };
      ipcMain.once("return-renderer-console-logs", listener);
      mainWin.webContents.send("request-renderer-console-logs");
    });
  };

  const appendRendererLogs = async (logFile: string) => {
    try {
      const logs = await getRendererConsoleLogs();
      if (logs.length > 0) {
        const header = `\n\n------ 渲染进程控制台日志 ${new Date().toISOString()} ------\n`;
        await appendFile(logFile, header + logs.join("\n") + "\n");
      }
    } catch (error) {
      rendererLog.error("追加控制台日志失败:", error);
    }
  };

  ipcMain.on("open-log-file", async () => {
    const logFile = log.transports.file.getFile().path;
    await appendRendererLogs(logFile);
    shell.openPath(logFile);
    rendererLog.info("📂 Opened log file:", logFile);
  });

  ipcMain.handle("save-log-file", async () => {
    const logFile = log.transports.file.getFile().path;
    const defaultName = basename(logFile);
    const { filePath } = await dialog.showSaveDialog({
      title: "保存日志文件",
      defaultPath: defaultName,
      filters: [{ name: "SPlayer Log", extensions: ["log"] }],
    });
    if (!filePath) return { success: false, error: "cancelled" };
    await appendRendererLogs(logFile);
    await copyFile(logFile, filePath);
    return { success: true, path: filePath };
  });
};

export default initRendererLogIpc;
