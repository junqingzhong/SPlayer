let timer: number | null = null;

const start = (intervalMs: number) => {
  if (timer !== null) {
    clearInterval(timer);
    timer = null;
  }
  timer = setInterval(() => {
    postMessage({ type: "TICK" });
  }, intervalMs);
};

const stop = () => {
  if (timer === null) return;
  clearInterval(timer);
  timer = null;
};

self.onmessage = (ev: MessageEvent) => {
  const msg = ev.data as { type?: string; intervalMs?: number } | undefined;
  if (!msg?.type) return;
  if (msg.type === "START") {
    start(msg.intervalMs ?? 75);
  } else if (msg.type === "STOP") {
    stop();
  }
};

