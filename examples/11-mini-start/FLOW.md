# 11 附录：完整箭头流程与产物对照

先读 [简明阅读入口](README.md)。本文件保留完整分支、产物入口与实验说明。

```bash
# 仓库根目录
pnpm dev 11                   # http://127.0.0.1:5181
pnpm --filter @vite-study/11-mini-start build
pnpm --filter @vite-study/11-mini-start start
```

开发和生产默认都是 5181，切换前停掉前一个服务；也可用 `PORT=4181 pnpm --filter @vite-study/11-mini-start start`。

本例参照 TanStack 官方源码 commit `7a0672503857283614799a0b480f4a82110e5ab6`。**这是自己实现的教学子集，没有安装或冒充完整 TanStack Start。** [源码对照](SOURCES.md)列出确实阅读的处理器、本地文件和实现差异。

## 1. 先看页面：三个名字，对应三种完全不同的调用

```text
页面首次 SSR
    ↓ routes/index.tsx 的 loader
getRuntime() → 执行 .server() 实现 → server:darwin / server:linux 等
getGreeting({ data: ... }) → 本地找到服务端实现并执行
    ↓
HTML + loader 数据 → 浏览器水合
    │
    ├─→ 点击“双端函数”
    │       getRuntime() → 执行 .client() 实现 → client:browser
    │       这条路没有 HTTP
    │
    ├─→ 提交“服务端函数”
    │       getGreeting(...) → fetch('/_server/函数ID') → Node 执行
    │
    └─→ 点击“服务端专属函数”
            getSigningKey() → 浏览器版抛错
            它没有自动生成 RPC 接口
```

RPC 的首次调用和浏览器按钮使用的是**同一个业务函数导入**；原始函数内部的签名计算始终在服务器执行。页面只收到 HMAC 结果，不收到签名密钥。

## 2. 文件结构：从页面往下追

```text
src/
  routes/
    __root.tsx                  页面外壳
    index.tsx                   createFileRoute + loader + 一个页面
  router.tsx                    getRouter，单页路由树
  entry-client.tsx               hydrateRoot，浏览器入口
  entry-server.tsx               SSR render / RPC 请求处理，服务器入口
  utils/
    runtime.ts                  createIsomorphicFn().server().client()
    greeting.functions.ts       createServerFn().validator().handler()
    private.ts                  createServerOnlyFn()
mini-start/
  plugin.mjs                    Vite 插件，选环境、造虚拟模块、编排构建
  compiler.mjs                  Babel AST 改写、依赖清理
  runtime/
    functions.ts                createServerFn 外壳、validator、__executeServer
    client.ts                   createClientRpc → HTTP
    ssr-rpc.ts                  createSsrRpc → 本地查注册表
    server-rpc.ts               createServerRpc → 提取入口的元信息
    node-rpc.ts                 HTTP 解码 → ID 查找 → 执行 → 返回
    router.tsx                  单页 loader/component/useLoaderData
vite.config.ts                  client + ssr 两个 Environment
server.mjs                      Node HTTP 宿主
```

`#mini-start` 和 `#mini-start/router` 是本 package 的 imports 别名，指向上面的本地 API。语法模仿 Start，路由只实现这个单页所需的结构。

## 3. 核心：同一份源码为什么能产生两种程序？

以 [runtime.ts](src/utils/runtime.ts) 为例，源码只写一次：

```ts
export const getRuntime = createIsomorphicFn()
  .server(() => `server:${platform()}`)
  .client(() => 'client:browser');
```

构建时：

```text
同一个 src/utils/runtime.ts
    │
    ├─→ client Environment 的 transform
    │       解析 AST → 选择 .client() 参数 → 删除另一分支与无用 import
    │           ↓
    │       export const getRuntime = () => 'client:browser'
    │           ↓
    │       浏览器依赖图 → 浏览器 bundle
    │
    └─→ ssr Environment 的 transform
            解析 AST → 选择 .server() 参数 → 删除另一分支与无用 import
                ↓
            import { platform } from 'node:os'
            export const getRuntime = () => `server:${platform()}`
                ↓
            Node 依赖图 → 服务端 bundle
```

不是在浏览器运行时检查 if 再隐藏另一端代码；插件已经把不属于当前环境的实现从 AST 中拿掉。

入口在 [plugin.mjs](mini-start/plugin.mjs) 的 transform：

