/*
 * @Author: ZJQ
 * @Date: 2026-01-20 11:01:36
 * @LastEditors: zjq zjq@xkb.com.cn
 * @LastEditTime: 2026-01-20 11:25:39
 * @FilePath: \tea\scripts\build-native.ts
 * @Description:
 *
 * Copyright (c) 2026 by ${git_name_email}, All Rights Reserved.
 */
import { execSync } from "node:child_process";
import process from "node:process";

const isRustAvailable = () => {
  try {
    execSync("cargo --version", { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
};

const shouldSkipIfNoRust = () => {
  const args = process.argv.slice(2);
  return args.includes("--skip-if-no-rust") || args.includes("--allow-missing-rust");
};

if (process.env.SKIP_NATIVE_BUILD === "true") {
  console.log("[BuildNative] SKIP_NATIVE_BUILD 已设置，跳过原生模块构建");
  process.exit(0);
}

if (!isRustAvailable()) {
  if (shouldSkipIfNoRust()) {
    console.warn("[BuildNative] 未检测到 Rust 工具链，已跳过原生模块构建");
    process.exit(0);
  }
  console.error("[BuildNative] 错误：检测不到 Rust 工具链");
  console.error("[BuildNative] 未设置 SKIP_NATIVE_BUILD，因此必须包含 Rust 环境才能继续");
  console.error(
    "[BuildNative] 安装 Rust (https://rust-lang.org/tools/install/) 或者设置环境变量 SKIP_NATIVE_BUILD=true",
  );
  process.exit(1);
}

console.log(`[BuildNative] 当前构建目标: ${process.platform}`);

try {
  console.log("[BuildNative] 开始构建原生模块...");

  execSync("pnpm --filter external-media-integration build", {
    stdio: "inherit",
  });

  console.log("[BuildNative] 模块构建成功");
} catch (error) {
  console.error("[BuildNative] 模块构建失败", error);
  process.exit(1);
}

console.log("[BuildNative] 原生模块构建完成");
