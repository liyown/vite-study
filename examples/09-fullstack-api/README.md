# 09 · React + Node API 全栈

上一节拆开浏览器与服务器的渲染；本节拆开浏览器与服务器的 **数据职责**。这是 CSR + API 的全栈项目，便于单独观察 HTTP，不把 SSR 与 API 混成一个概念。

## 开发运行

根目录 `pnpm dev 09`，打开 http://127.0.0.1:5179 。一个启动脚本在同一个 Node 进程中创建两个 HTTP 监听：Vite :5179 与 API :4309。

```text
浏览器 :5179 → GET /api/notes → Vite server.proxy → Node :4309
浏览器 :5179 → POST /api/notes → JSON 校验 → 内存笔记 → 201 JSON
```

本节的后端是原生 Node .mjs，由 Node 直接执行，没有被 Vite 构建成第二个 Environment。**全栈应用不必采用多 Environment 构建，多 Environment 也不自动提供 API。**

## 阅读顺序

1. `src/api.ts`：封装 HTTP 与错误响应，类型不会自动验证服务器返回值。
2. `src/App.tsx`：初次请求、取消请求、提交、禁用按钮与错误显示。
3. `vite.config.ts`：只在 dev 生效的 `/api` 代理。
4. `server.mjs`：真实的 GET/POST、长度与格式校验、内存状态。
5. `dev.mjs`：同时启动并关闭两个监听服务。

## 实验 A：数据确实来自后端

打开 Network，初次加载应有 GET /api/notes。新增一条笔记后出现 POST，状态 201；刷新页面，新条目仍在。停止服务再重启，条目重置，因为这里没有数据库。

```bash
curl http://127.0.0.1:5179/api/notes
curl -X POST http://127.0.0.1:5179/api/notes -H 'Content-Type: application/json' -d '{"text":"从终端写入"}'
```

再刷新浏览器。直接请求 :4309 也可访问 API，说明它是真实后端，Vite 代理只是开发期转发。

## 实验 B：失败路径

提交空白内容，服务器返回 400；超过 120 字也拒绝。请求 /api/missing 返回 404，DELETE 返回 405，错误 JSON 返回 400。浏览器页面会呈现保存错误，不假装保存成功。

React 用文本节点渲染笔记，不把用户输入传给 innerHTML。这个示例不包含账户、权限、数据库或跨站请求防护，用于本地学习数据链路。

## 实验 C：生产没有 Vite 代理

先 Ctrl+C 停掉开发服务，执行：

```bash
pnpm --filter @vite-study/09-fullstack-api build
pnpm --filter @vite-study/09-fullstack-api start
```

打开 http://127.0.0.1:4309 。这次 Node 在同一端口先处理 /api，再托管 dist 静态文件。前端继续 fetch 相对路径 /api/notes，不需要 CORS，也不依赖开发代理。

只把 dist 扔给 `vite preview` 不会自动拥有这个 API。将来分域部署，需要显式部署后端并配置路由/CORS。

## 自测与扩展

- 为什么开发时请求地址看起来是 :5179，处理请求的却是 :4309？
- 为什么 build 后 server.proxy 不会进入前端 JS？
- 将内存数组改成文件或数据库时，应该改 API 还是 React 组件？
- 进阶：把本节 GET/POST 处理合进 08 的 Node HTTP 服务，就能得到 SSR + API；仍需考虑服务端数据获取与水合数据共享。

## 继续学习

[课程目录](../../README.md) · [上一节：多环境 SSR](../08-environments-ssr/README.md) · [下一节：最小 RPC](../10-tiny-rpc/README.md)
