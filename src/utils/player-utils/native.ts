/**
 * 基于 HTMLAudioElement + Web Audio 的播放器引擎
 */
export class PlayerNative {
  private audio: HTMLAudioElement;
  private ctx: AudioContext;
  private sourceNode: MediaElementAudioSourceNode;
  private gainNode: GainNode;
  private analyser?: AnalyserNode;
  private events: Map<string, Set<(...args: any[]) => void>> = new Map();

  /**
   * 构造播放器引擎
   * @param ctx 可选的外部 `AudioContext`，不传则内部创建
   */
  constructor(ctx?: AudioContext) {
    this.audio = new Audio();
    this.audio.preload = "auto";
    this.audio.crossOrigin = "anonymous";

    this.ctx = ctx ?? new AudioContext();
    this.sourceNode = this.ctx.createMediaElementSource(this.audio);
    this.gainNode = this.ctx.createGain();
    this.sourceNode.connect(this.gainNode).connect(this.ctx.destination);

    this.bindDomEvents();
  }

  /**
   * 加载指定音频地址，切换歌曲时只需调用此方法即可
   * @param src 音频 URL（需允许跨域以启用频谱/均衡等处理）
   */
  load(src: string): void {
    this.audio.src = src;
    // 重置并触发新加载
    this.audio.load();
    this.emit("loadstart");
  }

  /**
   * 开始播放如果 `AudioContext` 处于挂起状态，将自动恢复
   * @returns 播放 Promise，用于捕获自动播放限制等异常
   */
  async play(): Promise<void> {
    if (this.ctx.state === "suspended") {
      try {
        await this.ctx.resume();
      } catch (e) {
        this.emit("error", e);
      }
    }
    try {
      await this.audio.play();
      this.emit("play");
    } catch (e) {
      this.emit("error", e);
      throw e;
    }
  }

  /**
   * 暂停播放
   */
  pause(): void {
    this.audio.pause();
    this.emit("pause");
  }

  /**
   * 停止播放并将进度归零
   */
  stop(): void {
    this.audio.pause();
    this.audio.currentTime = 0;
    this.emit("stop");
  }

  /**
   * 跳转到指定秒数
   * @param seconds 目标时间（秒）
   */
  seek(seconds: number): void {
    try {
      this.audio.currentTime = Math.max(0, seconds);
      this.emit("seek", seconds);
    } catch (e) {
      this.emit("error", e);
    }
  }

  /**
   * 设置音量（0.0 ~ 1.0）
   * @param volume 音量值
   */
  setVolume(volume: number): void {
    const v = Math.min(1, Math.max(0, volume));
    this.gainNode.gain.setValueAtTime(v, this.ctx.currentTime);
    this.emit("volume", v);
  }

  /**
   * 渐变到目标音量
   * @param target 目标音量（0.0 ~ 1.0）
   * @param durationMs 渐变时长（毫秒）
   */
  fadeTo(target: number, durationMs: number): void {
    const now = this.ctx.currentTime;
    const t = Math.min(1, Math.max(0, target));
    this.gainNode.gain.cancelScheduledValues(now);
    this.gainNode.gain.setValueAtTime(this.gainNode.gain.value, now);
    this.gainNode.gain.linearRampToValueAtTime(t, now + durationMs / 1000);
    this.emit("fade", t, durationMs);
  }

  /**
   * 设置是否循环播放
   * @param loop 是否循环
   */
  setLoop(loop: boolean): void {
    this.audio.loop = !!loop;
    this.emit("loop", !!loop);
  }

  /**
   * 设置播放速率
   * @param rate 倍速（例如 1.0 正常速）
   */
  setRate(rate: number): void {
    const r = Math.max(0.25, Math.min(4, rate));
    this.audio.playbackRate = r;
    this.emit("rate", r);
  }

