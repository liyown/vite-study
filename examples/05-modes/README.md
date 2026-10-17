# 05 · mode、NODE_ENV 与 Environment

本节仍然只有浏览器应用。所谓 development / staging / production 先理解成 **配置选择**；第 08 节的 client / ssr 才是不同模块运行目标。

根目录运行 `pnpm dev 05`，打开 http://127.0.0.1:5175 。先读 `vite.config.ts → .env / .env.staging → src/main.ts`。

## 默认行为对照

以下命令都在仓库根目录运行，默认不在 shell 中预设 NODE_ENV。

| 命令 | MODE | DEV | PROD | label |
| --- | --- | --- | --- | --- |
| `pnpm dev 05` | development | true | false | development |
| `pnpm --filter @vite-study/05-modes dev:staging` | staging | true | false | staging |
| `pnpm --filter @vite-study/05-modes build:staging` | staging | false | true | staging |
| `pnpm --filter @vite-study/05-modes build:development` | development | false | true | development |

build 后执行 `pnpm --filter @vite-study/05-modes preview`，打开 :4175。这里的 preview 不重新构建，也不重新选择产物中的变量。

`MODE` 来自 mode；`DEV / PROD` 反映 NODE_ENV。Vite dev 默认 NODE_ENV=development，build 默认 production；显式 NODE_ENV 会改变结果，所以 `--mode development` 本身不会让 build 变成开发运行时。多个 Vite JS API 调用在同一 Node 进程中也要注意 process.env 的影响。

## 实验 A：覆盖优先级

依次读 `.env`、`.env.staging` 和 `vite.config.ts`。`.env` 被所有 mode 加载，mode 文件覆盖通用文件，shell 中已有的变量优先级更高；本地覆盖可使用 .env.local / .env.[mode].local，它们不提交版本库。

```bash
VITE_LABEL=from-shell pnpm --filter @vite-study/05-modes dev:staging
```

预期：label 显示 from-shell。停止服务并去掉该前缀再启动即可恢复。编辑 .env 后要重启。

## 实验 B：字符串与暴露

`.env.staging` 中 `VITE_FEATURE=true`，页面同时显示 `featureRaw` 与 `featureEnabled`。前者是字符串，后者来自显式比较；`Boolean('false')` 依然是 true。

`.env` 的 SERVER_SECRET 是教学假数据。浏览器端不能得到它的值，页面显示“未暴露给浏览器”。**VITE_ 表示允许公开，不能把真实密钥改成 VITE_ 前缀。**

配置中使用 loadEnv，只读取 VITE_，且只把 mode 通过 define 暴露。不要把 loadEnv 的全部返回值或 process.env 整体塞进客户端 define。

## 实验 C：配置执行时机

看终端 `[config]` 日志。配置阶段需要显式 loadEnv 读取 .env；此时的 command 是 serve 或 build，和 mode 分开。配置路径基于 import.meta.url，所以从根目录通过 JS API 调用也不会误读根目录 .env。

## 自测

- staging mode 是否会自动多出一个 staging Environment？不会；还需要显式配置。
- 为什么 `build --mode staging` 的 PROD 可以是 true？
- 为什么部署后更改服务器 .env 不能改变已经构建好的前端 JS？


来源：[Vite 模式与变量](https://vite.dev/guide/env-and-mode)。

## 继续学习

[课程目录](../../README.md) · [上一节：React Fast Refresh](../04-react-refresh/README.md) · [下一节：生产构建与部署](../06-build-deploy/README.md)
