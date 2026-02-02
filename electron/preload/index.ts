import { contextBridge, ipcRenderer } from "electron";
import { electronAPI } from "@electron-toolkit/preload";

type LogLevel = "info" | "warn" | "error" | "debug";

const sendRendererLog = (level: LogLevel, message: string, args: unknown[]) => {
  ipcRenderer.send("renderer-log", level, message, args);
};

const createRendererLogger = () => ({
  info: (message: string, ...args: unknown[]) => sendRendererLog("info", message, args),
  warn: (message: string, ...args: unknown[]) => sendRendererLog("warn", message, args),
  error: (message: string, ...args: unknown[]) => sendRendererLog("error", message, args),
  debug: (message: string, ...args: unknown[]) => sendRendererLog("debug", message, args),
});

// Use `contextBridge` APIs to expose Electron APIs to
// renderer only if context isolation is enabled, otherwise
// just add to the DOM global.
if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld("electron", electronAPI);
    // Expose store API via preload
    contextBridge.exposeInMainWorld("api", {
      store: {
        get: (key: string) => ipcRenderer.invoke("store-get", key),
        set: (key: string, value: unknown) => ipcRenderer.invoke("store-set", key, value),
        has: (key: string) => ipcRenderer.invoke("store-has", key),
        delete: (key: string) => ipcRenderer.invoke("store-delete", key),
        reset: (keys?: string[]) => ipcRenderer.invoke("store-reset", keys),
        export: (data: any) => ipcRenderer.invoke("store-export", data),
        import: () => ipcRenderer.invoke("store-import"),
      },
      // Renderer logging API
      log: createRendererLogger(),
    });
  } catch (error) {
    sendRendererLog("error", "Preload expose error", [error]);
  }
}
