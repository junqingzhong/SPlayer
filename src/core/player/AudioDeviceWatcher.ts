import { watch } from "vue";
import { isElectron } from "@/utils/env";
import { useStatusStore } from "@/stores";

/**
 * 音频设备拔插监听器
 *
 * 监听 `navigator.mediaDevices` 的 `devicechange` 事件，当默认输出设备变化时：
 * - 设备消失（耳机拔出）→ 自动暂停并记录"恢复标志"
 * - 设备出现（耳机插回）→ 若存在"恢复标志"则自动继续播放
 *
 * 同时通过 IPC 接收主进程来自系统层（macOS CoreAudio / Windows WASAPI）的兜底信号，
 * 保证与 macOS、Windows 原生音乐 App 行为一致。
 *
 * 行为规则：
 * - 拔下时若用户已手动暂停，不设置恢复标志（避免后续插上时误启动）
 * - 拔下到插上之间若用户手动改变过播放状态，自动清除恢复标志
 */
class AudioDeviceWatcher {
  /** 上一次输出设备 ID 集合 */
  private prevOutputDeviceIds: Set<string> = new Set();
  /** 是否在耳机断开前正在播放，用于决定是否自动恢复 */
  private wasPlayingBeforeUnplug: boolean = false;
  /** 首次事件触发前的初始化标志 */
  private initialized: boolean = false;
  /** 重复事件去抖用的定时器 */
  private debounceTimer: ReturnType<typeof setTimeout> | null = null;
  /** 主进程原生设备变化回调是否已注册 */
  private nativeListenerRegistered: boolean = false;
  /** 监听 playStatus 变化以清除自动恢复标志 */
  private statusWatcher: ReturnType<typeof watch> | null = null;

  /**
   * 启动监听
   * 应在 PlayerController 初始化后调用
   */
  public async start() {
    if (typeof navigator === "undefined" || !navigator.mediaDevices) {
      console.warn("[AudioDeviceWatcher] 当前环境不支持 navigator.mediaDevices，已跳过");
      return;
    }

    if (this.initialized) return;

    // 注册浏览器级 devicechange 事件
    navigator.mediaDevices.addEventListener("devicechange", this.handleDeviceChange);

    // 注册主进程原生设备事件（macOS CoreAudio / Windows WASAPI）
    this.registerNativeListener();

    // 初始化设备列表快照
    this.prevOutputDeviceIds = await this.refreshDeviceSnapshot();
    this.initialized = true;

    // 监听播放状态变化，任何用户主动改变都会清空自动恢复标志
    const statusStore = useStatusStore();
    this.statusWatcher = watch(
      () => statusStore.playStatus,
      () => {
        this.wasPlayingBeforeUnplug = false;
      },
    );

    console.log("[AudioDeviceWatcher] 已启动，初始输出设备数:", this.prevOutputDeviceIds.size);
  }

  /**
   * 注册主进程原生音频设备事件监听
   */
  private registerNativeListener() {
    if (!isElectron || this.nativeListenerRegistered) return;
    if (!window.electron?.ipcRenderer) return;

    try {
      window.electron.ipcRenderer.removeAllListeners("audio-device-change");
      window.electron.ipcRenderer.on("audio-device-change", (_, event) => {
        this.handleNativeDeviceEvent(event);
      });
      this.nativeListenerRegistered = true;
    } catch (e) {
      console.warn("[AudioDeviceWatcher] 注册原生设备事件失败:", e);
    }
  }

