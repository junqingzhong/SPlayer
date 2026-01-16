import type { TextConverter } from "@opencc";
type WasmModule = typeof import("@opencc");

let wasmModule: WasmModule | null = null;
// 缓存所有已创建的转换器实例，考虑到转换模式只有十几种，全部换成下来的开销应该不大
const converters = new Map<string, TextConverter>();

// CAUTION: 更改了 wasm 的编译参数后务必更新它
export type ConverterMode =
  | "s2t"
  | "t2s"
  | "s2tw"
  | "tw2s"
  | "s2hk"
  | "hk2s"
  | "s2twp"
  | "tw2sp"
  | "t2tw"
  | "tw2t"
  | "t2hk"
  | "hk2t"
  | "off";

/**
 * 为指定的简繁转换模式创建一个转换器
 * @param mode 转换模式 (例如 "s2t", "t2s")。参见 {@linkcode ConverterMode}
 * @returns 一个接受字符串并返回转换后字符串的函数
 */
export async function getConverter(mode: ConverterMode): Promise<(text: string) => string> {
  if (mode === "off") {
    return (text: string) => text;
  }

  try {
    if (!wasmModule) {
      wasmModule = await import("@opencc");
      await wasmModule.default();
    }

    let converterInstance = converters.get(mode);

    if (!converterInstance) {
      converterInstance = new wasmModule.TextConverter(`${mode}.json`);
      converters.set(mode, converterInstance);
    }

    return (text: string) => converterInstance.convert(text);
  } catch (e) {
    console.error(`[OpenCC] 为模式 ${mode} 初始化转换器失败`, e);
    return (text: string) => text;
  }
}
