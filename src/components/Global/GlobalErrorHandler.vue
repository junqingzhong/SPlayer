<template>
  <slot />
</template>

<script setup lang="ts">
import { createConsoleBuffer } from "@/utils/log";
import { isElectron } from "@/utils/env";
import { useSettingStore } from "@/stores/setting";

const settingStore = useSettingStore();
let dialogOpened = false;

const sanitizeErrorMessage = (message: string) => {
  const lines = message.split(/\r?\n/);
  const filtered = lines.filter((line) => !line.trim().startsWith("at "));
  const result = filtered.join("\n").trim();
  return result || "未知错误";
};

const showErrorDialog = (errorMessage: string) => {
  if (!settingStore.enableGlobalErrorDialog) return;
  if (dialogOpened) return;
  dialogOpened = true;
  const safeMessage = sanitizeErrorMessage(errorMessage);
  window.$dialog.error({
    title: "SPlayer 出现错误",
    content: () =>
      h(
        "div",
        { style: { whiteSpace: "pre-wrap" } },
        "很抱歉，SPlayer出现了一些问题...\n\n" +
          "如果要寻求帮助，请向他人发送错误报告文件，而不是发送这个窗口的截图。\n\n" +
          "你也可以查看错误报告，其中可能会有出错的原因。\n\n" +
          "引起弹窗的错误：\n" +
          safeMessage,
      ),
    positiveText: "保存日志文件",
    negativeText: "关闭",
    onPositiveClick: () => {
      dialogOpened = false;
      if (isElectron) {
        void window.electron?.ipcRenderer?.invoke("save-log-file");
        return;
      }
      downloadWebLog(safeMessage);
    },
    onNegativeClick: () => {
      dialogOpened = false;
    },
    onClose: () => {
      dialogOpened = false;
    },
  });
};

const webConsole = createConsoleBuffer({
  maxSize: 500,
  bufferKey: "__splayerWebConsoleBuffer",
  onError: (message) => showErrorDialog(message || "未知错误"),
});

const errorPopupConsole = createConsoleBuffer({
  maxSize: 50,
  bufferKey: "__splayerErrorPopup",
  onError: (message) => showErrorDialog(message || "未知错误"),
});

const downloadWebLog = (errorMessage: string) => {
  const time = new Date().toISOString();
  const header = `------ Web Error Report ${time} ------\n`;
  const errorSection = `引起弹窗的错误：\n${errorMessage}\n\n`;
  const logs = webConsole.getLogs();
  const logsSection = logs.length
    ? `------ 控制台日志 ------\n${logs.join("\n")}\n`
    : "------ 控制台日志 ------\n无\n";
  const content = header + errorSection + logsSection;
  const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `SPlayer_ErrorReport_${time.replace(/[:.]/g, "-")}.log`;
  anchor.click();
  URL.revokeObjectURL(url);
};

const handleConsoleError = (event: ErrorEvent | PromiseRejectionEvent) => {
  const message = isElectron
    ? errorPopupConsole.formatErrorEventMessage(event)
    : webConsole.formatErrorEventMessage(event);
  console.error(message);
};

onMounted(() => {
  if (isElectron) {
    errorPopupConsole.init();
  } else {
    webConsole.init();
  }
  window.addEventListener("error", handleConsoleError);
  window.addEventListener("unhandledrejection", handleConsoleError);
});

onUnmounted(() => {
  window.removeEventListener("error", handleConsoleError);
  window.removeEventListener("unhandledrejection", handleConsoleError);
});
</script>
