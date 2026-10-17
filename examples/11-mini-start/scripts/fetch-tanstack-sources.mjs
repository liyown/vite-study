// 下载固定 commit 的一手参考源码，并核对记录的内容哈希。
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { createHash } from 'node:crypto';
const manifest = JSON.parse(await readFile(new URL('../tanstack-source-manifest.json', import.meta.url), 'utf8'));
const destination = resolve(import.meta.dirname, '../../../.sources/tanstack-start');
for (const file of manifest.files) {
  const url = `https://raw.githubusercontent.com/TanStack/router/${manifest.commit}/${file}`;
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${response.status}: ${url}`);
  const bytes = Buffer.from(await response.arrayBuffer());
  if (createHash('sha256').update(bytes).digest('hex') !== manifest.sha256[file]) throw new Error(`源码内容校验失败：${file}`);
  const target = resolve(destination, file);
  await mkdir(dirname(target), { recursive: true });
  await writeFile(target, bytes);
}
console.log(`已下载并校验 ${manifest.files.length} 个官方源码/许可文件：${destination}`);
