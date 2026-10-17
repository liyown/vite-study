import { createServer } from 'node:http';
import { randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import sirv from 'sirv';

// 真实的 Node API，开发/生产复用。数据只放内存，每次创建服务重置。
export function createApiServer({ serveClient = false } = {}) {
  const notes = [{ id: 'welcome', text: '这条数据由 Node API 返回' }];
  const assets = serveClient ? sirv(resolve(import.meta.dirname, 'dist'), { single: true }) : null;
  const json = (res, status, data) => {
    res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
    res.end(JSON.stringify(data));
  };
  return createServer(async (req, res) => {
    const pathname = new URL(req.url, 'http://localhost').pathname;
    if (pathname.startsWith('/api')) {
      if (pathname !== '/api/notes') { json(res, 404, { error: 'API 不存在' }); return; }
      if (req.method === 'GET') { json(res, 200, notes); return; }
      if (req.method !== 'POST') { res.setHeader('Allow', 'GET, POST'); json(res, 405, { error: '只支持 GET / POST' }); return; }
      if (!req.headers['content-type']?.includes('application/json')) { json(res, 415, { error: '请发送 application/json' }); return; }
      try {
        const chunks = []; let bytes = 0;
        for await (const chunk of req) {
          bytes += chunk.length;
          if (bytes > 8192) { json(res, 413, { error: '请求过大' }); return; }
          chunks.push(chunk);
        }
        const body = JSON.parse(Buffer.concat(chunks).toString('utf8'));
        const text = typeof body?.text === 'string' ? body.text.trim() : '';
        if (!text || text.length > 120) { json(res, 400, { error: '请输入 1–120 字的笔记' }); return; }
        const note = { id: randomUUID(), text }; notes.push(note);
        json(res, 201, note);
      } catch { if (!res.writableEnded) json(res, 400, { error: 'JSON 格式错误' }); }
      return;
    }
    if (assets && ['GET', 'HEAD'].includes(req.method)) {
      assets(req, res, () => { res.writeHead(404).end('Not found'); });
    } else res.writeHead(404).end('Not found');
  });
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const server = createApiServer({ serveClient: true });
  server.listen(Number(process.env.PORT ?? 4309), '127.0.0.1', () => console.log(`全栈 → http://127.0.0.1:${server.address().port}`));
  for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, () => { server.closeAllConnections(); server.close(); });
}
