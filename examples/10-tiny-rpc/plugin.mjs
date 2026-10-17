import { resolve } from 'node:path';

export function tinyRpc() {
  let functionFile;
  return {
    name: 'tiny-rpc',
    // ① 为了只看主线，本例固定一个模块、一个 default 导出、一个 ID：greet。
    configResolved(config) {
      functionFile = resolve(config.root, 'src/greet.server.js');
    },
    // ② 服务器入口 import 这个名字时，转到我们的虚拟模块。
    resolveId(id) {
      if (id === 'virtual:rpc-registry') return '\0rpc-registry';
    },
    load(id) {
      if (id !== '\0rpc-registry') return;
      // 返回源码：ID → 加载模块 → 取 default 函数。此刻还没有执行 import()。
      return `export const registry = {
        greet: () => import(${JSON.stringify(functionFile)}).then(module => module.default)
      };`;
    },
    // ③ 同一文件：服务器端保留原代码；浏览器端改成下面的代理函数。
    transform(_code, id) {
      if (id !== functionFile || this.environment.name !== 'client') return;
      return { code: `
        export default async function greet(name) {
          const response = await fetch('/rpc/greet', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name })
          });
          const data = await response.json();
          if (!response.ok) throw new Error(data.error);
          return data.result;
        }
      `, map: null };
    },
    // ④ 开发时把 HTTP 请求交给服务器入口；业务函数查找仍由入口里的注册表完成。
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        if (!req.url?.startsWith('/rpc/')) return next();
        server.environments.ssr.runner.import('/src/entry-server.js')
          .then(module => module.handleRpc(req, res)).catch(next);
      });
    },
  };
}
