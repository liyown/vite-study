import { defineConfig, loadEnv } from 'vite';
import { fileURLToPath } from 'node:url';

export default defineConfig(({ command, mode }) => {
  // 配置执行时 .env 尚未自动注入 process.env；用 loadEnv 显式读取。
  const env = loadEnv(mode, fileURLToPath(new URL('.', import.meta.url)), 'VITE_');
  console.log('[config]', { command, mode, label: env.VITE_LABEL });
  return { define: { __CONFIG_MODE__: JSON.stringify(mode) } };
});
