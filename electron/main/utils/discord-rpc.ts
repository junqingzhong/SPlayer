import { Client } from "discord-rpc";
import { processLog } from "../logger";

// 扩展 discord-rpc Client 类型定义
interface ExtendedClient extends Client {
    request(cmd: string, args: unknown): Promise<unknown>;
}

const APP_ID = "1454403710162698293";
const SP_ICON_ASSET_KEY = "logo-icon";
const RECONNECT_COOLDOWN_SECONDS = 5;

export enum DiscordDisplayMode {
    Name = "name",
    State = "state",
    Details = "details",
}

/** Discord RPC 配置接口 */
interface DiscordConfig {
    /** 暂停时是否显示 */
    showWhenPaused: boolean;
    /** 显示模式 */
    displayMode: DiscordDisplayMode;
}

/** 媒体元数据接口 */
interface MetadataParam {
    /** 歌曲名称 */
    songName: string;
    /** 歌手名称 */
    authorName: string;
    /** 专辑名称 */
    albumName: string;
    /** 原始封面 URL */
    originalCoverUrl?: string;
    /** 网易云音乐 ID */
    ncmId?: number;
    /** 歌曲时长 (ms) */
    duration?: number;
}

/** 时间轴接口 */
interface TimelineParam {
    /** 当前播放时间 (ms) */
    currentTime: number;
    /** 总时长 (ms) */
    totalTime: number;
}

/** Discord Activity 接口 (包含 type 字段) */
interface DiscordActivity {
    details?: string;
    state?: string;
    assets?: {
        large_image?: string;
        large_text?: string;
        small_image?: string;
        small_text?: string;
    };
    timestamps?: {
        start?: number;
        end?: number;
    };
    buttons?: Array<{ label: string; url: string }>;
    instance?: boolean;
    /** 活动类型: 0 = Playing, 2 = Listening */
    type?: number;
}

class DiscordRpcManager {
    private client: Client | null = null;
    private isEnabled = false;
    private reconnectTimeout: NodeJS.Timeout | null = null;

    private config: DiscordConfig = {
        showWhenPaused: false,
        displayMode: DiscordDisplayMode.Details,
    };

    private currentMetadata: MetadataParam | null = null;
    private currentStatus: "playing" | "paused" = "paused";
    private currentTimeline: TimelineParam = { currentTime: 0, totalTime: 0 };

    constructor() { }

    /**
     * 启用 Discord RPC
     */
    public enable() {
        if (this.isEnabled) return;
        this.isEnabled = true;
        processLog.info("[Discord RPC] Enabled");
        this.connect();
    }

    /**
     * 禁用 Discord RPC
     */
    public disable() {
        if (!this.isEnabled) return;
        this.isEnabled = false;
        processLog.info("[Discord RPC] Disabled");
        this.disconnect();
    }

    /**
     * 更新 Discord RPC 配置
     * @param config 部分配置对象
     */
    public updateConfig(config: Partial<DiscordConfig>) {
        this.config = { ...this.config, ...config };
        processLog.info(`[Discord RPC] Config updated: ${JSON.stringify(this.config)}`);
        this.updateActivity();
    }

    /**
     * 更新当前媒体元数据
     * @param metadata 元数据对象
     */
    public updateMetadata(metadata: MetadataParam) {
        this.currentMetadata = metadata;
        this.updateActivity();
    }

    /**
     * 更新当前播放状态
     * @param status "playing" (播放中) 或 "paused" (暂停)
     */
    public updatePlayState(status: "playing" | "paused") {
        this.currentStatus = status;
        this.updateActivity();
    }

    /**
     * 更新当前时间轴 (进度)
     * @param timeline 时间轴对象
     */
    public updateTimeline(timeline: TimelineParam) {
        this.currentTimeline = timeline;
        // 仅在播放时更新，以避免过多的更新
        if (this.currentStatus === "playing") {
            this.updateActivity();
        }
    }

    /**
     * 连接到 Discord RPC
     */
    private async connect() {
        if (this.client || !this.isEnabled) return;

        try {
            const client = new Client({ transport: "ipc" });

            client.on("ready", () => {
                processLog.info(`[Discord RPC] Connected as ${client.user?.username}`);
                this.client = client;
                this.updateActivity();
            });

            client.on("disconnected", () => {
                processLog.warn("[Discord RPC] Disconnected");
                this.client = null;
                this.scheduleReconnect();
            });

            await client.login({ clientId: APP_ID });
        } catch (e) {
            processLog.warn(`[Discord RPC] Connection failed: ${e}`);
            this.client = null;
            this.scheduleReconnect();
        }
    }

    /**
     * 断开 Discord RPC 连接
     */
    private disconnect() {
        if (this.reconnectTimeout) {
            clearTimeout(this.reconnectTimeout);
            this.reconnectTimeout = null;
        }
        if (this.client) {
            this.client.destroy();
            this.client = null;
        }
    }