  /**
   * 将内部音频链路连接到外部 `AnalyserNode`，用于频谱/可视化
   * @param analyser 频谱分析节点
   */
  connectAnalyser(analyser: AnalyserNode): void {
    try {
      // 重新布线：gain -> analyser -> destination
      this.gainNode.disconnect();
      this.gainNode.connect(analyser).connect(this.ctx.destination);
      this.analyser = analyser;
      this.emit("analyser");
    } catch (e) {
      this.emit("error", e);
    }
  }

  /**
   * 获取音频总时长（秒）
   */
  getDuration(): number {
    return Number.isFinite(this.audio.duration) ? this.audio.duration : 0;
  }

  /**
   * 获取当前播放进度（秒）
   */
  getCurrentTime(): number {
    return this.audio.currentTime || 0;
  }

  /**
   * 获取缓冲范围集合（TimeRanges）
   */
  getBuffered(): TimeRanges {
    return this.audio.buffered;
  }

  /**
   * 绑定原生 `HTMLAudioElement` 的事件到引擎事件系统
   */
  private bindDomEvents(): void {
    this.audio.addEventListener("loadstart", () => this.emit("loadstart"));
    this.audio.addEventListener("canplay", () => this.emit("canplay"));
    this.audio.addEventListener("canplaythrough", () => this.emit("loaded"));
    this.audio.addEventListener("playing", () => this.emit("playing"));
    this.audio.addEventListener("pause", () => this.emit("pause"));
    this.audio.addEventListener("ended", () => this.emit("end"));
    this.audio.addEventListener("waiting", () => this.emit("waiting"));
    this.audio.addEventListener("stalled", () => this.emit("stalled"));
    this.audio.addEventListener("error", (e) => this.emit("error", e));
    this.audio.addEventListener("timeupdate", () => this.emit("time", this.audio.currentTime));
    this.audio.addEventListener("progress", () => this.emit("progress", this.audio.buffered));
  }

  /**
   * 订阅事件
   * @param event 事件名
   * @param handler 事件处理函数
   */
  on(event: string, handler: (...args: any[]) => void): void {
    if (!this.events.has(event)) this.events.set(event, new Set());
    this.events.get(event)!.add(handler);
  }

  /**
   * 取消订阅事件；不传参数则清空所有事件
   * @param event 事件名（可选）
   * @param handler 处理函数（可选）
   */
  off(event?: string, handler?: (...args: any[]) => void): void {
    if (!event) {
      this.events.clear();
      return;
    }
    if (!handler) {
      this.events.get(event)?.clear();
      return;
    }
    this.events.get(event)?.delete(handler);
  }

  /**
   * 释放资源与断开音频链路；不会销毁全局 `AudioContext`
   */
  destroy(): void {
    try {
      this.off();
      this.audio.pause();
      this.audio.src = "";
      this.audio.removeAttribute("src");
      // 一般用于释放媒体资源的模式
      this.audio.load();
    } catch {}
    try {
      this.sourceNode.disconnect();
    } catch {}
    try {
      this.gainNode.disconnect();
    } catch {}
    try {
      this.analyser?.disconnect();
    } catch {}
    this.emit("destroy");
  }

  /**
   * 触发事件
   * @param event 事件名
   * @param args 事件参数
   */
  private emit(event: string, ...args: any[]): void {
    const set = this.events.get(event);
    if (!set || set.size === 0) return;
    set.forEach((fn) => {
      try {
        fn(...args);
      } catch {}
    });
  }
}

/**
 * 创建一个 PlayerNative 实例的便捷工厂
 * @param ctx 可选的外部 `AudioContext`
 */
export function createPlayerNative(ctx?: AudioContext): PlayerNative {
  return new PlayerNative(ctx);
}

/**
 * 引擎事件类型参考（自由扩展）
 */
export type PlayerNativeEvent =
  | "loadstart"
  | "canplay"
  | "loaded"
  | "playing"
  | "pause"
  | "stop"
  | "seek"
  | "volume"
  | "fade"
  | "loop"
  | "rate"
  | "analyser"
  | "time"
  | "progress"
  | "waiting"
  | "stalled"
  | "end"
  | "error"
  | "destroy";
