import { createServer as createHttpServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import sirv from 'sirv';

// HTTP 编排是应用代码。Vite 不会因为环境叫 ssr 就自动返回 HTML。
export async function createApp({ production = false, port = 5178 } = {}) {
  const root = import.meta.dirname;
  const http = createHttpServer();
  const vite = production ? null : await (await import('vite')).createServer({
    root,
    appType: 'custom',
    server: { middlewareMode: true, hmr: { server: http } },
  });
  const staticFiles = production ? sirv(resolve(root, 'dist/client'), { etag: true }) : null;
  const productionModule = production ? await import(pathToFileURL(resolve(root, 'dist/server/entry-server.js')).href) : null;
  const productionTemplate = production ? await readFile(resolve(root, 'dist/client/index.html'), 'utf8') : null;
  async function renderPage(req, res) {
    try {
      if (req.url?.split('?')[0] !== '/') { res.writeHead(404).end('Not found'); return; }
      if (req.method !== 'GET' && req.method !== 'HEAD') { res.writeHead(405).end(); return; }
      let template = productionTemplate;
      let entry = productionModule;
      if (vite) {
        template = await readFile(resolve(root, 'index.html'), 'utf8');
        // 注入 HMR 客户端与 React Refresh preamble。
        template = await vite.transformIndexHtml(req.url, template);
        const ssr = vite.environments.ssr;
        const { isRunnableDevEnvironment } = await import('vite');
        if (!isRunnableDevEnvironment(ssr)) throw new Error('本实验需要 Node RunnableDevEnvironment');
        entry = await ssr.runner.import('/src/entry-server.tsx');
      }
      const { html, data } = entry.render();
      // 防止 JSON 内的 </script> 提前终止 script 标签。
      const serialized = JSON.stringify(data).replaceAll('<', '\\u003c');
      const document = template.replace('<!--ssr-outlet-->', () => html).replace('<!--initial-data-->', () => serialized);
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(req.method === 'HEAD' ? undefined : document);
    } catch (error) {
      console.error(error);
      res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' }).end('SSR 失败，查看终端日志');
    }
  }
  http.on('request', (req, res) => {
    if (vite) vite.middlewares(req, res, () => void renderPage(req, res));
    // 仅把资产交给静态服务器，不能让它直接返回未填充的 index.html 模板。
    else if (req.url?.startsWith('/assets/')) staticFiles(req, res, () => { res.writeHead(404).end('Not found'); });
    else void renderPage(req, res);
  });
  await new Promise((ok, fail) => { http.once('error', fail); http.listen(port, '127.0.0.1', ok); });
  return { server: http, vite, async close() {
    await vite?.close();
    http.closeAllConnections();
    await new Promise((ok, fail) => http.close(error => error ? fail(error) : ok()));
  } };
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const app = await createApp({ production: process.argv.includes('--production'), port: Number(process.env.PORT ?? 5178) });
  console.log('SSR → http://127.0.0.1:' + app.server.address().port);
  for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, async () => { await app.close(); process.exit(0); });
}
