# 08 · React 多 Environment + SSR

本节将同一个 App.tsx 处理两遍：**浏览器负责水合与交互，Node 负责生成首屏 HTML。**

## 运行与源码路线

```bash
pnpm dev 08
# http://127.0.0.1:5178
```

先读 `vite.config.ts → src/entry-server.tsx → src/App.tsx → src/entry-client.tsx → server.mjs`。

```text
client: HTML → entry-client → hydrateRoot + App + CSS
ssr:    entry-server → renderToString + App + node:os
```

同一 App.tsx 出现在两张模块图中，但入口、解析上下文与可用 API 不同。Node 专用 hostname 只在服务器入口导入；不要在共享组件顶层读取 window 或导入 Node 模块。

## 实验 A：服务端到底做了什么

使用“查看网页源代码”，而非仅看 Elements：源代码已有标题、服务器主机名和计数按钮 HTML。浏览器还没运行 React 也能显示正文。

禁用 JS 刷新：正文仍有，计数不可用。重新启用 JS 刷新，按钮可用，页脚的 client-env 被浏览器入口填为 client。这一步叫水合：给服务器已有 HTML 接上 React 交互。

模板携带 initial-data，客户端首次渲染使用同一份数据；不要在浏览器首次渲染重新计算随机数、当前时间或服务器信息，否则可能出现 hydration mismatch。JSON 写入 script 时对 `<` 转义，避免 `</script>` 提前结束标签。

## 实验 B：Environment 感知插件

两个入口都 import `virtual:build-info`。查看浏览器 Console 得到 client；页面服务器数据里的环境名是 ssr。

沿着包 `packages/lab-plugins/src/index.ts` 的 virtualBuildInfo 看 `this.environment.name`：相同插件可以针对不同环境提供不同模块源码。

## 实验 C：一次构建两个环境

```bash
pnpm --filter @vite-study/08-environments-ssr build
pnpm --filter @vite-study/08-environments-ssr start
```

先停止 dev，生产仍在 :5178。产物是 `dist/client/index.html + assets` 和 `dist/server/entry-server.js`，两个目录各有 `study-report.json`。

比较报告：同一 App 都在，客户端入口与服务端入口不同。客户端 JS 不应包含 node:os。服务端产物保留对 react / react-dom 等外部依赖的导入，部署时也需要相应 Node 依赖。

`server.mjs` 在开发使用 `vite.environments.ssr.runner.import(...)` 执行转译后的服务端模块；生产用 Node import 加载已构建入口，不启动 Vite dev。它还负责读取模板、填入 HTML、发送响应；这些逻辑并不会因为环境名字叫 ssr 自动出现。

## 实验 D：移除 builder

配置中的 `builder: {}` 是关键。先删除本节 dist（只删除生成文件），再执行：

```bash
pnpm --filter @vite-study/08-environments-ssr build:client
```

预期：虽然 environments 仍声明 ssr，本次只构建 client，不生成新的 server 目录。恢复完整产物用 build。若不先清理，旧 server 目录会干扰观察；脚本默认不会跨环境清空另一个 outDir。

本仓库通过单独配置覆盖 `builder: undefined`，无需修改主文件。Environment API 的构建模式是显式选择；`vite build --app` 也是应用构建入口。

## 实验 E：开发更新

修改 App 标题，浏览器 React Refresh 生效；重新请求页面，SSR runner 也获得新模块。服务端入口有 `import.meta.hot.accept()`，帮助限制服务器模块失效传播。浏览器和服务器的更新处理是不同的上下文。

## 自测

- 有两个 Environment，是否必然有两个 Node 进程？
- 为什么浏览器首屏不能自己重新计算服务器 message？
- Vite 把程序编译好以后，是谁调用 render 并返回 HTTP 响应？


来源：[Vite Environment 框架接口](https://vite.dev/guide/api-environment-frameworks)、[SSR](https://vite.dev/guide/ssr)。这是最小教学 SSR，只有首页，没有流式渲染、鉴权与路由。

## 继续学习

[课程目录](../../README.md) · [上一节：插件与 Hook](../07-plugin-lab/README.md) · [下一节：Node API](../09-fullstack-api/README.md)
