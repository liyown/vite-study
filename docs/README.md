# 参考资料

主线教程在 [文章](../articles/vite-tutorial.md)，运行实验从 [课程目录](../README.md)进入。本目录保存需要单独查阅或复验的资料。

| 文档 | 用途 | 何时阅读 |
| --- | --- | --- |
| [Hook 生命周期箭头流程](plugin-lifecycle.md) | 配置、dev、HMR、构建与关闭的输入输出链 | 完成 07，继续追调度 |
| [全量 Hook 与上下文参考](plugin-hooks-reference.md) | 固定版本类型、源码位置与返回约定 | 查具体接口，不必从头通读 |
| [依赖源码阅读](dependency-sources.md) | 区分声明、发布 JS 与原始仓库 | 编辑器只跳到 .d.ts 时 |
| [验证记录](verification.md) | 命令、证据范围、浏览器观察与未覆盖项 | 复现结论或准备发布 |

`plugin-hooks.inventory.json` 由 `pnpm docs:hooks` 核对，反映安装版本的接口清单。`plugin-hooks.trace.json` 由 `pnpm docs:hooks:trace` 重建，记录六条实际调度路径；它不是任意项目通用的严格调用顺序。

框架源码对照位于 [11/SOURCES.md](../examples/11-mini-start/SOURCES.md)，完整三角色流程位于 [11/FLOW.md](../examples/11-mini-start/FLOW.md)。附录不依赖曾经的聊天上下文。
