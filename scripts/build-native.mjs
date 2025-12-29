import { execSync } from "child_process";
import process from "process";

console.log(`[BuildNative] 当前构建目标: ${process.platform}`);

if (process.platform === "win32") {
  try {
    execSync("pnpm --filter smtc-for-splayer build", {
      stdio: "inherit",
    });
    console.log("[BuildNative] 构建成功");
  } catch (error) {
    console.error("[BuildNative] 构建失败", error);
    process.exit(1);
  }
} else {
  console.log("[BuildNative] 不是 Windows, 跳过构建原生插件");
}
