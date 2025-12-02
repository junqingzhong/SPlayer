import { app } from "electron";
import { processLog } from "../logger";
import mainWindow from "../windows/main-window";

export const registerCustomProtocol = () => {
  app.setAsDefaultProtocolClient("orpheus");
  processLog.info("🔗 Registered custom protocol");
};

export const trySendCustomProtocol = (str: string): boolean => {
  try {
    if (str.startsWith("orpheus://")) {
      mainWindow.getWin()!.webContents.send("protocol-url", str);
      return true;
    }
    return false;
  } catch (e) {
    processLog.error("❌ Failed to send protocol url", e);
    return false;
  }
}

export const processProtocolFromCommand = (command: string[]): boolean => {
  // 这里第一个参数是程序名称 忽略此 仅遍历参数
  for (let i = 1; i < command.length; i++) {
    const arg = command[i];
    if (trySendCustomProtocol(arg)) return true;
  }
  return false;
}
