# 02 · 配置、TypeScript、CSS 与资源

目标：能判断一个 import 得到的是代码、文本、CSS 类名还是资源 URL，并分别配置 Vite 解析和 TypeScript 检查。

## 运行与阅读

根目录 `pnpm dev 02`，打开 http://127.0.0.1:5172 。先读 `vite.config.ts → tsconfig.json → src/main.ts`，再沿 import 读资源。

```text
HTML → main.ts
         ├─ @/message → resolve.alias → src/message.ts
         ├─ style.css → 页面样式
         ├─ card.module.css → 局部类名映射
         ├─ mark.svg → 可访问 URL
         ├─ note.txt?raw → 字符串
         ├─ import.meta.glob → 一组动态加载函数
         └─ new Worker(new URL(...)) → Worker 执行上下文
```

## 实验 A：配置与类型是两套职责

临时删除 Vite 的 alias，观察 import 解析失败，随后恢复。再把本节 `tsconfig.json` 中的 `compilerOptions.paths` 临时覆盖为 `{}`，执行根目录命令：

```bash
pnpm exec tsc --noEmit -p examples/02-project-basics/tsconfig.json
```

预期出现 `TS2307: Cannot find module '@/message'`。实验后恢复原来的 paths 并重跑，应该通过。不能只删除子配置的 paths：本节继承的根 tsconfig 也提供了映射，删除后会继承回来；空对象才会遮蔽它。

根目录 tsconfig 也配置了本课的 paths，因为根 `pnpm typecheck` 不会自动合并每个子项目的 tsconfig。这里使用显式 alias 便于观察；Vite 8 也提供可选的 `resolve.tsconfigPaths`。

## 实验 B：资源导入与 public

打开 Network：SVG 是 URL，raw 文本进入模块，public 文件可独立访问。修改 CSS 后页面样式更新；CSS Module 的 `.card` 会生成局部类名。

```bash
pnpm --filter @vite-study/02-project-basics build
pnpm --filter @vite-study/02-project-basics preview
```

打开 :4172。查看 dist：SVG 输出带 hash 的文件，因为本课关闭小资源内联；handbook.txt 保留原名；CSS 提取到 assets。默认配置可能把小资源内联为 data URL，不能据本课推断所有图片都输出文件。

## 实验 C：glob 与 Worker

点击文章按钮才调用对应加载函数；查看生产的独立文章 chunk。添加一个 `.txt` 后，glob 的匹配集合随构建/开发处理更新。

点击计算按钮应得到 5050。Worker 没有 document，通过 postMessage 与页面通信，生产 URL 自动指向生成的 Worker 文件。它与本教程后面的 SSR Environment 是不同层面的概念。

## 自测

- 为什么 public 文件不应该写成 `/public/handbook.txt`？
- `?raw` 和默认图片导入的结果有何不同？
- glob 为什么要求确定的字面量模式？
- 为什么 Vite build 通过后仍要单独检查类型？

## 继续学习

[课程目录](../../README.md) · [上一节：入口与模块图](../01-vanilla/README.md) · [下一节：React 裸配置](../03-react-bare/README.md)
