import { defineConfig } from 'vite';
import base from './vite.config';
// 对照实验：同一份 environments 声明，移除 builder 后仅构建 client。
export default defineConfig({ ...base, builder: undefined });
