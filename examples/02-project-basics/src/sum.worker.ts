// 不访问 DOM；通过消息收发数据。
self.onmessage = (event: MessageEvent<number>) => {
  const n = event.data;
  self.postMessage(n * (n + 1) / 2);
};
export {};
