import { renderToString } from 'react-dom/server';
import { hostname } from 'node:os'; // 只进入 SSR 依赖图。
import info from 'virtual:build-info';
import App, { type InitialData } from './App';

export function render() {
  const data: InitialData = {
    message: `SSR 在 Node 上运行，主机：${hostname()}`,
    serverEnvironment: info.environment,
  };
  return { html: renderToString(<App {...data} />), data };
}
if (import.meta.hot) import.meta.hot.accept();