    /**
     * 安排重新连接
     */
    private scheduleReconnect() {
        if (!this.isEnabled || this.reconnectTimeout) return;
        this.reconnectTimeout = setTimeout(() => {
            this.reconnectTimeout = null;
            this.connect();
        }, RECONNECT_COOLDOWN_SECONDS * 1000);
    }

    /**
     * 更新 Discord 活动状态
     */
    private updateActivity() {
        if (!this.client || !this.currentMetadata) return;

        const { songName, authorName, albumName, originalCoverUrl, ncmId, duration } = this.currentMetadata;

        if (this.currentStatus === "paused" && !this.config.showWhenPaused) {
            this.client.clearActivity();
            return;
        }

        const largeImageKey = this.processCoverUrl(originalCoverUrl);
        const smallImageKey = SP_ICON_ASSET_KEY;
        const smallImageText = this.currentStatus === "playing" ? "Playing" : "Paused";

        let details = songName;
        let state = authorName;

        switch (this.config.displayMode) {
            case DiscordDisplayMode.Name:
                details = songName;
                state = authorName;
                break;
            case DiscordDisplayMode.State:
                details = this.currentStatus === "playing" ? "Playing" : "Paused";
                state = `${songName} - ${authorName}`;
                break;
            case DiscordDisplayMode.Details:
                details = songName;
                state = `${authorName} | ${albumName}`;
                break;
        }

        let startTimestamp: number | undefined;
        let endTimestamp: number | undefined;

        const now = Date.now();

        if (this.currentStatus === "playing" && duration) {
            const remaining = (duration - this.currentTimeline.currentTime);
            endTimestamp = Math.floor((now + remaining) / 1000);
            startTimestamp = Math.floor((now - this.currentTimeline.currentTime) / 1000);
        } else if (this.currentStatus === "paused" && duration) {
            // 来自 https://musicpresence.app/ 的 hack，通过将
            // 开始和结束时间戳向后平移一年以实现在暂停时进度静止的效果
            const ONE_YEAR_MS = 365 * 24 * 60 * 60 * 1000;
            const currentProgressMs = this.currentTimeline.currentTime;

            // 计算未来的开始时间
            const futureStart = (now - currentProgressMs) + ONE_YEAR_MS;
            const futureEnd = futureStart + duration;

            startTimestamp = Math.floor(futureStart / 1000);
            endTimestamp = Math.floor(futureEnd / 1000);
        }

        // 手动构建 activity 对象以包含被 client.setActivity 忽略的 'type' 字段
        // Rust 代码中使用 ActivityType::Listening (2)
        const activity: DiscordActivity = {
            details,
            state,
            assets: {
                large_image: largeImageKey,
                large_text: albumName,
                small_image: smallImageKey,
                small_text: smallImageText,
            },
            instance: false,
            type: 2, // Listening
        };

        if (startTimestamp && endTimestamp) {
            activity.timestamps = {
                start: startTimestamp,
                end: endTimestamp,
            };
        }

        // Buttons
        const songUrl = this.processSongUrl(ncmId);
        if (songUrl) {
            activity.buttons = [{ label: "🎧 Listen", url: songUrl }];
        }

        // 使用内部 request 方法绕过验证/剥离
        // 使用内部 request 方法绕过验证/剥离
        (this.client as ExtendedClient).request('SET_ACTIVITY', {
            pid: process.pid,
            activity,
        }).catch((e: unknown) => {
            processLog.warn(`[Discord RPC] Failed to set activity: ${e}`);
        });
    }

    /**
     * 处理封面 URL
     * @param url 原始封面 URL
     * @returns 处理后的 URL 或默认图标 key
     */
    private processCoverUrl(url?: string): string {
        if (!url) return SP_ICON_ASSET_KEY;

        // 如果不是 http/https URL (例如 file:// 或本地路径)，Discord 无法显示。
        // 返回默认图标。
        if (!url.startsWith("http")) {
            return SP_ICON_ASSET_KEY;
        }

        // Discord needs https
        let processed = url.replace("http://", "https://");
        // 移除查询参数
        processed = processed.split('?')[0];
        // 如果是网易云音乐 URL，添加调整大小参数 (可选优化)
        if (processed.includes("music.126.net")) {
            return `${processed}?imageView&enlarge=1&type=jpeg&quality=90&thumbnail=150y150`;
        }
        return processed;
    }

    /**
     * 处理歌曲 URL
     * @param ncmId 网易云音乐 ID
     * @returns 歌曲链接
     */
    private processSongUrl(ncmId?: number): string | null {
        if (!ncmId) return "https://music.163.com/";
        return `https://music.163.com/song?id=${ncmId}`;
    }
}

export const discordRpcManager = new DiscordRpcManager();
