import { cp, mkdtemp, symlink, readFile, writeFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { createBuilder } from 'vite';
// 两次构建都在临时副本中进行，错误版不会写回课程源码。
const original = resolve(import.meta.dirname, '..');
for (const mode of ['empty', 'safe']) {
  const directory = await mkdtemp(resolve(tmpdir(), 'vite-map-probe-'));
  try {
    await cp(original, directory, { recursive: true, filter: path => !path.includes('/node_modules') && !path.includes('/dist') });
    await symlink(resolve(original, 'node_modules'), resolve(directory, 'node_modules'), 'dir');
    if (mode === 'empty') {
      const file = resolve(directory, 'mini-start/compiler.mjs');
      const code = await readFile(file, 'utf8');
      const expected = 'map: makeSafeSourceMap(output, file, mode)';
      if (!code.includes(expected)) throw new Error('编译器返回值已变更，请先更新此对照脚本');
      await writeFile(file, code.replace(expected, "map: { mappings: '' }"));
    }
    const builder = await createBuilder({ root: directory, logLevel: 'silent', configLoader: 'runner' });
    await builder.buildApp();
    const files = await readdir(resolve(directory, 'dist/client/assets'));
    // JS 中删掉实现还不够：map 的 sourcesContent 也是公开内容。
    let leaked = false;
    for (const file of files.filter(file => file.endsWith('.map'))) {
      const map = JSON.parse(await readFile(resolve(directory, 'dist/client/assets', file), 'utf8'));
      if (JSON.stringify(map.sourcesContent).includes('createHmac')) leaked = true;
    }
    console.log(JSON.stringify({ mode, sourcesContentContainsCreateHmac: leaked }));
  } finally { await rm(directory, { recursive: true, force: true }); }
}
