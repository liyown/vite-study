# 04 · 加入 @vitejs/plugin-react

本节与 03 的 `src` 相同，核心配置变化是：

```ts
import react from '@vitejs/plugin-react';
export default defineConfig({ plugins: [react()] });
```

根目录 `pnpm dev 04`，打开 http://127.0.0.1:5174 。可同时开启 03，在两个页面做相同操作。

## 实验 A：只改变组件标题

1. 点击计数器到 3。
2. 修改本节 Counter.tsx 的标题文字并保存。
3. 等待自动更新，不手动刷新。

预期：标题改变，计数仍为 3。React 插件为合适的组件模块加入 Refresh 注册、更新边界和开发运行时代码，React 在条件允许时保留状态。

## 实验 B：看实际注入

在 Network 中查看 Counter.tsx 响应，搜索 `$RefreshReg$`、`registerExportsForReactRefresh` 或 Refresh 相关代码；HTML 中也有初始化 preamble，Network 可见 `/@react-refresh`。

再运行根目录 `pnpm compare:react`。你将看到：两边都转换了 JSX，只有 04 的 `hasRefreshInstrumentation` 为 true。

## 实验 C：找到保留状态的边界

先只修改标题，再尝试改变 Hook 顺序或给组件添加 `// @refresh reset` 注释（实验后恢复）。某些改动会使状态重置。修改页面入口或破坏可接受的导出边界也可能回退到更大范围更新。

因此 **Fast Refresh 不是任意编辑都保留状态**。建议组件模块主要导出 React 组件，工具函数放到单独模块。

## 实验 D：生产并不运行 Refresh

分别构建 03 和 04，比较 dist。当前这两个最小示例可生成相同的生产 JS：开发时的差别不必变成生产包差别。不要把“使用 React 插件”理解成“必然启用 React Compiler”或“必然所有源码经 Babel 转换”。

本仓库固定 plugin-react 6.1.2。旧教程常介绍它的 Babel 转换链，不能直接作为当前版本实现的结论；需要看所用版本的插件源码与选项。

## 自测

- `plugins: [react()]` 加入的是 React 本体还是 Vite 扩展对象？
- 是 Vite 通用 HMR 还是 React Refresh 理解组件状态？
- 为什么生产包相同，开发体验却不同？


来源：[React 插件说明](https://github.com/vitejs/vite-plugin-react/tree/main/packages/plugin-react)。

## 继续学习

[课程目录](../../README.md) · [上一节：React 裸配置](../03-react-bare/README.md) · [下一节：mode 与 env](../05-modes/README.md)
