import { MessageApi, DialogApi, NotificationApi, LoadingBarApi, ModalApi } from "naive-ui";

import type {
  MetadataParam,
  PlayStatePayload,
  TimelinePayload,
  PlayModePayload,
  SmtcEvent,
} from "@native";
import { DiscordDisplayMode } from "./smtc";

export interface DiscordConfigPayload {
  showWhenPaused: boolean;
  displayMode: DiscordDisplayMode;
}

export interface DiscordMetadataParam {
  songName: string;
  authorName: string;
  albumName: string;
  originalCoverUrl?: string;
  duration?: number;
  ncmId?: number;
}

export interface DiscordPlayStateParam {
  status: 0 | 1; // 0: Playing, 1: Paused
}

export interface DiscordTimelineParam {
  currentTime: number;
  totalTime: number;
}

export interface IpcChannelMap {
  "smtc-update-metadata": MetadataParam;
  "smtc-update-play-state": PlayStatePayload;
  "smtc-update-timeline": TimelinePayload;
  "smtc-update-play-mode": PlayModePayload;
  "smtc-enable-discord": void;
  "smtc-disable-discord": void;
  "smtc-update-discord-config": DiscordConfigPayload;
  "discord-update-metadata": DiscordMetadataParam;
  "discord-update-play-state": DiscordPlayStateParam;
  "discord-update-timeline": DiscordTimelineParam;
}

declare global {
  interface Window {
    // naiveui
    $message: MessageApi;
    $dialog: DialogApi;
    $notification: NotificationApi;
    $loadingBar: LoadingBarApi;
    $modal: ModalApi;
    // electron
    api: {
      store: {
        get: (key: string) => Promise<any>;
        set: (key: string, value: unknown) => Promise<boolean>;
        has: (key: string) => Promise<boolean>;
        delete: (key: string) => Promise<boolean>;
        reset: (keys?: string[]) => Promise<boolean>;
        export: (data: any) => Promise<boolean>;
        import: () => Promise<any>;
      };
    };
    electron: {
      ipcRenderer: {
        send<K extends keyof IpcChannelMap>(channel: K, payload: IpcChannelMap[K]): void;

        on(
          channel: "smtc-event",
          listener: (event: Electron.IpcRendererEvent, payload: SmtcEvent) => void,
        ): void;

        // TODO: 这些类型定义不怎么安全
        send(channel: string, ...args: any[]): void;
        on(
          channel: string,
          listener: (event: Electron.IpcRendererEvent, ...args: any[]) => void,
        ): void;
        once(
          channel: string,
          listener: (event: Electron.IpcRendererEvent, ...args: any[]) => void,
        ): void;
        invoke(channel: string, ...args: any[]): Promise<any>;
        removeAllListeners(channel: string): void;
        sendSync(channel: string, ...args: any[]): any;
      };
    };
  }
}
