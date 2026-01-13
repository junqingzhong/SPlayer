/**
 * 音频管理器
 * 提供音频播放控制功能
 */

// 音频管理器接口
export interface AudioManager {
  // 播放控制
  play(src?: string, options?: { fadeIn?: boolean; autoPlay?: boolean; fadeDuration?: number }): Promise<void>;
  pause(options?: { fadeOut?: boolean; fadeDuration?: number }): void;
  stop(): void;
  seek(time: number): void;

  // 状态属性
  src: string | null;
  paused: boolean;
  currentTime: number;
  duration: number;
  volume: number;
  rate: number;

  // 事件监听
  on(event: string, callback: (...args: any[]) => void): void;
  off(event: string, callback: (...args: any[]) => void): void;

  // 获取数据
  getFrequencyData(): Uint8Array;
  getVolume(): number;

  // 设置
  setRate(rate: number): void;
  setVolume(volume: number): void;
  setSinkId(device: string): void;
  setFilterGain(index: number, value: number): void;
}

// 简单的音频管理器实现
class SimpleAudioManager implements AudioManager {
  private audio: HTMLAudioElement;
  private eventListeners: Map<string, Array<(...args: any[]) => void>> = new Map();

  // 提供对外访问音频元素的属性
  public get audioElement(): HTMLAudioElement | null {
    return this.audio;
  }

  constructor() {
    this.audio = new Audio();
    this.setupEventListeners();
  }

  private setupEventListeners() {
    this.audio.addEventListener('play', () => this.emit('play'));
    this.audio.addEventListener('pause', () => this.emit('pause'));
    this.audio.addEventListener('ended', () => this.emit('ended'));
    this.audio.addEventListener('timeupdate', () => this.emit('timeupdate'));
    this.audio.addEventListener('loadedmetadata', () => this.emit('loadedmetadata'));
  }

  private emit(event: string, ...args: any[]) {
    const listeners = this.eventListeners.get(event) || [];
    listeners.forEach((listener) => listener(...args));
  }

  on(event: string, callback: (...args: any[]) => void) {
    if (!this.eventListeners.has(event)) {
      this.eventListeners.set(event, []);
    }
    this.eventListeners.get(event)!.push(callback);
  }

  off(event: string, callback: (...args: any[]) => void) {
    const listeners = this.eventListeners.get(event) || [];
    const index = listeners.indexOf(callback);
    if (index > -1) {
      listeners.splice(index, 1);
    }
  }

  async play(src?: string, options?: { fadeIn?: boolean; autoPlay?: boolean; fadeDuration?: number }): Promise<void> {
    if (src) {
      this.audio.src = src;
    }
    // 简单的淡入效果模拟
    if (options?.fadeIn && options.fadeDuration) {
      this.audio.volume = 0;
      this.audio.play();
      // 简单的音量渐变
      const fadeIn = () => {
        if (this.audio.volume < 1) {
          this.audio.volume = Math.min(1, this.audio.volume + 0.1);
          setTimeout(fadeIn, options.fadeDuration! * 100);
        }
      };
      fadeIn();
    } else {
      await this.audio.play();
    }
  }

  pause(options?: { fadeOut?: boolean; fadeDuration?: number }): void {
    // 简单的淡出效果模拟
    if (options?.fadeOut && options.fadeDuration) {
      const fadeOut = () => {
        if (this.audio.volume > 0) {
          this.audio.volume = Math.max(0, this.audio.volume - 0.1);
          setTimeout(fadeOut, options.fadeDuration! * 100);
        } else {
          this.audio.pause();
        }
      };
      fadeOut();
    } else {
      this.audio.pause();
    }
  }

  stop(): void {
    this.audio.pause();
    this.audio.currentTime = 0;
  }

  seek(time: number): void {
    this.audio.currentTime = time;
  }

  get src(): string | null {
    return this.audio.src;
  }

  get paused(): boolean {
    return this.audio.paused;
  }

  get currentTime(): number {
    return this.audio.currentTime;
  }

  get duration(): number {
    return this.audio.duration;
  }

  get volume(): number {
    return this.audio.volume;
  }

  get rate(): number {
    return this.audio.playbackRate;
  }

  setRate(rate: number): void {
    this.audio.playbackRate = rate;
  }

  setVolume(volume: number): void {
    this.audio.volume = volume;
  }

  setSinkId(device: string): void {
    // 简单的实现，实际可能需要更复杂的处理
    console.log('Setting sink id:', device);
  }

  setFilterGain(index: number, value: number): void {
    // 简单的实现，实际可能需要Web Audio API
    console.log('Setting filter gain:', index, value);
  }

  getFrequencyData(): Uint8Array {
    // 简单的实现，返回空数组
    return new Uint8Array(128);
  }

  getVolume(): number {
    return this.audio.volume;
  }
}

// 创建单例实例
const audioManager = new SimpleAudioManager();

export default audioManager;