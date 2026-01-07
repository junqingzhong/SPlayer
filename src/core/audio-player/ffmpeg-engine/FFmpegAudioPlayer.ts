import { AudioErrorDetail, BaseAudioPlayer } from "../BaseAudioPlayer";
import AudioWorker from "./audio.worker?worker";
import type { AudioMetadata, PlayerEventMap, PlayerState, WorkerResponse } from "./types";

const HIGH_WATER_MARK = 30;
const LOW_WATER_MARK = 10;

// const ERR_ABORTED = 1;
const ERR_NETWORK = 2;
const ERR_DECODE = 3;
// const ERR_SRC_NOT_SUPPORTED = 4;

export class FFmpegAudioPlayer extends BaseAudioPlayer {
  private worker: Worker | null = null;
  private metadata: AudioMetadata | null = null;

  private playerState: PlayerState = "idle";
  private nextStartTime = 0;
  private timeOffset = 0;
  private isWorkerPaused = false;
  private activeSources: AudioBufferSourceNode[] = [];
  private isDecodingFinished = false;
  /** 精确控制 Worker Seek 状态的标志 */
  private isWorkerSeeking = false;
  /** 暂存 Seek 目标时间，用于在 Seek 期间维持 currentTime 稳定 */
  private targetSeekTime = 0;
  private _errorCode: number = 0;

  private metadataResolve: (() => void) | null = null;
  private metadataReject: ((reason?: unknown) => void) | null = null;

  private timeUpdateFrameId: number = 0;
  private currentMessageId = 0;

  private _src: string = "";

  constructor() {
    super();
  }

  public get src(): string {
    return this._src;
  }
  public get duration() {
    return this.metadata?.duration || 0;
  }
  public get currentTime() {
    if (this.isWorkerSeeking) {
      return this.targetSeekTime;
    }

    if (!this.audioCtx) return 0;
    const t = this.audioCtx.currentTime - this.timeOffset;
    return Math.max(0, t);
  }
  public get paused() {
    return this.playerState !== "playing";
  }
  public getErrorCode() {
    return this._errorCode;
  }

  public get audioInfo() {
    return this.metadata;
  }

  protected onGraphInitialized() {}

  public async load(url: string) {
    this._src = url;
    this.reset();
    this.setState("loading");

    return new Promise<void>((resolve, reject) => {
      this.metadataResolve = resolve;
      this.metadataReject = reject;

      const startLoading = async () => {
        try {
          if (!this.isInitialized) {
            this.init();
          }

          const response = await fetch(url);
          if (!response.ok) throw new Error(`Failed to fetch ${url}`);
          const blob = await response.blob();
          const file = new File([blob], "und", { type: blob.type });

          this.worker = new AudioWorker();
          this.setupWorkerListeners();

          this.currentMessageId = Date.now();
          if (this.worker) {
            this.worker.postMessage({
              type: "INIT",
              id: this.currentMessageId,
              file,
              chunkSize: 4096 * 8,
            });
          }
        } catch (e) {
          this.cleanupLoadPromise();
          this.handleError((e as Error).message, ERR_NETWORK);
          reject(e);
        }
      };
      startLoading();
    });
  }

  private cleanupLoadPromise() {
    this.metadataResolve = null;
    this.metadataReject = null;
  }

  protected async doPlay() {
    if (this.worker && this.isWorkerPaused) {
      this.worker.postMessage({ type: "RESUME", id: this.currentMessageId });
      this.isWorkerPaused = false;
    }

    this.setState("playing");
    this.startTimeUpdate();
  }

  protected doPause() {
    this.setState("paused");
    this.stopTimeUpdate();

    if (this.worker) {
      this.worker.postMessage({ type: "PAUSE", id: this.currentMessageId });
      this.isWorkerPaused = true;
    }
  }

