---
title: "Vite 教程：从项目配置、构建原理到插件与全栈框架集成"
description: "从零建立 Vite 项目，沿模块请求、热更新和生产构建理解配置、资源与分包；通过可运行插件和双端编译实验，拆解核心 Hook、React、SSR、TanStack Start 及 Workers 的集成方式。"
slug: "vite-tutorial"
date: "2026-10-17"
updated: "2026-10-17"
author: "刘耀文"
tags: [Vite, 前端工程化, 构建工具, 插件, SSR]
---

# Vite 教程：从项目配置、构建原理到插件与全栈框架集成

打开一个 Vite 项目的 Network 面板，会看到浏览器在请求 `/src/main.ts`。浏览器并不认识 TypeScript，这个页面却能运行。等到执行 build，原来的模块又不一定有了：几个文件合进一份 JS，一次动态 import 还可能带出几个 chunk。

问题就出在这里：我们写的源码、Vite 处理的模块、浏览器下载的文件，已经是不同的东西。只看配置，很容易把它们当成一回事。

这篇文章按一个项目实际需要的顺序讲 Vite：先建项目，处理配置、TypeScript、CSS 和资源，再看开发请求、热更新、构建与部署。有了这些基础，再拆开插件的 Hook，最后看 React、SSR、服务端函数和 Workers 运行时怎么接进来。遇到看不懂的地方，我们会回到一个具体模块，看它从哪里来、被改成什么、由谁执行。