```text
this.environment.name + 模块 query
    ↓
判断是 client / ssr caller / provider
    ↓ compileModule(code, file, root, mode)
Babel AST → 当前端的代码
    ↓
继续交给 Vite/Oxc/Rolldown
```

同一文件在不同环境拥有各自的模块节点、转换结果和缓存。这里打包器都还是 Rolldown，产生的是两份 bundle，并不需要两种不同的 bundler。

## 4. 服务端函数为什么要生成三种形式？

业务只写 [greeting.functions.ts](src/utils/greeting.functions.ts)：

```ts
export const getGreeting = createServerFn({ method: 'POST' })
  .validator(/* 输入校验 */)
  .handler(async ({ data }) => {
    // 使用 node:crypto、服务端密钥等
    return /* 业务结果 */;
  });
```

同一文件还导出了 pageTitle，它要留给两端使用。插件只改相应 AST 节点，保留共享导出。

```text
这份源码
    │
    ├─→ 浏览器 caller
    │       去掉 validator 和真正 handler
    │       保留 createServerFn().handler(...) 外壳
    │           ↓
    │       getGreeting = createServerFn({method:'POST'})
    │         .handler(createClientRpc('稳定ID'))
    │
    ├─→ SSR caller
    │       去掉真正 handler，保留 validator 和外壳
    │           ↓
    │       getGreeting = createServerFn({method:'POST'})
    │         .validator(...)
    │         .handler(createSsrRpc('同一个ID'))
    │
    └─→ provider：同文件路径 + ?server-fn-provider
            保留 validator 和真正 handler
            生成提取入口
                ↓
            const extracted = createServerRpc(meta,
              opts => getGreeting.__executeServer(opts))

            const getGreeting = createServerFn(...)
              .validator(...)
              .handler(extracted, 原始handler)

            export { extracted }
```

图里的 extracted 在实际产物中叫 `getGreeting_createServerFn_handler`。provider 只导出提取入口；共享导出仍在正常 caller 文件中。这个 `.handler(提取入口, 原始函数)` 的结构是直接对照官方处理器实现的，不是猜测。

为什么保留外壳？

```text
调用 getGreeting({data})
    ↓ createServerFn 的统一外壳
调用当前版本的 RPC 代理
    ↓ 得到 {result} 或 {error}
统一解出业务返回值 / 抛出错误
```

原版还在这里编排中间件等；本例只保留必要的 envelope 和 provider 输入校验。

## 5. 没有新建源码文件，provider 是怎么来的？

query 会让打包器把同一磁盘文件当成另一个模块身份：

```text
src/utils/greeting.functions.ts
    → 普通 caller 节点

src/utils/greeting.functions.ts?server-fn-provider
    → 独立 provider 节点
    → 读取同一个文件内容
    → 插件用 provider 模式改写
```

插件发现 `export const getGreeting = createServerFn(...).handler(...)` 后，计算稳定 ID，并生成虚拟注册表：

```ts
// virtual:mini-start/registry 的生成代码示意
export const registry = {
  '函数ID': {
    load: () => import('/绝对路径/greeting.functions.ts?server-fn-provider')
      .then(module => module.getGreeting_createServerFn_handler),
  },
};
```

所以 HTTP 路径不需要逐个手写，也不会在请求时 eval 客户端上传的函数源码。服务端只按生成的白名单查 ID。

## 6. 一次浏览器调用，怎样到达真正 handler？

```text
浏览器 getGreeting({ data: { name: '同学' } })
    ↓ createServerFn 外壳
createClientRpc(ID)
    ↓ fetch，JSON 序列化
POST /_server/ID
    ↓ Node HTTP 宿主
handleNodeRpc(req, res)
    ↓ 按 ID 查注册表
registry[ID].load()
    ↓ 动态 import provider
getGreeting_createServerFn_handler(options)
    ↓ createServerRpc 包装的函数
getGreeting.__executeServer(options)
    ↓ validator：校验输入
原始 handler({ data })
    ↓ Node 上计算 HMAC 等
{ result: 业务结果 }
    ↓ JSON 响应
浏览器 createClientRpc → createServerFn 外壳解包 → Promise 得到结果
```

SSR 的调用少了网络往返：

```text
route.loader → getGreeting({data}) → createSsrRpc(ID)
    ↓
同一个 registry[ID].load()
    ↓
同一个 provider → __executeServer → validator → handler
```

