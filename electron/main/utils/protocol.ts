import { app } from "electron";
import { processLog } from "../logger";

export const registerCustomProtocol = () => {
  app.setAsDefaultProtocolClient("orpheus");
  processLog.info("🔗 Registered custom protocol");
};

export const openCustomProtocol = (str: string): boolean => {
  switch (true) {
    case str.startsWith("orpheus://"):
      handleOpenOrpheus(str);
      return true;
    default:
      return false;
  }
}

export const processProtocolFromCommand = (command: string[]): boolean => {
  // 这里第一个参数是程序名称 忽略此 仅遍历参数
  for (let i = 1; i < command.length; i++) {
    const arg = command[i];
    if (openCustomProtocol(arg)) return true;
  }
  return false;
}

export const handleOpenOrpheus = (url: string) => {
  // 这里的协议是从网页端打开官方客户端的协议
  // 形如 `orpheus://eyJ0eXBlIjoic29uZyIsImlkIjoiMTgyNjM2MTcxMiIsImNtZCI6InBsYXkifQ==`
  // URI 的 Path 部分是 Base64 编码过的，解码后得到 Json
  // 形如 `{"type":"song","id":"1826361712","cmd":"play"}`

  if (!url.startsWith("orpheus://")) return;
  const path = url.replace("orpheus://", "");
  const data = atob(path);
  let json: any;
  try {
    json = JSON.parse(data);
  } catch (e) {
    processLog.error("❌ Invalid JSON:", e);
    return;
  }
  processLog.info("🚀 Open Orpheus:", json);
  // TODO 处理
};
