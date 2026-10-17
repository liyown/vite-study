# 顺着一个项目，走完 Vite 的全部 Hook

我们就看第 07 节这个项目：[源码](../examples/07-plugin-lab/src/main.ts)、[插件实现](../packages/lab-plugins/src/index.ts)。它的入口大致是：

```ts
import info from 'virtual:build-info'
import note from './lesson.note.md'
import { message } from './message.lesson'
import './style.css'
```

沿着它启动、请求、改文件、打包、关闭的过程，看看 **Vite 手里拿着什么 → 调哪个 Hook → 得到什么 → 接着干什么**。

本篇覆盖 Vite 8.3.4 / Rolldown 1.2.14 的全部 **37 个 Hook／环境选择回调**。图中的值用于说明数据变化；某些 Hook 是给这个项目扩展功能时才会用到，并不是第 07 节已经实现了全部 Hook。准确类型与源码证据放在 [附录](plugin-hooks-reference.md)，不穿插在流程中。

## 1. 先启动：配置怎么变成插件管线？

你运行 `pnpm dev 07`，Vite 先准备配置，此时还没处理 main.ts。

```text
vite.config.ts
    │
    │ Node 加载配置、执行插件工厂
    ↓
plugins: [traceHooks(), virtualBuildInfo(), noteLoader(), ...]
    │
    │ 得到一组插件对象
    │ 按 apply 筛选，按 enforce 等规则排序
    ↓
当前用户配置，例如 { plugins: [...], build: { sourcemap: true } }
    │
    ├─→ config(config, { command: 'serve', mode: 'development' })
    │       │
    │       └─→ 比如返回 { define: { __APP_NAME__: '"study"' } }
    │                 ↓ 合并进配置，交给下一个 config Hook
    ↓
各环境的配置：client、ssr 等
    │
    ├─→ configEnvironment('client', clientConfig, env)
    │       └─→ 返回的环境配置 → 合并进 client
    │
    └─→ configEnvironment('ssr', ssrConfig, env)
            └─→ 返回的环境配置 → 合并进 ssr
    ↓
Vite 解析默认值、路径等 → 最终 ResolvedConfig
    │
    └─→ configResolved(resolvedConfig)
            └─→ 插件记下 root / command 等，后面使用
    ↓
为环境准备各自的插件集合
    │
    └─→ applyToEnvironment(environment)
            ├─→ true  → 当前插件参与这个环境
            ├─→ false → 这个环境跳过当前插件
            └─→ 插件 / 插件数组 → 这个环境改用返回的实现
```

到这里，输出是**配置与插件集合**。configResolved 只是读最终配置，不是返回一个新配置重新解析。config 运行前插件集合已经解析，不能在 config 返回 plugins 来追加本轮插件。

接下来根据你运行的命令分路：

```text
配置准备好
    ├─→ dev     → 起开发服务器 → 按请求处理模块        【第 2～4 节】
    ├─→ build   → 从入口建图 → 生成产物                【第 5～7 节】
    └─→ preview → 托管已经存在的 dist                 【第 8 节】
```

## 2. dev：浏览器还没打开，Vite 先准备什么？

这里有两件准备工作：模块管线和 HTTP 中间件。

```text
准备环境的模块管线
    │
    └─→ options(打包器层的输入选项)
            │ 返回新选项对象 → 替换当前选项；空值 → 保持
            ↓
        管线准备好 → buildStart(归一化后的输入选项)
                         └─→ 清本轮统计、登记额外监听文件等

搭建开发 HTTP 服务器
    │
    └─→ configureServer(server)
            │ 比如注册 /__study API 中间件
            ↓
        Vite 注册内置中间件
            ↓
        如果 configureServer 返回了函数，此时执行它
            └─→ 再安装需要排在内置中间件后面的逻辑
```

这两条是准备工作的关系图，不能把它们拼成所有版本统一的严格时间顺序。默认 dev 中，buildStart/buildEnd 为兼容旧插件通常只在 client 调用；环境开关见第 9 节。

`configureServer` 安装中间件，真正每个请求执行的是中间件函数：

```text
启动时 configureServer 注册 /__study
    ↓
浏览器请求 /__study → 中间件运行 → 返回 JSON
浏览器请求 /__study → 中间件再次运行 → 返回 JSON
```

## 3. 浏览器打开页面：HTML → JS → 依赖模块

先取 HTML，再顺着 HTML 里的 script 请求入口。

