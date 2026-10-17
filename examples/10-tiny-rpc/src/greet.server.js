import { platform } from 'node:os';

// 只写一次业务实现。浏览器构建时，这整个模块会被插件替换为 fetch 代理。
export default async function greet(name) {
  if (typeof name !== 'string' || !name.trim()) throw new Error('请输入名字');
  return `你好，${name}！这句话在 Node 的 ${platform()} 上生成。`;
}
