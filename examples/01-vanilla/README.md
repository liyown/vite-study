# 01 · 入口、模块图与构建

本节只回答：**Vite 到底从哪里开始？开发时的模块与构建后的文件是什么关系？**

## 运行与阅读顺序

根目录执行 `pnpm dev 01`，打开 http://127.0.0.1:5171 。依次读：

1. `index.html`：`<script type="module" src="/src/main.ts">` 是入口线索。
2. `src/main.ts`：静态导入 `utils.ts` 和 CSS，按钮事件中动态导入 `editor.ts`。
3. `src/utils.ts`：被使用的 format 与没有被使用的 unused。
4. `vite.config.ts`：本节只打开 manifest，Vite 本身不需要业务插件就能处理 TS/CSS。

依赖关系：`HTML → main.ts → utils.ts / style.css`；点击按钮后才执行 `main.ts → import(editor.ts)`。

## 实验 A：开发服务器

打开 DevTools → Network，关闭缓存并刷新，过滤 JS。点击“加载编辑器”。

预期：初次访问请求 main、utils 等模块；点击后出现 editor 请求与控制台日志。开发模式没有先把整个应用打成一个 bundle。依赖预构建是另一个环节，并不意味着业务源码也被整体打包。

查看 main.ts 请求的 Response：TypeScript 类型已去掉，import 路径可能被重写；浏览器执行的是 HTTP 返回的 JS。

## 实验 B：生产产物

```bash
pnpm --filter @vite-study/01-vanilla build
pnpm --filter @vite-study/01-vanilla preview
```

打开 http://127.0.0.1:4171 ，查看 `dist/assets` 和 `dist/.vite/manifest.json`。

预期：HTML 引用带 hash 的入口 JS；editor 是动态入口 chunk；utils 不必对应一个独立文件；CSS 被提取为资产。文件名和 hash 由构建决定。

`unused()` 的 `UNUSED_TREE_SHAKING_MARKER` 不应出现在产物 JS 中。模块没有被使用的导出可以被消除，但具有副作用的语句不能简单认定会消失。

## 实验 C：自己改变依赖边界

把 main.ts 的动态导入移到文件顶部，使用 `import { open } from './editor'`，按钮中调用 open。重新 build。

预期：editor 不再有独立异步加载边界，可能合入入口 chunk。恢复动态导入再构建，比较 manifest 的 dynamicImports。

接着给 utils.ts 加一条顶层 console.log。即使 unused 不被调用，这条副作用仍可能保留。**Tree shaking 消除的是可证明不用的代码，不是所有不直接调用的文件。**

## 自测

- 一个源码文件是否一定对应一个生产 JS 文件？为什么？
- 为什么开发时能请求 `/src/main.ts`，生产部署却只需要 dist？
- 为什么 Vite build 成功不能证明 TypeScript 类型没有错？尝试给 format 传一个数字，再分别运行 build 和根目录 `pnpm typecheck`，最后恢复。

## 继续学习

[课程目录](../../README.md) · [下一节：配置与资源](../02-project-basics/README.md)