```text
浏览器 GET /
    ↓
Vite 读 index.html
    ↓
transformIndexHtml(html, ctx)
    │ 比如返回一个 <meta name="study-plugin" ...> 标签描述
    ↓
Vite 合并 HTML 修改、注入开发客户端等
    ↓
HTML 响应 → 浏览器发现 <script type="module" src="/src/main.ts">
    ↓
浏览器 GET /src/main.ts
```

现在开始处理 main.ts。注意每一步手里的数据在变：

```text
请求地址：/src/main.ts
    ↓
resolveId(source, importer, options)
    │ “这指的是哪个模块？”
    ↓
模块 ID：/项目绝对路径/src/main.ts
    ↓
load(id)
    │ “它的源码是什么？”
    │ 自定义插件没接管 → 内置加载器读文件
    ↓
源码：import info from 'virtual:build-info'; ...
    ↓
transform(code, id)
    │ 插件 A → 改过的 code/map → 插件 B → ...
    │ 其中包括内置的 TS 转译、import 分析等处理
    ↓
浏览器能执行的 JS + Vite 记录的模块依赖关系
    ↓
HTTP 响应 → 浏览器沿 import 继续请求依赖
```

接下来碰到虚拟模块。它没有磁盘文件，但照样走这条链：

```text
main.ts 导入 'virtual:build-info'
    ↓
resolveId('virtual:build-info', mainId)
    │ virtualBuildInfo 插件接管
    ↓
返回内部 ID：'\0virtual:build-info'
    ↓
load('\0virtual:build-info')
    │ virtualBuildInfo 插件生成内容
    ↓
返回源码：export default { environment: 'client', command: 'serve', ... }
    ↓
transform 链 → 响应模块 JS → 浏览器执行 → 拿到 info 对象
```

`\0` 表示内部 ID 的空字符前缀；浏览器 URL 另有编码。**source、模块 ID、磁盘路径、请求 URL 有映射关系，不是永远同名。**

`.note.md` 的例子同样如此：

```text
导入 './lesson.note.md'
    ↓ resolveId
绝对路径 /.../lesson.note.md
    ↓ load：noteLoader 读取文本
export default "笔记内容"
    ↓ transform 链
JS 模块响应 → 浏览器 import → note 变量得到字符串
```

这里最需要分清两个“怎么往下走”：

```text
resolveId / load：找一个能处理的插件
    插件 A 返回 null → 试 B → B 返回有效结果 → 停止查找

transform：让多个插件接着改
    原代码 → A 改后的代码 → B 改后的代码 → 最终代码
```

解析和转换可以命中缓存，不能把一次 HTTP 请求直接等同于完整重跑一遍。默认 dev 不生成整应用 chunk，所以没有普通 renderChunk/generateBundle 阶段。

## 4. 编辑笔记：服务端 Hook 怎么接到浏览器更新？

现在你把 lesson.note.md 从“旧笔记”改成“新笔记”。

```text
文件系统出现 update 事件
    ↓
watchChange(file, { event: 'update' })
    │ 通知插件：文件变了，可以清理自己的缓存
    ↓
Vite 找出当前环境中与文件关联的候选模块
    │ 例如 [lessonNoteModule]
    ↓
hotUpdate({ type: 'update', file, modules, read, ... })
    │
    ├─→ 返回 undefined → 候选列表保持不变
    ├─→ 返回新模块数组 → 替换候选列表，交给后续插件
    └─→ 返回 []        → 清空这次默认更新的候选列表
    ↓
Vite 失效处理、沿 importer 查找谁能接受变化
    ↓
main.ts 注册过 accept('./lesson.note.md', callback)
    │ 找到接受边界
    ↓
服务端发送 update 元数据：更新谁、在哪接受、时间戳
    ↓
浏览器 /@vite/client 收到消息
    ↓
请求更新的模块 URL，带 ?t=时间戳
    ↓
服务端重新提供需要更新的模块：load / transform 等
    ↓
浏览器求值新模块 → 得到 { default: '新笔记' }
    ↓
执行 main.ts 先前登记的 accept 回调
    ↓
回调把新字符串写进页面 → 笔记更新，计数器状态保留
```

这里 **main.ts 不必整体重跑**：再次执行赋值的是你写的 accept 回调。第 07 节的 noteLoader 还会发送自定义事件来更新提示文字，这与默认模块更新是两件事。

