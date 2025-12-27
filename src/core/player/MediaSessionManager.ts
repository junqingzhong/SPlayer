import axios from "axios";
import { useMusicStore, useSettingStore } from "@/stores";
import { getPlaySongData } from "@/utils/format";
import { isElectron, isWin } from "@/utils/env";
import { msToS } from "@/utils/time";
import { type SmtcEvent } from "@native";
import { usePlayerController } from "./PlayerController";
import { SmtcEventType, PlaybackStatus } from "@/types/smtc";
import { sendSmtcMetadata, sendSmtcTimeline, sendSmtcPlayState } from "./PlayerIpc";

/**
 * 媒体会话管理器，负责控制媒体控件相关功能
 *
 * 在 Windows 上，会使用原生插件来直接与 SMTC 交互以提供更多功能，在其他平台会使用 `navigator.mediaSession`
 */
class MediaSessionManager {
  /**
   * 初始化 MediaSession
   */
  public init() {
    const settingStore = useSettingStore();
    if (!settingStore.smtcOpen) return;

    const player = usePlayerController();

    if (isElectron && isWin) {
      window.electron.ipcRenderer.removeAllListeners("smtc-event");

      window.electron.ipcRenderer.on("smtc-event", (_, event: SmtcEvent) => {
        switch (event.type) {
          case SmtcEventType.Play:
            player.play();
            break;
          case SmtcEventType.Pause:
            // 乐观更新以避免淡出延迟
            sendSmtcPlayState(PlaybackStatus.Paused);
            player.pause();
            break;
          case SmtcEventType.NextSong:
            player.nextOrPrev("next");
            break;
          case SmtcEventType.PreviousSong:
            player.nextOrPrev("prev");
            break;
          case SmtcEventType.Stop:
            player.pause();
            break;
          case SmtcEventType.Seek:
            if (event.positionMs !== undefined) {
              player.setSeek(event.positionMs);
            }
            break;
          case SmtcEventType.ToggleShuffle:
            player.handleSmtcShuffle();
            break;
          case SmtcEventType.ToggleRepeat:
            player.handleSmtcRepeat();
            break;
        }
      });

      player.syncSmtcPlayMode();
      return;
    }

    if ("mediaSession" in navigator) {
      const nav = navigator.mediaSession;
      nav.setActionHandler("play", () => player.play());
      nav.setActionHandler("pause", () => player.pause());
      nav.setActionHandler("previoustrack", () => player.nextOrPrev("prev"));
      nav.setActionHandler("nexttrack", () => player.nextOrPrev("next"));
      nav.setActionHandler("seekto", (e) => {
        if (e.seekTime) player.setSeek(e.seekTime * 1000);
      });
    }
  }

  /**
   * 更新元数据
   */
  public async updateMetadata() {
    if (!("mediaSession" in navigator)) return;
    const musicStore = useMusicStore();

    // 获取播放数据
    const song = getPlaySongData();
    if (!song) return;

    const isRadio = song.type === "radio";
    const title = song.name;
    const artist = isRadio
      ? "播客电台"
      : Array.isArray(song.artists)
        ? song.artists.map((a) => a.name).join("/")
        : String(song.artists);
    const album = isRadio
      ? "播客电台"
      : typeof song.album === "object"
        ? song.album.name
        : String(song.album);
    const coverUrl = musicStore.getSongCover("xl") || musicStore.playSong.cover || "";

    // 更新元数据
    if (isElectron && isWin) {
      try {
        let coverBuffer: Uint8Array | undefined;

        if (coverUrl && coverUrl.startsWith("http")) {
          const resp = await axios.get(coverUrl, { responseType: "arraybuffer" });
          coverBuffer = new Uint8Array(resp.data);
        }

        sendSmtcMetadata({
          songName: title,
          authorName: artist,
          albumName: album,
          coverData: coverBuffer as Buffer, // Electron 会帮我们处理转换的
          originalCoverUrl: coverUrl.startsWith("http") ? coverUrl : undefined, // Discord 需要 URL
          duration: song.duration,
          ncmId: song.id, // 上传到 SMTC 的流派字段以便其他应用可以通过 ID 精确检测当前播放的歌曲，不过可能意义不大
        });
      } catch (e) {
        console.error("[SMTC] 更新元数据失败", e);
      }
      return;
    }

    if ("mediaSession" in navigator) {
      navigator.mediaSession.metadata = new window.MediaMetadata({
        title,
        artist,
        album,
        artwork: [
          {
            src: musicStore.getSongCover("s") || musicStore.playSong.cover || "",
            sizes: "100x100",
            type: "image/jpeg",
          },
          {
            src: musicStore.getSongCover("m") || musicStore.playSong.cover || "",
            sizes: "300x300",
            type: "image/jpeg",
          },
          {
            src: musicStore.getSongCover("cover") || musicStore.playSong.cover || "",
            sizes: "512x512",
            type: "image/jpeg",
          },
          {
            src: musicStore.getSongCover("l") || musicStore.playSong.cover || "",
            sizes: "1024x1024",
            type: "image/jpeg",
          },
          {
            src: musicStore.getSongCover("xl") || musicStore.playSong.cover || "",
            sizes: "1920x1920",
            type: "image/jpeg",
          },
        ],
      });
    }
  }

  /**
   * 更新状态
   * @param duration 总时长 (ms)
   * @param position 当前进度 (ms)
   */
  public updateState(duration: number, position: number) {
    const settingStore = useSettingStore();
    if (!settingStore.smtcOpen) return;

    if (isElectron && isWin) {
      sendSmtcTimeline(position, duration);
      return;
    }

    if ("mediaSession" in navigator) {
      navigator.mediaSession.setPositionState({
        duration: msToS(duration),
        position: msToS(position),
      });
    }
  }
}

/**
 * @see {@link MediaSessionManager}
 */
export const mediaSessionManager = new MediaSessionManager();
