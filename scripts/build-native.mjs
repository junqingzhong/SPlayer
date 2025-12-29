import { execSync } from "child_process";
import os from "os";
import process from "process";

console.log(`[BuildNative] 当前构建目标: ${process.platform}`);

// 构建 Discord RPC 模块（跨平台）
try {
  console.log("[BuildNative] 构建 Discord RPC 模块...");
  execSync("pnpm --filter discord-rpc-for-splayer build", {
    stdio: "inherit",
  });
  console.log("[BuildNative] Discord RPC 模块构建成功");
} catch (error) {
  console.error("[BuildNative] Discord RPC 模块构建失败", error);
  process.exit(1);
}

// 仅在 Windows 平台构建 SMTC 模块
if (process.platform === "win32") {
  try {
    console.log("[BuildNative] 构建 SMTC 模块...");
    execSync("pnpm --filter smtc-for-splayer build", {
      stdio: "inherit",
    });
    console.log("[BuildNative] SMTC 模块构建成功");
  } catch (error) {
    console.error("[BuildNative] SMTC 模块构建失败", error);
    process.exit(1);
  }
} else {
  console.log("[BuildNative] 不是 Windows, 跳过 SMTC 模块构建");
}

console.log("[BuildNative] 所有原生模块构建完成");
