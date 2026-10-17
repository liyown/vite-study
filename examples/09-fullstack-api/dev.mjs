import { createServer } from 'vite';
import { createApiServer } from './server.mjs';
const api = createApiServer();
let vite;
try {
  await new Promise((ok, fail) => { api.once('error', fail); api.listen(4309, '127.0.0.1', ok); });
  vite = await createServer({ root: import.meta.dirname, server: { host: '127.0.0.1', port: 5179, strictPort: true } });
  await vite.listen(); vite.printUrls();
  console.log('/api → Node http://127.0.0.1:4309（代理仅在开发时使用）');
} catch (error) {
  console.error(error); await vite?.close(); api.close(); process.exit(1);
}
for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, async () => {
  await vite.close(); api.closeAllConnections(); api.close(() => process.exit(0));
});
