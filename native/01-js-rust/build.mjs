// 只用于本机实验：Cargo 编译动态库，再复制为 Node 能加载的 .node 文件。
// 无需安装额外 npm 构建工具，也不生成多平台发布包装。
import { spawnSync } from 'node:child_process';
import { copyFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const root = import.meta.dirname;
const result = spawnSync('cargo', ['build', '--locked', '--release', '--target-dir', resolve(root, 'target')], {
  cwd: root,
  stdio: 'inherit',
});
if (result.error) throw result.error;
if (result.status !== 0) process.exit(result.status ?? 1);

const library = {
  darwin: 'libvite_study_js_rust.dylib',
  linux: 'libvite_study_js_rust.so',
  win32: 'vite_study_js_rust.dll',
}[process.platform];
if (!library) throw new Error(`此构建脚本未配置平台：${process.platform}`);
await copyFile(resolve(root, 'target/release', library), resolve(root, 'addon.node'));
console.log('[build] addon.node 已生成');
