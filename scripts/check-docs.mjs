// 检查可交付教材，不遍历依赖、生成产物或可选源码下载。
import assert from 'node:assert/strict';
import { readFile, readdir, access } from 'node:fs/promises';
import { resolve, dirname, relative } from 'node:path';
const root = resolve(import.meta.dirname, '..');
const ignored = new Set(['node_modules', 'dist', 'target', '.sources', 'output']);
async function markdown(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const groups = await Promise.all(entries.map(entry => {
    if (ignored.has(entry.name) || entry.isSymbolicLink()) return [];
    const file = resolve(dir, entry.name);
    return entry.isDirectory() ? markdown(file) : entry.name.endsWith('.md') ? [file] : [];
  }));
  return groups.flat();
}
const docs = [resolve(root, 'README.md'), ...(await Promise.all(['articles', 'docs', 'examples', 'native'].map(dir => markdown(resolve(root, dir))))).flat()];
const withoutCode = text => text.replace(/^(```|~~~)[^\n]*\n[\s\S]*?^\1\s*$/gm, '');
function headings(text) {
  const used = new Map();
  const result = new Set([...withoutCode(text).matchAll(/^#{1,6}\s+(.+)$/gm)].map(match => {
    const slug = match[1].replace(/<[^>]*>/g, '').replace(/[^\p{L}\p{N}\p{M}_\- ]/gu, '').toLowerCase().replaceAll(' ', '-');
    const n = used.get(slug) ?? 0; used.set(slug, n + 1);
    return slug + (n ? '-' + n : '');
  }));
  for (const match of text.matchAll(/<(?:a|span)\s+id=["']([^"']+)["']/g)) result.add(match[1]);
  return result;
}
let links = 0;
let generated = 0;
for (const file of docs) {
  const source = await readFile(file, 'utf8');
  assert.doesNotMatch(source, /\/Users\/[^\s)]+/, '教材含机器专属路径：' + relative(root, file));
  for (const match of withoutCode(source).matchAll(/\]\(([^)]+)\)/g)) {
    const url = match[1].replace(/^<|>$/g, '');
    if (/^[a-z][a-z\d+.-]*:/i.test(url)) continue;
    const [path, hash] = url.split('#');
    const target = path ? resolve(dirname(file), decodeURIComponent(path)) : file;
    // 产物链接是阅读构建结果的入口；源教材验证不要求先下载参考仓库。
    if (target.includes('/dist/')) {
      generated++;
      if (!process.argv.includes('--built')) continue;
    }
    await access(target).catch(() => { throw new Error(`${relative(root, file)}：链接不存在 ${url}`); });
    if (hash && target.endsWith('.md')) {
      assert.ok(headings(await readFile(target, 'utf8')).has(decodeURIComponent(hash)), `${relative(root, file)}：锚点不存在 ${url}`);
    }
    links++;
  }
}
const lessons = (await readdir(resolve(root, 'examples'))).sort();
assert.equal(lessons.length, 11);
const launcher = await readFile(resolve(root, 'scripts/dev.mjs'), 'utf8');
const home = await readFile(resolve(root, 'README.md'), 'utf8');
for (const [i, name] of lessons.entries()) {
  const number = String(i + 1).padStart(2, '0');
  assert.ok(name.startsWith(number + '-'), `课程顺序错误：${name}`);
  const pkg = JSON.parse(await readFile(resolve(root, 'examples', name, 'package.json'), 'utf8'));
  assert.equal(pkg.name, '@vite-study/' + name);
  assert.ok(launcher.includes(name) && home.includes(`examples/${name}/README.md`));
  const readme = await readFile(resolve(root, 'examples', name, 'README.md'), 'utf8');
  assert.ok(readme.includes(`pnpm dev ${number}`) && readme.includes(`:${5170 + i + 1}`), `启动说明不一致：${name}`);
  if (i + 1 < lessons.length) assert.ok(readme.includes(`../${lessons[i + 1]}/README.md`), `缺少下一节导航：${name}`);
}
console.log(`${docs.length} 篇文档，${links} 个本地链接/锚点通过；${generated} 个构建产物链接${process.argv.includes('--built') ? '已检查' : '留待 --built 检查'}；11 节编号与启动说明一致。`);
