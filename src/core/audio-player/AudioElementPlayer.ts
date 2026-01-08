import { AUDIO_EVENTS, BaseAudioPlayer, type AudioEventType } from "./BaseAudioPlayer";

/**
 * 基于 HTMLAudioElement 的播放器实现
 */
export class AudioElementPlayer extends BaseAudioPlayer {
  private audioElement: HTMLAudioElement;
  private sourceNode: MediaElementAudioSourceNode | null = null;

  /** Seek 锁 */
  private isInternalSeeking = false;
  /** 目标时间缓存 */
  private targetSeekTime = 0;

  constructor() {
    super();
    this.audioElement = new Audio();
    this.audioElement.crossOrigin = "anonymous";
    this.bindInternalEvents();

    this.audioElement.addEventListener("seeked", () => {
      this.isInternalSeeking = false;
    });
  }

  protected onGraphInitialized(): void {
    if (!this.audioCtx || !this.inputNode) return;

    try {
      this.sourceNode = this.audioCtx.createMediaElementSource(this.audioElement);

      this.sourceNode.connect(this.inputNode);
    } catch (error) {
      console.error("[AudioElementPlayer] SourceNode 创建失败", error);
    }
  }

  public async load(url: string): Promise<void> {
    this.audioElement.src = url;
    this.audioElement.load();
  }

  protected async doPlay(): Promise<void> {
    return this.audioElement.play();
  }

  protected doPause(): void {
    this.audioElement.pause();
  }

  public async seek(time: number): Promise<void> {
    this.isInternalSeeking = true;
    this.targetSeekTime = time;

    await super.seek(time);
  }

  protected doSeek(time: number): void {
    if (Number.isFinite(time)) {
      this.audioElement.currentTime = time;
    }
  }

  public setRate(value: number): void {
    this.audioElement.playbackRate = value;
  }

  public getRate(): number {
    return this.audioElement.playbackRate;
  }

  protected async doSetSinkId(deviceId: string): Promise<void> {
    if (typeof this.audioElement.setSinkId === "function") {
      await this.audioElement.setSinkId(deviceId);
    }
  }

  public get src(): string {
    return this.audioElement.src || "";
  }

  public get duration(): number {
    return this.audioElement.duration || 0;
  }

  public get currentTime(): number {
    // 如果正在 Seek (无论是等待淡出，还是正在缓冲)，强制返回目标时间以避免进度跳回
    if (this.isInternalSeeking) {
      return this.targetSeekTime;
    }
    return this.audioElement.currentTime || 0;
  }

  public get paused(): boolean {
    return this.audioElement.paused;
  }

  public getErrorCode(): number {
    if (!this.audioElement.error) return 0;
    switch (this.audioElement.error.code) {
      case MediaError.MEDIA_ERR_ABORTED:
        return 1;
      case MediaError.MEDIA_ERR_NETWORK:
        return 2;
      case MediaError.MEDIA_ERR_DECODE:
        return 3;
      case MediaError.MEDIA_ERR_SRC_NOT_SUPPORTED:
        return 4;
      default:
        return 0;
    }
  }

  /**
   * 监听原生 DOM 事件并转发为标准事件
   */
  private bindInternalEvents() {
    const events: AudioEventType[] = Object.values(AUDIO_EVENTS);

    events.forEach((eventType) => {
      this.audioElement.addEventListener(eventType, (e) => {
        if (eventType === AUDIO_EVENTS.ERROR) {
          this.emit(AUDIO_EVENTS.ERROR, {
            originalEvent: e,
            errorCode: this.getErrorCode(),
          });
        } else {
          this.emit(eventType);
        }
      });
    });
  }
}
