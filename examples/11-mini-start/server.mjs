/**
 * 【启动入口】pnpm dev 11 → 本文件创建 Node HTTP 服务器。
 * 开发：Vite 转换源码，ssr.runner.import 取得服务端模块。
 * 生产：直接 import 已构建的 dist/server/entry-server.js。
 * 拿到模块以后，两种模式都调用同样的 render / handleNodeRpc。
 */
import { createServer as createHttpServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import sirv from 'sirv';
export async function createApp({ production = false, port = 5181, root = import.meta.dirname } = {}) {
  const http = createHttpServer();
  // 开发需要 Vite 的模块服务；生产只运行产物，不需要再启动编译器。
  const vite = production ? null : await (await import('vite')).createServer({
    root, appType: 'custom', server: { middlewareMode: true, hmr: { server: http } },
  });
  const built = production ? await import(pathToFileURL(resolve(root, 'dist/server/entry-server.js')).href) : null;
  const template = production ? await readFile(resolve(root, 'dist/client/index.html'), 'utf8') : null;
  const assets = production ? sirv(resolve(root, 'dist/client'), { etag: true }) : null;
  // 统一“怎么取得服务器入口”，避免下面的业务分支各写一套 dev/prod。
  async function entry() {
    if (built) return built;
    const { isRunnableDevEnvironment } = await import('vite');
    const ssr = vite.environments.ssr;
    if (!isRunnableDevEnvironment(ssr)) throw new Error('需要 Node RunnableDevEnvironment');
    return ssr.runner.import('/src/entry-server.tsx');
  }
  async function handle(req, res) {
    try {
      // 分支 A：浏览器远程调用服务端函数，返回 JSON。
      if (req.url?.startsWith('/_server/')) return await (await entry()).handleNodeRpc(req, res);
      if (req.url?.split('?')[0] !== '/') { res.writeHead(404).end('Not found'); return; }
      if (!['GET', 'HEAD'].includes(req.method)) { res.writeHead(405).end(); return; }
      const source = vite ? await vite.transformIndexHtml(req.url, await readFile(resolve(root, 'index.html'), 'utf8')) : template;
      // 分支 B：打开页面，执行 loader 并渲染 HTML；loader 中的 RPC 走本地代理。
      const { html, data } = await (await entry()).render();
      const json = JSON.stringify(data).replaceAll('<', '\\u003c');
      const document = source.replace('<!--app-html-->', () => html).replace('<!--loader-data-->', () => json);
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }).end(req.method === 'HEAD' ? undefined : document);
    } catch (error) {
      vite?.ssrFixStacktrace(error); console.error(error);
      if (!res.headersSent) res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('服务失败，查看终端日志');
    }
  }
  http.on('request', (req, res) => {
    if (vite) vite.middlewares(req, res, () => void handle(req, res));
    else if (req.url?.startsWith('/assets/') || req.url?.startsWith('/compiled/') || req.url === '/function-manifest.json' || req.url === '/build-report.json') assets(req, res, () => res.writeHead(404).end());
    else void handle(req, res);
  });
  try { await new Promise((ok, fail) => { http.once('error', fail); http.listen(port, '127.0.0.1', ok); }); }
  catch (error) { await vite?.close(); throw error; }
  return { server: http, vite, async close() {
    await vite?.close(); http.closeAllConnections();
    await new Promise((ok, fail) => http.close(error => error ? fail(error) : ok()));
  } };
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const app = await createApp({ production: process.argv.includes('--production'), port: Number(process.env.PORT ?? 5181) });
  console.log(`Mini Start → http://127.0.0.1:${app.server.address().port}`);
  for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, async () => { await app.close(); process.exit(0); });
}
