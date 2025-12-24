import { WebSocketServer, type WebSocket } from "ws";
import { createServer } from "net";
import { serverLog } from "../logger";
import { useStore } from "../store";

/**
 * WebSocket 主服务
 */
export class SocketService {
  private static instance: SocketService;

  private wss: WebSocketServer | null = null;
  private clients: Set<WebSocket> = new Set();
  private currentPort: number | null = null;

  private constructor() {}

  public static getInstance(): SocketService {
    if (!SocketService.instance) {
      SocketService.instance = new SocketService();
    }
    return SocketService.instance;
  }

  /**
   * 当前是否已启动 WebSocket 服务
   */
  public isRunning(): boolean {
    return this.wss !== null;
  }

  /**
   * 获取当前监听端口
   */
  public getPort(): number | null {
    return this.currentPort;
  }

  /**
   * 启动 WebSocket 服务
   * @param portOverride 可选端口
   * @param forceRestart 是否强制重启
   */
  public async start(
    portOverride?: number,
    forceRestart: boolean = false,
  ): Promise<{ port: number }> {
    const store = useStore();
    const websocketConfig = store.get("websocket");
    const portFromStore = websocketConfig?.port;
    const port = portOverride ?? portFromStore ?? 25885;

    // 如果服务已在运行
    if (this.wss && this.currentPort !== null) {
      // 如果端口相同，直接返回
      if (this.currentPort === port) {
        return { port: this.currentPort };
      }
      // 如果端口不同且需要强制重启，先停止再启动
      if (forceRestart) {
        await this.stop();
      } else {
        // 否则返回当前端口
        return { port: this.currentPort };
      }
    }

    serverLog.info(`🔌 Trying to start WebSocket server on port ${port}`);

    // 先验证端口是否可用
    const isAvailable = await this.testPort(port);
    if (!isAvailable) throw new Error(`端口 ${port} 不可用`);

    return new Promise<{ port: number }>((resolve, reject) => {
      try {
        const wss = new WebSocketServer({ port });
        this.wss = wss;
        this.currentPort = port;

        wss.on("connection", (socket: WebSocket) => {
          this.clients.add(socket);
          serverLog.info("🔗 WebSocket client connected");

          socket.on("close", () => {
            this.clients.delete(socket);
            serverLog.info("🔌 WebSocket client disconnected");
          });

          socket.on("error", (error: Error) => {
            serverLog.error("⚠️ WebSocket client error:", error);
          });
        });

        wss.once("listening", () => {
          serverLog.info(`✅ WebSocket server started on port ${port}`);
          resolve({ port });
        });

        wss.once("error", (error: Error) => {
          serverLog.error("❌ WebSocket server failed to start:", error);
          this.cleanupServer();
          reject(error);
        });
      } catch (error) {
        serverLog.error("❌ WebSocket server creation error:", error);
        this.cleanupServer();
        reject(error instanceof Error ? error : new Error(String(error)));
      }
    });
  }

  /**
   * 测试 socket 端口是否可用（可以绑定）
   * @param port 要测试的端口
   * @returns 如果端口可用返回 true，否则返回 false
   */
  public async testPort(port: number): Promise<boolean> {
    return new Promise<boolean>((resolve) => {
      const server = createServer();

      server.once("error", (error: NodeJS.ErrnoException) => {
        // 端口被占用或权限不足
        if (error.code === "EADDRINUSE" || error.code === "EACCES") {
          resolve(false);
        } else {
          resolve(false);
        }
      });

      server.once("listening", () => {
        // 端口可用，立即关闭测试服务器
        server.close(() => {
          resolve(true);
        });
      });

      try {
        server.listen(port, "127.0.0.1");
      } catch {
        resolve(false);
      }
    });
  }

  /**
   * 尝试自动启动
   */
  public async tryAutoStart(): Promise<void> {
    const store = useStore();
    try {
      const websocketConfig = store.get("websocket");
      if (!websocketConfig?.enabled) return;
      const { port } = await this.start(websocketConfig.port, false);
      serverLog.info(`🔌 Auto-start WebSocket server on port ${port}`);
      store.set("websocket", { enabled: true, port });
    } catch (error) {
      serverLog.error("❌ Error while auto-starting WebSocket server from store:", error);
      store.set("websocket.enabled", false);
    }
  }

  /**
   * 关闭 WebSocket 服务
   */
  public async stop(): Promise<void> {
    if (!this.wss) return;

    const server = this.wss;
    serverLog.info("🛑 Stopping WebSocket server...");

    // 关闭所有客户端
    for (const client of this.clients) {
      try {
        client.close();
      } catch {
        // ignore
      }
    }
    this.clients.clear();

    await new Promise<void>((resolve) => {
      server.close(() => {
        serverLog.info("✅ WebSocket server stopped");
        resolve();
      });
    });

    this.cleanupServer();
  }

  /**
   * 清理 WebSocket 服务
   */
  private cleanupServer(): void {
    this.wss = null;
    this.currentPort = null;
    this.clients.clear();
  }

  /**
   * 便于主进程调用自动启动
   */
  public static async tryAutoStart(): Promise<void> {
    const instance = SocketService.getInstance();
    await instance.tryAutoStart();
  }
}
