# Vite 渐进教程与实验

在线阅读：[博客正式版](https://liuyaowen.cn/posts/web-typescript/vite-tutorial)。仓库对应教材版本为 [v1.0.0](https://github.com/liyown/vite-study/tree/v1.0.0)。

配套文章：[Vite 教程：从项目配置、构建原理到插件与全栈框架集成](articles/vite-tutorial.md)。先掌握日常开发与生产构建，再学习插件、多环境和框架接入。每节均有独立入口、中文实验说明和可运行源码。

## 开始

安装 Node 24.22.0（见 `.node-version`）和 pnpm 10.24.0，在仓库根目录执行：

```bash
pnpm install --frozen-lockfile
pnpm dev 01
# http://127.0.0.1:5171
```

按编号切换，如 `pnpm dev 02`。一次专注一节，Ctrl+C 停止。全部主线实验在本地运行，不需要云账号；JS/Rust 附录另需 Rust 工具链。

锁文件基线：Vite 8.3.4、React 19.3.1、@vitejs/plugin-react 6.1.2。Vite 使用 Oxc / Rolldown；版本相关结论以锁文件与 [验证记录](docs/verification.md) 为准。

## 课程顺序

先读每节的运行与源码路线，只改变一个条件，观察结果，恢复后再做下一节。03 与 04 的源码相同，用于隔离 React 插件的影响。

| 课 | 实验 | 开发地址 | 要验证的结果 |
| --- | --- | --- | --- |
| 01 | [入口、模块图与构建](examples/01-vanilla/README.md) | :5171 | 开发模块请求、动态 import、tree shaking |
| 02 | [配置、TypeScript、CSS 与资源](examples/02-project-basics/README.md) | :5172 | alias、CSS Module、raw/public、glob、Worker |
| 03 | [React 裸配置](examples/03-react-bare/README.md) | :5173 | TSX 可以转译，组件更新没有 Refresh 边界 |
| 04 | [React Fast Refresh](examples/04-react-refresh/README.md) | :5174 | 组件注册、更新边界与状态保留 |
| 05 | [mode 与 env](examples/05-modes/README.md) | :5175 | 配置选择、字符串变量与公开边界 |
| 06 | [生产构建、库与部署](examples/06-build-deploy/README.md) | :5176/study/ | 多页面、共享/动态 chunk、base、manifest、库 |
| 07 | [插件与核心 Hook](examples/07-plugin-lab/README.md) | :5177 | resolve/load/transform、虚拟模块、HMR、产物报告 |
| 08 | [多 Environment 与 SSR](examples/08-environments-ssr/README.md) | :5178 | 两张模块图、SSR、水合、开发 runner 与生产入口 |
| 09 | [React + Node API](examples/09-fullstack-api/README.md) | :5179 | 开发代理、真实 HTTP、生产同源托管 |
| 10 | [最小 RPC](examples/10-tiny-rpc/README.md) | :5180 | 一个短插件生成代理与注册表，按 ID 执行函数 |
| 11 | [参考 Start 的框架式编译](examples/11-mini-start/README.md) | :5181 | AST、双端函数、caller/provider、动态分包 |

11 是参考固定 TanStack 源码提交实现的教学子集，包含 [来源与差异](examples/11-mini-start/SOURCES.md)。它与 10 都不作为生产框架分发；正式框架和运行时集成的职责见文章第 12 节。

## 构建与验证

以下命令均在根目录执行：

```bash
pnpm typecheck       # 独立类型检查，Vite build 不代替它
pnpm build           # 构建全部 11 节，含各自的多环境/库输出
pnpm verify          # 检查已有产物，并测试开发/生产服务
pnpm docs:check      # 文档链接、课程编号、包名与启动端口
pnpm docs:hooks      # 对照实际安装类型，检查 Hook 覆盖
pnpm check           # 依次执行以上必要检查
pnpm compare:react   # 对照 03/04 实际转换结果
pnpm --filter @vite-study/11-mini-start compare:maps # 比较客户端源码映射
```

单独构建：`pnpm --filter @vite-study/02-project-basics build`。01 至 07 可在构建后运行包内 preview，端口为 4171 至 4177（06 路径为 `/study/`）。

08 至 11 需要 Node HTTP 服务，不能只预览客户端 dist：

```bash
pnpm --filter @vite-study/08-environments-ssr build
pnpm --filter @vite-study/08-environments-ssr start   # :5178
pnpm --filter @vite-study/09-fullstack-api start     # 已 build 后，:4309
pnpm --filter @vite-study/10-tiny-rpc start          # 已 build 后，:4180
pnpm --filter @vite-study/11-mini-start start        # 已 build 后，:5181
```

同端口的 dev/start 先停止再切换。所有 Node 示例仅监听本机；09 使用内存数据，重启会重置。

## 文档与目录

- [完整教程](articles/vite-tutorial.md)：建立概念并解释关键输入输出。
- [参考资料目录](docs/README.md)：Hook 箭头流程、全量接口、源码阅读与验证边界。
- [发布说明](articles/PUBLISHING.md)：文章元信息、来源、署名与站点落地事项。
- [JS ↔ Rust 附录](native/01-js-rust/README.md)：执行 `pnpm native:demo`，需要 Cargo。

`examples/` 保存课程，`packages/lab-plugins/` 是 07 的插件实现并供 08 复用，`scripts/` 维护验证工具。dist、node_modules、output 和可选 `.sources` 是生成或本地阅读目录，不是学习前置材料；不用下载可选源码也能完成全部课程。

## 排错

端口占用时先停止对应进程；strictPort 会报告占用而不是悄悄更换地址。编辑 env 后重启。生产提示入口缺失时先 build；出现 JS 请求返回 HTML 时检查 base、服务器挂载与 fallback。类型和构建结果不一致时，分别核对 tsconfig 与 Vite 的解析配置。

所有实验均应恢复到初始状态后执行 `pnpm check`。自动测试、浏览器实测和未验证的云端集成分别记录在验证说明中。
