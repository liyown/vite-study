# 官方源码 → 本例实现：逐项对照

参考的是 TanStack/router 官方仓库，固定 commit **`7a0672503857283614799a0b480f4a82110e5ab6`**。以下链接固定到这个提交及对应行号，避免 main 分支更新后对不上。

版本和每个参考文件的 SHA-256 保存在 [tanstack-source-manifest.json](tanstack-source-manifest.json)。在线链接可直接阅读；下方命令可选下载到 `.sources/tanstack-start/`，同时保存原仓库 LICENSE。课程运行不依赖这个可选缓存，下载的是选定文件快照。

重新下载并核对内容：

```bash
pnpm --filter @vite-study/11-mini-start sources:tanstack
```

## 1. 参考位置

| 官方源码位置 | 核对的机制 | 本例对应位置 |
| --- | --- | --- |
| [compiler.ts:L1349](https://github.com/TanStack/router/blob/7a0672503857283614799a0b480f4a82110e5ab6/packages/start-plugin-core/src/start-compiler/compiler.ts#L1349) | 先记录引用，按类别改写 AST，再清理不再使用的依赖 | mini-start/compiler.mjs：inspectOriginalBindings + removeUnusedBindings |
| [handleCreateServerFn.ts:L95](https://github.com/TanStack/router/blob/7a0672503857283614799a0b480f4a82110e5ab6/packages/start-plugin-core/src/start-compiler/handleCreateServerFn.ts#L95) | client / SSR caller / provider 三种生成目标 | mini-start/plugin.mjs：Environment + query → compileModule 模式 |
| [handleCreateServerFn.ts:L217](https://github.com/TanStack/router/blob/7a0672503857283614799a0b480f4a82110e5ab6/packages/start-plugin-core/src/start-compiler/handleCreateServerFn.ts#L217) | 为同源文件生成带 split query 的独立模块身份 | ?server-fn-provider，与原版 tss-serverfn-split 对照 |
| [handleCreateServerFn.ts:L327](https://github.com/TanStack/router/blob/7a0672503857283614799a0b480f4a82110e5ab6/packages/start-plugin-core/src/start-compiler/handleCreateServerFn.ts#L327) | provider 生成 createServerRpc、双参数 handler、单独导出提取入口 | mini-start/compiler.mjs 的 provider 分支 |
| [handleCreateServerFn.ts:L393](https://github.com/TanStack/router/blob/7a0672503857283614799a0b480f4a82110e5ab6/packages/start-plugin-core/src/start-compiler/handleCreateServerFn.ts#L393) | caller 保留 builder/handler 外壳，只替换 handler 参数 | client/ssr caller 分支；不是把整个源文件变成 fetch |
| [handleCreateIsomorphicFn.ts:L10](https://github.com/TanStack/router/blob/7a0672503857283614799a0b480f4a82110e5ab6/packages/start-plugin-core/src/start-compiler/handleCreateIsomorphicFn.ts#L10) | 按环境取 .server/.client 的函数表达式 | createIsomorphicFn 分支 |
| [handleEnvOnly.ts:L17](https://github.com/TanStack/router/blob/7a0672503857283614799a0b480f4a82110e5ab6/packages/start-plugin-core/src/start-compiler/handleEnvOnly.ts#L17) | 目标端取原函数，另一端改为抛错函数 | createServerOnlyFn 分支 + serverOnlyGuard |
| [server-fn-resolver-module.ts:L60](https://github.com/TanStack/router/blob/7a0672503857283614799a0b480f4a82110e5ab6/packages/start-plugin-core/src/start-compiler/server-fn-resolver-module.ts#L60) | 生成带 import() 的函数 ID 查找模块 | virtual:mini-start/registry |
| [createServerFn.ts:L122](https://github.com/TanStack/router/blob/7a0672503857283614799a0b480f4a82110e5ab6/packages/start-client-core/src/createServerFn.ts#L122) | .handler 的编译后参数、__executeServer 与结果解包 | mini-start/runtime/functions.ts |
| [createClientRpc.ts:L6](https://github.com/TanStack/router/blob/7a0672503857283614799a0b480f4a82110e5ab6/packages/start-client-core/src/client-rpc/createClientRpc.ts#L6) | 浏览器代理把 ID 接到请求 URL | mini-start/runtime/client.ts |
| [createSsrRpc.ts:L5](https://github.com/TanStack/router/blob/7a0672503857283614799a0b480f4a82110e5ab6/packages/start-server-core/src/createSsrRpc.ts#L5) | SSR 代理按 ID 本地取提取入口，无浏览器 HTTP 往返 | mini-start/runtime/ssr-rpc.ts |
| [createServerRpc.ts:L4](https://github.com/TanStack/router/blob/7a0672503857283614799a0b480f4a82110e5ab6/packages/start-server-core/src/createServerRpc.ts#L4) | 给提取函数附加元信息 | mini-start/runtime/server-rpc.ts |
| [server-functions-handler.ts:L184](https://github.com/TanStack/router/blob/7a0672503857283614799a0b480f4a82110e5ab6/packages/start-server-core/src/server-functions-handler.ts#L184) | HTTP 处理按 ID 取服务端函数再执行 | mini-start/runtime/node-rpc.ts |

表里的“对应”表示同一职责，不表示逐字复制，也不表示实现了框架全部分支。

## 2. 最关键的结构确实来自源码

```text
原版 handleCreateServerFn
    ├─ client caller → createClientRpc(functionId)
    ├─ SSR caller    → createSsrRpc(functionId)
    └─ provider      → createServerRpc(meta, opts => fn.__executeServer(opts))
                          ↓
                      fn = createServerFn(...).handler(extractedFn, 原实现)
                          ↓
                      导出 extractedFn，供生成的 resolver 动态导入
```

本例生成同样的三种角色，并保留 caller 的 `.handler(...)` 外壳。自己动手读 [compiler.mjs](mini-start/compiler.mjs) 时，先看环境分支，再看引用清理；不要只看 HTTP fetch 的十几行。

`createIsomorphicFn` 则直接替换 AST 表达式，不经 RPC。`createServerOnlyFn` 在非目标端变成抛错函数。它们是三套独立改写规则。

## 3. 有意简化的地方

| 方面 | 本例采用的做法 |
| --- | --- |
| API 与路由 | 模仿 createFileRoute/loader/useLoaderData、getRouter、entry-client/entry-server 和 utils 目录；只实现一个 `/` 页面，不提供完整 TanStack Router。 |
| 函数识别 | Babel binding 确认 API 来自 `#mini-start`；支持顶层 `export const` 的直接链式声明，不实现原版跨模块重导出、builder 别名分析或所有语法。 |
| 函数发现 | 启动/构建扫描 src；原版由多环境编译追踪发现、访问来源及生产注册信息等。扫描到的函数在本例中都被注册为公开演示 RPC。 |
| provider 身份 | 用 `?server-fn-provider`；原版这个快照用 `tss-serverfn-split`，并有更完整的规范化与 HMR 逻辑。 |
| ID | 相对文件路径 + 提取函数名的 SHA-256 截断，主动检查冲突；不复制原版 dev/prod ID 策略。 |
| 运行时 | 保留 handler 外壳、提取入口、__executeServer、校验、结果 envelope 和解包；不实现完整中间件、请求上下文、取消传播、复杂错误/重定向。 |
| 传输 | POST + JSON、输入错误与基础同源检查；原版还支持更多方法、复杂值/流、框架上下文等。 |
| 构建 | 两个 Environment，顺序 buildApp，provider 动态 chunk；不复制部署适配器与其他构建目标。 |
| 源码映射 | 映射到改写后的代码，避免原 handler 进入客户端 sourcesContent；不是复刻原版源码映射策略。 |

因此它适合学习“原代码如何被编译成两端程序”，不能当作生产框架替代品。

## 4. 证据怎么复验？

```text
原始 utils/greeting.functions.ts
    ↓ 同一个 compiler.mjs
client 转换快照 / SSR caller 快照 / provider 快照
    ↓ 实际 Vite 构建
client assets + server entry/chunks
    ↓ scripts/integration.test.mjs
检查私有实现与 source map 没进入 client
检查 provider 是服务端的动态 chunk
检查 dev/prod SSR 和浏览器协议都能调用同一 ID
```

构建后的三个实际快照与分包报告都在 [README 的产物入口](FLOW.md#8-打开真正转换后的代码对照)。测试并非通过“函数名看起来相似”来判定实现完成。
