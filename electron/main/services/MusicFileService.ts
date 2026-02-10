import FastGlob from "fast-glob";
import type { Options as GlobOptions } from "fast-glob/out/settings";
import { parseFile } from "music-metadata";
import { access, readdir, readFile, stat } from "node:fs/promises";
import { basename, dirname, extname, join, resolve } from "node:path";
import pLimit from "p-limit";
import { ipcLog } from "../logger";
import { getFileID, getFileMD5, metaDataLyricsArrayToLrc } from "../utils/helper";
import { loadNativeModule } from "../utils/native-loader";
import type { SongMetadata } from "@native/tools";

type toolModule = typeof import("@native/tools");
const tools: toolModule = loadNativeModule("tools.node", "tools");

export class MusicFileService {
  private globOpt(cwd?: string): GlobOptions {
    return {
      cwd,
      caseSensitiveMatch: false,
    };
  }

  async getMusicFiles(dirPath: string): Promise<any[]> {
    try {
      if (!dirPath || dirPath.trim() === "") {
        ipcLog.warn("⚠️ Empty directory path provided, skipping");
        return [];
      }
      const filePath = resolve(dirPath).replace(/\\/g, "/");
      try {
        await access(filePath);
      } catch {
        ipcLog.warn(`⚠️ Directory not accessible: ${filePath}`);
        return [];
      }
      console.info(`📂 Fetching music files from: ${filePath}`);
      const musicExtensions = [
        "mp3",
        "wav",
        "flac",
        "aac",
        "webm",
        "m4a",
        "ogg",
        "aiff",
        "aif",
        "aifc",
      ];
      const musicFiles = await FastGlob(
        `**/*.{${musicExtensions.join(",")}}`,
        this.globOpt(filePath),
      );

      const limit = pLimit(10);
      const results: any[] = [];
      const BATCH_SIZE = 500; // Batch processing to avoid creating too many Promises at once

      for (let i = 0; i < musicFiles.length; i += BATCH_SIZE) {
        const batch = musicFiles.slice(i, i + BATCH_SIZE);
        const batchPromises = batch.map((file) =>
          limit(async () => {
            const fullPath = join(dirPath, file);
            try {
              const { common, format } = await parseFile(fullPath, { skipCovers: true });
              const fileStat = await stat(fullPath);
              const ext = extname(fullPath);

              return {
                id: getFileID(fullPath),
                name: common.title || basename(fullPath, ext),
                artists: common.artists?.[0] || common.artist,
                album: common.album || "",
                alia: common.comment?.[0]?.text || "",
                duration: (format?.duration ?? 0) * 1000,
                size: fileStat.size, // Return bytes, let frontend format it
                path: fullPath,
                quality: format.bitrate ?? 0,
                createTime: fileStat.birthtime.getTime(),
                replayGain: {
                  trackGain: common.replaygain_track_gain?.ratio,
                  trackPeak: common.replaygain_track_peak?.ratio,
                  albumGain: common.replaygain_album_gain?.ratio,
                  albumPeak: common.replaygain_album_peak?.ratio,
                },
              };
            } catch (err) {
              ipcLog.warn(`⚠️ Failed to parse file: ${fullPath}`, err);
              return null;
            }
          }),
        );
        const batchResults = await Promise.all(batchPromises);
        results.push(...batchResults);
      }

      return results
        .filter((item): item is NonNullable<typeof item> => item !== null)
        .sort((a, b) => b.createTime - a.createTime);
    } catch (error) {
      ipcLog.error("❌ Error fetching music metadata:", error);
      return [];
    }
  }

  async getMusicMetadata(path: string): Promise<any> {
    try {
      const filePath = resolve(path).replace(/\\/g, "/");
      const { common, format } = await parseFile(filePath);
      const fileStat = await stat(filePath);
      return {
        fileName: basename(filePath),
        fileSize: fileStat.size, // Return bytes
        common,
        lyric:
          metaDataLyricsArrayToLrc(common?.lyrics?.[0]?.syncText || []) ||
          common?.lyrics?.[0]?.text ||
          "",
        format,
        md5: await getFileMD5(filePath),
        replayGain: {
          trackGain: common.replaygain_track_gain?.ratio,
          trackPeak: common.replaygain_track_peak?.ratio,
          albumGain: common.replaygain_album_gain?.ratio,
          albumPeak: common.replaygain_album_peak?.ratio,
        },
      };
    } catch (error) {
      ipcLog.error("❌ Error fetching music metadata:", error);
      throw error;
    }
  }

  async setMusicMetadata(path: string, metadata: any): Promise<boolean> {
    try {
      const {
        name,
        artist,
        album,
        alia,
        lyric,
        cover,
        albumArtist,
        genre,
        year,
        trackNumber,
        discNumber,
      } = metadata;
      const songPath = resolve(path);
      const coverPath = cover ? resolve(cover) : undefined;

      const meta: SongMetadata = {
        title: name || "未知曲目",
        artist: artist || "未知艺术家",
        album: album || "未知专辑",
        lyric: lyric || "",
        description: alia || "",
        albumArtist: albumArtist,
        genre: genre,
        year: year,
        trackNumber: trackNumber,
        discNumber: discNumber,
      };

      if (!tools) {
        throw new Error("Native tools not loaded");
      }

      await tools.writeMusicMetadata(songPath, meta, coverPath);
      return true;
    } catch (error) {
      ipcLog.error("❌ Error setting music metadata:", error);
      throw error;
    }
  }