在 [ssr-rpc.ts](mini-start/runtime/ssr-rpc.ts) 可以直接看到：这里没有 fetch。

## 7. 所以这是两个入口，还是分包？

这个例子是**先有两个环境/根入口，再在服务端图内部动态分包**：

```text
浏览器根入口：index.html → entry-client.tsx
    ↓ client 图
页面 + 双端函数的 client 实现 + RPC caller + serverOnly 抛错函数
    ↓
dist/client/assets/...

服务端根入口：entry-server.tsx
    ↓ ssr 图
SSR 页面 + 双端函数的 server 实现 + 本地 RPC caller + 注册表
    │
    └─→ 注册表中的 import(provider)
             ↓ 服务端动态 chunk
         真正 handler + node:crypto 等
    ↓
dist/server/entry-server.js
dist/server/chunks/greeting.functions-哈希.js
```

`server.mjs` 负责启动 Node HTTP、托管 client 资源并调用服务端产物；生成服务端 bundle 本身不等于自动开始监听端口。

分包策略可以改变：把动态 import 改成静态 import，provider 可能并进服务端入口；它仍属于服务端程序。反过来，仅给浏览器做 code splitting，并不会让某个 chunk 自动变成服务器代码。

## 8. 打开真正转换后的代码对照

构建会保存插件的转换结果（这时仍可能包含 TS 类型，之后才由 Oxc 转译）：

- [浏览器 caller](dist/client/compiled/src/utils/greeting.functions.ts.txt)
- [SSR caller](dist/server/compiled/src/utils/greeting.functions.ts.txt)
- [服务端 provider](dist/server/compiled/src/utils/greeting.functions.ts.provider.txt)
- [双端函数的 client 结果](dist/client/compiled/src/utils/runtime.ts.txt)
- [双端函数的 server 结果](dist/server/compiled/src/utils/runtime.ts.txt)
- [浏览器版 serverOnly](dist/client/compiled/src/utils/private.ts.txt)
- [函数 manifest](dist/server/function-manifest.json)
- [服务端最终分包报告](dist/server/build-report.json)

这些文件由插件实际 emitFile 生成，不是 README 里手写的伪产物。最终可执行 JS 在 assets/chunks 目录；报告记录了每个 chunk 的输入模块与动态依赖。

## 9. 学习时改这四处

```text
只改 handler 返回文案
    → 观察浏览器 caller 没有 handler 文案
    → 后续 RPC 得到新文案；稳定 ID 不变

把 getRuntime 的 .client() 返回值改掉
    → 观察 SSR 结果保持 server 实现
    → 浏览器按钮执行新的 client 实现

在 handler 里增加服务端依赖
    → 编译器拿掉 handler 后，清理不再使用的 import/helper
    → 检查 dist/client，包括 .map，确认没有私有代码

在页面导入另一个 createServerFn 导出
    → 插件扫描到它，生成新 ID 和 provider 注册项
    → 不需要添加一条手写接口路由
```

不要随意把服务端副作用写到模块顶层。编译器只清理由抽取导致失去引用的依赖，不会擅自删除所有顶层副作用。

## 10. 已验证的范围与简化

根目录 `pnpm check` 包含此例：

```text
类型检查
    → 11 节构建
    → 基础 13 项 + 最小 RPC 2 项 + 本例 6 项验证
```

本例检查 AST 三种输出、导出保留、依赖删除、稳定 ID、SSR 本地调用、开发/生产 HTTP、输入错误、跨源拒绝、开发 provider 修改生效，以及客户端代码与 sourcemap 不含私有实现。浏览器也实测了水合后的三个按钮。

源码映射有个重要细节：返回空 map 时，Vite 可能回填磁盘原文。这里使用指向**转换后安全代码**的独立 source，并检查最终 sourcesContent，避免 handler 被藏进浏览器 .map。

为让主线能读完，本例约定服务端函数直接声明为顶层 `export const`，只支持 POST + JSON，函数发现用 src 扫描；不实现完整路由生成、完整中间件体系、复杂值/流序列化、部署适配、生产级函数访问控制或完整 TanStack 类型系统。示例问候是公开演示操作，不处理账号数据；给业务加权限时仍要在服务端执行端验证身份。源码对照中逐项写明了这些边界。