旧插件可能写的是 handleHotUpdate。它处在同一个位置的兼容分支：

```text
插件有 hotUpdate？
    ├─→ 有 → 调 hotUpdate（按环境，支持 create/update/delete）
    └─→ 没有 → 是兼容路径里的 update 事件吗？
                  ├─→ 是 → 调 handleHotUpdate(ctx)
                  └─→ 否 → 不调用旧 Hook
```

同一个插件同时提供两者不会都调用。返回 [] 也不表示“已经自动完成自定义更新”；自己发消息时，要处理所需的缓存失效。

还有两种常见分路：

```text
改 CSS → 转换后的 CSS-JS 模块重新求值 → updateStyle() 更新 style → 自接受

改普通 JS → 向上找接受边界
               ├─→ 找到 → 更新模块 + 执行接受回调
               └─→ 无可用边界 → 可能刷新页面

改 Vite 配置 / 需要重启的 env 文件 → 提前进入服务器重启路径
```

## 5. build：同样的模块，怎样变成 dist？

运行 `pnpm --filter @vite-study/07-plugin-lab build`。配置阶段还是第 1 节，但现在 command 是 build。

这次 Vite 不等浏览器逐个请求，它从入口主动遍历依赖。

```text
打包器 InputOptions
    ↓ options：修改/替换输入选项
打包器 OutputOptions
    ↓ outputOptions：修改/替换输出选项，例如文件命名
归一化后的配置
    ↓ buildStart：开始本轮
入口 index.html → main.ts
    ↓
resolveId → 模块 ID → load → 源码 → transform → 新源码
    ↓
Rolldown 解析这份代码中的 import
    │
    ├─→ 静态 import → resolveId → load → transform → 继续查依赖
    │
    └─→ 动态 import('virtual:lazy')
            ↓ resolveDynamicImport（旧兼容 Hook）
            │ 未接管时继续解析；新插件优先用 resolveId
            ↓ 模块 ID → load → transform → 继续查依赖
    ↓
某个模块解析完成，且它的导入已解析
    ↓ moduleParsed(moduleInfo)
这个模块依赖谁，已可供插件查看
    ↓ 继续处理其他模块；不同模块的回调可以交错
整张模块图构建完毕
    ↓ buildEnd(undefined)
开始生成输出
```

在 moduleParsed 时，模块“导入了谁”已经确定，但“被谁导入”还可能继续增加；要看较完整的模块图，可到 buildEnd。

这版实测 outputOptions 在 buildStart 前执行。它处理的是输出**选项**；下面 renderStart 才表示开始生成本份输出。

```text
模块图 + 输出选项
    ↓ renderStart(outputOptions, inputOptions)
开始本份输出生成：优化、分配/渲染 chunk 等由内部实现处理
    ↓
得到若干 chunk
    │ 可能合并多个源码模块，也可能由动态 import 分开
    ↓
每个 chunk 的生成过程                        【下面三个分支展开】
    ↓
最终 JS chunk + 静态资源
    ↓ generateBundle(outputOptions, bundle, isWrite)
插件可增删/改产物，或 emitFile 生成报告
    ↓ 后续 generateBundle Hook 继续处理
本例中 Vite HTML 插件在这里处理 HTML
    ↓ transformIndexHtml(html, ctx)
index.html 进入 bundle
    ↓
本次要写盘吗？
    ├─→ 否，write:false → 返回内存产物，不调用 writeBundle
    └─→ 是             → 写入 dist → writeBundle(options, bundle)
    ↓
关闭构建对象 → closeBundle(error?) → 清理资源
```

你的 generateBundle 不一定看到最终 HTML：上图 HTML 的位置来自本版受控实验，具体还受插件排序影响。writeBundle 时文件已经写出；只改此时的内存对象，不会自动重写文件。

### 分支 A：一个 chunk 上，四种插入文本分别放哪？

```text
某个 chunk
    │
    ├─→ banner(chunk) → 得到文件头文本，放在格式包装外
    ├─→ intro(chunk)  → 得到前置代码，放在格式包装内
    ├─→ outro(chunk)  → 得到末尾代码，放在格式包装内
    └─→ footer(chunk) → 得到文件尾文本，放在格式包装外
    ↓
以有函数包装的输出格式为例，生成内容的位置是：

    /* banner */
    (function () {
        /* intro */
        ...真正的 chunk 代码...
        /* outro */
    })();
    /* footer */
```

