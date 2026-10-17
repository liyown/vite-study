# 11：一份源码，怎样变成浏览器和服务器两份程序？

第一次理解 RPC，建议先读 [10 最小版](../10-tiny-rpc/README.md)：一个函数、一个短插件，顺着请求走完整条线，再回来看这里的 AST 和多种 API。

这个例子用一个页面说明整条流程。先记住：**插件在编译时改代码；代理函数在运行时决定怎么调用。**

```text
同一份业务源码
    ↓ Vite 把它交给插件，告诉插件当前 Environment
    ├─ client → 留下浏览器实现、HTTP 代理 → 浏览器 bundle
    └─ ssr    → 留下服务器实现、本地代理 → 服务器 bundle
```

## 先跑起来，看三种函数的区别

```bash
# 仓库根目录
pnpm dev 11
# http://127.0.0.1:5181
```

页面只有三个实验：

| 页面调用 | 浏览器拿到什么 | 服务器拿到什么 |
| --- | --- | --- |
| `getRuntime()` | `.client()` 的普通函数，本地执行 | `.server()` 的普通函数，本地执行 |
| `getGreeting({data})` | HTTP 代理，真正的 handler 已删除 | 本地代理，通过注册表找到真正 handler |
| `getSigningKey()` | 一调用就抛错的函数，没有 RPC | 原始服务端函数 |

不要把“双端函数”理解成“同一函数体能在两端访问所有 API”。它是同一个声明，为两端分别选择不同函数体。

## 按这条顺序读代码

```text
1. src/utils/greeting.functions.ts       我们原本写了什么？
    ↓
2. vite.config.ts                       两张图从哪里开始？
    ↓
3. mini-start/plugin.mjs 的 transform   怎么知道当前该生成哪一端？
    ↓
4. mini-start/compiler.mjs              原函数体具体改成了什么？
    ↓
5. mini-start/runtime/                  页面调用后，真正走哪条路？
```

每个文件都加了中文注释。编译器先读 `compileModule` 和三条 `rewrite...` 规则；底下的 AST 工具、类型声明、请求检查可以第二遍再看。

## 编译时：不是把源码执行两遍，而是改写两次

源码结构如下（校验和业务函数用名字省略）：

```ts
export const getGreeting = createServerFn({ method: 'POST' })
  .validator(validateName)
  .handler(async ({ data }) => makeGreeting(data));
```

插件拿到代码后：

```text
code + this.environment.name
    ↓ plugin.transform → compileModule
Babel 把文本解析为 AST
    ↓ 找到 createServerFn 的 handler 参数
    ├─ client：替换为 createClientRpc(ID)，删除 validator
    └─ ssr：   替换为 createSsrRpc(ID)，保留 validator
    ↓ 清掉因 handler 删除而无用的 import/helper
AST 生成新代码 → Vite/Oxc 继续转译 → Rolldown 建图和打包
```

两边的普通导入现在分别是：

```ts
// 浏览器版本：不包含原始 handler。
createServerFn({ method: 'POST' }).handler(createClientRpc(ID));

// SSR 版本：也不直接内联原始 handler，而是本地查表。
createServerFn({ method: 'POST' }).validator(validateName).handler(createSsrRpc(ID));
```

**那原始 handler 去哪了？** 插件还会生成服务器专用的 provider（实现模块）：

```text
原文件路径 + ?server-fn-provider
    ↓ 读的是同一份磁盘源码，但视为另一个模块节点
插件用 provider 模式改写
    ↓
保留原始 handler，生成可调用的提取入口
    ↓
虚拟注册表写入：ID → () => import(provider)
    ↓ Rolldown 看到动态 import
服务器 bundle 中产生对应动态 chunk
```

所以：**两个 Environment、两个根入口；provider 是服务器图内部的动态依赖。** 它不是第三端，也不是把服务器代码放进一个浏览器懒加载文件。

## 运行时：同一个函数导入，怎样在两端调用？

```text
浏览器按钮调用 getGreeting({data})
    ↓ createServerFn 外壳
createClientRpc(ID)
    ↓ fetch('/_server/' + ID)，传 JSON 参数
Node 收到请求 → 注册表按 ID 找 provider
    ↓
提取入口 → __executeServer → validator → 原始 handler
    ↓
{result} → HTTP JSON → 浏览器外壳解包 → 页面得到结果
```

SSR loader 的路径更短：

```text
SSR 调 getGreeting({data}) → createSsrRpc(ID)
    ↓ 没有 fetch
同一个注册表 → 同一个 provider → 同一个原始 handler
```

`__executeServer` 只是我们给函数加的一个普通属性，在 [functions.ts](mini-start/runtime/functions.ts) 中能直接看到赋值。提取入口调用这个属性，就能把调用带到原始 handler。

## 对照真实产物，再看 AST 细节

```bash
pnpm --filter @vite-study/11-mini-start build
```

把原文件与以下文件并排打开：

- [浏览器转换结果](dist/client/compiled/src/utils/greeting.functions.ts.txt)
- [SSR 转换结果](dist/server/compiled/src/utils/greeting.functions.ts.txt)
- [provider 转换结果](dist/server/compiled/src/utils/greeting.functions.ts.provider.txt)
- [服务端分包报告](dist/server/build-report.json)

这些是实际编译器输出的快照，不是手写结果；快照之后还有 TS 转译和打包。双端函数、serverOnly 的结果也在同级 compiled 目录。

先改 handler 的返回文案，再观察：浏览器代理代码不需要带上这段文案，下一次 RPC 却能拿到新结果。

生产运行：先停开发服务，再执行 `pnpm --filter @vite-study/11-mini-start start`。`server.mjs` 托管已有产物，生产环境不再启动 Vite 编译器。

需要完整分支时看 [完整流程与实验](FLOW.md)；想验证实现依据时看 [官方源码对照](SOURCES.md)。本例保留 TanStack Start 的关键编译思路，路由、协议和类型系统都只实现教学所需的部分。

## 继续学习

[课程目录](../../README.md) · [上一节：最小 RPC](../10-tiny-rpc/README.md)
