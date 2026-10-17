import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir, mkdtemp, writeFile, rm } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import { runInNewContext } from 'node:vm';
import { build, createServer, preview } from 'vite';
import { createApp } from '../examples/08-environments-ssr/server.mjs';
import { createApiServer } from '../examples/09-fullstack-api/server.mjs';

const root = name => resolve('examples', name);
const jsonFile = async file => JSON.parse(await readFile(file, 'utf8'));
async function scriptsIn(directory) {
  const files = await readdir(directory, { withFileTypes: true });
  return (await Promise.all(files.map(file => file.isDirectory() ? scriptsIn(resolve(directory, file.name)) : file.name.endsWith('.js') ? readFile(resolve(directory, file.name), 'utf8') : ''))).join('\n');
}
async function listen(server) {
  await new Promise((ok, fail) => { server.once('error', fail); server.listen(0, '127.0.0.1', ok); });
  return `http://127.0.0.1:${server.address().port}`;
}
async function close(server) {
  server.closeAllConnections();
  await new Promise((ok, fail) => server.close(error => error ? fail(error) : ok()));
}

test('01：动态 import 产生独立 chunk，未使用的导出被移除', async () => {
  const dist = root('01-vanilla/dist');
  const manifest = await jsonFile(resolve(dist, '.vite/manifest.json'));
  assert.ok(manifest['src/editor.ts'].isDynamicEntry);
  assert.ok(manifest['index.html'].dynamicImports.includes('src/editor.ts'));
  assert.doesNotMatch(await scriptsIn(dist), /UNUSED_TREE_SHAKING_MARKER/);
});

test('02：alias、raw、CSS Module、glob、Worker 与 public 的开发和构建结果', async () => {
  const directory = root('02-project-basics');
  const vite = await createServer({ root: directory, logLevel: 'silent', server: { middlewareMode: true, watch: null } });
  try {
    const { code } = await vite.transformRequest('/src/main.ts');
    assert.match(code, /\/src\/message.ts/);
    assert.doesNotMatch(code, /import\.meta\.glob/);
    assert.match((await vite.transformRequest('/src/note.txt?raw')).code, /原始文本/);
    assert.match((await vite.transformRequest('/src/card.module.css')).code, /card/);
  } finally { await vite.close(); }
  const dist = resolve(directory, 'dist');
  const manifest = await jsonFile(resolve(dist, '.vite/manifest.json'));
  assert.equal(Object.values(manifest).filter(entry => entry.isDynamicEntry).length, 2);
  const files = await readdir(resolve(dist, 'assets'));
  assert.ok(files.some(name => /^mark-.+\.svg$/.test(name)));
  assert.ok(files.some(name => /^sum\.worker-.+\.js$/.test(name)));
  assert.match(await readFile(resolve(dist, 'handbook.txt'), 'utf8'), /PUBLIC_FILE_UNCHANGED/);
  assert.match(await scriptsIn(dist), /MODULE_ARTICLE/);
});

test('02：类型别名实验覆盖继承映射后失败，恢复继承后通过', async () => {
  const temporary = await mkdtemp(root('02-project-basics/.alias-check-'));
  const configFile = resolve(temporary, 'tsconfig.json');
  const config = { extends: '../tsconfig.json', include: ['../src/main.ts'], compilerOptions: { paths: {} } };
  const check = () => spawnSync('pnpm', ['exec', 'tsc', '--noEmit', '-p', configFile], { encoding: 'utf8' });
  try {
    await writeFile(configFile, JSON.stringify(config));
    const failed = check();
    assert.equal(failed.status, 1);
    assert.match(failed.stdout, /TS2307: Cannot find module '@\/message'/);
    delete config.compilerOptions.paths;
    await writeFile(configFile, JSON.stringify(config));
    const restored = check();
    assert.equal(restored.status, 0, restored.stdout + restored.stderr);
  } finally { await rm(temporary, { recursive: true, force: true }); }
});

