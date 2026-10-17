import { defineConfig } from 'vite';
import { traceHooks, virtualBuildInfo, noteLoader, lessonMacro, htmlAndDevApi, bundleReport } from '@vite-study/lab-plugins';

export default defineConfig({
  plugins: [traceHooks(), virtualBuildInfo(), noteLoader(), lessonMacro(), htmlAndDevApi(), bundleReport()],
  build: { sourcemap: true },
});
