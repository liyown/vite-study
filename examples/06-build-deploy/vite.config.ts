import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
const file = (name: string) => fileURLToPath(new URL(name, import.meta.url));
export default defineConfig({
  base: '/study/',
  build: {
    manifest: true,
    sourcemap: true,
    rolldownOptions: { input: { home: file('index.html'), admin: file('admin/index.html') } },
  },
});