  public async seek(time: number) {
    // 如果正在 Seek (无论是等待淡出，还是正在缓冲)，强制返回目标时间以避免进度跳回
    this.isWorkerSeeking = true;
    this.targetSeekTime = time;

    await super.seek(time);
  }

  protected doSeek(time: number) {
    if (!this.worker || !this.audioCtx || !this.metadata) return;

    this.activeSources.forEach((s) => {
      try {
        s.stop();
      } catch {
        // 忽略已停止的错误
      }
    });
    this.activeSources = [];
    this.currentMessageId = Date.now();

    this.worker.postMessage({
      type: "SEEK",
      id: this.currentMessageId,
      seekTime: time,
    });
    this.isDecodingFinished = false;

    this.dispatch("timeUpdate", time);
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  public setRate(_value: number) {
    console.warn("[FFmpegAudioPlayer] setRate is not supported");
  }

  public getRate() {
    console.warn("[FFmpegAudioPlayer] getRate is not supported");
    return 1;
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  protected async doSetSinkId(_deviceId: string) {
    console.warn("[FFmpegAudioPlayer] doSetSinkId is not supported");
  }

  public destroy() {
    this.reset();

    if (this.audioCtx) {
      this.audioCtx.close().catch(console.error);
      this.audioCtx = null;
    }
  }

  private reset() {
    this._errorCode = 0;
    if (this.metadataReject) {
      this.metadataReject(new Error("Aborted by reset"));
      this.cleanupLoadPromise();
    }

    this.stopTimeUpdate();

    if (this.worker) {
      this.worker.terminate();
      this.worker = null;
    }

    this.activeSources.forEach((source) => {
      try {
        source.stop();
      } catch {
        // 忽略已停止的错误
      }
    });
    this.activeSources = [];

    if (this.metadata && this.metadata.coverUrl) {
      URL.revokeObjectURL(this.metadata.coverUrl);
    }

    this.metadata = null;
    this.isWorkerPaused = false;
    this.isDecodingFinished = false;
    this.timeOffset = this.audioCtx ? this.audioCtx.currentTime : 0;
    this.nextStartTime = this.timeOffset;

    this.setState("idle");
  }

  private setState(newState: PlayerState) {
    if (this.playerState === newState) return;
    this.playerState = newState;

    this.dispatch("stateChange", newState);

    if (newState === "playing") this.dispatchEvent(new Event("play"));
    if (newState === "paused") this.dispatchEvent(new Event("pause"));
  }

  private handleError(msg: string, code: number = ERR_DECODE) {
    console.error("[FFmpegAudioPlayer]", msg, code);

    this._errorCode = code;

    this.setState("error");

    const errorDetail: AudioErrorDetail = {
      originalEvent: new ErrorEvent("error", {
        message: msg,
        error: new Error(msg),
      }),
      errorCode: code,
    };

    this.dispatch("error", errorDetail);
  }

  private setupWorkerListeners() {
    if (!this.worker) return;

    this.worker.onmessage = (event: MessageEvent<WorkerResponse>) => {
      const resp = event.data;
      if (resp.id !== this.currentMessageId) return;

      switch (resp.type) {
        case "ERROR":
          if (this.metadataReject) {
            this.metadataReject(new Error(resp.error));
            this.cleanupLoadPromise();
          }
          this.handleError(resp.error, ERR_DECODE);
          break;
        case "METADATA":
          this.metadata = {
            sampleRate: resp.sampleRate,
            channels: resp.channels,
            duration: resp.duration,
            metadata: resp.metadata,
            encoding: resp.encoding,
            coverUrl: resp.coverUrl,
            bitsPerSample: resp.bitsPerSample,
          };
          if (this.audioCtx) {
            const now = this.audioCtx.currentTime;
            this.timeOffset = now;
            this.nextStartTime = now;
          }
          this.dispatch("durationChange", resp.duration);
          this.dispatchEvent(new Event("durationchange"));

          this.setState("ready");
          this.dispatchEvent(new Event("canplay"));

          if (this.metadataResolve) {
            this.metadataResolve();
            this.cleanupLoadPromise();
          }

          break;
        case "CHUNK":
          if (this.metadata) {
            this.scheduleChunk(
              resp.data,
              this.metadata.sampleRate,
              this.metadata.channels,
              resp.startTime,
            );

            if (this.audioCtx) {
              const bufferedDuration = this.nextStartTime - this.audioCtx.currentTime;
              if (bufferedDuration > HIGH_WATER_MARK && !this.isWorkerPaused) {
                if (this.worker) {
                  this.worker.postMessage({
                    type: "PAUSE",
                    id: this.currentMessageId,
                  });
                  this.isWorkerPaused = true;
                }
              }
            }
          }
          break;
        case "EOF":
          this.isDecodingFinished = true;
          this.checkIfEnded();
          break;
        case "SEEK_DONE":
          if (this.audioCtx) {
            const now = this.audioCtx.currentTime;
            this.isWorkerPaused = false;
            this.nextStartTime = now;
            this.timeOffset = now - resp.time;
            this.isWorkerSeeking = false;
          }
          break;
      }
    };
  }

  private scheduleChunk(
    planarData: Float32Array,
    sampleRate: number,
    channels: number,
    chunkStartTime: number,
  ) {
    if (!this.audioCtx || !this.inputNode) return;
    const ctx = this.audioCtx;

    const safeChannels = channels || 1;
    const frameCount = planarData.length / safeChannels;

    const audioBuffer = ctx.createBuffer(safeChannels, frameCount, sampleRate);

    for (let ch = 0; ch < safeChannels; ch++) {
      const chData = audioBuffer.getChannelData(ch);
      const start = ch * frameCount;
      chData.set(planarData.subarray(start, start + frameCount));
    }

    const now = this.audioCtx.currentTime;

    if (this.nextStartTime < now) {
      this.nextStartTime = now;
    }

    this.timeOffset = this.nextStartTime - chunkStartTime;

    const source = ctx.createBufferSource();
    source.buffer = audioBuffer;
    source.connect(this.inputNode);

    source.start(this.nextStartTime);

    this.nextStartTime += audioBuffer.duration;

    this.activeSources.push(source);

    source.onended = () => {
      this.activeSources = this.activeSources.filter((s) => s !== source);

      if (this.audioCtx && !this.isDecodingFinished) {
        const bufferedDuration = this.nextStartTime - this.audioCtx.currentTime;
        if (bufferedDuration < LOW_WATER_MARK && this.isWorkerPaused) {
          if (this.worker) {
            this.worker.postMessage({ type: "RESUME", id: this.currentMessageId });
            this.isWorkerPaused = false;
          }
        }
      }

      this.checkIfEnded();
    };
  }

  private checkIfEnded() {
    if (this.playerState !== "playing") return;
    if (this.activeSources.length > 0) return;
    if (!this.isDecodingFinished) return;

    this.setState("idle");
    this.dispatch("ended", undefined);
    this.dispatchEvent(new Event("ended"));
  }

  private dispatch<K extends keyof PlayerEventMap>(type: K, detail?: PlayerEventMap[K]) {
    this.dispatchEvent(new CustomEvent(type, { detail }));
  }

  private startTimeUpdate() {
    this.stopTimeUpdate();
    const tick = () => {
      if (this.playerState === "playing") {
        if (!this.isWorkerSeeking) {
          this.dispatch("timeUpdate", this.currentTime);
          this.dispatchEvent(new Event("timeupdate"));
        }
        this.timeUpdateFrameId = requestAnimationFrame(tick);
      }
    };
    this.timeUpdateFrameId = requestAnimationFrame(tick);
  }

  private stopTimeUpdate() {
    if (this.timeUpdateFrameId) {
      cancelAnimationFrame(this.timeUpdateFrameId);
      this.timeUpdateFrameId = 0;
    }
  }
}
