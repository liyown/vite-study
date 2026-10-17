// 从实际安装的类型声明提取全量成员，防止生命周期文档静默漏项。
// --write 更新版本化清单；默认检查清单与文档，不执行任何业务插件。
import assert from 'node:assert/strict';
import { readFile, readdir, writeFile } from 'node:fs/promises';
import { dirname, relative, resolve } from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { parseSync } from 'vite';

const root = resolve(import.meta.dirname, '..');
const viteEntry = fileURLToPath(import.meta.resolve('vite'));
async function packageRoot(entry, name) {
  let dir = dirname(entry);
  while (true) {
    try {
      const pkg = JSON.parse(await readFile(resolve(dir, 'package.json'), 'utf8'));
      if (pkg.name === name) return { dir, version: pkg.version };
    } catch (error) { if (error.code !== 'ENOENT') throw error; }
    const parent = dirname(dir);
    if (parent === dir) throw new Error(`找不到包：${name}`);
    dir = parent;
  }
}
const vite = await packageRoot(viteEntry, 'vite');
const rolldown = await packageRoot(createRequire(viteEntry).resolve('rolldown'), 'rolldown');
const viteTypes = resolve(vite.dir, 'dist/node/index.d.ts');
const sharedDir = resolve(rolldown.dir, 'dist/shared');
const candidates = (await readdir(sharedDir)).filter(name => name.endsWith('.d.mts'));
let rolldownTypes;
for (const name of candidates) {
  const file = resolve(sharedDir, name);
  if ((await readFile(file, 'utf8')).includes('interface FunctionPluginHooks {')) {
    assert.ok(!rolldownTypes, '出现多个 FunctionPluginHooks，需要重新核对继承关系');
    rolldownTypes = file;
  }
}
assert.ok(rolldownTypes, '未找到 Rolldown Hook 声明');

function visit(node, fn) {
  if (!node || typeof node !== 'object') return;
  if (typeof node.type === 'string') fn(node);
  for (const [key, value] of Object.entries(node)) {
    if (key === 'comments') continue;
    if (Array.isArray(value)) value.forEach(item => visit(item, fn));
    else if (value && typeof value === 'object') visit(value, fn);
  }
}
async function declarations(file, names) {
  const code = await readFile(file, 'utf8');
  const ast = parseSync(file, code, { lang: 'ts', astType: 'ts' });
  assert.equal(ast.errors.length, 0, `类型解析失败：${file}`);
  const interfaces = new Map();
  visit(ast.program, node => {
    if (node.type !== 'TSInterfaceDeclaration' || !names.includes(node.id.name)) return;
    assert.ok(!interfaces.has(node.id.name), `接口 ${node.id.name} 有多处定义，需要显式合并`);
    interfaces.set(node.id.name, node.body.body.map(member => {
      const key = member.key;
      const name = key.name ?? key.property?.name ?? key.value;
      assert.equal(typeof name, 'string', '无法识别成员名');
      return {
        name,
        interface: node.id.name,
        file: relative(root, file).replaceAll('\\', '/'),
        line: code.slice(0, member.start).split('\n').length,
        declaration: code.slice(member.start, member.end),
      };
    }));
  });
  for (const name of names) assert.ok(interfaces.has(name), `接口不存在：${name}`);
  return interfaces;
}
const v = await declarations(viteTypes, ['Plugin']);
const r = await declarations(rolldownTypes, ['FunctionPluginHooks', 'AddonHooks', 'OutputPlugin', 'Plugin', 'MinimalPluginContext', 'PluginContext', 'TransformPluginContext']);
const controls = new Set(['sharedDuringBuild', 'perEnvironmentStartEndDuringDev', 'perEnvironmentWatchChangeDuringDev', 'enforce', 'apply']);
const hooks = new Map();
for (const item of [...r.get('FunctionPluginHooks'), ...r.get('AddonHooks')]) {
  assert.ok(!hooks.has(item.name), `重复 Hook：${item.name}`);
  hooks.set(item.name, { name: item.name, declaredBy: 'rolldown', sources: [item] });
}
for (const item of v.get('Plugin')) {
  if (controls.has(item.name)) continue;
  const previous = hooks.get(item.name);
  hooks.set(item.name, { name: item.name, declaredBy: previous ? 'vite-override' : 'vite', sources: [...(previous?.sources ?? []), item] });
}
const properties = [...r.get('OutputPlugin'), ...r.get('Plugin'), ...v.get('Plugin').filter(item => controls.has(item.name))];
const inventory = {
  scope: 'Vite Plugin + inherited Rolldown FunctionPluginHooks / AddonHooks; apply is a control property',
  versions: { vite: vite.version, rolldown: rolldown.version },
  hooks: [...hooks.values()].sort((a, b) => a.name.localeCompare(b.name)),
  properties: properties.sort((a, b) => a.name.localeCompare(b.name)),
  contextInterfaces: Object.fromEntries(['MinimalPluginContext', 'PluginContext', 'TransformPluginContext'].map(name => [name, r.get(name)])),
};
const inventoryFile = resolve(root, 'docs/plugin-hooks.inventory.json');
if (process.argv.includes('--write')) await writeFile(inventoryFile, JSON.stringify(inventory, null, 2) + '\n');
else assert.deepEqual(JSON.parse(await readFile(inventoryFile, 'utf8')), inventory, '清单与当前安装版本不同，请重新调研并执行 --write');

const [doc, reference] = await Promise.all([
  readFile(resolve(root, 'docs/plugin-lifecycle.md'), 'utf8'),
  readFile(resolve(root, 'docs/plugin-hooks-reference.md'), 'utf8'),
]);
const flows = [...doc.matchAll(/```text\n([\s\S]*?)```/g)].map(match => match[1]).join('\n');
assert.ok(/[↓→]/.test(flows), '正文应使用箭头串联数据流');
for (const hook of inventory.hooks) {
  assert.ok(new RegExp(`\\b${hook.name}\\b`).test(flows), `${hook.name} 未出现在正文箭头流程中`);
  const anchor = `<a id="hook-${hook.name}"></a>`;
  assert.equal(reference.split(anchor).length - 1, 1, `${hook.name} 附录必须有且只有一处详细说明`);
  const section = reference.slice(reference.indexOf(anchor)).split(/\n<a id="/)[0];
  for (const label of ['输入：', '返回：', '下游：', '场景：', '证据：']) assert.ok(section.includes(label), `${hook.name} 缺少 ${label}`);
}
for (const property of inventory.properties) assert.ok(reference.includes(`\`${property.name}\``), `配置属性未记录：${property.name}`);
console.log(`Vite ${vite.version} / Rolldown ${rolldown.version}: 正文箭头覆盖 ${inventory.hooks.length} 个 Hook/选择回调；附录完整记录这些 Hook 与 ${inventory.properties.length} 个配置属性。`);
