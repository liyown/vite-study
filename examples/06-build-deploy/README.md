# 06 · 生产构建、分包、库与部署

目标：能从 manifest 找到入口与动态依赖，在子路径正确加载资源，并区分网站构建和库构建。

## 运行与阅读

根目录 `pnpm dev 06`，打开 http://127.0.0.1:5176/study/ 。读 `vite.config.ts → index.html / admin/index.html → src/main.ts / admin.ts → shared.ts / lazy.ts`。

```text
index.html → main.ts ──┐
                       ├─ shared.ts → 可共享的代码
admin/index.html → admin.ts ┘
main.ts → import(lazy.ts) → 动态加载边界
```

## 实验 A：看构建结果而不是猜文件名

```bash
pnpm --filter @vite-study/06-build-deploy build
pnpm --filter @vite-study/06-build-deploy preview
# http://127.0.0.1:4176/study/
```

构建生成 `dist/index.html`、`dist/admin/index.html`、`dist/assets/` 和 `dist/.vite/manifest.json`。查看两个入口的 imports，以及首页的 dynamicImports。静态依赖可能合并或提取为共享 chunk；不要依赖某个源码固定对应一个文件。

点击管理页，再回首页点击按需加载。在 Network 中核对 URL 均使用 `/study/`。代码中的动态 import 会被重写，普通业务字符串拼出来的 URL 不保证自动重写。

## 实验 B：部署路径与缓存

生产服务器需要把 `/study/` 映射到本课 dist，路径与 base 对齐。直接把文件放在根路径并不能代替这个映射。使用本地 preview 观察产物，它只适合检查，不承担生产服务职责。

本课是真实多页面，`/study/admin/` 对应第二份 HTML。SPA 的任意客户端路由则需要服务器回退到入口 HTML；不能把不存在的 JS 和 API 也统一返回 HTML。

部署时让 HTML 与其引用的 hash 资源来自同一次构建。HTML 通常需要重新验证缓存；带内容 hash 的资源可以使用长期缓存。保留旧资源直到旧页面不再引用，能降低发布期间动态加载失败的风险。

## 实验 C：库构建

build 脚本还运行独立的 `vite.lib.config.ts`：`src/math.ts → dist/lib/math.js`。运行：

```bash
node --input-type=module -e "import('./examples/06-build-deploy/dist/lib/math.js').then(m => console.log(m.add(2, 3)))"
```

应得到 5。库入口是供消费者 import 的导出，不以 HTML 为根。本课没有生成类型声明；发布 TypeScript 库还应配置声明生成、package exports、外部依赖和消费测试。第三方大依赖是否 external 由库的分发约定决定。

## 自测

- `base`、开发代理与服务器实际路由分别解决什么？
- source map 的 sourcesContent 是否可能公开源码？本课 map 用于学习，发布时需明确策略。
- 降低 build.target 为什么不等于补齐缺失的浏览器 API？
- 为什么随手提取“vendor 大包”可能扩大首屏下载，而不是让页面更快？

## 继续学习

[课程目录](../../README.md) · [上一节：mode 与 env](../05-modes/README.md) · [下一节：插件与 Hook](../07-plugin-lab/README.md)