test('06：多页面、base、动态分包、静态资源可达与库导出', async () => {
  const directory = root('06-build-deploy');
  const manifest = await jsonFile(resolve(directory, 'dist/.vite/manifest.json'));
  assert.ok(manifest['index.html'].isEntry && manifest['admin/index.html'].isEntry);
  assert.ok(manifest['src/lazy.ts'].isDynamicEntry);
  assert.ok(manifest['index.html'].dynamicImports.includes('src/lazy.ts'));
  const { add } = await import('../examples/06-build-deploy/dist/lib/math.js');
  assert.equal(add(2, 3), 5);
  const server = await preview({ root: directory, logLevel: 'silent', preview: { host: '127.0.0.1', port: 0, strictPort: false } });
  try {
    const base = `http://127.0.0.1:${server.httpServer.address().port}`;
    for (const path of ['/study/', '/study/admin/']) {
      const response = await fetch(base + path); assert.equal(response.status, 200);
      const html = await response.text();
      const scriptUrl = html.match(/<script[^>]*src="([^"]+)"/)[1];
      assert.ok(scriptUrl.startsWith('/study/assets/'));
      const script = await fetch(base + scriptUrl); assert.equal(script.status, 200);
      assert.match(script.headers.get('content-type'), /javascript/);
    }
    const lazy = await fetch(base + '/study/' + manifest['src/lazy.ts'].file);
    assert.match(await lazy.text(), /LAZY_DEPLOY_MARKER/);
  } finally { await server.close(); }
});

test('03 ↔ 04：两者都转换 JSX，只有 react 插件注入 Refresh', async () => {
  for (const [name, refresh] of [['03-react-bare', false], ['04-react-refresh', true]]) {
    const vite = await createServer({ root: root(name), logLevel: 'silent', server: { middlewareMode: true, watch: null } });
    try {
      const { code } = await vite.transformRequest('/src/Counter.tsx');
      assert.doesNotMatch(code, /<section>/);
      assert.equal(/\$RefreshReg\$|registerExportsForReactRefresh/.test(code), refresh);
    } finally { await vite.close(); }
  }
});

test('05：staging mode 的 build 仍是 PROD，私密变量没有进入客户端', async () => {
  // createServer 会默认设 NODE_ENV=development；隔离同进程前一个实验的影响。
  const previous = process.env.NODE_ENV;
  process.env.NODE_ENV = 'production';
  let output;
  try {
    output = await build({ root: root('05-modes'), mode: 'staging', logLevel: 'silent', build: { write: false, minify: false, modulePreload: false } });
  } finally {
    if (previous === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = previous;
  }
  const code = output.output.find(file => file.type === 'chunk' && file.isEntry).code;
  assert.doesNotMatch(code, /demo-secret-never-expose/);
  const values = {};
  runInNewContext(code, { document: { querySelector: id => values[id] ??= {} } });
  const observed = JSON.parse(values['#values'].textContent);
  assert.equal(observed.MODE, 'staging');
  assert.equal(observed.label, 'staging');
  assert.equal(observed.PROD, true);
  assert.equal(observed.DEV, false);
  assert.equal(observed.featureRaw, 'true');
  assert.equal(observed.featureEnabled, true);
});

test('08：client/ssr 报告分离，共享组件参与两次构建，Node 模块不泄漏', async () => {
  const client = await jsonFile(root('08-environments-ssr/dist/client/study-report.json'));
  const server = await jsonFile(root('08-environments-ssr/dist/server/study-report.json'));
  assert.equal(client.environment, 'client'); assert.equal(server.environment, 'ssr');
  for (const report of [client, server]) assert.ok(report.modules.includes('src/App.tsx'));
  assert.ok(client.modules.includes('src/entry-client.tsx'));
  assert.ok(!client.modules.includes('src/entry-server.tsx'));
  assert.ok(server.modules.includes('src/entry-server.tsx'));
  assert.doesNotMatch(await scriptsIn(root('08-environments-ssr/dist/client')), /node:os|SSR 在 Node 上运行，主机/);
});

test('08：移除 builder 的配置仅执行 client 构建', async () => {
  const output = await build({ root: root('08-environments-ssr'), configFile: root('08-environments-ssr/vite.client-only.config.ts'), logLevel: 'silent', build: { write: false } });
  const report = output.output.find(file => file.fileName === 'study-report.json');
  assert.equal(JSON.parse(report.source).environment, 'client');
  assert.ok(output.output.some(file => file.fileName === 'index.html'));
  assert.ok(!output.output.some(file => file.fileName === 'entry-server.js'));
});

for (const production of [false, true]) {
  test(`08：${production ? '生产' : '开发'} SSR 返回正文、共享数据和可加载的浏览器模块`, async () => {
    const app = await createApp({ production, port: 0 });
    try {
      const base = `http://127.0.0.1:${app.server.address().port}`;
      const response = await fetch(base);
      assert.equal(response.status, 200);
      const html = await response.text();
      assert.match(html, /同一组件，两份程序/);
      assert.match(html, /SSR 在 Node 上运行/);
      assert.doesNotMatch(html, /<!--ssr-outlet-->/);
      const data = JSON.parse(html.match(/id="initial-data" type="application\/json">([^<]*)<\/script>/)[1]);
      assert.equal(data.serverEnvironment, 'ssr');
      assert.ok(data.message.startsWith('SSR 在 Node 上运行'));
      const scriptUrl = html.match(/<script[^>]*type="module"[^>]*src="([^"]+)"/)[1];
      const script = await fetch(base + scriptUrl);
      assert.equal(script.status, 200);
      assert.match(script.headers.get('content-type'), /javascript/);
      assert.equal((await fetch(base + '/missing')).status, 404);
    } finally { await app.close(); }
  });
}