这是文本**位置示意**，不是说所有输出格式都有这层函数。ESM 通常没有这样的包装；这些内容后面还可能被渲染/压缩处理。

### 分支 B：发射的资源，代码里怎么引用它？

假设插件想生成 hello.txt，并在 JS 里取得它的地址：

```text
load 等 Hook 中 this.emitFile({ type: 'asset', name: 'hello.txt', source: 'hello' })
    ↓
拿到 referenceId，例如 ref123
    ↓
插件生成 JS：export default import.meta.ROLLUP_FILE_URL_ref123
    ↓ 输出生成时，宿主需要替换这个特殊表达式
resolveFileUrl({ referenceId, fileName, relativePath, ... })
    ↓
返回 JS 表达式字符串，例如 JSON.stringify('/assets/hello-abc.txt')
    ↓
输出代码：export default "/assets/hello-abc.txt"
```

这里返回的是带引号等语法的 **JS 表达式**，不是随便返回一段裸 URL。Vite 内置资源插件也会接管这个 first Hook；普通插件不一定轮得到。

### 分支 C：模块转换结束了，还能改最终 JS 吗？

```text
多个源码模块 → 合并/分包 → 某个 chunk 的代码
    ↓
renderChunk(code, chunk, options, meta)
    │ 插件 A 改代码 → 插件 B 接着改 → ...
    ↓
改过的 chunk 代码和 sourcemap
    ↓
augmentChunkHash(chunk)
    │ 比如返回额外版本字符串 'template-v2'
    ↓
宿主把它加入哈希计算 → 确定带哈希的产物名与引用
```

transform 改的是**单模块源码**，renderChunk 改的是**输出 chunk**。augmentChunkHash 贡献哈希输入，返回 abc 并不表示文件就叫 abc.js。不要据这个简图推断所有格式下 URL、哈希、占位符替换的内部微观顺序。

## 6. 构建出错、监听变化、关闭：旁边的分支

这些 Hook 不在正常成功路径上，也不应该硬插成每个文件必经的一站。

```text
resolve/load/transform 等模块阶段失败
    ↓
buildEnd(error)
    ↓
错误交给调用者 → 宿主关闭构建对象 → closeBundle(error?)

模块阶段成功 → buildEnd(undefined)
    ↓
输出阶段例如 renderChunk 失败
    ↓
renderError(error)
    ↓
错误交给调用者 → 关闭/清理
```

buildEnd 成功只表示模块阶段结束，不表示 dist 成功。closeBundle 的错误参数也不覆盖所有失败；本版错误实验甚至观察到重复调用，因此清理逻辑应幂等。

日志可以出现在很多阶段：

```text
Rolldown 或插件发出日志
    ↓
onLog(level, log)
    ├─→ 返回 false → 拦下这条日志
    └─→ 其他允许结果 → 下一个 onLog → 配置的日志处理器/终端
```

它不是所有 Vite 配置/服务器日志的统一拦截器。

如果运行的是 build --watch：

```text
首次构建完成 → watcher 继续监听
    ↓ 文件变化
watchChange(id, { event }) → 清理插件缓存
    ↓
开始下一轮：buildStart → 模块处理 → buildEnd → 产物生成 → ...
    ↓ 继续监听，可能再构建很多轮
用户关闭构建 watcher
    ↓
closeWatcher() → 释放需要跨轮保留的资源
```

watcher 中一轮构建完成，不等于 watcher 关闭。closeBundle 适合构建对象资源，closeWatcher 适合跨轮监听资源；它们也不同于下面的开发服务器关闭。

## 7. 全栈、多环境：外面再套一层应用编排

前面第 5 节说的是一个环境怎么 build。整应用构建还要决定先构建谁，例如先 client，再 ssr。

```text
createBuilder(...) → builder.buildApp()
    ↓
buildApp(builder) 的 pre/default Hook
    │ 插件可调用 builder.build(builder.environments.client)
    ↓
配置里的 builder.buildApp(builder)
    ↓
buildApp(builder) 的 post Hook
    │ 插件可按依赖关系继续构建 ssr 等
    ↓
如果所有环境都还没构建过 → Vite 默认构建全部环境
如果已有环境被自定义逻辑构建 → 自定义逻辑负责覆盖所需环境
```

builder.build 一个环境时，又回到前面那条线：

