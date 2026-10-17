# 10：最小 RPC，看懂一份源码怎样编译成两份

先运行，页面输入名字、点击按钮：

```bash
# 仓库根目录
pnpm dev 10
# http://127.0.0.1:5180
```

这里只讲一个函数 `greet(name)`。先读这个例子，再看 11 的 AST 改写和多种 API。

## 1. 我们写什么

[src/greet.server.js](src/greet.server.js) 写真正的业务函数，使用 Node 的 `node:os`。
[src/main.js](src/main.js) 像普通函数一样导入、调用：

```js
import greet from './greet.server.js';
const result = await greet('小明');
```

浏览器不能运行 `node:os`。所以插件会在编译时替换浏览器拿到的这个模块。

## 2. 同一文件，编译出什么

看 [plugin.mjs](plugin.mjs) 的 `transform`，再看 [vite.config.mjs](vite.config.mjs) 的两个环境：

```text
src/greet.server.js
    ↓ transform(code, id)，根据 this.environment.name 处理
    ├─ client → 整个模块替换成代理：greet(name) → fetch('/rpc/greet')
    └─ ssr    → 不改，保留真正的 greet(name) 和 node:os

两个构建入口
    ├─ index.html → main.js → 代理函数          → dist/client/
    └─ entry-server.js → 注册表 → 真正的函数     → dist/server/
```

两边都用 Vite/Rolldown。它们是同一套构建工具的两次环境构建。

## 3. 请求到底怎么找到函数

看插件的 `resolveId` 和 `load`：它们生成一个虚拟模块，内容相当于：

```js
export const registry = {
  greet: () => import('./src/greet.server.js').then(module => module.default)
};
```

然后看 [src/entry-server.js](src/entry-server.js)，完整调用只有这条线：

```text
页面 await greet('小明')
    ↓ 浏览器执行编译后的代理
POST /rpc/greet，JSON 请求体 { "name": "小明" }
    ↓ 服务器从 URL 取出 ID：greet
registry['greet']()
    ↓ import() 加载服务器模块，取出 default 导出的函数
const fn = 真正的 greet
    ↓ await fn('小明')
{ "result": "你好，小明！这句话在 Node 的 darwin 上生成。" }
    ↓ 代理解析 JSON，return data.result
页面 await 得到字符串，显示到页面
```

**没有远程传输函数，也没有根据名字搜索源码。** 编译时生成的查找表，已经明确记录了 ID 对应哪个模块。这里的真实服务器模块，就承担了框架里 `provider` 的作用。

动态 `import()` 会让生产构建生成独立的服务器 chunk。文件名带 hash 也没关系：构建工具会把注册表中的 import 路径一起改成实际产物路径。

## 4. 开发与生产怎么运行

开发：插件的 `configureServer` 接住 `/rpc/` 请求，通过 Vite 的服务器环境加载 `entry-server.js`，执行 `handleRpc`。

生产：下面先构建两端，再由 [server.mjs](server.mjs) 提供页面和 RPC：

```bash
pnpm --filter @vite-study/10-tiny-rpc build
pnpm --filter @vite-study/10-tiny-rpc start
# http://127.0.0.1:4180
```

这个教学版本固定一个文件、一个 default 函数、一个 ID。用“替换整个模块”来展示两端编译；11 再进一步用 AST 从同一模块里提取特定函数，对照 TanStack Start 的做法。

## 继续学习

[课程目录](../../README.md) · [上一节：Node API](../09-fullstack-api/README.md) · [下一节：框架式编译](../11-mini-start/README.md)
