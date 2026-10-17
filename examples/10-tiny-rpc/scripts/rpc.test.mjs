import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'vite';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { readFile, readdir } from 'node:fs/promises';
const root = new URL('../', import.meta.url).pathname;

async function verify(base) {
  assert.equal((await fetch(base)).status, 200);
  const call = (path, body) => fetch(base + path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body });
  const good = await call('/rpc/greet', JSON.stringify({ name: '学习者' }));
  assert.equal(good.status, 200);
  assert.match((await good.json()).result, /^你好，学习者！这句话在 Node 的 .+ 上生成。$/);
  assert.equal((await call('/rpc/missing', '{}')).status, 404);
  assert.equal((await fetch(base + '/rpc/greet')).status, 405);
  assert.equal((await call('/rpc/greet', '{')).status, 400);
  assert.equal((await call('/rpc/greet', '{"name":""}')).status, 400);
}

test('开发：浏览器得到代理，HTTP 按 ID 加载真实函数', async () => {
  const server = await createServer({ root, logLevel: 'silent', server: { host: '127.0.0.1', port: 0, strictPort: false } });
  try {
    await server.listen();
    const base = 'http://127.0.0.1:' + server.httpServer.address().port;
    await verify(base);
    const code = await (await fetch(base + '/src/greet.server.js')).text();
    assert.match(code, /fetch\(['"]\/rpc\/greet/);
    assert.doesNotMatch(code, /node:os|platform\(|这句话在 Node/);
  } finally { await server.close(); }
});

test('生产：实际服务运行双端产物，客户端不含服务器实现', async () => {
  const child = spawn(process.execPath, ['server.mjs'], { cwd: root, env: { ...process.env, PORT: '0' }, stdio: ['ignore', 'pipe', 'pipe'] });
  try {
    const base = await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('服务启动超时')), 10000);
      child.on('error', error => { clearTimeout(timer); reject(error); });
      child.stderr.on('data', data => { clearTimeout(timer); reject(new Error(String(data))); });
      child.once('exit', code => { clearTimeout(timer); reject(new Error('服务提前退出：' + code)); });
      child.stdout.on('data', data => {
        const match = String(data).match(/http:\/\/127\.0\.0\.1:\d+/);
        if (match) { clearTimeout(timer); resolve(match[0]); }
      });
    });
    await verify(base);
    const assets = await readdir(root + 'dist/client/assets');
    const code = (await Promise.all(assets.map(file => readFile(root + 'dist/client/assets/' + file, 'utf8')))).join('\n');
    assert.doesNotMatch(code, /node:os|这句话在 Node|platform\(/);
    assert.match(code, /\/rpc\/greet/);
    const entry = await readFile(root + 'dist/server/entry-server.js', 'utf8');
    assert.match(entry, /import\("\.\/assets\/greet.server-[^"]+\.js"\)/);
  } finally {
    if (child.exitCode === null) { const done = once(child, 'close'); child.kill(); await done; }
  }
});