```text
buildApp：决定 client → ssr 的先后关系
    │
    ├─→ builder.build(client)
    │       └─→ options → buildStart → 模块图 → render/output → client 产物
    │
    └─→ builder.build(ssr)
            └─→ options → buildStart → 模块图 → render/output → ssr 产物
```

这个 Hook 需要整应用构建入口；普通单环境 build 不等于自动经过它。不要只构建 client 就假定 Vite 一定会把其余环境补齐。

## 8. 服务器怎样收尾？preview 又在哪条线？

开发服务器：

```text
用户关闭 dev / 配置变化导致重启
    ↓
关闭 watcher、热通道、环境插件容器、HTTP 等
    │ 环境容器清理中有 buildEnd / closeBundle，受兼容策略影响
    ↓
closeServer({ reason: 'close' 或 'restart' })
    ↓
释放 configureServer 安装的服务器级资源
```

preview 是另外一种服务器，只读现成的 dist：

```text
现成 dist + 配置解析
    ↓
configurePreviewServer(server)
    ↓ 注册自定义预览中间件
Vite 注册内置静态服务
    ↓
执行 Hook 返回的后置注册函数
    ↓
HTTP 请求 → 返回 dist 中的文件
    │ 不再走源码 resolve/load/transform/build
    ↓ 用户关闭
关闭预览 HTTP 服务器
    ↓
closePreviewServer()
```

closePreviewServer 没有 reason 参数。开发中间件、预览中间件也不会自动变成你部署后的生产后端。

## 9. 剩下这些名字，放回流程里怎么看？

### 有声明但这版还不工作的 Hook

```text
你写 shouldTransformCachedModule(options) 并返回 true
    ↓
Vite 8.3.4 声明说明：Rolldown 暂不支持，此项当前 no-op
    ↓
不会因此强制已缓存模块重新 transform
```

至此，37 个 Hook／选择回调都已经落在上面的主线或分支中。

### 插件对象上另外 9 个属性，在哪里起作用？

```text
{name, version, meta} → 插件身份/描述，供日志与工具识别
api                 → 插件公开的自定义 API；Plugin<A> 的 A 描述它

apply               → 配置阶段，全局决定是否参与 serve/build
enforce             → 给插件安排 pre / 默认 / post 层级
Hook 的 order       → 在某个同名 Hook 内再安排顺序

sharedDuringBuild   → 整应用构建：这个插件是否加入共享实例管线
                         ↓ 共享时，把各环境状态分开存

perEnvironmentStartEndDuringDev
    ↓
默认 dev 的 buildStart/buildEnd 只调 client
    → 开启后，让该插件在其他环境也参与初始化/收尾

perEnvironmentWatchChangeDuringDev
    ↓
默认 dev 的 watchChange 只调 client
    → 开启后，让该插件在其他环境也收到变化通知
```

这些开关还有对应的 builder/server 全局配置，细节见附录。enforce 与 order 是两层排序；不能拿一个层级顺序推导所有 Hook 的微观顺序。

### `this.xxx()` 和 Hook 的关系

```text
宿主调用你的 load(id) Hook
    ↓
你在里面调用 this.resolve(...) / this.load(...) / this.addWatchFile(...)
    ↓
请求宿主解析、加载或登记依赖
```

前者是**宿主回调你的函数**，后者是**你调用宿主提供的工具**。this.emitFile/getFileName/getModuleInfo/getCombinedSourcemap 等工具的完整列表在附录；并非每个 Hook 都拥有完整工具集，配置/HTML/旧 HMR 等上下文尤其不同。

## 10. 对照代码和源码时，从哪里接着看？

```text
想对照本项目实现
    → 第 07 节 main.ts
    → packages/lab-plugins/src/index.ts 中对应的插件函数

想查某个 Hook 的准确参数、返回类型、源码位置
    → 附录里点该 Hook 名字

想核对是否真的覆盖当前版本的全部接口
    → pnpm docs:hooks

想观察实际执行顺序
    → pnpm docs:hooks:trace
    → docs/plugin-hooks.trace.json
```

[类型与源码附录](plugin-hooks-reference.md) · [接口清单](plugin-hooks.inventory.json) · [实际日志](plugin-hooks.trace.json) · [第 07 节实验说明](../examples/07-plugin-lab/README.md)

图表达数据怎么流动，不承诺跨模块、跨环境都串行或固定调用一次。前文顺序细节以本项目版本和注明的实测路径为准；未打包 dev、生产构建、缓存命中和重启会走不同分支。附录保留来源与运行验证范围。