  /**
   * 刷新输出设备 ID 快照
   */
  private async refreshDeviceSnapshot(): Promise<Set<string>> {
    const ids = new Set<string>();
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      for (const device of devices) {
        if (device.kind === "audiooutput" && device.deviceId) {
          ids.add(device.deviceId);
        }
      }
    } catch (e) {
      console.warn("[AudioDeviceWatcher] 获取设备列表失败:", e);
    }
    return ids;
  }

  /**
   * 浏览器 devicechange 事件处理
   */
  private handleDeviceChange = () => {
    if (!this.initialized) return;

    // 去抖：短时间内多次变化只处理一次
    if (this.debounceTimer) clearTimeout(this.debounceTimer);
    this.debounceTimer = setTimeout(() => {
      this.processDeviceChange().catch((e) =>
        console.warn("[AudioDeviceWatcher] 处理设备变化失败:", e),
      );
    }, 80);
  };

  /**
   * 处理主进程原生设备事件
   */
  private handleNativeDeviceEvent(event: {
    type: "Disconnected" | "Connected";
    deviceId?: string;
  }) {
    if (!event || !event.type) return;
    if (event.type === "Disconnected") {
      this.onDeviceDisconnected(event.deviceId);
    } else {
      this.onDeviceConnected(event.deviceId);
    }
  }

  /**
   * 设备变化的实际处理
   */
  private async processDeviceChange() {
    const currentIds = await this.refreshDeviceSnapshot();
    const prevIds = this.prevOutputDeviceIds;

    // 找出消失的设备
    const removedIds: string[] = [];
    for (const id of prevIds) {
      if (!currentIds.has(id)) removedIds.push(id);
    }

    // 找出新增的设备
    const addedIds: string[] = [];
    for (const id of currentIds) {
      if (!prevIds.has(id)) addedIds.push(id);
    }

    this.prevOutputDeviceIds = currentIds;

    // 仅当曾经有设备被记录过才认为是拔插事件，避免初次加载时误判
    if (prevIds.size > 0) {
      if (removedIds.length > 0) {
        this.onDeviceDisconnected(removedIds[0]);
      } else if (addedIds.length > 0) {
        this.onDeviceConnected(addedIds[0]);
      }
    }
  }

  /**
   * 设备断开（耳机拔出）处理
   */
  private onDeviceDisconnected(_deviceId?: string) {
    const statusStore = useStatusStore();
    // 仅在用户原本正在播放时记录恢复标志
    this.wasPlayingBeforeUnplug = !!statusStore.playStatus;

    if (this.wasPlayingBeforeUnplug) {
      this.dispatchPause();
    }
  }

  /**
   * 设备恢复（耳机插回）处理
   */
  private onDeviceConnected(_deviceId?: string) {
    if (!this.wasPlayingBeforeUnplug) return;
    this.wasPlayingBeforeUnplug = false;
    this.dispatchPlay();
  }

  /**
   * 触发暂停：通过动态导入避免循环依赖
   */
  private dispatchPause() {
    import("./PlayerController")
      .then(({ usePlayerController }) => {
        try {
          usePlayerController().pause();
        } catch (e) {
          console.warn("[AudioDeviceWatcher] 自动暂停失败:", e);
        }
      })
      .catch((e) => console.warn("[AudioDeviceWatcher] 加载 PlayerController 失败:", e));
  }

  /**
   * 触发恢复播放
   */
  private dispatchPlay() {
    import("./PlayerController")
      .then(({ usePlayerController }) => {
        try {
          usePlayerController().play();
        } catch (e) {
          console.warn("[AudioDeviceWatcher] 自动恢复失败:", e);
        }
      })
      .catch((e) => console.warn("[AudioDeviceWatcher] 加载 PlayerController 失败:", e));
  }

  /**
   * 停止监听
   */
  public stop() {
    if (typeof navigator !== "undefined" && navigator.mediaDevices) {
      navigator.mediaDevices.removeEventListener("devicechange", this.handleDeviceChange);
    }
    if (isElectron && window.electron?.ipcRenderer && this.nativeListenerRegistered) {
      try {
        window.electron.ipcRenderer.removeAllListeners("audio-device-change");
      } catch {
        // 忽略
      }
      this.nativeListenerRegistered = false;
    }
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
    }
    if (this.statusWatcher) {
      this.statusWatcher();
      this.statusWatcher = null;
    }
    this.initialized = false;
  }
}

export const audioDeviceWatcher = new AudioDeviceWatcher();
export default audioDeviceWatcher;
