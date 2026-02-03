/**
 * 美化打印实现方法
 * https://juejin.cn/post/7371716384847364147
 */
const log = () => {
  const isEmpty = (value: any) => {
    return value == null || value === undefined || value === "";
  };
  const prettyPrint = (title: string, text: string, color: string) => {
    console.info(
      `%c ${title} %c ${text} %c`,
      `background:${color};border:1px solid ${color}; padding: 1px; border-radius: 2px 0 0 2px; color: #fff;`,
      `border:1px solid ${color}; padding: 1px; border-radius: 0 2px 2px 0; color: ${color};`,
      "background:transparent",
    );
  };
  const info = (textOrTitle: string, content = "") => {
    const title = isEmpty(content) ? "Info" : textOrTitle;
    const text = isEmpty(content) ? textOrTitle : content;
    prettyPrint(title, text, "#909399");
  };
  const error = (textOrTitle: string, content = "") => {
    const title = isEmpty(content) ? "Error" : textOrTitle;
    const text = isEmpty(content) ? textOrTitle : content;
    prettyPrint(title, text, "#F56C6C");
  };
  const warning = (textOrTitle: string, content = "") => {
    const title = isEmpty(content) ? "Warning" : textOrTitle;
    const text = isEmpty(content) ? textOrTitle : content;
    prettyPrint(title, text, "#E6A23C");
  };
  const success = (textOrTitle: string, content = "") => {
    const title = isEmpty(content) ? "Success " : textOrTitle;
    const text = isEmpty(content) ? textOrTitle : content;
    prettyPrint(title, text, "#67C23A");
  };
  const table = () => {
    const data = [
      { id: 1, name: "Alice", age: 25 },
      { id: 2, name: "Bob", age: 30 },
      { id: 3, name: "Charlie", age: 35 },
    ];
    console.info(
      "%c id%c name%c age",
      "color: white; background-color: black; padding: 2px 10px;",
      "color: white; background-color: black; padding: 2px 10px;",
      "color: white; background-color: black; padding: 2px 10px;",
    );

    data.forEach((row: any) => {
      console.info(
        `%c ${row.id} %c ${row.name} %c ${row.age} `,
        "color: black; background-color: lightgray; padding: 2px 10px;",
        "color: black; background-color: lightgray; padding: 2px 10px;",
        "color: black; background-color: lightgray; padding: 2px 10px;",
      );
    });
  };
  const picture = (url: string, scale = 1) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      const c = document.createElement("canvas");
      const ctx = c.getContext("2d");
      if (ctx) {
        c.width = img.width;
        c.height = img.height;
        ctx.fillStyle = "red";
        ctx.fillRect(0, 0, c.width, c.height);
        ctx.drawImage(img, 0, 0);
        const dataUri = c.toDataURL("image/png");

        console.info(
          `%c sup?`,
          `font-size: 1px;
          padding: ${Math.floor((img.height * scale) / 2)}px ${Math.floor((img.width * scale) / 2)}px;background-image: url(${dataUri});
          background-repeat: no-repeat;
          background-size: ${img.width * scale}px ${img.height * scale}px;
          color: transparent;`,
        );
      }
    };
    img.src = url;
  };

  // retu;
  return {
    info,
    error,
    warning,
    success,
    picture,
    table,
  };
};

/**
 * 控制台缓冲区配置项
 */
type ConsoleBufferOptions = {
  /**
   * 缓冲区最大长度
   */
  maxSize?: number;
  /**
   * 缓冲区键名
   */
  bufferKey?: string;
  /**
   * 错误处理函数
   */
  onError?: (message: string, args: unknown[]) => void;
};

/**
 * 创建一个控制台缓冲区
 * @param options 配置项
 */
export const createConsoleBuffer = (options: ConsoleBufferOptions = {}) => {
  const buffer: string[] = [];
  const maxSize = options.maxSize ?? 500;
  const bufferKey = options.bufferKey ?? "__splayerConsoleBuffer";
  const onError = options.onError;
  /**
   * 格式化控制台值
   * @param value 值
   * @returns 格式化后的值
   */
  const formatConsoleValue = (value: unknown) => {
    if (value instanceof Error) return value.stack || value.message;
    if (typeof value === "string") return value;
    if (typeof value === "number") return String(value);
    if (typeof value === "boolean") return value ? "true" : "false";
    if (typeof value === "bigint") return value.toString();
    if (typeof value === "function") return value.name ? `[Function ${value.name}]` : "[Function]";
    if (value === undefined) return "undefined";
    if (value === null) return "null";
    try {
      return JSON.stringify(value);
    } catch {
      return String(value);
    }
  };
  /**
   * 格式化控制台参数
   * @param args 参数
   * @returns 格式化后的参数
   */
  const formatArgs = (args: unknown[]) => args.map(formatConsoleValue).join(" ");
  /**
   * 将日志推入缓冲区
   * @param level 日志级别
   * @param args 日志参数
   */
  const push = (level: string, args: unknown[]) => {
    const time = new Date().toISOString();
    const message = formatArgs(args);
    buffer.push(`[${time}] [${level}] ${message}`);
    if (buffer.length > maxSize) {
      buffer.splice(0, buffer.length - maxSize);
    }
  };
  /**
   * 初始化缓冲区
   */
  const init = () => {
    const consoleWithKey = console as Console & Record<string, boolean | undefined>;
    if (consoleWithKey[bufferKey]) return;
    consoleWithKey[bufferKey] = true;

    const originalLog = console.log.bind(console);
    const originalInfo = console.info.bind(console);
    const originalWarn = console.warn.bind(console);
    const originalError = console.error.bind(console);
    const originalDebug = console.debug.bind(console);

    console.log = (...args: unknown[]) => {
      push("log", args);
      originalLog(...args);
    };
    console.info = (...args: unknown[]) => {
      push("info", args);
      originalInfo(...args);
    };
    console.warn = (...args: unknown[]) => {
      push("warn", args);
      originalWarn(...args);
    };
    console.error = (...args: unknown[]) => {
      const message = formatArgs(args);
      push("error", args);
      onError?.(message, args);
      originalError(...args);
    };
    console.debug = (...args: unknown[]) => {
      push("debug", args);
      originalDebug(...args);
    };
  };
  /**
   * 格式化错误事件消息
   * @param event 错误事件
   * @returns 格式化后的消息
   */
  const formatErrorEventMessage = (event: ErrorEvent | PromiseRejectionEvent) => {
    if (event instanceof ErrorEvent) {
      if (event.error instanceof Error) return event.error.stack || event.error.message;
      return event.message || "Unknown Error";
    }
    const reason = event.reason;
    if (reason instanceof Error) return reason.stack || reason.message;
    if (typeof reason === "string") return reason;
    try {
      return JSON.stringify(reason);
    } catch {
      return String(reason);
    }
  };

  /**
   * 获取日志
   * @returns 日志
   */
  const getLogs = () => buffer.slice();

  return {
    init,
    push,
    getLogs,
    formatErrorEventMessage,
  };
};

export default log();

export const webConsole = createConsoleBuffer({
  maxSize: 500,
  bufferKey: "__splayerWebConsoleBuffer",
});

export const errorPopupConsole = createConsoleBuffer({
  maxSize: 50,
  bufferKey: "__splayerErrorPopup",
});

export const downloadWebLog = (errorMessage: string = "User exported logs") => {
  const time = new Date().toISOString();
  const header = `------ Web Error Report ${time} ------\n`;
  const errorSection = `导出原因：\n${errorMessage}\n\n`;
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