  async getMusicLyric(musicPath: string): Promise<{
    lyric: string;
    format: "lrc" | "ttml" | "yrc";
    external?: { lyric: string; format: "lrc" | "ttml" | "yrc" };
    embedded?: { lyric: string; format: "lrc" };
  }> {
    try {
      const absPath = resolve(musicPath);
      const dir = dirname(absPath);
      const ext = extname(absPath);
      const baseName = basename(absPath, ext);

      let files: string[] = [];
      try {
        files = await readdir(dir);
      } catch (error) {
        ipcLog.error("❌ Failed to read directory:", dir);
        throw error;
      }

      let external: { lyric: string; format: "lrc" | "ttml" | "yrc" } | undefined;
      let embedded: { lyric: string; format: "lrc" } | undefined;

      // Optimized search for external lyrics
      const targetNameLower = baseName.toLowerCase();
      const lyricFiles = files.filter((file) => {
        const fileLower = file.toLowerCase();
        return (
          fileLower === `${targetNameLower}.ttml` ||
          fileLower === `${targetNameLower}.yrc` ||
          fileLower === `${targetNameLower}.lrc`
        );
      });

      // Priority: ttml > yrc > lrc
      const formatPriority = ["ttml", "yrc", "lrc"];

      for (const format of formatPriority) {
        const matchedFileName = lyricFiles.find((file) =>
          file.toLowerCase().endsWith(`.${format}`),
        );
        if (matchedFileName) {
          try {
            const lyricPath = join(dir, matchedFileName);
            const lyric = await readFile(lyricPath, "utf-8");
            if (lyric && lyric.trim() !== "") {
              ipcLog.info(`✅ Local lyric found (${format}): ${lyricPath}`);
              external = { lyric, format: format as "lrc" | "ttml" | "yrc" };
              break;
            }
          } catch {
            // Read failed, try next
          }
        }
      }

      try {
        const { common } = await parseFile(absPath);
        const syncedLyric = common?.lyrics?.[0]?.syncText;
        if (syncedLyric && syncedLyric.length > 0) {
          embedded = {
            lyric: metaDataLyricsArrayToLrc(syncedLyric),
            format: "lrc",
          };
        } else if (common?.lyrics?.[0]?.text) {
          embedded = {
            lyric: common?.lyrics?.[0]?.text,
            format: "lrc",
          };
        }
      } catch (e) {
        ipcLog.warn(`⚠️ Failed to parse metadata for lyrics: ${absPath}`, e);
      }

      const main = external || embedded || { lyric: "", format: "lrc" as const };
      return {
        ...main,
        external,
        embedded,
      };
    } catch (error) {
      ipcLog.error("❌ Error fetching music lyric:", error);
      throw error;
    }
  }

  async getMusicCover(path: string): Promise<{ data: Buffer; format: string } | null> {
    try {
      const { common } = await parseFile(path);
      const picture = common.picture?.[0];
      if (picture) {
        return { data: Buffer.from(picture.data), format: picture.format };
      } else {
        const coverFilePath = path.replace(/\.[^.]+$/, ".jpg");
        try {
          await access(coverFilePath);
          const coverData = await readFile(coverFilePath);
          return { data: coverData, format: "image/jpeg" };
        } catch {
          return null;
        }
      }
    } catch (error) {
      console.error("❌ Error fetching music cover:", error);
      throw error;
    }
  }

  async readLocalLyric(lyricDirs: string[], id: number): Promise<{ lrc: string; ttml: string }> {
    const result = { lrc: "", ttml: "" };
    try {
      const patterns = {
        ttml: `**/{,*.}${id}.ttml`,
        lrc: `**/{,*.}${id}.lrc`,
      };

      for (const dir of lyricDirs) {
        try {
          if (!result.ttml) {
            const ttmlFiles = await FastGlob(patterns.ttml, this.globOpt(dir));
            if (ttmlFiles.length > 0) {
              const filePath = join(dir, ttmlFiles[0]);
              await access(filePath);
              result.ttml = await readFile(filePath, "utf-8");
            }
          }

          if (!result.lrc) {
            const lrcFiles = await FastGlob(patterns.lrc, this.globOpt(dir));
            if (lrcFiles.length > 0) {
              const filePath = join(dir, lrcFiles[0]);
              await access(filePath);
              result.lrc = await readFile(filePath, "utf-8");
            }
          }

          if (result.ttml && result.lrc) break;
        } catch {
          // Ignore error
        }
      }
    } catch {
      // Ignore error
    }
    return result;
  }
}
