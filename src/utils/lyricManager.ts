import { useStatusStore, useMusicStore, useSettingStore } from "@/stores";
import { songLyric, songLyricTTML } from "@/api/song";
import { type SongLyric } from "@/types/lyric";
import { type LyricLine, parseLrc, parseTTML, parseYrc } from "@applemusic-like-lyrics/lyric";
import { isElectron } from "./env";
import { isEmpty } from "lodash-es";

// TODO: 实现歌词统一管理类
// 先区分是在线还是本地
// 然后检查本地歌词覆盖
// 如果本地没有覆盖，进行在线请求
// 然后处理并格式化
// 然后根据配置的歌词排除内容来处理
// 然后写入 store
class LyricManager {
  // Store
  private musicStore = useMusicStore();
  private statusStore = useStatusStore();
  private settingStore = useSettingStore();
  /**
   * 在线歌词请求序列
   * 每次发起新请求递增
   */
  private lyricReqSeq = 0;
  /**
   * 当前有效的请求序列
   * 用于校验返回是否属于当前歌曲的最新请求
   */
  private activeLyricReq = 0;
  /**
   * 重置当前歌曲的歌词数据
   * 包括清空歌词数据、重置歌词索引、关闭 TTMLL 歌词等
   */
  private resetSongLyric() {
    // 重置歌词数据
    this.musicStore.setSongLyric({}, true);
    this.statusStore.usingTTMLLyric = false;
    // 重置歌词索引
    this.statusStore.lyricIndex = -1;
  }
  /**
   * 歌词内容对齐
   * @param lyrics 歌词数据
   * @param otherLyrics 其他歌词数据
   * @param key 对齐类型
   * @returns 对齐后的歌词数据
   */
  private alignLyrics(
    lyrics: LyricLine[],
    otherLyrics: LyricLine[],
    key: "translatedLyric" | "romanLyric",
  ): LyricLine[] {
    const lyricsData = lyrics;
    if (lyricsData.length && otherLyrics.length) {
      lyricsData.forEach((v: LyricLine) => {
        otherLyrics.forEach((x: LyricLine) => {
          if (v.startTime === x.startTime || Math.abs(v.startTime - x.startTime) < 0.6) {
            v[key] = x.words.map((word) => word.word).join("");
          }
        });
      });
    }
    return lyricsData;
  }
  /**
   * 对齐本地歌词
   * @param lyrics 本地歌词数据
   * @param otherLyrics 其他歌词数据
   * @returns 对齐后的本地歌词数据
   */
  private alignLocalLyrics(lyricData: SongLyric): SongLyric {
    // 同一时间的两/三行分别作为主句、翻译、音译
    const toTime = (line: LyricLine) => Number(line?.startTime ?? line?.words?.[0]?.startTime ?? 0);
    // 取内容
    const toText = (line: LyricLine) => String(line?.words?.[0]?.word || "").trim();
    const lrc = lyricData.lrcData || [];
    if (!lrc.length) return lyricData;
    // 按开始时间分组，时间差 < 0.6s 视为同组
    const sorted = [...lrc].sort((a, b) => toTime(a) - toTime(b));
    const groups: LyricLine[][] = [];
    for (const line of sorted) {
      const st = toTime(line);
      const last = groups[groups.length - 1]?.[0];
      if (last && Math.abs(st - toTime(last)) < 0.6) groups[groups.length - 1].push(line);
      else groups.push([line]);
    }
    // 组装：第 1 行主句；第 2 行翻译；第 3 行音译；不调整时长
    const aligned = groups.map((group) => {
      const base = { ...group[0] } as LyricLine;
      const tran = group[1] ? toText(group[1]) : "";
      const roma = group[2] ? toText(group[2]) : "";
      if (!base.translatedLyric) base.translatedLyric = tran;
      if (!base.romanLyric) base.romanLyric = roma;
      return base;
    });
    return { lrcData: aligned, yrcData: lyricData.yrcData };
  }
  /**
   * 处理在线歌词
   * @param id 歌曲 ID
   * @returns 歌词数据
   */
  private async handleOnlineLyric(id: number): Promise<SongLyric> {
    const req = this.activeLyricReq;
    const settingStore = this.settingStore;
    // 请求是否成功
    let adopted = false;
    let result: SongLyric = { lrcData: [], yrcData: [] };
    // 过期判断
    const isStale = () => this.activeLyricReq !== req || this.musicStore.playSong?.id !== id;
    // 处理 TTML 歌词
    const adoptTTML = async () => {
      try {
        if (!settingStore.enableTTMLLyric) return;
        const ttmlContent = await songLyricTTML(id);
        if (isStale()) return;
        if (!ttmlContent || typeof ttmlContent !== "string") return;
        const parsed = parseTTML(ttmlContent);
        const lines = parsed?.lines || [];
        if (!lines.length) return;
        result = { lrcData: [], yrcData: lines };
        adopted = true;
      } catch {
        /* empty */
      }
    };
    // 处理 LRC 歌词
    const adoptLRC = async () => {
      try {
        const data = await songLyric(id);
        if (isStale()) return;
        if (!data || data.code !== 200) return;
        let lrcLines: LyricLine[] = [];
        let yrcLines: LyricLine[] = [];
        // 普通歌词
        if (data?.lrc?.lyric) {
          lrcLines = parseLrc(data.lrc.lyric) || [];
          // 普通歌词翻译
          if (data?.tlyric?.lyric)
            lrcLines = this.alignLyrics(lrcLines, parseLrc(data.tlyric.lyric), "translatedLyric");
          // 普通歌词音译
          if (data?.romalrc?.lyric)
            lrcLines = this.alignLyrics(lrcLines, parseLrc(data.romalrc.lyric), "romanLyric");
        }
        // 逐字歌词
        if (data?.yrc?.lyric) {
          yrcLines = parseYrc(data.yrc.lyric) || [];
          // 逐字歌词翻译
          if (data?.ytlrc?.lyric)
            yrcLines = this.alignLyrics(yrcLines, parseLrc(data.ytlrc.lyric), "translatedLyric");
          // 逐字歌词音译
          if (data?.yromalrc?.lyric)
            yrcLines = this.alignLyrics(yrcLines, parseLrc(data.yromalrc.lyric), "romanLyric");
        }
        if (adopted) return;
        result = { lrcData: lrcLines, yrcData: yrcLines };
        adopted = true;
      } catch {
        /* empty */
      }
    };
    // 统一判断与设置 TTML
    await Promise.allSettled([adoptTTML(), adoptLRC()]);
    this.statusStore.usingTTMLLyric = Boolean(
      settingStore.enableTTMLLyric && result.yrcData?.length && !result.lrcData?.length,
    );
    return result;
  }
  /**
   * 处理本地歌词
   * @param path 本地歌词路径
   * @returns 歌词数据
   */
  private async handleLocalLyric(path: string): Promise<SongLyric> {
    try {
      const { lyric, format }: { lyric?: string; format?: "lrc" | "ttml" } =
        await window.electron.ipcRenderer.invoke("get-music-lyric", path);
      if (!lyric) return { lrcData: [], yrcData: [] };
      // TTML 直接返回
      if (format === "ttml") {
        const ttml = parseTTML(lyric);
        const lines = ttml?.lines || [];
        this.statusStore.usingTTMLLyric = true;
        return { lrcData: [], yrcData: lines };
      }
      // 解析本地歌词并对其
      const lrcLines = parseLrc(lyric);
      const aligned = this.alignLocalLyrics({ lrcData: lrcLines, yrcData: [] });
      this.statusStore.usingTTMLLyric = false;
      return aligned;
    } catch {
      return { lrcData: [], yrcData: [] };
    }
  }
  /**
   * 检测本地歌词覆盖
   * @param id 歌曲 ID
   * @returns 歌词数据
   */
  private async checkLocalLyricOverride(id: number): Promise<SongLyric> {
    console.log("检测本地歌词覆盖", id);
    const { localLyricPath } = this.settingStore;
    if (!isElectron || !localLyricPath.length) return { lrcData: [], yrcData: [] };
    // 从本地遍历
    const { lrc, ttml } = await window.electron.ipcRenderer.invoke(
      "read-local-lyric",
      localLyricPath,
      id,
    );
    this.statusStore.usingTTMLLyric = Boolean(ttml);
    return { lrcData: parseLrc(lrc || ""), yrcData: parseTTML(ttml || "").lines || [] };
  }
  /**
   * 处理歌词排除
   * @param lyricData 歌词数据
   * @returns 处理后的歌词数据
   */
  private handleLyricExclude(lyricData: SongLyric): SongLyric {
    const { enableExcludeLyrics, excludeKeywords, excludeRegexes } = this.settingStore;
    // 未开启排除
    if (!enableExcludeLyrics) return lyricData;
    // 处理正则表达式
    const regexes = (excludeRegexes || []).map((r: string) => new RegExp(r));
    /**
     * 判断歌词是否被排除
     * @param line 歌词行
     * @returns 是否被排除
     */
    const isExcluded = (line: LyricLine) => {
      const content = (line?.words || [])
        .map((w) => String(w.word || ""))
        .join("")
        .trim();
      if (!content) return true;
      return (
        (excludeKeywords || []).some((k: string) => content.includes(k)) ||
        regexes.some((re) => re.test(content))
      );
    };
    /**
     * 过滤排除的歌词行
     * @param lines 歌词行数组
     * @returns 过滤后的歌词行数组
     */
    const filterLines = (lines: LyricLine[]) => (lines || []).filter((l) => !isExcluded(l));
    return {
      lrcData: filterLines(lyricData.lrcData || []),
      yrcData: filterLines(lyricData.yrcData || []),
    };
  }
  /**
   * 处理歌词
   * @param id 歌曲 ID
   * @param path 本地歌词路径（可选）
   */
  public async handleLyric(id: number, path?: string) {
    try {
      // 歌词加载状态
      this.statusStore.lyricLoading = true;
      // 重置歌词
      this.resetSongLyric();
      // 标记当前歌词请求（避免旧请求覆盖新请求）
      this.activeLyricReq = ++this.lyricReqSeq;
      // 检查歌词覆盖
      let lyricData = await this.checkLocalLyricOverride(id);
      // 开始获取歌词
      if (isEmpty(lyricData.lrcData) || isEmpty(lyricData.yrcData)) {
        // 进行本地歌词对齐
        lyricData = this.alignLocalLyrics(lyricData);
      } else if (path) {
        lyricData = await this.handleLocalLyric(path);
      } else {
        lyricData = await this.handleOnlineLyric(id);
      }
      // 排除内容
      lyricData = this.handleLyricExclude(lyricData);
      console.log("最终歌词数据", lyricData);
    } catch (error) {
    } finally {
      // 歌词加载状态
      if (this.musicStore.playSong?.id === undefined || this.activeLyricReq === this.lyricReqSeq) {
        this.statusStore.lyricLoading = false;
      }
    }
  }
}

export default new LyricManager();