test('09：真实 API 支持读写，拒绝空数据、错误 JSON 和不存在的接口', async () => {
  const server = createApiServer({ serveClient: true });
  const base = await listen(server);
  const post = text => fetch(base + '/api/notes', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: text });
  try {
    assert.equal((await fetch(base)).status, 200);
    assert.equal((await fetch(base + '/api/notes').then(r => r.json())).length, 1);
    const created = await post(JSON.stringify({ text: '端到端笔记' }));
    assert.equal(created.status, 201);
    assert.equal((await created.json()).text, '端到端笔记');
    assert.equal((await fetch(base + '/api/notes').then(r => r.json())).length, 2);
    assert.equal((await post('{broken')).status, 400);
    assert.equal((await post('{"text":"  "}')).status, 400);
    assert.equal((await post(JSON.stringify({ text: 'a'.repeat(121) }))).status, 400);
    assert.equal((await fetch(base + '/api/missing')).status, 404);
    assert.equal((await fetch(base + '/api/notes', { method: 'DELETE' })).status, 405);
  } finally { await close(server); }
});

test('09：开发代理把浏览器的 /api 转发到 Node', async () => {
  const api = createApiServer();
  const apiUrl = await listen(api);
  const vite = await createServer({ root: root('09-fullstack-api'), logLevel: 'silent', server: { host: '127.0.0.1', port: 0, proxy: { '/api': apiUrl } } });
  try {
    await vite.listen();
    const response = await fetch(`http://127.0.0.1:${vite.httpServer.address().port}/api/notes`);
    assert.equal(response.status, 200);
    assert.equal((await response.json())[0].id, 'welcome');
  } finally { await vite.close(); await close(api); }
});

test('07：插件生成 HTML 标记、虚拟模块、转换文本和报告', async () => {
  const dist = root('07-plugin-lab/dist');
  assert.match(await readFile(resolve(dist, 'index.html'), 'utf8'), /html-hook-was-here/);
  const code = await scriptsIn(dist);
  assert.match(code, /这句话由 transform Hook 生成/);
  assert.doesNotMatch(code, /__LESSON_WORD__/);
  assert.match(code, /自定义格式/);
  const report = await jsonFile(resolve(dist, 'study-report.json'));
  assert.equal(report.environment, 'client');
  assert.ok(report.modules.includes('src/lesson.note.md'));
});

test('07：configureServer 开发 API 可用，SSR/客户端获得不同的虚拟模块', async () => {
  const vite = await createServer({ root: root('07-plugin-lab'), logLevel: 'silent', server: { host: '127.0.0.1', port: 0 } });
  try {
    await vite.listen();
    const response = await fetch(`http://127.0.0.1:${vite.httpServer.address().port}/__study`);
    assert.equal((await response.json()).source, 'configureServer');
    const { default: info } = await vite.environments.ssr.runner.import('virtual:build-info');
    assert.equal(info.environment, 'ssr');
    const result = await vite.transformRequest('/src/lesson.note.md');
    assert.match(result.code, /export default/);
    assert.match(result.code, /自定义格式/);
  } finally { await vite.close(); }
});
