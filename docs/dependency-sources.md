# 阅读依赖的实现与原始源码

编辑器点击 `react()` 时常先打开 `.d.ts`，因为“转到定义”主要定位类型声明。理解执行逻辑，需要继续查看发布的 JavaScript，或与该版本对应的源码仓库。

## 先确认运行版本

根目录执行 `pnpm --filter @vite-study/04-react-refresh list @vitejs/plugin-react`。本仓库锁定 6.1.2；安装后可查看 `examples/04-react-refresh/node_modules/@vitejs/plugin-react/dist/index.js`。

原始入口的固定版本：[plugin-react 源码](https://github.com/vitejs/vite-plugin-react/blob/ac47648e17674299accb51816e9e33b8a7b07b05/packages/plugin-react/src/index.ts)。先读工厂返回的插件，再按注册、转换和 Refresh 运行时追踪。

需要在本地阅读时，从仓库根目录执行：

```bash
mkdir -p .sources
git clone --depth 1 --single-branch --branch plugin-react@6.1.2 \
  https://github.com/vitejs/vite-plugin-react.git .sources/vite-plugin-react
```

目录已存在时直接打开，不要覆盖。源码下载是可选操作，不替换 node_modules，也不参与实验构建。应核对对应提交是否为 `ac47648e17674299accb51816e9e33b8a7b07b05`。

## 为什么与 Maven 的源码附件不同

npm/pnpm 安装的是包作者发布的文件，没有统一等同于 sources.jar 的原始源码附件约定。可用以下命令查看来源信息：

```bash
npm view @vitejs/plugin-react@6.1.2 repository gitHead
```

不是每个包都有 gitHead，仓库 tag 也不总是 `v版本号`。下载了源码仓库，不代表编辑器自动建立它与声明文件的映射。

VS Code 的 Go to Source Definition 可以尝试打开 JS；如果作者发布 `.d.ts.map` 并提供其指向的 TS 源文件，声明映射还能帮助跳到原始实现。具体效果取决于包的发布内容与编辑器能力。

TanStack 参考快照可按 [11 的来源说明](../examples/11-mini-start/SOURCES.md)下载并校验哈希。文章与实验已经包含教学实现，额外源码仅供对照。

参考：[npm files](https://docs.npmjs.com/cli/v11/configuring-npm/package-json/#files)、[TypeScript declarationMap](https://www.typescriptlang.org/tsconfig/declarationMap.html)。
