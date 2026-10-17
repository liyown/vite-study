# 03 · 不加 React 插件，TSX 还能跑吗？

结论通过实验得出：**能跑；源码转译与 React Fast Refresh 是两件事。**

## 运行

根目录 `pnpm dev 03`，打开 http://127.0.0.1:5173 。

先读 `vite.config.ts`：没有 plugins。再读 `src/main.tsx → Counter.tsx`。项目安装了 react / react-dom，并继承根 tsconfig 的 `jsx: "react-jsx"`，使用自动 JSX runtime。

Vite 8 内置 Oxc 的 TS/JSX 转换。React 运行时负责渲染；没有插件不意味着浏览器能直接执行 TSX。

## 实验 A：确认页面不是假象

点击计数器到 3；在 Network 打开 `/src/Counter.tsx` 的 Response。

预期：能看到转换后的 JSX 函数调用，未保留原始 `<section>` JSX；没有 React Refresh 的组件注册与边界代码。

根目录运行 `pnpm compare:react`，可直接对照两份实际转换结果：03 的 `jsxWasTransformed` 为 true，`hasRefreshInstrumentation` 为 false。

## 实验 B：更新组件

保持页面打开，只修改 Counter.tsx 中 `<h2>计数器实验</h2>` 的文字并保存。

预期：本示例没有 React Refresh 接受边界，更新会向上冒泡并触发页面重新加载，计数归零。不要自己手动刷新，也不要修改 main.tsx：我们要隔离组件编辑的差异。

修改 CSS 仍能热更新。CSS HMR 由 Vite 提供，不能由此推出 React 组件也具备 Fast Refresh。

## 实验 C：生产构建

```bash
pnpm --filter @vite-study/03-react-bare build
pnpm --filter @vite-study/03-react-bare preview
```

打开 :4173，计数器可以工作。生产 JSX 和 React 渲染并不依赖开发期 Refresh 注入。

本课配置刻意简化，只演示正常 React TSX 代码；这不能推导出所有框架、所有编译扩展都不需要插件。

## 自测

- 是谁把 JSX 转为 JS？谁把组件渲染成 DOM？
- 为什么 CSS 更新保留计数，但组件编辑丢失计数？
- 如果页面会自动刷新，是否就代表有 Fast Refresh？

## 继续学习

[课程目录](../../README.md) · [上一节：配置与资源](../02-project-basics/README.md) · [下一节：React Fast Refresh](../04-react-refresh/README.md)
