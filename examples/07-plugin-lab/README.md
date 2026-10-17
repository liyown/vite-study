# 07 · 自己写六个插件

本节是可拆装实验台：`pnpm dev 07`，打开 http://127.0.0.1:5177 。

实现全部放在 `packages/lab-plugins/src/index.ts`，每个函数返回一个短小 Plugin 对象；`vite.config.ts` 负责注册。08 也复用了其中两个插件，因此可以对比 client 和 ssr。

## 逐个读，逐个关闭

| 插件 | Hook | 实验现象 |
| --- | --- | --- |
| traceHooks | config / configResolved / resolveId / transform | 终端显示配置与本地模块处理日志 |
| virtualBuildInfo | resolveId + load | import 一个磁盘上不存在的模块 |
| noteLoader | load + hotUpdate | 自定义后缀导入为字符串；变更通知与模块热更新 |
| lessonMacro | transform | 把受控占位符换成字符串，并提供 source map |
| htmlAndDevApi | transformIndexHtml + configureServer | head 元信息；开发期 /__study JSON |
| bundleReport | buildStart / transform / generateBundle | dist/study-report.json 记录每环境模块与 chunk |

不要一次删光插件。每次只注释一个注册项，重启并观察报错来自哪个环节，再恢复。

## 实验 A：虚拟模块

main.ts import `virtual:build-info`。resolveId 把公开名字映射到 `\0virtual:build-info`，load 返回 JS 源码 `export default ...`。

`\0` 是内部模块标记，不是文件路径。resolveId 没匹配就返回 null，让其它解析器继续。JSON.stringify 用来安全构造字符串代码；load 的结果仍会经过后续转换与依赖分析。

在 08 中使用相同插件时，this.environment.name 分别是 client / ssr。插件闭包只记录全局 command/mode，环境信息在环境 Hook 中读取。

## 实验 B：自定义文件与 HMR

先把“点击”计数点到 3，修改 `src/lesson.note.md` 并保存。

预期：新文本显示、点击数仍为 3、状态栏显示 hotUpdate 文件通知。原因是 main.ts 通过 `import.meta.hot.accept('./lesson.note.md', ...)` 接受这个依赖的更新，只改对应 DOM；hotUpdate 同时发送一个自定义事件。

插件没有返回 [] 阻断正常传播。文件通过 load 变为 JS 字符串，this.addWatchFile 显式声明依赖。这里叫 .note.md 是为了识别格式，页面按纯文本渲染，**不是 Markdown→HTML 编译器**。

尝试在文本中加入反引号、双引号和 `</script>`。字符串仍应正常展示，因为代码生成使用 JSON.stringify，页面使用 textContent。

## 实验 C：源码转换与 source map

打开 `src/message.lesson.ts`，它导出 `__LESSON_WORD__`。lessonMacro 只处理 `.lesson.ts` 文件，通过 MagicString 改写占位符并生成映射。

页面显示替换后的中文；Network 的响应中占位符消失。build 开启 source map，可在调试器中追溯源文件。

这是有意收窄的词法宏：正则不理解注释、字符串和变量绑定。不要把它扩大成任意 JS 重写；需要语法语义时应使用 AST。

## 实验 D：开发服务器不等于生产 API

点击“请求开发中间件”，或访问 /__study，能看到 configureServer 的 JSON。

build + preview 后，页面会明确显示该接口只属于 dev。configureServer 本身不会被打包成后端服务；真实 API 的实现看 09。

检查 Elements 的 head 与构建的 dist/index.html，会看到 study-plugin meta：HTML Hook 同时参与 dev 与 build。

## 实验 E：构建报告

```bash
pnpm --filter @vite-study/07-plugin-lab build
```

打开 dist/study-report.json：它含本地源码清单与 chunk 的入口/动态导入信息。generateBundle 可以读产物并通过 emitFile 新增资产；开发时按需模块请求没有这个完整产物阶段。

再看 08 的两个报告。bundleReport 用 `Map<Environment, Set<id>>` 存状态，避免环境之间混合。buildStart 清理的是当前环境的数据，不是无条件清空整个 Map。

## Hook 不是统一的 reduce

- resolveId / load 通常由首个有效结果接管对应工作。
- transform 可以形成连续转换链；返回 null 表示本插件不改动。
- configureServer、configResolved 是全局操作，不在其中假定存在当前 this.environment。
- 模块 Hook 有环境上下文；插件顺序还受 enforce、Hook 自己的 order、Vite 内部插件排序影响。
- trace 日志不是承诺完整的严格调用顺序：缓存、依赖优化和不同请求会改变观测。

## 自己完成的小任务

1. 给 virtualBuildInfo 新增一个公开的固定 lesson 名称，并更新声明类型。
2. 新增 `.upper.txt` loader，让它默认导出大写文本；观察非目标文件返回 null 的必要性。
3. 为构建报告加每个 chunk 的字符长度；不要用 JS 字符长度冒充压缩后的网络字节数。
4. 把 virtual 插件的环境值用在 08 两个入口的 Console，确认不是按照进程区分。

## 继续学习

[课程目录](../../README.md) · [上一节：生产构建与部署](../06-build-deploy/README.md) · [下一节：多环境 SSR](../08-environments-ssr/README.md)
