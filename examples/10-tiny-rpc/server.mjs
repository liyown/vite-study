import { createServer } from 'node:http';
import sirv from 'sirv';
import { handleRpc } from './dist/server/entry-server.js';

// 生产只运行编译产物。这个文件负责监听 HTTP，不再启动 Vite。
const serveFiles = sirv(new URL('./dist/client', import.meta.url).pathname);
const server = createServer((req, res) => {
  if (req.url.startsWith('/rpc/')) return handleRpc(req, res);
  serveFiles(req, res, () => res.writeHead(404).end('Not found'));
});
server.listen(Number(process.env.PORT ?? 4180), '127.0.0.1', () => {
  console.log(`Tiny RPC → http://127.0.0.1:${server.address().port}`);
});
