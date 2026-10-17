import { renderToString } from 'react-dom/server';
import { RouterProvider } from '#mini-start/router';
import { Root } from './routes/__root';
import { getRouter } from './router';
export { handleNodeRpc } from '../mini-start/runtime/node-rpc';
// server.mjs 收到页面请求后调用；先取得数据，再把同一页面组件渲染成 HTML。
export async function render() {
  const router = getRouter();
  // loader 中的 getGreeting 已编译为 createSsrRpc：本地查 provider，不发 HTTP。
  const data = await router.route.loader();
  const Page = router.route.component;
  return { data, html: renderToString(<RouterProvider data={data}><Root><Page /></Root></RouterProvider>) };
}
