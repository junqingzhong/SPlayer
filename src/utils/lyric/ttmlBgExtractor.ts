import type { LyricLine } from "@applemusic-like-lyrics/lyric";

type LyricWord = { word: string; startTime: number; endTime: number; romanWord: string };

const parseTtmlTimeToMs = (raw: string | null): number | null => {
  if (!raw) return null;
  const value = raw.trim();
  const msPartToMs = (ms: string) => parseInt(ms.padEnd(3, "0").slice(0, 3), 10);

  const m1 = value.match(/^(\d{2}):(\d{2})\.(\d{1,})$/);
  if (m1) {
    const mm = parseInt(m1[1], 10);
    const ss = parseInt(m1[2], 10);
    const ms = msPartToMs(m1[3]);
    return mm * 60_000 + ss * 1000 + ms;
  }

  const m2 = value.match(/^(\d{2}):(\d{2}):(\d{2})\.(\d{1,})$/);
  if (m2) {
    const hh = parseInt(m2[1], 10);
    const mm = parseInt(m2[2], 10);
    const ss = parseInt(m2[3], 10);
    const ms = msPartToMs(m2[4]);
    return hh * 3_600_000 + mm * 60_000 + ss * 1000 + ms;
  }

  return null;
};

const getRole = (el: Element): string => {
  return (
    el.getAttribute("ttm:role") ||
    el.getAttribute("role") ||
    el.getAttributeNS("http://www.w3.org/ns/ttml#metadata", "role") ||
    ""
  ).trim();
};

const getTextContentSkippingRoles = (node: Node, skipRoles: Set<string>): string => {
  if (node.nodeType === Node.TEXT_NODE) return node.textContent || "";
  if (node.nodeType !== Node.ELEMENT_NODE) return "";
  const el = node as Element;
  const role = getRole(el);
  if (skipRoles.has(role)) return "";
  let out = "";
  for (const child of Array.from(el.childNodes)) {
    out += getTextContentSkippingRoles(child, skipRoles);
  }
  return out;
};

const createWord = (word: string, startTime: number, endTime: number): LyricWord => ({
  word,
  startTime,
  endTime,
  romanWord: "",
});

const normalizeBgBracket = (words: LyricWord[]): LyricWord[] => {
  if (!words.length) return words;
  const text = words.map((w) => w.word).join("").trim();
  const isWrapped =
    (text.startsWith("(") && text.endsWith(")")) || (text.startsWith("（") && text.endsWith("）"));
  if (isWrapped) return words;
  const out = words.map((w) => ({ ...w }));
  out[0].word = `(${out[0].word}`;
  out[out.length - 1].word = `${out[out.length - 1].word})`;
  return out;
};

const getFirstInnerTextByRole = (root: Element, role: string): string => {
  const nodes = root.querySelectorAll(`span[ttm\\:role="${role}"],span[role="${role}"]`);
  if (!nodes.length) return "";
  return (nodes[0]?.textContent || "").trim();
};

export const extractTtmlBgLines = (ttml: string): LyricLine[] => {
  if (!ttml.trim()) return [];
  const doc = new DOMParser().parseFromString(ttml, "application/xml");
  if (doc.getElementsByTagName("parsererror").length) return [];

  const bgSpans = Array.from(
    doc.querySelectorAll('span[ttm\\:role="x-bg"],span[role="x-bg"]'),
  );
  if (!bgSpans.length) return [];

  const skipRoles = new Set(["x-translation", "x-roman"]);
  const result: LyricLine[] = [];

  for (const bgSpan of bgSpans) {
    const translatedLyric = getFirstInnerTextByRole(bgSpan, "x-translation");
    const romanLyric = getFirstInnerTextByRole(bgSpan, "x-roman");

    const wordEls = Array.from(bgSpan.querySelectorAll("span")).filter((el) => {
      const role = getRole(el);
      if (skipRoles.has(role)) return false;
      return parseTtmlTimeToMs(el.getAttribute("begin")) !== null;
    });

    const words: LyricWord[] = [];
    for (const el of wordEls) {
      const startTime = parseTtmlTimeToMs(el.getAttribute("begin"));
      if (startTime === null) continue;
      const endTimeRaw = parseTtmlTimeToMs(el.getAttribute("end"));
      const endTime = endTimeRaw !== null && endTimeRaw >= startTime ? endTimeRaw : startTime;
      const text = (el.textContent || "").replace(/\s+/g, " ").trim();
      if (!text) continue;
      words.push(createWord(text, startTime, endTime));
    }

    let startTime = parseTtmlTimeToMs(bgSpan.getAttribute("begin"));
    let endTime = parseTtmlTimeToMs(bgSpan.getAttribute("end"));
    if (startTime === null && words.length) startTime = words[0].startTime;
    if (endTime === null && words.length) endTime = words[words.length - 1].endTime;
    if (startTime === null) continue;
    if (endTime === null || endTime < startTime) endTime = startTime;

    let finalWords = words;
    if (!finalWords.length) {
      const text = getTextContentSkippingRoles(bgSpan, skipRoles).replace(/\s+/g, " ").trim();
      if (!text) continue;
      finalWords = [createWord(text, startTime, startTime)];
    }
    finalWords = normalizeBgBracket(finalWords);

    result.push({
      words: finalWords,
      startTime,
      endTime,
      translatedLyric,
      romanLyric,
      isBG: true,
      isDuet: false,
    });
  }

  return result;
};

