import { createRequire } from "node:module";
import { parentPort } from "node:worker_threads";

type AnalyzeRequest = {
  filePath: string;
  maxTime: number;
  nativeModulePath: string;
};

type AnalyzeResponse =
  | { ok: true; result: unknown }
  | { ok: false; error: string };

const requireNative = createRequire(import.meta.url);

let cachedNativeModulePath: string | null = null;
let cachedAnalyzeAudioFile: ((filePath: string, maxTime: number) => unknown) | null = null;
let cachedAnalyzeAudioFileError: string | null = null;

const getAnalyzeAudioFile = (nativeModulePath: string) => {
  if (cachedNativeModulePath === nativeModulePath) {
    return { analyzeAudioFile: cachedAnalyzeAudioFile, error: cachedAnalyzeAudioFileError };
  }

  try {
    const tools = requireNative(nativeModulePath) as { analyzeAudioFile?: unknown };
    if (typeof tools.analyzeAudioFile !== "function") {
      cachedNativeModulePath = nativeModulePath;
      cachedAnalyzeAudioFile = null;
      cachedAnalyzeAudioFileError = "NATIVE_EXPORT_MISSING:analyzeAudioFile";
      return { analyzeAudioFile: null, error: cachedAnalyzeAudioFileError };
    }
    cachedNativeModulePath = nativeModulePath;
    cachedAnalyzeAudioFile = tools.analyzeAudioFile as (filePath: string, maxTime: number) => unknown;
    cachedAnalyzeAudioFileError = null;
    return { analyzeAudioFile: cachedAnalyzeAudioFile, error: null };
  } catch (e) {
    cachedNativeModulePath = nativeModulePath;
    cachedAnalyzeAudioFile = null;
    cachedAnalyzeAudioFileError = e instanceof Error ? e.message : String(e);
    return { analyzeAudioFile: null, error: cachedAnalyzeAudioFileError };
  }
};

const port = parentPort;
if (!port) throw new Error("WORKER_PARENT_PORT_MISSING");

port.on("message", (msg: AnalyzeRequest) => {
  try {
    const { analyzeAudioFile, error } = getAnalyzeAudioFile(msg.nativeModulePath);
    if (!analyzeAudioFile) {
      const resp: AnalyzeResponse = {
        ok: false,
        error: error ? `NATIVE_TOOLS_NOT_AVAILABLE:${error}` : "NATIVE_TOOLS_NOT_AVAILABLE",
      };
      port.postMessage(resp);
      return;
    }
    const result = analyzeAudioFile(msg.filePath, msg.maxTime);
    if (result == null) {
      const resp: AnalyzeResponse = { ok: false, error: "ANALYZE_RETURNED_NULL" };
      port.postMessage(resp);
      return;
    }
    const resp: AnalyzeResponse = { ok: true, result };
    port.postMessage(resp);
  } catch (e) {
    const error = e instanceof Error ? e.message : String(e);
    const resp: AnalyzeResponse = { ok: false, error };
    port.postMessage(resp);
  }
});
