import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';

export default defineConfig({
  resolve: {
    // 构建器的别名：与 tsconfig 的编辑器/类型解析配置分别设置。
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  build: { assetsInlineLimit: 0, manifest: true }, // 让 SVG 确实输出文件，便于观察 URL 改写。
});
