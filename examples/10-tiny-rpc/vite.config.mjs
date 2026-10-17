import { defineConfig } from 'vite';
import { tinyRpc } from './plugin.mjs';

export default defineConfig({
  plugins: [tinyRpc()],
  builder: {}, // 让 vite build 构建下面两个环境。
  environments: {
    client: { build: { outDir: 'dist/client' } }, // index.html → main.js
    ssr: { build: {
      ssr: true, outDir: 'dist/server', minify: false,
      rolldownOptions: { input: 'src/entry-server.js', output: { entryFileNames: 'entry-server.js' } },
    } },
  },
});
