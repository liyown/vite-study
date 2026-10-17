import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { virtualBuildInfo, bundleReport } from '@vite-study/lab-plugins';

export default defineConfig({
  plugins: [react(), virtualBuildInfo(), bundleReport()],
  // 开启整应用构建。只有 environments 配置并不会让普通 build 构建全部环境。
  builder: {},
  environments: {
    client: { build: { outDir: 'dist/client' } }, // 默认 HTML 入口
    ssr: {
      build: {
        ssr: true,
        outDir: 'dist/server',
        rolldownOptions: {
          input: 'src/entry-server.tsx',
          output: { entryFileNames: 'entry-server.js' },
        },
      },
    },
  },
});
