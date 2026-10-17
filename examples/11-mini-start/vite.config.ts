import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { miniStart } from './mini-start/plugin.mjs';

// 从这里看“两份程序”的根：同一套插件，被两张环境依赖图分别调用。
export default defineConfig({
  plugins: [miniStart(), react()],
  builder: {}, // 开启整应用构建，由插件的 buildApp 依次构建下面两个环境。
  environments: {
    // 浏览器根入口默认是 index.html，再由 script 找到 entry-client.tsx。
    client: {
      build: { outDir: 'dist/client', sourcemap: true },
    },
    // 服务器根入口自己指定；provider 是它的动态依赖，不是第三个 Environment。
    ssr: {
      build: {
        ssr: true,
        outDir: 'dist/server',
        minify: false,
        emitAssets: true, // 同时写出教学用的 compiled/ 与分包报告。
        rolldownOptions: {
          input: 'src/entry-server.tsx',
          output: {
            entryFileNames: 'entry-server.js',
            chunkFileNames: 'chunks/[name]-[hash].js',
          },
        },
      },
    },
  },
});
