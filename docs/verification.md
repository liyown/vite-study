# 验证记录与边界

验证日期：2026-10-17。Node 24.22.0 / pnpm 10.24.0，依赖固定于 pnpm-lock.yaml：Vite 8.3.4、Rolldown 1.2.14、React 19.3.1、plugin-react 6.1.2。

## 复验命令

```bash
pnpm install --frozen-lockfile
pnpm check
```

check 执行独立类型检查、11 节构建、22 项行为验证、教材本地链接与生成产物链接检查，以及 37 项 Hook/选择回调和 9 项控制属性覆盖核对。Rust 附录、浏览器交互和公开站点 SEO 检查不由这条命令涵盖。

## 自动检查覆盖

| 测试入口 | 项数 | 检查的行为 |
| --- | --- | --- |
| `scripts/verify.test.mjs` | 14 | 动态分包与未使用导出；alias 继承与覆盖的失败/通过对照、raw/CSS/glob/Worker 产物与 public；多页面/base/资源可达/库导出；React 注入对照；mode 与变量公开边界；多环境报告、builder、dev/prod SSR；API 与代理；插件报告 |
| `examples/10-tiny-rpc/scripts/rpc.test.mjs` | 2 | dev/prod 真实 HTTP 调用、ID 查找、失败响应；客户端只含代理，服务器有动态实现 chunk |
| `examples/11-mini-start/scripts/*.test.mjs` | 6 | AST 三角色、绑定识别、稳定 ID、导出保留、依赖清理、dev/prod SSR/RPC、输入与同源限制、修改 provider 更新、客户端 JS/map 无私有实现 |

类型检查对源码运行，Vite build 不代替类型检查。06 同时构建多页面网站与 ES 模块库；08、10、11 同时构建 client 与 server 产物。

另外，将教材复制到全新临时目录，排除 node_modules、dist、output 和可选 `.sources` 后，使用本机包缓存执行 `pnpm install --offline --frozen-lockfile` 与 `pnpm check`，均通过。它验证教材不依赖当前目录的旧产物或源码缓存；首次联网下载在其他平台上的可用性仍取决于包源和相应原生依赖。

`pnpm docs:check` 只检查源教材链接；加 `--built` 后检查产物入口。根 check 使用后者。`pnpm docs:hooks` 从实际安装类型提取接口核对清单；`pnpm docs:hooks:trace` 可另行运行六条实际调度路径，重建 trace 文件。37 项完整覆盖是接口与正文覆盖，不表示每个 Hook 的每个分支都跑过。

## 浏览器观察

| 日期 | 实验与操作 | 观察 |
| --- | --- | --- |
| 2026-10-17 | 02：打开页面，点击 modules.txt 和 Worker 按钮 | 显示 raw/alias 文本与文章内容；Worker 返回 5050 |
| 2026-10-17 | 06：预览 `/study/`，点击按需加载，再进入管理页 | 动态模块显示；第二份 HTML 正确加载，链接保持 `/study/` 前缀 |
| 2026-10-16 | React 对照（现 03/04）：计数到 3 后修改组件标题 | 裸配置归零；Refresh 配置保持 3 |
| 2026-10-16 | SSR（现 08）：页面源 HTML、水合后点击 | HTML 已含正文，按钮响应，无水合错误 |
| 2026-10-16 | API（现 09）：新增笔记，再刷新 | Network 有真实请求，新增数据从 API 返回；重启后内存清空 |
| 2026-10-16 | 07：计数到 3 后修改文本文件，包含引号等字符 | 文本更新，计数保留，自定义事件显示文件名 |
| 2026-10-16 | 框架编译（现 11）：水合后三种函数按钮 | 双端本地函数显示 browser；RPC 返回服务器结果；serverOnly 浏览器调用抛错 |

旧日期记录的是整理编号之前的同一实现；自动检查已按新目录重新执行。实验修改已恢复。浏览器观察的范围就是表中列出的操作，不推断所有浏览器、所有 HMR 编辑都表现相同。

## 原始来源与局限

TanStack 对照固定提交为 `7a0672503857283614799a0b480f4a82110e5ab6`，来源、哈希与教学差异见 [源码对照](../examples/11-mini-start/SOURCES.md)。源码下载是可选项，不是课程运行前提。

最小 RPC 固定一个模块和 ID；框架编译只实现约定语法、POST/JSON 和单页路由。它们用于学习模块处理与调用链，不具备正式框架全部协议、访问控制与部署适配。

source map 检查曾检出原始 handler 被带入客户端 sourcesContent，11 采用指向安全转换结果的映射并持续验证。另行运行 `pnpm --filter @vite-study/11-mini-start compare:maps`，在临时副本中比较 `{ mappings: '' }` 与当前映射：前者的客户端 sourcesContent 含 createHmac，后者不含。这个结果限定于锁定版本与本例转换链。当前策略有调试精度取舍，不应误认为原始位置映射完整。

Cloudflare 与正式 TanStack Start 的集成仅按官方资料解释，未进行云端登录、运行时或部署验证。文章也不包含生产站点流量、关键词搜索量或排名结果。
