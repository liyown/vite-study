import test from 'node:test';
import assert from 'node:assert/strict';
import { readdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createHmac } from 'node:crypto';
import { createApp } from '../server.mjs';
const root = resolve(import.meta.dirname, '..');
async function tree(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  return (await Promise.all(entries.map(entry => entry.isDirectory() ? tree(resolve(dir, entry.name)) : readFile(resolve(dir, entry.name), 'utf8')))).join('\n');
}
const manifest = JSON.parse(await readFile(resolve(root, 'dist/client/function-manifest.json'), 'utf8'));
const id = manifest.find(entry => entry.exportName === 'getGreeting').id;
const headers = { 'Content-Type': 'application/json', 'X-Mini-Rpc': '1' };
function rpc(base, data, more = {}) { return fetch(`${base}/_server/${id}`, { method: 'POST', headers, body: JSON.stringify({ data }), ...more }); }

test('双 bundle：客户端代码/源码映射均无私有实现，服务端 provider 是独立动态 chunk', async () => {
  const client = await tree(resolve(root, 'dist/client'));
  assert.doesNotMatch(client, /SERVER_IMPLEMENTATION_ONLY_11|node:crypto|createHmac|greetingPrefix/);
  assert.match(await tree(resolve(root, 'dist/server')), /SERVER_IMPLEMENTATION_ONLY_11/);
  const report = JSON.parse(await readFile(resolve(root, 'dist/server/build-report.json'), 'utf8'));
  const chunk = report.chunks.find(chunk => chunk.modules.some(id => id.includes('?server-fn-provider')));
  assert.ok(chunk); assert.equal(chunk.dynamic, true); assert.equal(chunk.entry, false);
  const caller = await readFile(resolve(root, 'dist/server/compiled/src/utils/greeting.functions.ts.txt'), 'utf8');
  assert.match(caller, /createSsrRpc/); assert.doesNotMatch(caller, /createHmac/);
});
for (const production of [false, true]) {
  test(`${production ? '生产' : '开发'}：SSR 本地执行、HTTP RPC、验证、专属函数保护`, async () => {
    const oldSecret = process.env.DEMO_SERVER_SECRET;
    process.env.DEMO_SERVER_SECRET = 'integration-only-key';
    const app = await createApp({ production, port: 0, root });
    const base = `http://127.0.0.1:${app.server.address().port}`;
    try {
      const response = await fetch(base); assert.equal(response.status, 200);
      const html = await response.text();
      assert.match(html, /首次 SSR/); assert.match(html, /server:/);
      assert.doesNotMatch(html, /integration-only-key|SERVER_IMPLEMENTATION_ONLY_11|<!--app-html-->/);
      const data = JSON.parse(html.match(/id="loader-data" type="application\/json">([^<]*)<\/script>/)[1]);
      assert.equal(data.greeting.signature, createHmac('sha256', 'integration-only-key').update('首次 SSR').digest('hex').slice(0, 12));
      const rpcResponse = await rpc(base, { name: '学习者' }); assert.equal(rpcResponse.status, 200);
      const result = (await rpcResponse.json()).result;
      assert.match(result.message, /学习者/); assert.match(result.runtime, /^server:/);
      assert.equal(result.signature, createHmac('sha256', 'integration-only-key').update('学习者').digest('hex').slice(0, 12));
      assert.equal((await rpc(base, { name: '' })).status, 400);
      assert.equal((await rpc(base, {}, { body: '{' })).status, 400);
      assert.equal((await rpc(base, {}, { headers: { ...headers, Origin: 'https://wrong.example' } })).status, 403);
      assert.equal((await rpc(base, {}, { headers: { 'Content-Type': 'application/json' } })).status, 403);
      assert.equal((await fetch(`${base}/_server/${id}`)).status, 405);
      assert.equal((await fetch(`${base}/_server/not-a-function`)).status, 404);
      assert.equal((await rpc(base, { name: 'a'.repeat(17000) })).status, 413);
      if (!production) {
        const code = await (await fetch(`${base}/src/utils/greeting.functions.ts`)).text();
        assert.match(code, /createClientRpc/); assert.doesNotMatch(code, /createHmac|greetingPrefix/);
        const exclusive = await (await fetch(`${base}/src/utils/private.ts`)).text();
        assert.match(exclusive, /serverOnlyGuard/); assert.doesNotMatch(exclusive, /SERVER_IMPLEMENTATION_ONLY_11/);
        // 真实修改原函数体，确认后续 RPC 使用更新后的 provider，而不是客户端执行。
        const file = resolve(root, 'src/utils/greeting.functions.ts');
        const before = await readFile(file, 'utf8');
        try {
          await writeFile(file, before.replace('来自服务端的问候', '更新后的服务端问候'));
          const timeout = Date.now() + 6000;
          let updated;
          do {
            const next = await rpc(base, { name: 'HMR' }); updated = await next.json();
            if (updated.result?.message.includes('更新后的服务端问候')) break;
            await new Promise(ok => setTimeout(ok, 80));
          } while (Date.now() < timeout);
          assert.match(updated.result.message, /更新后的服务端问候/);
        } finally { await writeFile(file, before); }
      }
    } finally {
      await app.close();
      if (oldSecret === undefined) delete process.env.DEMO_SERVER_SECRET; else process.env.DEMO_SERVER_SECRET = oldSecret;
    }
  });
}
