import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
export default defineConfig({
  build: {
    outDir: 'dist/lib',
    lib: { entry: fileURLToPath(new URL('./src/math.ts', import.meta.url)), formats: ['es'], fileName: 'math' },
  },
});
