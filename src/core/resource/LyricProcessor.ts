import { songLyricTTML } from "@/api/song";
import { qqMusicMatch } from "@/api/qqmusic";
import { getConverter } from "@/utils/opencc";
import {
  lyricLinesToTTML,
  parseQRCLyric,
  parseSmartLrc,
  alignLyrics,
} from "@/utils/lyric/lyricParser";
import { generateASS } from "@/utils/assGenerator";
import { parseTTML, parseYrc, type LyricLine } from "@applemusic-like-lyrics/lyric";
import type { SongType } from "@/types/main";

// 定义歌词处理需要的配置接口，避免直接依赖 Store
export interface LyricProcessorOptions {
  downloadLyricToTraditional?: boolean;
  downloadLyricTranslation?: boolean;
  downloadLyricRomaji?: boolean;
  downloadLyricEncoding?: string;
}

export interface LyricResult {
  lrc?: { lyric: string };
  tlyric?: { lyric: string };
  romalrc?: { lyric: string };
  yrc?: { lyric: string };
  ttml?: { lyric: string };
}

// 纯函数式的歌词处理工具
export const LyricProcessor = {
  /**
   * 处理基础歌词 (LRC)
   */
  async processBasic(
    lyricResult: LyricResult | null,
    options: LyricProcessorOptions = {}
  ): Promise<string> {
    if (!lyricResult) return "";
    const lrc = lyricResult.lrc?.lyric || "";
    return await this.convertToTraditionalIfNeeded(lrc, options.downloadLyricToTraditional);
  },

  /**
   * 获取逐字歌词 (TTML/YRC)
   */
  async fetchVerbatim(
    song: SongType,
    initialLyricResult: LyricResult | null
  ): Promise<{ ttml: string; yrc: string }> {
    let ttmlLyric = "";
    let yrcLyric = "";

    try {
      const ttmlRes = await songLyricTTML(song.id);
      if (typeof ttmlRes === "string") ttmlLyric = ttmlRes;

      if (!ttmlLyric) {
        yrcLyric = initialLyricResult?.yrc?.lyric || "";

        // 尝试 QQ 音乐匹配兜底
        if (!yrcLyric) {
          try {
            const artistsStr = Array.isArray(song.artists)
              ? song.artists.map((a) => a.name).join("/")
              : String(song.artists || "");
            const keyword = `${song.name}-${artistsStr}`;
            const qmResult = await qqMusicMatch(keyword);

            if (qmResult?.code === 200 && qmResult?.qrc) {
              const parsedLines = parseQRCLyric(qmResult.qrc, qmResult.trans, qmResult.roma);
              if (parsedLines.length > 0) {
                ttmlLyric = lyricLinesToTTML(parsedLines);
              } else {
                yrcLyric = qmResult.qrc;
              }
            }
          } catch (e) {
            console.error("[Download] QM Fallback failed", e);
          }
        }
      }
    } catch (e) {
      console.error("[Download] Error fetching verbatim lyrics:", e);
    }
    return { ttml: ttmlLyric, yrc: yrcLyric };
  },

  /**
   * 繁简转换工具函数
   */
  async convertToTraditionalIfNeeded(content: string, enable: boolean = false): Promise<string> {
    if (!content) return "";
    if (enable) {
      try {
        const converter = await getConverter("s2t");
        return converter(content);
      } catch (e) {
        console.error("繁简转换失败", e);
      }
    }
    return content;
  },

  /**
   * 保存逐字歌词文件
   */
  async saveVerbatimFile(
    ttml: string,
    yrc: string,
    lyricResult: LyricResult | null,
    fileName: string,
    path: string,
    options: LyricProcessorOptions = {}
  ) {
    let content = ttml || yrc;
    let merged = false;
    let lines: LyricLine[] = [];

    if (content) {
      if (yrc && !ttml) {
        // 优先使用 TTML，若无则解析 YRC
        if (yrc.trim().startsWith("<") || yrc.includes("<QrcInfos>")) {
          lines = parseQRCLyric(yrc);
        } else {
          lines = parseYrc(yrc) || [];
        }
      }

      if (lines.length > 0) {
        const tlyric = options.downloadLyricTranslation ? lyricResult?.tlyric?.lyric : null;
        const romalrc = options.downloadLyricRomaji ? lyricResult?.romalrc?.lyric : null;

        if (tlyric) {
          const transParsed = parseSmartLrc(tlyric);
          if (transParsed?.lines?.length) {
            lines = alignLyrics(lines, transParsed.lines, "translatedLyric");
            merged = true;
          }
        }
        if (romalrc) {
          const romaParsed = parseSmartLrc(romalrc);
          if (romaParsed?.lines?.length) {
            lines = alignLyrics(lines, romaParsed.lines, "romanLyric");
            merged = true;
          }
        }

        if ((merged || yrc) && lines.length > 0) {
          content = lyricLinesToTTML(lines);
        }
      }

      content = await this.convertToTraditionalIfNeeded(content, options.downloadLyricToTraditional);
      const ext = ttml || lines.length > 0 ? "ttml" : "yrc";
      const encoding = options.downloadLyricEncoding || "utf-8";

      if (ext === "ttml" && encoding !== "utf-8") {
        content = content.replace('encoding="utf-8"', `encoding="${encoding}"`);
        content = content.replace('encoding="UTF-8"', `encoding="${encoding}"`);
      }

      // 注意：这里仍然依赖 window.electron，因为它是环境能力，不是状态依赖
      // 如果要进一步解耦，可以将 saveFile 方法注入进来
      if (window.electron?.ipcRenderer) {
        await window.electron.ipcRenderer.invoke("save-file", {
          path: `${path}\\${fileName}.${ext}`,
          content,
          encoding,
        });
      }
    }
  },

  /**
   * 保存 ASS 字幕文件
   */
  async saveAssFile(
    ttml: string,
    yrc: string,
    lyricResult: LyricResult | null,
    fileName: string,
    path: string,
    title: string,
    artist: string,
    options: LyricProcessorOptions = {}
  ) {
    let lines: LyricLine[] = [];

    if (ttml) {
      const parsed = parseTTML(ttml);
      if (parsed?.lines) lines = parsed.lines;
    } else if (yrc) {
      if (yrc.trim().startsWith("<")) lines = parseQRCLyric(yrc);
      else lines = parseYrc(yrc) || [];
    } else if (lyricResult?.lrc?.lyric) {
      const parsed = parseSmartLrc(lyricResult.lrc.lyric);
      if (parsed?.lines) lines = parsed.lines;
    }

    if (lines.length > 0) {
      const tlyric = options.downloadLyricTranslation ? lyricResult?.tlyric?.lyric : null;
      if (tlyric) {
        const transParsed = parseSmartLrc(tlyric);
        if (transParsed?.lines?.length)
          lines = alignLyrics(lines, transParsed.lines, "translatedLyric");
      }

      const assContent = generateASS(lines, { title, artist });
      const encoding = options.downloadLyricEncoding || "utf-8";

      if (window.electron?.ipcRenderer) {
        await window.electron.ipcRenderer.invoke("save-file", {
          path: `${path}\\${fileName}.ass`,
          content: assContent,
          encoding,
        });
      }
    }
  },
};
