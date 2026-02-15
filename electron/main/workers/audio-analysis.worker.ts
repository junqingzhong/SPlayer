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

const getAnalyzeAudioFile = (nativeModulePath: string) => {
  if (cachedNativeModulePath === nativeModulePath && cachedAnalyzeAudioFile) {
    return cachedAnalyzeAudioFile;
  }

  try {
    const tools = requireNative(nativeModulePath) as { analyzeAudioFile?: unknown };
    if (typeof tools.analyzeAudioFile !== "function") {
      cachedNativeModulePath = nativeModulePath;
      cachedAnalyzeAudioFile = null;
      return null;
    }
    cachedNativeModulePath = nativeModulePath;
    cachedAnalyzeAudioFile = tools.analyzeAudioFile as (filePath: string, maxTime: number) => unknown;
    return cachedAnalyzeAudioFile;
  } catch {
    cachedNativeModulePath = nativeModulePath;
    cachedAnalyzeAudioFile = null;
    return null;
  }
};

const port = parentPort;
if (!port) throw new Error("WORKER_PARENT_PORT_MISSING");

port.on("message", (msg: AnalyzeRequest) => {
  try {
    const analyzeAudioFile = getAnalyzeAudioFile(msg.nativeModulePath);
    if (!analyzeAudioFile) {
      const resp: AnalyzeResponse = { ok: false, error: "NATIVE_TOOLS_NOT_AVAILABLE" };
      port.postMessage(resp);
      return;
    }
    const result = analyzeAudioFile(msg.filePath, msg.maxTime);
    const resp: AnalyzeResponse = { ok: true, result };
    port.postMessage(resp);
  } catch (e) {
    const error = e instanceof Error ? e.message : String(e);
    const resp: AnalyzeResponse = { ok: false, error };
    port.postMessage(resp);
  }
});