本文配有 [11 节渐进实验](https://github.com/liyown/vite-study/tree/v1.0.0)。要求读者会使用 JavaScript 的 `import/export`、Promise 和基本命令行；React 只在相关章节使用。所有实验都能在本机运行，不需要云账号。源码固定 Vite 8.3.4、React 19.3.1、`@vitejs/plugin-react` 6.1.2；验证环境为 Node 24.22.0、pnpm 10.24.0。可复验范围与记录见 [验证说明](../docs/verification.md)。

文章的章节号与教材课程号不同：章节按解释顺序展开，课程号只标识对应实验。只需要日常开发与交付的读者，可以先读前两部分；插件与框架部分在此基础上继续深入。

- 基础：[Vite 的职责](#1-vite-负责哪些工作) · [创建项目](#2-从零创建项目先认识三个命令) · [配置与 TypeScript](#3-配置模块解析和-typescript-分别负责什么) · [CSS 与资源](#4-css图片和文本怎样进入模块图)
- 开发与交付：[模块服务](#5-开发服务器为什么能让浏览器执行-typescript) · [HMR 与 React](#6-hmr-如何把文件改动变成页面更新) · [mode 与 env](#7-mode环境变量与运行目标不要混在一起) · [构建与部署](#8-生产构建怎样合并模块拆分-chunk)
- 扩展机制：[核心 Hook 流程](#9-插件的核心-hook-怎样串起来)
- 框架与实践：[多环境 SSR](#10-多-environment-怎样支撑-ssr) · [服务端函数](#11-一份服务端函数源码为什么能生成两端程序) · [生态集成](#12-生态框架通常怎样接入-vite) · [排错](#13-性能与故障应按阶段排查) · [复验](#14-用配套实验复验本文)

## 第一部分：项目与模块

### 1. Vite 负责哪些工作

先把开发和部署分开。运行 dev 时，Vite 接收浏览器请求，转换源码，维护模块关系；运行 build 时，它从入口收集依赖，组织出可以部署的文件。这是两种交付方式，最终执行程序的仍然是浏览器或服务器运行时。

所以页面里一个 React 按钮能工作，至少涉及两件事：源码被转换成可执行的 JS，React 运行时把组件变成 DOM。Vite 把前一件事接起来，并不替 React 完成后一件事。后面判断“某个能力是否需要插件”，就要先分清它属于哪一步。

```text
业务源码与资源
    ↓ Vite 配置、插件与内置处理
    ├─ 开发：模块服务 → 浏览器或服务器运行器加载 → 执行
    └─ 构建：依赖分析、优化、分包 → dist → 部署服务加载 → 执行
```

读源码前先看版本。本文的 Vite 8 使用 Rust 编写的 Rolldown 打包，并整合 Oxc；React 插件 v6 的默认 Refresh 转换也使用 Oxc。网上“开发用 esbuild、生产用 Rollup”的解释有它的版本背景；拿它分析这里的调用链，就会找错工具。[Vite 8 发布说明](https://vite.dev/blog/announcing-vite8)列出了这次调整。

Rust 打包器可以调用 JavaScript 插件：Vite 配置与插件函数运行在 Node 的 JavaScript 环境，原生绑定把需要的调用与结果交给 Rust。两种语言通过接口协作，不要求插件也使用 Rust。想实际观察双向调用，可以运行配套的 [JS/Rust 小实验](../native/01-js-rust/README.md)；它演示同步绑定，不模拟 Rolldown 的完整调度系统。

### 2. 从零创建项目，先认识三个命令

新建项目可以使用官方脚手架：

```bash
pnpm create vite my-app --template vanilla-ts
cd my-app
pnpm install
pnpm dev
```

脚手架会随版本更新。如果要复现本文的结果，使用配套仓库与锁文件：

```bash
git clone --branch v1.0.0 https://github.com/liyown/vite-study.git
cd vite-study
pnpm install --frozen-lockfile
pnpm dev 01
```

Vite 8 的 Node 最低要求是 20.19+、22.12+；模板还可能要求更高版本。本仓库使用 `.node-version` 指定验证版本。新建项目的操作见[官方入门文档](https://vite.dev/guide/)。

| 命令 | 输入 | 输出或行为 |
| --- | --- | --- |
| `vite` / `vite dev` | 源码、配置 | 启动开发服务器，按需要提供模块 |
| `vite build` | 构建入口及其依赖 | 生成生产产物，通常写入 dist |
| `vite preview` | 已有 dist | 本地检查构建结果，不重新编译 |

项目建好以后，先打开 `index.html`，别急着看配置。网页应用默认从 root 下这份 HTML 进入，它通过模块脚本引出后面的代码：

```html
<div id="app"></div>
<script type="module" src="/src/main.ts"></script>
```

Vite 会处理这份 HTML，再沿着模块脚本找依赖。因此它要放在项目 root，不能照搬某些工具的目录习惯，把入口塞进 public。root 也不必是 Git 仓库根：在多项目仓库里，从错误目录启动，很可能连配置和 env 文件都找错。

[入口与模块图实验（课程 01）](../examples/01-vanilla/README.md)提供了最初的观察点：刷新页面记录 Network，点击“加载编辑器”后再看新增请求。随后 build，打开 manifest，对照这个模块在生产里的去向。源码关系与交付文件的区别，会在这两份结果中出现。

### 3. 配置、模块解析和 TypeScript 分别负责什么

一个常见的配置文件如下：

```ts
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';

export default defineConfig(({ command, mode }) => ({
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  server: {
    port: 5173,
    strictPort: true,
  },
  build: { manifest: true },
}));
```

这份配置在 Node 侧加载，里面的 `node:url` 不会因此进入浏览器。`defineConfig` 帮助检查配置类型；`command` 告诉我们现在是 serve 还是 build，mode 则是另一项选择，稍后单独讨论。alias 用绝对路径，是为了让解析结果不随启动目录漂移。配置加载器的差异可以继续查[官方配置文档](https://vite.dev/config/)。

模块解析要回答的是“这个 import 指向哪里”。相对路径、包名和别名分别走相应的解析规则；包的 exports、条件与目标环境也会影响最终选择。路径大小写错误可能在本机不明显，到 Linux 构建机才暴露。

编辑器接受了路径，构建器却说找不到模块，通常要分别检查 TypeScript 和 Vite 的解析配置。[配置与资源实验（课程 02）](../examples/02-project-basics/README.md)显式设置 paths 与 alias。关闭 Vite alias 会导致模块解析失败；要观察类型检查失败，则把子 tsconfig 的 paths 临时覆盖成 `{}`，再运行 `pnpm exec tsc --noEmit -p examples/02-project-basics/tsconfig.json`。仅删除子配置项会继承根映射，不能隔离这个条件。实验后恢复，再检查通过。Vite 8 另有可选的 `resolve.tsconfigPaths`；本实验采用显式配置，是为了让两侧的职责可见。

再做一个小改动：给只接受字符串的函数传入数字。build 仍可能成功，`tsc --noEmit` 才会报告类型错误。Vite 这里做的是转译，项目要把类型检查单独接入开发或 CI。网络输入还要再过一关：给 JSON 写一个 TypeScript 类型，并不能阻止服务器真的返回错误数据。

### 4. CSS、图片和文本怎样进入模块图

看到下面几种 import，先判断变量里装的是什么，别把它们都理解成“把文件引进来”：

```ts
import './style.css';                    // 把样式接入页面
import styles from './card.module.css';  // 得到局部类名映射
import logoUrl from './mark.svg';        // 得到资源 URL
import rawText from './note.txt?raw';    // 得到原始文本
```

```text
源码中的资源引用
    ↓ 解析路径和导入形式
    ├─ CSS → 开发样式更新 / 生产 CSS 资源
    ├─ CSS Module → 类名映射 + 对应样式
    ├─ 普通资源 → URL，可能是独立文件或内联 data URL
    └─ ?raw → 导出的字符串
```

`logoUrl` 是最值得看的一项。开发时它指向一个资源地址，构建后可能是带 hash 的文件，也可能是内联 data URL。图片被 import，Vite 就能跟踪并改写这条引用。

public 走另一条路。文件原样提供和复制，适合必须保留文件名的资源。当 base 为 `/` 时，`public/handbook.txt` 的访问路径是 `/handbook.txt`，不带 public。部署到子路径时，用 `import.meta.env.BASE_URL` 构造这种公开资源地址；课程中的写法是 `${import.meta.env.BASE_URL}handbook.txt`。选择这条路，就接受它不参与同一套 hash 管理。内联阈值等细节见[资源文档](https://vite.dev/guide/assets)。

CSS Module 提供局部类名，CSS 的层叠和选择器规则仍然存在。Sass、Less 等预处理器需要安装对应实现；PostCSS 与其他 CSS 工具还各有配置。先使用普通 CSS 看懂处理过程，再按项目需求接入，通常更容易排错。

批量加载也可以进入依赖图：

```ts
const articles = import.meta.glob('./articles/*.txt', {
  query: '?raw',
  import: 'default',
});
```

这里得到的不是已经读好的所有文本，而是一张“路径 → 加载函数”表。点击某篇文章时调用对应函数，才触发加载；加上 `eager: true`，才改成立即导入。模式必须写成静态字面量，因为 Vite 需要提前知道依赖集合，不能等部署后再遍历你的源码目录。

Worker 的常用写法是：

```ts
const worker = new Worker(new URL('./sum.worker.ts', import.meta.url), {
  type: 'module',
});
```

Vite 可以分析这种形式，处理 Worker 的源码与生产地址；运行时仍需通过消息通信，Worker 不能访问页面 DOM。glob、CSS 与 Worker 的支持范围见[内置能力文档](https://vite.dev/guide/features)。资源实验把这些能力放在一个页面，可逐项检查。

## 第二部分：开发与交付

### 5. 开发服务器为什么能让浏览器执行 TypeScript

回到开头的 `/src/main.ts`。在 Network 里点开它，看 Response，不要只看文件名。类型标注已经消失，import 路径也可能变了。浏览器执行的是这段响应里的 JavaScript；`.ts` 只是这个开发请求的 URL 后缀。

```text
GET /
    ↓ 处理 index.html，加入开发客户端
浏览器请求 /src/main.ts
    ↓ 路径解析 → 加载源码 → 插件和内置转换 → import 分析与 URL 改写
响应 JavaScript
    ↓ 浏览器解析 import
继续请求后续模块
```

沿着这个过程观察，会看到业务模块是按需要提供的，并没有先等待整个应用完成生产打包。已转换的模块可以命中缓存，预加载也会提前请求一些依赖；这张图描述的是处理关系，不是每次请求都从头执行的脚本。

再看一个包名导入：`import React from 'react'`。浏览器不会去 node_modules 里按 Node 的规则寻找包，Vite 要先替它解析，并交付可以请求的 URL。依赖预构建还处理 CommonJS/UMD 兼容，以及依赖内部过多的小模块请求。[依赖预构建文档](https://vite.dev/guide/dep-pre-bundling)说明了什么时候重做、什么时候复用缓存。

如果链接进来的本地包只有在第二次启动后才正常，或者某个 CommonJS 包只在开发时失败，就该检查解析结果与优化日志，再考虑 `optimizeDeps.include/exclude`。我不建议先堆一份很长的配置列表。`--force` 可以用来排除旧缓存的影响；如果每次都要加它，问题还没有定位完。

开发优化也不能代替生产验证。生产还会进行 tree shaking、分包、压缩和资源输出；开发能运行，只验证了其中一条路径。

### 6. HMR 如何把文件改动变成页面更新

开发时还有一个经常出现在 Network 里的地址：`/@vite/client`。它是 Vite 注入的开发客户端，用来接收更新、配合模块替换、处理样式与错误提示。保存文件后，服务器和它之间传递更新消息；浏览器随后加载需要的新模块。

```text
保存 message.js
    ↓ 服务端标记相关模块转换缓存失效
沿导入关系寻找 HMR 接受边界
    ↓ 发送更新消息，包含边界 path、更新模块 acceptedPath 等信息
浏览器热更新客户端加载带新时间戳的模块 URL
    ↓ 得到新模块导出
调用已登记的 accept 回调
    ↓ 回调或框架运行时更新页面
```

只把新代码下载下来，页面还不会凭空知道该怎么变。服务端模块图先找到接受边界，浏览器端还要知道收到新导出后执行什么。下面把这件事直接写出来：

```js
import { getMessage } from './message.js';
const app = document.querySelector('#app');
app.textContent = getMessage();

if (import.meta.hot) {
  import.meta.hot.accept('./message.js', nextModule => {
    if (nextModule) app.textContent = nextModule.getMessage();
  });
}
```

关键是 `nextModule.getMessage()`。第一次赋值使用旧模块，更新后的赋值由这个回调完成。如果删掉回调，Vite 不知道原来的 DOM 是哪个函数调用产生的，也就不能替我们重做它。它会按模块关系继续寻找边界，必要时重新加载页面。接受边界和失效传播的约定见 [HMR API](https://vite.dev/guide/api-hmr)。

CSS 是一个容易观察的例子。普通导入的 CSS 在开发时会变成调用 `updateStyle` 的 JS，模块自接受更新；再次执行时更新对应 style 元素。源码是 `.css`，更新消息出现 `js-update` 并不矛盾。生命周期结束时，还可以通过 prune 清理对应样式。

有资源需要清理时，用 dispose 处理监听器、定时器等；需要跨更新保留少量数据时可以使用 hot.data。HMR 不会替应用自动管理所有副作用。

#### React 插件多做了什么

运行裸 React 与 Fast Refresh 对照实验：在两个终端分别执行 `pnpm dev 03` 和 `pnpm dev 04`，打开 :5173 与 :5174，计数器都点到 3。只改各自 Counter 的标题：裸配置一侧归零，加入 React 插件的一侧仍为 3。两边的业务源码相同，TSX 原本也都能转换。

`pnpm compare:react` 检查实际转换结果，输出中的两个标志为：

```text
03-react-bare     jsxWasTransformed: true    hasRefreshInstrumentation: false
04-react-refresh  jsxWasTransformed: true    hasRefreshInstrumentation: true
```

JSX 已转换，只能说明语法被处理了；组件注册与接受更新的代码才把这次改动接入 Refresh。修改 Hook 顺序或使导出边界失效，仍可能重置状态，不能将标题编辑的结果扩大到任意修改。

```text
首次加载 Counter_v1
    ↓ Refresh 注册稳定标识，建立组件 family
修改后加载 Counter_v2
    ↓ 同一标识关联新旧实现，检查模块导出与 Hook 签名
performReactRefresh 更新 family.current
    ↓ 通知 React 渲染器
React 在渲染阶段解析到新实现
    ↓ 兼容时保留 Fiber 上的状态，不兼容时重新挂载
```

这一步很容易看错。父模块可能还拿着 Counter_v1，JSX 也确实把这个函数交给 React。新版本被选中的位置，在 React 的开发渲染流程：渲染器通过组件函数找到 family，再读取当前实现。family 关联版本，Fiber 保存实例状态。把它误解成 ESM 自动替换全部旧 import，后面写普通 JavaScript 的 HMR 就会做出错误假设。

React 插件的边界处理可对照[固定版本源码](https://github.com/vitejs/vite-plugin-react/blob/ac47648e17674299accb51816e9e33b8a7b07b05/packages/plugin-react/src/index.ts)。React 项目中的 [Refresh Runtime](https://github.com/facebook/react/blob/main/packages/react-refresh/src/ReactFreshRuntime.js)与[渲染器热更新处理](https://github.com/facebook/react/blob/main/packages/react-reconciler/src/ReactFiberHotReloading.js)展示了两侧如何配合；main 链接用于阅读，复现实验仍以仓库锁定版本为准。

### 7. mode、环境变量与运行目标不要混在一起

| 名称 | 决定什么 | 例子 |
| --- | --- | --- |
| mode | 选择一组开发/构建配置和 env 文件 | development、staging |
| `NODE_ENV` | 影响开发/生产运行语义及相关常量 | development、production |
| Vite Environment | 当前模块的解析、转换和构建上下文 | client、ssr |
| runtime | 真正执行程序的宿主 | 浏览器、Node、workerd |

在没有预设 `NODE_ENV` 的情况下，`vite build --mode staging` 的 `MODE` 是 staging，`PROD` 仍为 true。`--mode development` 也不会单凭名字把生产构建变成开发服务。[mode 与 env 实验（课程 05）](../examples/05-modes/README.md)给出了命令与实际值的对照。[模式文档](https://vite.dev/guide/env-and-mode)解释了 mode 与 `NODE_ENV` 的区别。

同名变量的覆盖顺序由低到高是 `.env` → `.env.local` → `.env.[mode]` → `.env.[mode].local` → 启动进程时已有的环境变量。只在某一个文件定义的值仍然可用。修改 env 后重启开发服务器。

浏览器里的 `import.meta.env.VITE_FEATURE` 通常是字符串，`Boolean('false')` 仍是 true，应按业务约定显式解析。`VITE_` 表示默认允许进入客户端，而不是加密或隐藏。配置阶段需要读取 env 时使用 `loadEnv`，不要把全部 process.env 填进客户端 define。

部署后改 env，前端为什么没变？可以直接打开产物 JS 找这个值：它在构建时就被写进去了，服务器此时改的是另一个进程的环境。如果确实需要上线后变更，应让服务器返回一份公开运行时配置，或在 HTML 中注入它，并约定浏览器能读到哪些字段。

### 8. 生产构建怎样合并模块、拆分 chunk

先区分两个词：模块是依赖图里的单位，chunk 是交付出去的代码文件。构建要把模块组织进 chunk，二者当然不必一一对应。[构建与部署实验（课程 06）](../examples/06-build-deploy/README.md)用两个 HTML 入口和一个动态模块展示这件事：

```text
index.html → main.ts → shared.ts
admin/index.html → admin.ts → shared.ts
main.ts → import(lazy.ts)
    ↓ 构建
两份 HTML + 入口 chunk + 可能的共享 chunk + 动态 chunk + CSS/资源
```

这里的 shared 同时被首页和管理页使用。如果复制两份会浪费代码，把它提取出来又会增加依赖请求；打包器需要按依赖关系和输出策略安排。动态 import 提供按需加载边界，但遇到共享依赖时，一次调用可能需要几个文件。盯着“一个源码对应一个 JS”看产物，很快就会困惑。

那文件名变了，import 怎么办？打开入口产物就能看到：`import('./lazy.ts')` 已经被改成 `import('./assets/lazy-abc123.js')` 一类的路径。声明之间的引用和重名变量也需要一起处理。所以构建器必须理解模块关系。随手写进 JSON 的路径字符串，没有这种 import 关系，不能指望它自动跟着改名。

入口实验还有一个观察点：先看没有使用的导出消失，再给模块顶层加一条 console.log。后者即使没有被谁调用，也已经改变了模块求值时的行为，不能按“没引用”随便删掉。Tree shaking 依赖静态分析和副作用信息；把 sideEffects 错写成 false，也可能把真正需要的初始化删掉。

手动分包会改变加载与共享关系，甚至影响副作用触发时机，不能把“文件更多”直接等同于更快。[Rolldown 分包文档](https://rolldown.rs/in-depth/manual-code-splitting)说明了相关控制。先观察真实依赖、入口下载体积和交互时的加载，再决定是否手动调整。

构建与部署实验同时提供多页面、动态模块和库构建。常用配置的作用如下：

| 配置 | 作用与限制 |
| --- | --- |
| `base` | 资源公共基础路径，需要与实际服务器挂载路径一致 |
| `build.target` | 控制目标语法兼容，不自动补齐所有缺失的浏览器 API |
| `build.manifest` | 输出入口、资源和依赖映射，供后端模板或检查工具使用 |
| `build.sourcemap` | 输出调试映射，也可能公开源码，需要明确分发策略 |
| `build.rolldownOptions` | 配置底层入口和输出等构建选项 |
| `build.lib` | 以代码导出为入口构建库，另需考虑声明文件、exports 与依赖约定 |

网站构建默认关心 HTML 和浏览器资源，库构建关心消费者可以导入哪些导出；发布 TypeScript 库还需要类型声明生成。相关配置见[生产构建文档](https://vite.dev/guide/build)。

#### 产物怎样部署才一致

静态网站可以把 dist 交给静态服务器或 CDN。`vite preview` 用于本地检查。[官方部署指南](https://vite.dev/guide/static-deploy)列出了不同平台的接入方式。

base 是 `/study/` 时，服务器也需要把这个路径映射到产物。SPA 的客户端路由需要 HTML fallback，多页面则需要对应的 HTML；缺失的 JS、CSS 和 API 不应被误回退成 HTML，否则容易出现 MIME 类型错误。

还有一种问题只会在发布后出现：用户开着旧页面，过一会儿才点击动态功能，旧 JS 要找的 chunk 已经被新部署删掉了。hash 保证了文件内容身份，却不保证旧文件还在。HTML 和资源要按版本一致交付，旧资源需要留存策略；HTML 通常重新验证缓存，hash 资源可以长期缓存。SSR 则还要部署服务器入口及其外部依赖，不能只上传 client 目录。

## 第三部分：扩展 Vite

### 9. 插件的核心 Hook 怎样串起来

现在再打开 plugins，情况就具体了。一个插件可能补配置，也可能把特殊文件变成 JS，或者为开发服务器装一个接口。工厂返回的是这些工作的 Hook 对象；它还可以返回一组插件。`plugins: [a(), b()]` 注册了处理者，运行时由 Vite 在不同阶段调用它们。

读插件源码时，我会先找它接管了哪一种输入。改配置、处理模块、处理请求和生成产物，要看的是不同位置。把所有 Hook 先抄成一张执行顺序表，反而容易误读。

#### 配置阶段：把用户配置变成可用上下文

```text
用户配置、CLI 参数、插件列表
    ↓ config(config, configEnv)
插件补充或返回部分配置，Vite 继续合并
    ↓ configEnvironment(name, options)
按环境补充选项
    ↓ configResolved(resolvedConfig)
读取最终 root、mode 等配置，准备后续处理
```

配置还在合并时，可以通过 config 补充 alias 或 define。到了 configResolved，最终 root 等结果已经可读，适合保存下来供后面使用。此时修改配置，不会让 Vite 自动重做已经完成的解析。这里也还不是“某个模块正在 client 环境转换”的时刻，不能给所有配置 Hook 都套上 `this.environment`。

#### 模块阶段：名字怎样变成可执行源码

用 `import { message } from 'virtual:lesson'` 走一遍：

```text
输入 source = 'virtual:lesson'，importer = 当前导入者
    ↓ resolveId(source, importer)
输出内部模块 ID '\0virtual:lesson'
    ↓ load(id)
输出 'export const message = "hello"'
    ↓ transform(code, id)
输出改写后的 code + map
    ↓ 后续转换、依赖分析
开发响应 / 构建依赖图
```

最小插件如下：

```js
function lessonPlugin() {
  return {
    name: 'lesson',
    resolveId(source) {
      if (source === 'virtual:lesson') return '\0virtual:lesson';
    },
    load(id) {
      if (id === '\0virtual:lesson') {
        return 'export const message = "hello"';
      }
    },
  };
}
```

这里没有创建文件。resolveId 把公开名字认领成内部 ID，load 给这个 ID 提供源码；接下来的步骤就能把它当成模块处理。生成的源码里若写着 import，依赖分析仍会继续追下去。后面的 RPC 注册表正是这样进入服务器模块图的。

| Hook | 常见输入 | 有效结果交给谁 |
| --- | --- | --- |
| `resolveId` | import 字符串、导入者、解析选项 | 解析后的模块 ID，交给加载步骤 |
| `load` | 模块 ID | 模块源码，交给转换步骤 |
| `transform` | 当前源码、模块 ID | 新源码与 map，交给后续转换和分析 |

三个 Hook 的合作方式也不同。一个插件已经给出有效的 load 结果，通常就不需要再让另一个 loader 重新提供源码；transform 却可能把前一个插件的结果继续加工。它们不是同一种 reduce。写插件前要看清返回类型：null、字符串、对象和数组，在不同 Hook 里承担的职责不同。具体约定见 [Plugin API](https://vite.dev/guide/api-plugin)。

[插件实验（课程 07）](../examples/07-plugin-lab/README.md)中的文本宏只处理约定后缀，替换一个受控占位符，并返回 source map。这个范围用文本处理就能说明问题。如果要识别“名为 createServerFn 的调用确实来自某个包”，正则就不够了：局部变量可以同名，导入也可以有别名。后面的框架编译实验才引入 AST 和绑定分析。复杂度应由要处理的语义决定。

#### 开发阶段：服务建立与变更传播

```text
开发服务器创建
    ↓ configureServer(server)
注册 HTTP 中间件、接入框架服务
    ↓ HTML 请求 → transformIndexHtml → 模块请求 → resolve/load/transform
文件变化
    ↓ 当前环境 hotUpdate(context)
检查受影响模块、调整更新范围或发送自定义事件
    ↓ Vite 传播更新 → 客户端接受边界 → 执行更新逻辑
服务器关闭/重启
    ↓ closeServer
释放对应服务资源
```

configureServer 能拿到开发服务器，所以你可以在这里装中间件；返回后置安装函数，还能把中间件放在内部处理之后。但 build 不会把这个闭包抄进 dist。插件实验的开发接口在预览时消失，就是为了让这个边界可见。生产 API 则由后面的 Node API 实验单独提供。

transformIndexHtml 则既能参与开发，也能参与构建，判断时不能仅看它是不是“Vite 自有 Hook”。热更新也一样：新 hotUpdate 和兼容的 handleHotUpdate 有各自的环境上下文，应该看所用版本。

插件实验的文本 loader 返回可导入字符串，`this.addWatchFile` 声明需要观察的文件，hotUpdate 发送通知；页面的 accept 回调更新对应 DOM。这几部分共同完成热更新，单有一个 Hook 不足以保证业务状态保留。

#### 构建阶段：模块怎样进入最终输出

```text
构建初始化、options / outputOptions 等配置处理
    ↓ buildStart
准备当前构建状态
    ↓ resolveId → load → transform，递归处理依赖
moduleParsed / buildEnd 等分析阶段通知
    ↓ renderStart
进入 chunk 输出阶段
    ↓ renderChunk(code, chunk)
调整 chunk 代码，按需返回 map
    ↓ generateBundle(options, bundle)
查看 chunk/asset，emitFile 添加资源
    ↓ 写盘 → writeBundle
构建器关闭 → closeBundle
```

开发容器也会复用部分构建 Hook，例如初始化时的 buildStart；普通开发请求不进入完整 chunk 输出阶段。

这里有两个实测结果，能说明为什么不该死记一条顺序。锁定版本的 trace 中，outputOptions 可以早于 buildStart；用户 generateBundle 被调用时，Vite 也可能还没有生成 HTML。若插件想在这个位置修改 HTML，单凭“已经 generateBundle 了”就会判断错。要么选择合适的 HTML Hook，要么核对相关插件的输出顺序。

下面是 `pnpm docs:hooks:trace` 的写盘构建日志摘录，中间的模块转换调用已省略：

```text
options
outputOptions
buildStart
...
generateBundle  { isWrite: true, hasHtml: false }
transformIndexHtml
writeBundle
```

`hasHtml: false` 只描述这个探针被调用时的输出集合，不表示 Vite 没有生成 HTML。HTML 在后续处理阶段加入，所以 Hook 所属阶段和插件排序都需要一起考虑。

transform 看一个模块，renderChunk 看组织好的 chunk，generateBundle 看这一份输出的文件集合。到了最后一处，就能从 modules、imports 和 dynamicImports 回答“源码放进哪一包、包之间怎样依赖”。用 emitFile 添加 JSON 报告，再等构建器写盘即可。

框架编译实验中的 function-manifest.json、compiled 文本和 build-report.json 都是为了阅读。实际 RPC 的查找表在 load 里生成。把报告当成执行机制，会多追一条根本不存在的运行时链路。

关闭逻辑也值得单独验证。构建可能在初始化一半时失败，输出失败又走另一条错误路径；本仓库的受控错误追踪里还观察过重复 closeBundle。释放资源应允许“已经释放过”，统计状态也要按构建轮次重置。否则 watch 一会儿以后，报告里很可能混进前几轮的数据。

#### 排序与环境状态有什么限制

`enforce: 'pre'/'post'` 调整插件组的位置，一些 Hook 还支持自己的 order。配置和通知、并行与串行、first 与连续处理分别有各自约定。`apply`、`applyToEnvironment` 等还会限制插件在哪些场景生效。

多环境插件应在支持环境上下文的 Hook 中读取 `this.environment`。跨环境共享插件实例时，用以环境为键的 Map 保存记录，buildStart 只清理本轮对应环境。配置 Hook 和模块 Hook 的上下文不能互换。

全部 Hook、控制项与上下文成员放在[完整参考](../docs/plugin-hooks-reference.md)，[箭头生命周期](../docs/plugin-lifecycle.md)负责串联。`pnpm docs:hooks` 对照实际安装类型检查覆盖；`pnpm docs:hooks:trace` 运行构建成功、错误、开发和预览等六条路径，生成真实调度记录。完整清单用于查漏，不能替代对具体一次调用的观察。

## 第四部分：框架与实践

### 10. 多 Environment 怎样支撑 SSR

到这里，我们处理的主要还是浏览器程序。加上 SSR 后，问题变成了：同一个 App，一份要在服务器生成 HTML，另一份要在浏览器接上交互。源码可以共享，入口和执行目标却不同。

```text
                     App.tsx
                    ↗       ↖
浏览器入口 entry-client    服务器入口 entry-server
    ↓ hydrateRoot             ↓ renderToString
client 模块图              ssr 模块图
    ↓                         ↓
浏览器程序                  Node 服务器程序
```

如果只给同一张图加一个 ssr 布尔值，很快会遇到更多区别：包该选哪个条件导出？某个插件应该生成浏览器代码，还是服务器代码？输出又放在哪里？Environment 把这些处理上下文分开，一台 Vite 开发服务器可以服务多张图。它不是进程数量；runtime 才是代码实际执行的宿主。[Environment API](https://vite.dev/guide/api-environment)正式表达了这些关系，部分接口仍在演进。

[多环境 SSR 实验（课程 08）](../examples/08-environments-ssr/README.md)声明 client、ssr，并启用应用构建。下面只摘出环境与入口配置，省略 imports、React 插件和 HTTP 宿主；可运行配置见课程源码：

```ts
export default defineConfig({
  builder: {},
  environments: {
    client: { build: { outDir: 'dist/client' } },
    ssr: {
      build: {
        ssr: true,
        outDir: 'dist/server',
        rolldownOptions: { input: 'src/entry-server.tsx' },
      },
    },
  },
});
```

配置声明处理目标，应用构建再编排这些目标。仅声明环境不能推导出任意构建命令都会自动产出所有环境；SSR 实验提供移除应用 builder 的对照。[框架接口](https://vite.dev/guide/api-environment-frameworks)说明了应用构建与开发环境的编排方式。

一次 SSR 请求还需要 HTTP 宿主：

```text
GET /
    ↓ Node HTTP 路由
开发：ssr.runner.import(服务端入口)
生产：Node import(已构建入口)
    ↓ 调用导出的 render
生成 HTML 与可公开的初始数据
    ↓ 填充模板，返回响应
浏览器加载 client 程序 → hydrateRoot
```

注意图里的“调用 render”。Vite 可以把服务端模块交给运行器执行，但需要 HTTP 宿主接住请求，取出这个导出并调用。SSR 实验把这段编排写在 server.mjs 中，可以直接追踪到导出被调用的位置。[SSR 文档](https://vite.dev/guide/ssr)也把它作为低层接入来说明。

浏览器随后要用同一份初始数据水合。如果服务器先算一次随机值，浏览器再算一次，两份输出就不再一致。初始数据还意味着一次公开交付：写进 HTML 的内容浏览器都能读到；序列化时也要处理标签结束等字符，不能把 JSON 直接拼进去就结束。

[Node API 实验（课程 09）](../examples/09-fullstack-api/README.md)单独展示 CSR + Node API：开发代理转发请求，生产由 Node 提供 API 和静态资源。它没有为后端配置第二张 Vite 图。全栈 API、SSR、多环境分别解决不同问题，可以组合，也可以分别采用。

### 11. 一份服务端函数源码为什么能生成两端程序

[最小 RPC 实验（课程 10）](../examples/10-tiny-rpc/README.md)只保留一个函数和一个短插件。业务模块只导出 `greet(name)`，内部使用 Node API；页面仍像普通函数一样导入它。

插件在转换时按环境处理：

```text
同一个 greet.server.js
    ├─ client → 整个模块替换成 fetch('/rpc/greet') 代理
    └─ ssr → 保留真正的 Node 实现
```

服务器入口导入插件生成的虚拟注册表，其内容相当于：

```js
export const registry = {
  greet: () => import('./greet.server.js').then(module => module.default),
};
```

```text
浏览器 await greet('小明')
    ↓ POST /rpc/greet，发送 JSON 参数
服务器取出 ID greet
    ↓ await registry[id]()，加载模块并拿到函数
await fn('小明')
    ↓ JSON 响应 → 浏览器代理解包
await 得到结果
```

函数就是在 `registry[id]()` 这一步找到的。没有远程传输函数，也没有到磁盘里搜索名为 greet 的声明；编译时已经写好“这个 ID 加载这个模块”。打包之后，ID 仍可以是 greet，import 路径则变成 `./assets/greet.server-某个hash.js`。两种标识的对应关系保存在代码里，打包器修改模块引用时一起维护它。

最小 RPC 把整个文件当成一个服务端函数，这是它能保持短小的原因。接下来再放宽一个条件：同一文件还要导出页面会用的常量。整文件替换就不合适了。继续支持导入别名、局部同名变量和共享 helper，又需要知道绑定关系。框架编译实验的 AST 编译器是在解决这些具体问题，可以按这个顺序逐步增加条件。

#### TanStack Start 对应到哪里

[框架编译实验（课程 11）](../examples/11-mini-start/README.md)参考 TanStack/router 的固定提交 `7a0672503857283614799a0b480f4a82110e5ab6`。在这个快照的[服务端函数编译器](https://github.com/TanStack/router/blob/7a0672503857283614799a0b480f4a82110e5ab6/packages/start-plugin-core/src/start-compiler/handleCreateServerFn.ts)中，可以看到 client caller、SSR caller 与 provider 等角色；本地[源码对照](../examples/11-mini-start/SOURCES.md)逐项列出采用和省略的机制。

```text
createServerFn().handler(真实实现)
    ↓ 根据模块角色编译
    ├─ client caller → HTTP 代理
    ├─ SSR caller → 服务器本地查表代理
    └─ provider → 保留真实实现，导出供注册表加载的入口
```

这里最绕的是 provider。服务器自己也需要调用接口的代码：一份是“我要调用 getGreeting”的调用者，另一份才是保留真实 handler 的实现者。插件用 `?server-fn-provider` 给后者一个不同模块 ID，transform 看见 query，就生成实现端代码。两者仍在 ssr 图内；增加一个身份，并没有增加第三个环境或要求启动第三个服务器。

不要把所有类似名字的 API 都归入 RPC。`createIsomorphicFn` 为两端选择各自的本地实现；`createServerFn` 让调用跨越到服务器；`createServerOnlyFn` 限制执行目标，不意味着自动发布接口。TanStack 的[服务端函数指南](https://tanstack.com/start/latest/docs/framework/react/guide/server-functions)描述了正式框架的用法，教学 API 只覆盖其中一部分。

一个可远程调用的函数最终是外部输入入口。正式应用还需要权限、输入校验、错误处理、请求上下文和传输协议等。编译时移除客户端 handler，不能代替服务端授权。客户端包也不是唯一公开渠道：把密钥写进 SSR 初始数据，或把原实现留在公开 source map，仍然会泄漏。

这次实现里真正出过问题的是 source map。检查客户端 JS 时，handler 和 Node 加密依赖都已移除；继续检查 map，却发现 sourcesContent 带回了原始 handler。代码执行路径已经隔离，源码分发路径却漏了。

具体触发条件是：转换已经删掉 handler，却返回 `{ mappings: '' }`，并开启客户端构建 source map。在本例 Vite 8.3.4 的后续处理中，最终 sourcesContent 带回了包含 `createHmac` 的原文。可以在临时目录比较错误版与当前版，脚本会清理临时输出，不修改课程源码：

```bash
pnpm --filter @vite-study/11-mini-start compare:maps
```

```json
{"mode":"empty","sourcesContentContainsCreateHmac":true}
{"mode":"safe","sourcesContentContainsCreateHmac":false}
```

当前版本把映射指向安全的转换后源码，并同时检查 JS 和 map。代价是失去原始业务源码的精细定位。这个结果限定于上述映射与构建链，不能推断所有工具中的空 map 都会泄漏。正式框架需要在隔离和定位精度之间设计更完整的映射策略。

### 12. 生态框架通常怎样接入 Vite

把“框架插件”按职责拆开，比只看 plugins 数组更容易定位问题：

| 接入层 | 常见工作 | 应该检查的结果 |
| --- | --- | --- |
| 语法与组件开发 | JSX、单文件组件、开发注册、热更新边界 | 转换后的模块、编辑行为 |
| 应用框架 | 路由、双端入口、数据加载、SSR、服务端函数编译 | 两端模块图、调用协议、产物 |
| 运行时与部署适配 | 开发执行宿主、绑定、请求接口、构建与部署资产 | 实际运行时能力、请求入口、部署配置 |

React 插件主要参与第一层；TanStack Start 组合应用约定与运行时；Cloudflare 插件则把相应环境接到 Workers 的开发和部署体系。一个框架可能横跨多层，表格用于区分责任，不是包之间绝对互斥的分类。

Workers 可以解释第三层为什么必要。如果本地一直在 Node 里执行，部署后却交给另一个运行时，开发时验证的 API、模块行为和 bindings 就未必是生产里的那一套。Cloudflare 在[介绍 Vite 插件的文章](https://blog.cloudflare.com/introducing-the-cloudflare-vite-plugin/)里，把 workerd 接入开发环境作为重要变化。它解决的是代码在哪里执行，构建输出目录只是其中一部分。

框架仍负责组织应用，运行时提供者负责让相应环境中的代码能在正确宿主执行。Vite 的[运行时接口](https://vite.dev/guide/api-environment-runtimes)和 [Cloudflare 插件文档](https://developers.cloudflare.com/workers/vite-plugin/)把这个接缝展开说明。

Vite、框架和运行时适配器通过环境、入口及请求约定衔接。某个插件工厂可以返回多个插件，各自负责不同 Hook；数组顺序只是排序的一部分。真实项目应从框架官方集成模板开始，再观察最终配置，而不是把几份独立教程里的插件数组拼在一起。TanStack Start + Cloudflare 的具体配置应对照[官方集成指南](https://developers.cloudflare.com/workers/framework-guides/web-apps/tanstack-start/)。配套仓库验证的是 Node 教学实现，没有声称完成这套云端部署。

阅读一个不熟悉的 Vite 框架，可以依次定位：配置如何加载、有哪些环境、各环境入口、特殊 import 的解析与转换、实际执行宿主，以及最终接收请求的处理器。找到这几个位置后，大量框架代码都能归到具体职责里。

### 13. 性能与故障应按阶段排查

性能问题先说清楚哪一步慢。是启动命令之后迟迟不能访问，第一次打开慢，保存后更新慢，还是生产首屏慢？同一句“Vite 很慢”背后，可能是四个不同位置的工作。打包速度和用户下载体积也要分别测量。

| 现象 | 先看什么 | 常见方向 |
| --- | --- | --- |
| 启动或首次页面慢 | 依赖优化日志、Network、插件转换耗时 | 新依赖扫描、过宽转换范围、昂贵插件、请求瀑布 |
| 编辑后更新慢或整页刷新 | HMR 消息、模块导入关系、框架边界 | 广泛导入的模块、失效传播、重型转换 |
| 仅生产失败 | 完整 build 日志、产物、预览请求 | 大小写、静态分析限制、资源路径、外部依赖 |
| JS 请求返回 HTML | Response 与 Content-Type、服务器 fallback | base/挂载路径错误、旧资源失效、回退规则过宽 |
| SSR 出现 window 错误 | 堆栈所属入口、共享模块顶层代码 | 浏览器专用逻辑进入服务器目标 |
| CI 类型失败但 build 成功 | 独立类型检查、各工具解析配置 | 转译与类型检查职责不同、alias 配置未对齐 |

例如一个插件在每次 transform 中都遍历整个 src。单看某次扫描很快，模块多了，同一棵目录树却会被反复读很多次。这时应该先调整扫描时机和缓存失效，而不是去改 vendor 分包。先从日志或 profiler 找到耗时，再用相同操作比较变更前后；如果没有差别，就没有依据把这项改动叫优化。[Vite 性能指南](https://vite.dev/guide/performance)给出了测量入口。

测试也按层次选择：纯函数用单元测试；插件转换检查输入输出；开发服务器和 SSR/RPC 用集成测试；HMR 的状态保留与水合行为用真实浏览器操作。Vitest 等工具可以接入 Vite 生态，但本文使用 Node 测试运行器验证构建与服务，避免引入一个测试框架后再解释其配置。

### 14. 用配套实验复验本文

主线先掌握日常使用，再进入扩展机制：

```text
01 入口与模块图 → 02 配置、CSS 与资源
    ↓
03 裸 React → 04 Fast Refresh → 05 mode 与 env
    ↓
06 构建、库与部署 → 07 插件与 Hook
    ↓
08 多环境 SSR → 09 Node API → 10 最小 RPC → 11 框架式编译
```

每节 README 提供运行地址、源码阅读顺序、修改实验、预期现象和自测。实验后恢复修改，再运行：

```bash
pnpm check
```

它执行类型检查、全部课程构建、行为验证、文档链接与课程顺序检查，以及 Hook 覆盖核对。浏览器操作和云端部署不由这条命令自动涵盖，范围见[验证记录](../docs/verification.md)。

完成后可以用一个实际任务检验理解：为自己的项目画出“HTML/服务器入口 → 模块图 → 转换 → 产物 → 请求处理”图，并标出一个动态模块、一个框架 HMR 边界和一个服务器专属依赖。图里每条箭头都应能在 Network、源码或构建报告中找到对应证据。


作者：[刘耀文](https://github.com/liyown)。本文源于这套本地学习实验，代码与文字使用 AI 辅助实现和整理；验证命令、版本与未覆盖范围保留在配套教材。勘误请提交到[仓库 Issues](https://github.com/liyown/vite-study/issues)。
