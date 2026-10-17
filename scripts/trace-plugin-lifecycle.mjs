// 用临时项目观察真实调度；退出时删除临时文件并关闭服务。
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { build, createServer, preview, version, rolldownVersion } from 'vite';

const root = await mkdtemp(resolve(tmpdir(), 'vite-hook-trace-'));
const traces = {};
function plugin(events, failure) {
  const record = (hook, extra) => events.push({ hook, ...(extra === undefined ? {} : { detail: extra }) });
  return {
    name: 'study:hook-trace', enforce: 'pre',
    config() { record('config'); },
    configEnvironment(name) { record('configEnvironment', name); },
    configResolved() { record('configResolved'); },
    applyToEnvironment(env) { record('applyToEnvironment', env.name); return true; },
    options() { record('options'); },
    outputOptions() { record('outputOptions'); },
    buildStart() { record('buildStart'); this.warn('controlled trace warning'); },
    onLog(level) { record('onLog', level); return false; },
    resolveId(id) {
      if (id.startsWith('virtual:')) { record('resolveId', id); return '\0' + id; }
    },
    resolveDynamicImport(id) { record('resolveDynamicImport', id); return null; },
    load(id) {
      if (!id.startsWith('\0virtual:')) return;
      record('load', id.slice(1));
      if (id.endsWith('lazy')) return 'export const value = 42';
      const ref = this.emitFile({ type: 'asset', name: 'hello.txt', source: 'hello' });
      return `console.log(import.meta.ROLLUP_FILE_URL_${ref}); import('virtual:lazy').then(console.log);`;
    },
    transform(code, id) {
      if (!id.startsWith('\0virtual:')) return;
      record('transform', id.slice(1));
      if (failure === 'transform') throw new Error('controlled transform failure');
    },
    moduleParsed(info) { if (info.id.startsWith('\0virtual:')) record('moduleParsed', info.id.slice(1)); },
    buildEnd(error) { record('buildEnd', error ? 'error' : 'success'); },
    renderStart() { record('renderStart'); },
    banner() { record('banner'); return '/* banner */'; },
    intro() { record('intro'); return '/* intro */'; },
    outro() { record('outro'); return '/* outro */'; },
    footer() { record('footer'); return '/* footer */'; },
    renderChunk() { record('renderChunk'); if (failure === 'render') throw new Error('controlled render failure'); },
    augmentChunkHash() { record('augmentChunkHash'); return 'study'; },
    resolveFileUrl({ fileName }) { record('resolveFileUrl'); return JSON.stringify('/' + fileName); },
    generateBundle(_, bundle, isWrite) { record('generateBundle', { isWrite, hasHtml: 'index.html' in bundle }); },
    writeBundle() { record('writeBundle'); },
    renderError() { record('renderError'); },
    closeBundle(error) { record('closeBundle', error ? 'error' : 'success'); },
    configureServer() { record('configureServer'); return () => record('configureServer:post'); },
    transformIndexHtml() { record('transformIndexHtml'); },
    closeServer({ reason }) { record('closeServer', reason); },
    configurePreviewServer() { record('configurePreviewServer'); return () => record('configurePreviewServer:post'); },
    closePreviewServer() { record('closePreviewServer'); },
  };
}
try {
  await mkdir(resolve(root, 'src'));
  await writeFile(resolve(root, 'index.html'), '<div id="app"></div><script type="module" src="virtual:main"></script>');
  await writeFile(resolve(root, 'src/main.js'), 'export const value = 1');
  for (const [name, write, failure] of [
    ['build-memory', false], ['build-write', true], ['build-transform-error', false, 'transform'], ['build-render-error', false, 'render'],
  ]) {
    const events = traces[name] = [];
    let caught;
    try { await build({ root, configFile: false, logLevel: 'silent', plugins: [plugin(events, failure)], build: { write, minify: false } }); }
    catch (error) { caught = error; }
    assert.equal(Boolean(caught), Boolean(failure), name);
    if (failure) assert.match(caught.message, /controlled (transform|render) failure/);
  }
  const devEvents = traces.dev = [];
  const server = await createServer({ root, configFile: false, logLevel: 'silent', plugins: [plugin(devEvents)], server: { host: '127.0.0.1', port: 0, watch: null, ws: false } });
  try {
    await server.listen();
    await server.transformIndexHtml('/', '<script type="module" src="/src/main.js"></script>');
    await server.environments.client.transformRequest('/src/main.js');
  } finally { await server.close(); }
  const previewEvents = traces.preview = [];
  const previewServer = await preview({ root, configFile: false, logLevel: 'silent', plugins: [plugin(previewEvents)], preview: { host: '127.0.0.1', port: 0 } });
  await previewServer.close();

  const memory = traces['build-memory'].map(e => e.hook);
  assert.ok(memory.indexOf('outputOptions') < memory.indexOf('buildStart'));
  assert.ok(memory.indexOf('buildEnd') < memory.indexOf('renderStart'));
  assert.ok(memory.indexOf('generateBundle') < memory.indexOf('transformIndexHtml'));
  assert.ok(memory.includes('resolveFileUrl'));
  assert.ok(!memory.includes('writeBundle'));
  assert.ok(traces['build-write'].some(e => e.hook === 'writeBundle'));
  assert.ok(traces['build-render-error'].some(e => e.hook === 'renderError'));
  assert.ok(!devEvents.some(e => ['renderStart', 'moduleParsed', 'generateBundle'].includes(e.hook)));
  assert.ok(previewEvents.some(e => e.hook === 'closePreviewServer'));
  const result = { versions: { vite: version, rolldown: rolldownVersion }, scope: '受控示例：内存构建、写盘构建、转换失败、输出失败、默认 dev、preview；非所有 Hook 的穷举执行测试。日志顺序仅代表此示例。', traces };
  const target = resolve(import.meta.dirname, '../docs/plugin-hooks.trace.json');
  await writeFile(target, JSON.stringify(result, null, 2) + '\n');
  console.log(`已写入 ${target}；6 条路径与关键顺序断言通过。`);
} finally { await rm(root, { recursive: true, force: true }); }
