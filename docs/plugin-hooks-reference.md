# Vite Plugin Hook 附录：类型、返回值与源码证据

这一份用于查阅准确签名。连续阅读从 [箭头流程正文](plugin-lifecycle.md) 开始。基线：Vite 8.3.4 / Rolldown 1.2.14。

## Hook 详细索引

| 阅读阶段 | Hook |
| --- | --- |
| 配置与环境选择 | [config](#hook-config)、[configEnvironment](#hook-configEnvironment)、[configResolved](#hook-configResolved)、[applyToEnvironment](#hook-applyToEnvironment) |
| 应用编排与管线初始化 | [buildApp](#hook-buildApp)、[options](#hook-options)、[outputOptions](#hook-outputOptions)、[buildStart](#hook-buildStart) |
| 开发/预览服务器安装 | [configureServer](#hook-configureServer)、[configurePreviewServer](#hook-configurePreviewServer) |
| 模块处理 | [resolveId](#hook-resolveId)、[resolveDynamicImport](#hook-resolveDynamicImport)、[load](#hook-load)、[transform](#hook-transform)、[moduleParsed](#hook-moduleParsed) |
| 输出渲染 | [renderStart](#hook-renderStart)、[resolveFileUrl](#hook-resolveFileUrl)、[banner](#hook-banner)、[intro](#hook-intro)、[outro](#hook-outro)、[footer](#hook-footer)、[renderChunk](#hook-renderChunk)、[augmentChunkHash](#hook-augmentChunkHash) |
| 产物与 HTML | [generateBundle](#hook-generateBundle)、[transformIndexHtml](#hook-transformIndexHtml)、[writeBundle](#hook-writeBundle) |
| 诊断与阶段结束 | [renderError](#hook-renderError)、[onLog](#hook-onLog)、[buildEnd](#hook-buildEnd) |
| 变化与 HMR | [watchChange](#hook-watchChange)、[hotUpdate](#hook-hotUpdate)、[handleHotUpdate](#hook-handleHotUpdate) |
| 关闭与清理 | [closeBundle](#hook-closeBundle)、[closeWatcher](#hook-closeWatcher)、[closeServer](#hook-closeServer)、[closePreviewServer](#hook-closePreviewServer) |
| 兼容占位 | [shouldTransformCachedModule](#hook-shouldTransformCachedModule) |

下面沿阅读阶段排列，共 37 项。声明中的 `DEFINED_HOOK_NAMES.xxx` 就是实际对象键 xxx；未展开的类型别名可在清单或原始声明中继续跳转。

<a id="hook-config"></a>
### config：调整 Vite 用户配置

**输入：** 尚未完全解析的 `UserConfig` 和 `ConfigEnv`，后者包含 command、mode，以及 isSsrBuild/isPreview 等状态。它不是 Rolldown InputOptions。

**返回：** 部分 Vite 配置、null、void 或对应 Promise；也可以直接修改传入配置。返回对象按 Vite 配置规则合并，数组等细节由合并规则决定。

**下游：** 合并结果成为后续 config Hook 与配置解析的输入，最终产生 ResolvedConfig。插件集合此前已解析；返回类型排除了 plugins，不能在这里追加插件并期待新插件参加当前解析。

**场景：** 给框架添加 alias、define 或默认构建选项。一轮配置解析按 Hook 顺序执行。配置变更重启可能重新解析，不等于进程终生只一次。配置上下文不是完整 PluginContext。

```ts
config(config, env) {
  return { define: { __BUILD_KIND__: JSON.stringify(env.command) } }
}
```

**证据：** [Plugin.config 声明](../node_modules/.pnpm/vite@8.3.4_@types+node@24.19.2/node_modules/vite/dist/node/index.d.ts)（第 2226 行）；[Vite 运行时](../node_modules/vite/dist/node/chunks/node.js)（第 38151 行，搜索 `async function runConfigHook`）。

<details>
<summary>锁定版本类型声明</summary>

```ts
config?: ObjectHook<(this: ConfigPluginContext, config: UserConfig, env: ConfigEnv) => Omit<UserConfig, "plugins"> | null | void | Promise<Omit<UserConfig, "plugins"> | null | void>>;
```

</details>

<a id="hook-configEnvironment"></a>
### configEnvironment：调整某个环境的配置

**输入：** 环境名（如 client/ssr）、当前 EnvironmentOptions、ConfigEnv；另有兼容用 isSsrTargetWebworker 标志。此时用 name 判环境，不依赖 this.environment。

**返回：** EnvironmentOptions 部分配置、null、void 或 Promise；允许修改传入环境配置。

**下游：** 合并到对应环境，供环境默认值解析与创建使用。它处理解析设置、define、build 等环境配置，不处理某个模块代码。

**场景：** 同一个插件给浏览器和服务端设置不同的 resolve 条件或 define。本版 runConfigEnvironmentHook 逐插件、逐环境处理；不要从“一应用一次”推导此 Hook 的次数。

**证据：** [Plugin.configEnvironment 声明](../node_modules/.pnpm/vite@8.3.4_@types+node@24.19.2/node_modules/vite/dist/node/index.d.ts)（第 2237 行）；[Vite 运行时](../node_modules/vite/dist/node/chunks/node.js)（第 38170 行，搜索 `async function runConfigEnvironmentHook`）。

<details>
<summary>锁定版本类型声明</summary>

```ts
configEnvironment?: ObjectHook<(this: ConfigPluginContext, name: string, config: EnvironmentOptions, env: ConfigEnv & {
    /**
     * Whether this environment is SSR environment and `ssr.target` is set to `'webworker'`.
     * Only intended to be used for backward compatibility.
     */
    isSsrTargetWebworker?: boolean;
  }) => EnvironmentOptions | null | void | Promise<EnvironmentOptions | null | void>>;
```

</details>

<a id="hook-configResolved"></a>
### configResolved：读取最终配置

**输入：** 已解析的 ResolvedConfig，包含 root、最终插件列表和环境配置等。

**返回：** void 或 Promise<void>；返回配置对象没有“再合并一次”的含义。

**下游：** 插件通常把所需字段存入闭包，供后续 Hook 使用。不要通过修改 config 指望 Vite 重跑已经完成的解析步骤。

**场景：** 记录 root、command、build 配置，做一致性检查。当前 Vite 全局并发等待这些 Hook，不要依赖另一插件在这里先写共享对象。上下文没有 this.environment。

**证据：** [Plugin.configResolved 声明](../node_modules/.pnpm/vite@8.3.4_@types+node@24.19.2/node_modules/vite/dist/node/index.d.ts)（第 2247 行）。

<details>
<summary>锁定版本类型声明</summary>

```ts
configResolved?: ObjectHook<(this: MinimalPluginContextWithoutEnvironment, config: ResolvedConfig) => void | Promise<void>>;
```

</details>

<a id="hook-applyToEnvironment"></a>
### applyToEnvironment：选择或生成环境插件

**输入：** PartialEnvironment，能读到 name、config 等；不是每次 transform 都调用，也不是最终模块图。

**返回：** boolean、Promise<boolean> 或 PluginOption。true 沿用当前插件；false 在此环境跳过；PluginOption 为这个环境提供具体插件，允许数组/异步组合。

**下游：** 形成该环境实际使用的插件集合。返回新的 PluginOption 时，它替代原插件在该环境的实现，不是无条件叠加在原对象上。

**场景：** 只在 client 编译某种语法，或为每个环境创建独立缓存。新返回插件中的 config/configEnvironment/configResolved/configureServer 在这里已错过全局阶段，本版会忽略并警告这些全局 Hook。应放在外层插件上。

```ts
applyToEnvironment(environment) {
  return environment.name === 'client'
}
```

**证据：** [Plugin.applyToEnvironment 声明](../node_modules/.pnpm/vite@8.3.4_@types+node@24.19.2/node_modules/vite/dist/node/index.d.ts)（第 2217 行）；[Vite 运行时](../node_modules/vite/dist/node/chunks/node.js)（第 3396 行，搜索 `async function resolveEnvironmentPlugins`）。

<details>
<summary>锁定版本类型声明</summary>

```ts
applyToEnvironment?: (environment: PartialEnvironment) => boolean | Promise<boolean> | PluginOption;
```

</details>

<a id="hook-buildApp"></a>
### buildApp：编排整个应用的环境构建

**输入：** ViteBuilder，包含 environments、build(environment)、config 等。它是整应用调度入口，不是一个模块或一个 chunk。

**返回：** Promise<void>。通过调用 builder.build(...) 产生环境构建，而不是 return 一个 bundle。

**下游：** 所选环境分别进入 options / buildStart / 模块 / 输出管线，成功后 environment.isBuilt 被标记。pre/default Hook 在配置的 builder.buildApp 前；post Hook 在其后。

**场景：** 框架先构建 client，再根据 manifest 构建 ssr。必须走整应用 builder 路径，普通单环境 build() 不等于必调此 Hook。本版默认兜底只有在所有环境都未构建时才构建全部：若自定义 Hook 已构建 client，不要以为 Vite 必定补齐 ssr。自行覆盖需要的环境，并检查 isBuilt 避免重复。

```ts
async buildApp(builder) {
  for (const name of ['client', 'ssr']) {
    const env = builder.environments[name]
    if (env && !env.isBuilt) await builder.build(env)
  }
}
```

**证据：** [Plugin.buildApp 声明](../node_modules/.pnpm/vite@8.3.4_@types+node@24.19.2/node_modules/vite/dist/node/index.d.ts)（第 2308 行）；[Vite 运行时](../node_modules/vite/dist/node/chunks/node.js)（第 35107 行，搜索 `async function createBuilder`）。

<details>
<summary>锁定版本类型声明</summary>

```ts
buildApp?: ObjectHook<BuildAppHook>;
```

</details>

<a id="hook-options"></a>
### options：处理 Rolldown 输入选项

**输入：** InputOptions，例如 input、external、plugins；这是 Vite 转换到打包器层后的选项，和顶层 UserConfig 不同。

**返回：** InputOptions、空值或 Promise。返回对象替换当前输入选项；null 等表示不替换。也允许原地修改。

**下游：** 下一 options Hook 继续处理，之后归一化选项供 buildStart 使用。要保留原配置，用展开原对象的方式返回补丁。

**场景：** 调整低层打包输入行为。只需读取最终输入选项时优先 buildStart。默认 dev 兼容容器也调用此 Hook；当前容器缓存其解析结果，不是每个 HTTP 请求重调。上下文是 MinimalPluginContext，没有完整图操作 API。

**证据：** [FunctionPluginHooks.options 声明](../node_modules/.pnpm/rolldown@1.2.14/node_modules/rolldown/dist/shared/define-config-BLptERXo.d.mts)（第 3070 行）。

<details>
<summary>锁定版本类型声明</summary>

```ts
[DEFINED_HOOK_NAMES.options]: (this: MinimalPluginContext, options: InputOptions) => NullValue | InputOptions;
```

</details>

<a id="hook-outputOptions"></a>
### outputOptions：处理输出选项

**输入：** OutputOptions，例如 format、entryFileNames、chunkFileNames、assetFileNames。

**返回：** 新 OutputOptions 或空值；同步 Hook。是替换/修改，不是 Vite 配置深度合并，不能返回 Promise。

**下游：** 后续 outputOptions Hook 与归一化过程，最终结果交给 renderStart 和生成器。

**场景：** 调整打包器输出格式与命名。只需读最终值时用 renderStart。默认 dev 不运行；每个 output 可执行。实测本版 Vite build 路径在 buildStart 之前执行它，不能把它固定画在 buildEnd 后。上下文是 MinimalPluginContext。

**证据：** [FunctionPluginHooks.outputOptions 声明](../node_modules/.pnpm/rolldown@1.2.14/node_modules/rolldown/dist/shared/define-config-BLptERXo.d.mts)（第 3085 行）。

<details>
<summary>锁定版本类型声明</summary>

```ts
[DEFINED_HOOK_NAMES.outputOptions]: (this: MinimalPluginContext, options: OutputOptions) => NullValue | OutputOptions;
```

</details>

<a id="hook-configureServer"></a>
### configureServer：搭建开发服务器

**输入：** ViteDevServer，可访问 middlewares、watcher、environments、ws、transformIndexHtml 等。

**返回：** void、后置注册函数或相应 Promise。返回函数是在 Vite 内置中间件注册后再执行的安装逻辑，不是每个请求回调。需要逐请求运行，应传函数给 server.middlewares.use。

**下游：** 中间件栈建立完成后，HTTP 请求按注册顺序经过中间件；某个中间件提前结束响应，后续不会处理此请求。

**场景：** 开发 API、调试端点、SSR 中间件。只在 dev 建立服务器时全局调用；重启可重复。挂在这里的 API 不会自动成为部署后的生产后端。清理资源优先配 closeServer。

```ts
configureServer(server) {
  server.middlewares.use('/__hello', (req, res) => {
    res.setHeader('Content-Type', 'text/plain; charset=utf-8')
    res.end('hello')
  })
}
```

**证据：** [Plugin.configureServer 声明](../node_modules/.pnpm/vite@8.3.4_@types+node@24.19.2/node_modules/vite/dist/node/index.d.ts)（第 2257 行）；[Vite 运行时](../node_modules/vite/dist/node/chunks/node.js)（第 25092 行，搜索 `const postHooks = []`）。

<details>
<summary>锁定版本类型声明</summary>

```ts
configureServer?: ObjectHook<ServerHook>;
```

</details>

<a id="hook-buildStart"></a>
### buildStart：开始一轮模块构建

**输入：** 所有 options Hook 处理后并归一化的 NormalizedInputOptions。

**返回：** void 或 Promise<void>；通知型。可以通过 this.addWatchFile、this.emitFile 等上下文 API 产生副作用，但返回字符串不是代码。

**下游：** 从入口开始解析、加载和转换模块。此时还没有最终 bundle。

**场景：** 重置本轮统计、预读配置、登记外部依赖。在 dev 它表示容器启动，不是每次源码变化重新跑全量构建；默认只有 client 执行，非 client 受 perEnvironmentStartEndDuringDev 等设置控制。多环境共享实例要分环境保存状态。

**证据：** [FunctionPluginHooks.buildStart 声明](../node_modules/.pnpm/rolldown@1.2.14/node_modules/rolldown/dist/shared/define-config-BLptERXo.d.mts)（第 3094 行）；[Vite 运行时](../node_modules/vite/dist/node/chunks/node.js)（第 8402 行，搜索 `async buildStart`）。

<details>
<summary>锁定版本类型声明</summary>

```ts
[DEFINED_HOOK_NAMES.buildStart]: (this: PluginContext, options: NormalizedInputOptions) => void;
```

</details>

<a id="hook-resolveId"></a>
### resolveId：从导入标识到模块 ID

**输入：** source、importer、options。入口的 importer 可能是 undefined；options 有 isEntry、kind、custom、兼容 ssr 等。source 可以是包名、相对路径、带 query 的标识或虚拟名字。

**返回：** 字符串模块 ID；含 id/external/meta/moduleSideEffects 等的对象；false 表示外部模块；null/undefined 表示不接管。允许 Promise。first 模式。

**下游：** 非 external 的解析 ID 进入 load，并作为缓存/模块图身份。external 模块跳过正常打包加载，最终引用如何表达由输出配置决定。相同 ID 可被多个 importer 解析到，多次 resolve 不等于多次 load。

**场景：** 虚拟模块、特殊协议、定制解析。惯例是公开导入名 virtual:xxx，内部 ID 使用 `\0virtual:xxx`。内部 ID、源码文件路径、浏览器请求 URL 三者有映射，不能简单当成同一个字符串。Vite 覆盖类型支持对象 Hook 的 id filter。

```ts
resolveId(source) {
  if (source === 'virtual:message') return '\0virtual:message'
  return null
}
```

**证据：** [FunctionPluginHooks.resolveId 声明](../node_modules/.pnpm/rolldown@1.2.14/node_modules/rolldown/dist/shared/define-config-BLptERXo.d.mts)（第 3113 行）；[Plugin.resolveId 声明](../node_modules/.pnpm/vite@8.3.4_@types+node@24.19.2/node_modules/vite/dist/node/index.d.ts)（第 2141 行）。

<details>
<summary>锁定版本类型声明</summary>

```ts
[DEFINED_HOOK_NAMES.resolveId]: (this: PluginContext, source: string, importer: string | undefined, extraOptions: ResolveIdExtraOptions) => ResolveIdResult;
```

```ts
resolveId?: ObjectHook<(this: PluginContext, source: string, importer: string | undefined, options: {
    kind?: ImportKind;
    custom?: CustomPluginOptions;
    ssr?: boolean | undefined;

    isEntry: boolean;
  }) => Promise<ResolveIdResult> | ResolveIdResult, {
    filter?: {
      id?: StringFilter<RegExp>;
    };
  }>;
```

</details>

<a id="hook-resolveDynamicImport"></a>
### resolveDynamicImport：兼容的动态导入解析

**输入：** 动态 import 的 source 和 importer。本版声明的 source 是 string，不要照抄其他版本可能出现的 AST 参数类型。

**返回：** 与 ResolveIdResult 相同，允许异步，first 模式；空值继续默认/后续解析。

**下游：** 为动态依赖确定模块身份，进入建图与分包。实测返回 null 后，虚拟动态依赖继续走 resolveId。

**场景：** 阅读或维护旧插件。本版 Rolldown 明确 deprecated，建议新插件用 resolveId，并根据 kind 区分需要的导入类型。默认 Vite 未打包 dev 不提供对应的完整构建 Hook 路径。

**证据：** [FunctionPluginHooks.resolveDynamicImport 声明](../node_modules/.pnpm/rolldown@1.2.14/node_modules/rolldown/dist/shared/define-config-BLptERXo.d.mts)（第 3123 行）。

<details>
<summary>锁定版本类型声明</summary>

```ts
[DEFINED_HOOK_NAMES.resolveDynamicImport]: (this: PluginContext, source: string, importer: string | undefined) => ResolveIdResult;
```

</details>

<a id="hook-load"></a>
### load：从模块 ID 到源码

**输入：** 已解析的 id，Vite 兼容 options?.ssr。它不是当前代码字符串；id 也不保证对应磁盘文件。

**返回：** 源码字符串；SourceDescription（code/map/meta/moduleSideEffects 等）；空值表示交给其他插件/内置加载。允许 Promise，first 模式。

**下游：** 拿到源码后仍然进入 transform 链。返回 JS 并不表示浏览器立即执行，更不表示跳过后面的内置 import 分析。

**场景：** 虚拟模块、读取特殊文件、把远端/生成内容接入模块图。本版 Vite load filter 支持 id。返回自定义内容要考虑 query 区分与依赖监听；不能依赖文件名后缀猜测所有内置请求的语义。

```ts
load(id) {
  if (id === '\0virtual:message') return `export default 'hello'`
}
```

**证据：** [FunctionPluginHooks.load 声明](../node_modules/.pnpm/rolldown@1.2.14/node_modules/rolldown/dist/shared/define-config-BLptERXo.d.mts)（第 3134 行）；[Plugin.load 声明](../node_modules/.pnpm/vite@8.3.4_@types+node@24.19.2/node_modules/vite/dist/node/index.d.ts)（第 2152 行）。

<details>
<summary>锁定版本类型声明</summary>

```ts
[DEFINED_HOOK_NAMES.load]: (this: PluginContext, id: string) => MaybePromise<LoadResult>;
```

```ts
load?: ObjectHook<(this: PluginContext, id: string, options?: {
    ssr?: boolean | undefined;
  }) => Promise<LoadResult> | LoadResult, {
    filter?: {
      id?: StringFilter;
    };
  }>;
```

</details>

<a id="hook-transform"></a>
### transform：从一个模块的源码到新源码

**输入：** code、id、Vite options（moduleType、兼容 ssr）。code 是前一层 load/transform 的输出，不一定是磁盘原文。

**返回：** 新源码字符串、含可选 code/map/meta/moduleSideEffects 等的结果对象，或空值；可仅返回元数据而不改代码；支持 Promise。Rolldown 也有其原生 MagicString 能力，使用前核对对应开关与 Vite 覆盖后的类型。

**下游：** 下一 transform 拿到改过的 code，宿主组合 sourcemap，之后解析 imports。源码新增/删除依赖可能改变模块图；这是单模块转换，还没有合并分包后的最终 chunk。

**场景：** TS/JSX/模板编译、宏替换、注入 HMR。修改代码时返回正确 map；`map:null` 不提供本次映射。Vite 覆盖的 filter 支持 id/code/moduleType。请求被缓存时可能不调；同文件因环境或 query 可调多次。用 this.environment.name/config 判断当前环境，比只看旧 ssr 布尔值更完整。

**证据：** [FunctionPluginHooks.transform 声明](../node_modules/.pnpm/rolldown@1.2.14/node_modules/rolldown/dist/shared/define-config-BLptERXo.d.mts)（第 3147 行）；[Plugin.transform 声明](../node_modules/.pnpm/vite@8.3.4_@types+node@24.19.2/node_modules/vite/dist/node/index.d.ts)（第 2159 行）。

<details>
<summary>锁定版本类型声明</summary>

```ts
[DEFINED_HOOK_NAMES.transform]: (this: TransformPluginContext, code: string, id: string, meta: BindingTransformHookExtraArgs & {
    moduleType: ModuleType;
    magicString?: RolldownMagicString;
    ast?: Program;
  }) => TransformResult;
```

```ts
transform?: ObjectHook<(this: TransformPluginContext, code: string, id: string, options?: {
    moduleType: ModuleType;
    ssr?: boolean | undefined;
  }) => Promise<Rolldown.TransformResult> | Rolldown.TransformResult, {
    filter?: {
      id?: StringFilter;
      code?: StringFilter;
      moduleType?: ModuleTypeFilter;
    };
  }>;
```

</details>

<a id="hook-moduleParsed"></a>
### moduleParsed：观察已经解析的模块

**输入：** ModuleInfo。Rolldown 等该模块的静态/动态导入解析完成，所以 importedIds/dynamicallyImportedIds 已有准确结果。

**返回：** void 或 Promise<void>，不返回转换代码。

**下游：** 宿主继续构建其他依赖模块。当前模块的 importers 仍可能不完整，因为更多导入者还未被发现；需要完整图可在 buildEnd 遍历。

**场景：** 依赖报告、模块元数据统计。默认未打包 Vite dev 为避免完整 AST 工作不调用它；不能把 build 中可用的 ModuleInfo 字段一概用于 dev。

**证据：** [FunctionPluginHooks.moduleParsed 声明](../node_modules/.pnpm/rolldown@1.2.14/node_modules/rolldown/dist/shared/define-config-BLptERXo.d.mts)（第 3165 行）。

<details>
<summary>锁定版本类型声明</summary>

```ts
[DEFINED_HOOK_NAMES.moduleParsed]: (this: PluginContext, moduleInfo: ModuleInfo) => void;
```

</details>

<a id="hook-buildEnd"></a>
### buildEnd：模块图阶段结束

**输入：** 可选 Error；模块构建失败时带错误，成功时通常无参数。

**返回：** void 或 Promise<void>；不返回 bundle。

**下游：** 成功后开始输出生成，失败时进入错误处理/关闭。buildEnd 成功不代表 renderChunk 成功，更不代表文件已经写盘。

**场景：** 汇总模块图、结束模块分析资源。默认 dev 在插件容器关闭时调用，默认非 client 同样受 perEnvironmentStartEndDuringDev 控制。这里读取 getModuleIds/getModuleInfo 时仍需结合宿主字段能力。

**证据：** [FunctionPluginHooks.buildEnd 声明](../node_modules/.pnpm/rolldown@1.2.14/node_modules/rolldown/dist/shared/define-config-BLptERXo.d.mts)（第 3173 行）；[Vite 运行时](../node_modules/vite/dist/node/chunks/node.js)（第 8573 行，搜索 `async close`）。

<details>
<summary>锁定版本类型声明</summary>

```ts
[DEFINED_HOOK_NAMES.buildEnd]: (this: PluginContext, err?: Error) => void;
```

</details>

<a id="hook-renderStart"></a>
### renderStart：开始生成某份输出

**输入：** NormalizedOutputOptions 和 NormalizedInputOptions，均已包含相应选项 Hook 的变换与默认值。

**返回：** void 或 Promise<void>。

**下游：** 对模块图进行输出渲染，生成 chunk/asset。之后才有逐 chunk 的代码处理。

**场景：** 记录输出 format，初始化本份输出的统计；同一次构建存在多个 output 时不要只保留一个共享计数。默认 dev 不调用。它比 outputOptions 更适合作为“开始生成输出”的阶段标记。

**证据：** [FunctionPluginHooks.renderStart 声明](../node_modules/.pnpm/rolldown@1.2.14/node_modules/rolldown/dist/shared/define-config-BLptERXo.d.mts)（第 3192 行）。

<details>
<summary>锁定版本类型声明</summary>

```ts
[DEFINED_HOOK_NAMES.renderStart]: (this: PluginContext, outputOptions: NormalizedOutputOptions, inputOptions: NormalizedInputOptions) => void;
```

</details>

<a id="hook-resolveFileUrl"></a>
### resolveFileUrl：把发射文件引用换成 JS 表达式

**输入：** ResolveFileUrlArgs，包含 referenceId、fileName、relativePath、chunkId、format、moduleId，及本版扩展 urlId。chunkId 可能仍带哈希占位；referenceId 通常由 this.emitFile 返回。

**返回：** **JavaScript 表达式字符串**或空值；同步、first 模式。返回 JSON.stringify('/assets/a.txt') 得到的是带引号的 JS 字面量，不是裸 URL。

**下游：** 替换源码里的 `import.meta.ROLLUP_FILE_URL_<ref>` 等引用表达式，进入 chunk 渲染。普通 `import './a.png'` 的完整处理还包括 Vite asset 插件自己的加载与转换。

**场景：** 自定义发射资源的运行时 URL。Vite 内置 asset 插件也实现了它，普通插件可能还没轮到就被接管；本次探针设 enforce:pre 才观察到自定义回调。默认 dev 没有这条整应用输出替换阶段。

```ts
// 在 load 等有完整上下文的 Hook 中：
const ref = this.emitFile({ type: 'asset', name: 'a.txt', source: 'hello' })
return `export default import.meta.ROLLUP_FILE_URL_${ref}`
// 在 resolveFileUrl 中：
// return JSON.stringify('/' + fileName)
```

**证据：** [FunctionPluginHooks.resolveFileUrl 声明](../node_modules/.pnpm/rolldown@1.2.14/node_modules/rolldown/dist/shared/define-config-BLptERXo.d.mts)（第 3227 行）；[Vite 运行时](../node_modules/vite/dist/node/chunks/node.js)（第 32501 行，搜索 `resolveFileUrl`）。

<details>
<summary>锁定版本类型声明</summary>

```ts
[DEFINED_HOOK_NAMES.resolveFileUrl]: (this: PluginContext, args: ResolveFileUrlArgs) => string | NullValue;
```

</details>

<a id="hook-banner"></a>
### banner：在格式包装外侧添加头部文本

**输入：** 直接提供文本，或提供接收 RenderedChunk 的函数；对象 Hook 的 handler 也可使用该 AddonHook 类型。

**返回：** 文本；函数可返回 Promise<string>。

**下游：** 文本被加入对应 chunk 头部，处于格式包装之外；后面还会经过相关渲染/后处理，不能等同最终文件的不可更改字节。

**场景：** 许可证注释、文件标头。按 chunk 调用，多个插件可贡献文本。与 output.banner 作用对应；压缩器对注释的保留策略也会影响最终结果。默认 dev 不调用。

**证据：** [AddonHooks.banner 声明](../node_modules/.pnpm/rolldown@1.2.14/node_modules/rolldown/dist/shared/define-config-BLptERXo.d.mts)（第 3335 行）。

<details>
<summary>锁定版本类型声明</summary>

```ts
[DEFINED_HOOK_NAMES.banner]: AddonHook;
```

</details>

<a id="hook-intro"></a>
### intro：在格式包装内部添加前置代码

**输入：** 文本，或接收 RenderedChunk 的函数。

**返回：** string 或函数返回的 Promise<string>。

**下游：** 在当前 chunk 的格式包装内部、主体代码之前插入。ESM 没有明显函数包装时，视觉上可能与 banner 接近，语义位置仍不同。

**场景：** 为 IIFE/UMD 等输出注入包装内部需要的初始化内容；要确认变量作用域与输出格式兼容。它是每 chunk 的输出工作，不是 transform 每模块注入。

**证据：** [AddonHooks.intro 声明](../node_modules/.pnpm/rolldown@1.2.14/node_modules/rolldown/dist/shared/define-config-BLptERXo.d.mts)（第 3349 行）。

<details>
<summary>锁定版本类型声明</summary>

```ts
[DEFINED_HOOK_NAMES.intro]: AddonHook;
```

</details>

<a id="hook-outro"></a>
### outro：在格式包装内部添加末尾代码

**输入：** 文本，或接收 RenderedChunk 的函数。

**返回：** string 或函数返回的 Promise<string>。

**下游：** 放到包装内部主体末尾，仍属于当前 chunk 的输出内容。

**场景：** 输出包装内的收尾逻辑。若逻辑要在每个源码模块生效，应考虑 transform；若是构建工具自身清资源，应考虑 closeBundle，不能把运行时 outro 当工具清理 Hook。

**证据：** [AddonHooks.outro 声明](../node_modules/.pnpm/rolldown@1.2.14/node_modules/rolldown/dist/shared/define-config-BLptERXo.d.mts)（第 3356 行）。

<details>
<summary>锁定版本类型声明</summary>

```ts
[DEFINED_HOOK_NAMES.outro]: AddonHook;
```

</details>

<a id="hook-footer"></a>
### footer：在格式包装外侧添加尾部文本

**输入：** 文本，或接收 RenderedChunk 的函数。

**返回：** string 或函数返回的 Promise<string>。

**下游：** 拼入 chunk 的包装外侧尾部，并继续后续输出处理。与 output.footer 对应。

**场景：** 文件级尾注等。footer 不保证能访问包装内部局部变量；与 outro 的区别是所处作用域/位置。默认 dev 不调用。

**证据：** [AddonHooks.footer 声明](../node_modules/.pnpm/rolldown@1.2.14/node_modules/rolldown/dist/shared/define-config-BLptERXo.d.mts)（第 3342 行）。

<details>
<summary>锁定版本类型声明</summary>

```ts
[DEFINED_HOOK_NAMES.footer]: AddonHook;
```

</details>

<a id="hook-renderChunk"></a>
### renderChunk：修改合并/分包后的 chunk 代码

**输入：** code、RenderedChunk、归一化 OutputOptions、RenderedChunkMeta。meta.chunks 可观察本份输出的 chunk 信息；原生 magicString 依相应实验能力而定。

**返回：** string、RolldownMagicString、含 code/map 的对象，或空值；允许 Promise，按转换链消费。

**下游：** 下一插件得到修改后的 chunk 代码，继续哈希和最终生成。RenderedChunk 可修改；若增加/删除 import/export，需同步 imports/importedBindings/exports 等元数据。

**场景：** chunk 级包装、输出代码改写。此时 chunk 可能包含多个源模块，文件名可能包含哈希占位；不要按 src 文件名假设一对一。修改代码应提供相应映射，不能把 transform 的模块 sourcemap 直接冒充 chunk 变换 map。

**证据：** [FunctionPluginHooks.renderChunk 声明](../node_modules/.pnpm/rolldown@1.2.14/node_modules/rolldown/dist/shared/define-config-BLptERXo.d.mts)（第 3206 行）。

<details>
<summary>锁定版本类型声明</summary>

```ts
[DEFINED_HOOK_NAMES.renderChunk]: (this: PluginContext, code: string, chunk: RenderedChunk, outputOptions: NormalizedOutputOptions, meta: RenderedChunkMeta) => NullValue | string | RolldownMagicString | {
    code: string | RolldownMagicString;
    map?: SourceMapInput;
  };
```

</details>

<a id="hook-augmentChunkHash"></a>
### augmentChunkHash：贡献额外的哈希输入

**输入：** RenderedChunk。

**返回：** string 或 void，同步 Hook；有效字符串参与哈希计算，空值不贡献。

**下游：** 宿主把贡献与其他哈希信息一起计算，影响带 hash 的输出命名与关联引用。返回 'abc' 不表示文件名直接变成 abc.js。

**场景：** 外部模板/配置改变但生成的 chunk 文本不足以表达该变化时，让缓存标识反映额外依赖。不要在这里随机返回值，否则产物哈希失去可重复性。默认 dev 不调用。

**证据：** [FunctionPluginHooks.augmentChunkHash 声明](../node_modules/.pnpm/rolldown@1.2.14/node_modules/rolldown/dist/shared/define-config-BLptERXo.d.mts)（第 3221 行）。

<details>
<summary>锁定版本类型声明</summary>

```ts
[DEFINED_HOOK_NAMES.augmentChunkHash]: (this: PluginContext, chunk: RenderedChunk) => string | void;
```

</details>

<a id="hook-generateBundle"></a>
### generateBundle：处理写盘前的产物集合

**输入：** 归一化 OutputOptions、OutputBundle、isWrite。bundle 是文件名到 OutputChunk/OutputAsset 的映射；chunk 有 code，asset 有 source，二者不能混用。

**返回：** void 或 Promise<void>。通过修改 bundle/条目或 this.emitFile 发射资源生效；return 一个新对象不会把整个 bundle 替换掉。

**下游：** 后续同名 Hook 继续处理集合，最终内存返回或写盘。isWrite=true 只说明本次准备写盘，不代表已经写入。

**场景：** 生成 manifest、检查体积、删除某些条目、产物报告。要避免手动改名却漏改 import/HTML/manifest 引用。实测此插件执行时可能还没有 index.html：Vite 的 HTML 处理与同阶段内部插件交织，`transformIndexHtml` 不是全局必早于所有 generateBundle。

**证据：** [FunctionPluginHooks.generateBundle 声明](../node_modules/.pnpm/rolldown@1.2.14/node_modules/rolldown/dist/shared/define-config-BLptERXo.d.mts)（第 3252 行）。

<details>
<summary>锁定版本类型声明</summary>

```ts
[DEFINED_HOOK_NAMES.generateBundle]: (this: PluginContext, outputOptions: NormalizedOutputOptions, bundle: OutputBundle, isWrite: boolean) => void;
```

</details>

<a id="hook-transformIndexHtml"></a>
### transformIndexHtml：HTML 到 HTML/标签描述

**输入：** html 字符串和 ctx。ctx 包含 path、filename；开发可带 server/originalUrl，构建可带 bundle/chunk；不要假定所有可选字段始终存在。上下文无 this.environment。

**返回：** 新 HTML 字符串、HtmlTagDescriptor[]、`{ html, tags }`、void 或 Promise。标签描述有 tag、attrs、children、injectTo，注入位置可为 head/body/head-prepend/body-prepend，默认 head-prepend。

**下游：** 改过的 HTML 进入后续 HTML Hook、Vite 内置处理/注入或作为输出/响应。`order:'pre'` 在默认 HTML 转换前处理，适合引入需要被 Vite 识别的入口；default/post 可观察更后面的结果，具体资源顺序仍结合内部插件实现。

**场景：** 注入 meta、开发脚本、替换标题。普通 JS transform 不负责完整 HTML。SSR 若自己响应模板而绕过 Vite HTML 服务，需要显式调用 server.transformIndexHtml。preview 默认静态托管不会再调用它。

```ts
transformIndexHtml: {
  order: 'pre',
  handler(html) {
    return { html, tags: [{ tag: 'meta', attrs: { name: 'study', content: 'vite' } }] }
  },
}
```

**证据：** [Plugin.transformIndexHtml 声明](../node_modules/.pnpm/vite@8.3.4_@types+node@24.19.2/node_modules/vite/dist/node/index.d.ts)（第 2302 行）。

<details>
<summary>锁定版本类型声明</summary>

```ts
transformIndexHtml?: IndexHtmlTransform;
```

</details>

<a id="hook-writeBundle"></a>
### writeBundle：真实写盘完成以后

**输入：** 归一化 OutputOptions、已经写出的 OutputBundle。

**返回：** void 或 Promise<void>。

**下游：** 宿主等待后继续完成构建/清理。此时只修改内存 bundle 不会自动把磁盘文件重新写一遍，要改磁盘需明确进行文件操作。

**场景：** 依赖实际文件存在的工具调用、输出检查。本版 `build.write:false` 不执行；不要把它用于必须在内存构建中也产生的 manifest，那应在 generateBundle 发射。多输出/多轮 watch 可重复。

**证据：** [FunctionPluginHooks.writeBundle 声明](../node_modules/.pnpm/rolldown@1.2.14/node_modules/rolldown/dist/shared/define-config-BLptERXo.d.mts)（第 3260 行）。

<details>
<summary>锁定版本类型声明</summary>

```ts
[DEFINED_HOOK_NAMES.writeBundle]: (this: PluginContext, outputOptions: NormalizedOutputOptions, bundle: OutputBundle) => void;
```

</details>

<a id="hook-renderError"></a>
### renderError：输出生成失败

**输入：** 输出生成过程的 Error。

**返回：** void 或 Promise<void>；记录/清理副作用，不会通过返回正常代码恢复构建。

**下游：** 错误继续传播至构建调用者，后续正常输出流程被打断，关闭工作依宿主进行。

**场景：** 清理本份输出的临时状态、记录 renderChunk 等输出阶段失败。它不是捕获所有 config/模块加载/服务器错误的通用 catch。实测 transform 失败走 buildEnd(error)，renderChunk 失败走 renderError，二者边界不同。

**证据：** [FunctionPluginHooks.renderError 声明](../node_modules/.pnpm/rolldown@1.2.14/node_modules/rolldown/dist/shared/define-config-BLptERXo.d.mts)（第 3239 行）。

<details>
<summary>锁定版本类型声明</summary>

```ts
[DEFINED_HOOK_NAMES.renderError]: (this: PluginContext, error: Error) => void;
```

</details>

<a id="hook-onLog"></a>
### onLog：穿插于构建过程的日志过滤

**输入：** level 和 RolldownLog。日志可由打包器或插件产生，包含 code、message 等字段。

**返回：** 同步 boolean 或空值；**false** 阻止该日志继续传播，其他允许结果沿默认链传递。不是返回替换后的日志对象。

**下游：** 下一插件 onLog、输入配置里的 onLog，或终端输出。可使用 this.warn/info/debug/error 处理日志并返回 false，注意递归与重复记录。

**场景：** 精确过滤已知诊断、提升某类警告等级。它随日志事件发生，不能固定安排成 buildStart 后的某一阶段，也不能当作所有 Vite server/config logger 的统一拦截器。this 只有 MinimalPluginContext 能力。

**证据：** [FunctionPluginHooks.onLog 声明](../node_modules/.pnpm/rolldown@1.2.14/node_modules/rolldown/dist/shared/define-config-BLptERXo.d.mts)（第 3057 行）。

<details>
<summary>锁定版本类型声明</summary>

```ts
[DEFINED_HOOK_NAMES.onLog]: (this: MinimalPluginContext, level: LogLevel, log: RolldownLog) => NullValue | boolean;
```

</details>

<a id="hook-watchChange"></a>
### watchChange：监听源文件变化

**输入：** id 和 `{ event: 'create' | 'update' | 'delete' }`。Rolldown watch 中按发生变化的监测文件通知；若构建正在进行，会等待本轮结束后通知。

**返回：** void 或 Promise<void>，不返回候选模块列表。

**下游：** 清理自己的缓存/状态后，宿主继续重建或热更新流程。它既不等于 transform，也不负责默认浏览器更新协议。

**场景：** 构建 watch 缓存失效；Vite dev 有自己的兼容调用路径，默认 client，非 client 由 perEnvironmentWatchChangeDuringDev 等控制。不是所有文件系统改动都会自然成为插件依赖；可用 addWatchFile 登记额外文件。只作为输出插件使用时不可用。

**证据：** [FunctionPluginHooks.watchChange 声明](../node_modules/.pnpm/rolldown@1.2.14/node_modules/rolldown/dist/shared/define-config-BLptERXo.d.mts)（第 3291 行）；[Vite 运行时](../node_modules/vite/dist/node/chunks/node.js)（第 8569 行，搜索 `async watchChange`）。

<details>
<summary>锁定版本类型声明</summary>

```ts
[DEFINED_HOOK_NAMES.watchChange]: (this: PluginContext, id: string, event: {
    event: ChangeEvent;
  }) => void;
```

</details>

<a id="hook-hotUpdate"></a>
### hotUpdate：每个环境选择热更新模块

**输入：** type、file、timestamp、当前候选 modules、read()、server。通过 this.environment 访问当前 DevEnvironment，其 moduleGraph/hot 属于这个环境。read() 用来读取受编辑器保存时序影响的最新内容，允许 Promise。

**返回：** EnvironmentModuleNode[]、void 或 Promise。返回新数组替换当前候选，返回 [] 清空，void 沿用。不是返回新源码，也不是返回 HMR JSON 包。

**下游：** 下一插件看到更新后的 candidates；Vite 再进行失效、传播与消息发送。自行发送 custom/full-reload 并返回 [] 时，应自行明确必要的模块缓存失效，否则“消息已发”不代表服务端旧结果已清掉。

**场景：** 一个文件生成多个虚拟模块，选择真正受影响的模块；在当前环境用 environment.hot.send 发自定义事件。它是服务端决策 Hook，和浏览器 import.meta.hot.accept 注册的函数不同。CSS 自接受、React Refresh 都还依赖各自转换与客户端运行时。

```ts
hotUpdate({ modules }) {
  // 这是“沿用默认候选”，不是强制页面重载。
  return modules
}
```

**证据：** [Plugin.hotUpdate 声明](../node_modules/.pnpm/vite@8.3.4_@types+node@24.19.2/node_modules/vite/dist/node/index.d.ts)（第 2135 行）；[Vite 运行时](../node_modules/vite/dist/node/chunks/node.js)（第 25461 行，搜索 `async function handleHMRUpdate`）。

<details>
<summary>锁定版本类型声明</summary>

```ts
hotUpdate?: ObjectHook<(this: MinimalPluginContext & {
    environment: DevEnvironment;
  }, options: HotUpdateOptions) => Array<EnvironmentModuleNode> | void | Promise<Array<EnvironmentModuleNode> | void>>;
```

</details>

<a id="hook-handleHotUpdate"></a>
### handleHotUpdate：旧 HMR 兼容接口

**输入：** HmrContext：file、timestamp、兼容 ModuleNode[]、read、server。没有新接口的 type；上下文也没有 this.environment。

**返回：** ModuleNode[]、void 或 Promise；候选处理规则与旧兼容管线对应，不能直接混用 EnvironmentModuleNode。

**下游：** Vite 把兼容图结果映射回相关环境，继续更新。本版调度选择 hotUpdate ?? handleHotUpdate；同一个插件同时提供两者时优先新接口，不是双调。

**场景：** 维护既有插件。本版旧接口只在兼容更新路径且 type=update 时调用，不能用它承担所有环境的 create/delete 热更新。新环境感知实现选 hotUpdate；不要仅改个方法名就假设参数和 this 完全一致。

**证据：** [Plugin.handleHotUpdate 声明](../node_modules/.pnpm/vite@8.3.4_@types+node@24.19.2/node_modules/vite/dist/node/index.d.ts)（第 2324 行）；[Vite 运行时](../node_modules/vite/dist/node/chunks/node.js)（第 25461 行，搜索 `async function handleHMRUpdate`）。

<details>
<summary>锁定版本类型声明</summary>

```ts
handleHotUpdate?: ObjectHook<(this: MinimalPluginContextWithoutEnvironment, ctx: HmrContext) => Array<ModuleNode> | void | Promise<Array<ModuleNode> | void>>;
```

</details>

<a id="hook-closeBundle"></a>
### closeBundle：关闭构建对象/容器资源

**输入：** 本版有可选 error 参数；但不同错误路径/宿主不保证这里拿到所有错误。

**返回：** void 或 Promise<void>。

**下游：** 完成插件资源释放。它不是“写盘成功通知”，默认 dev 关闭环境插件容器也调用。

**场景：** 关闭服务、子进程、临时资源。直接使用 Rolldown JS API 时，调用者要在合适时机 await bundle.close()。watch 想跨轮保留资源时检查 this.meta.watchMode，并在 closeWatcher 清理。清理要幂等：本次受控 transform 错误路径观察到 closeBundle 调用两次；render 错误路径该参数也未携带渲染错误，不能只靠它判定成功/失败。

**证据：** [FunctionPluginHooks.closeBundle 声明](../node_modules/.pnpm/rolldown@1.2.14/node_modules/rolldown/dist/shared/define-config-BLptERXo.d.mts)（第 3277 行）；[Vite 运行时](../node_modules/vite/dist/node/chunks/node.js)（第 8584 行，搜索 `await this.hookParallel`）。

<details>
<summary>锁定版本类型声明</summary>

```ts
[DEFINED_HOOK_NAMES.closeBundle]: (this: PluginContext, error?: Error) => void;
```

</details>

<a id="hook-closeWatcher"></a>
### closeWatcher：关闭构建 watcher

**输入：** 没有位置参数，使用上下文观察 watch 状态。

**返回：** void 或 Promise<void>。

**下游：** 构建监听结束，释放跨构建轮次保留的资源。

**场景：** build --watch 的长生命周期缓存/外部服务。它不表示单次重建完成，也不能替代开发服务器 closeServer。仅作为输出插件时不可用；调用的是构建 watcher 的关闭路径。

**证据：** [FunctionPluginHooks.closeWatcher 声明](../node_modules/.pnpm/rolldown@1.2.14/node_modules/rolldown/dist/shared/define-config-BLptERXo.d.mts)（第 3302 行）。

<details>
<summary>锁定版本类型声明</summary>

```ts
[DEFINED_HOOK_NAMES.closeWatcher]: (this: PluginContext) => void;
```

</details>

<a id="hook-closeServer"></a>
### closeServer：开发服务器拆除以后

**输入：** `{ reason: 'restart' | 'close' }`，区分重启与最终关闭。

**返回：** void 或 Promise<void>。

**下游：** 等待插件做服务器级资源清理；当前实现先拆除 watcher、热通道、环境、HTTP 等，再全局等待这些 Hook。

**场景：** 清理 configureServer 安装的监听器或配套服务。reason=restart 时可按需要安排重启状态；不要在这里期待 HTTP 仍可正常处理请求。它不同于每环境 closeBundle；上下文无 this.environment。

**证据：** [Plugin.closeServer 声明](../node_modules/.pnpm/vite@8.3.4_@types+node@24.19.2/node_modules/vite/dist/node/index.d.ts)（第 2276 行）。

<details>
<summary>锁定版本类型声明</summary>

```ts
closeServer?: ObjectHook<CloseServerHook>;
```

</details>

<a id="hook-configurePreviewServer"></a>
### configurePreviewServer：搭建预览服务器

**输入：** PreviewServer，能访问预览中间件和 HTTP 服务器等，但不是完整 ViteDevServer。

**返回：** void、后置注册函数或对应 Promise；后置函数同样是安装中间件的阶段回调。

**下游：** 完成预览中间件栈，再托管已有产物。需要每次 HTTP 运行的逻辑仍应注册 middleware。

**场景：** 本地预览的模拟 API/特定响应头。不会参与打包、不能把它当生产部署后端；不要调用只有开发服务器才有的 transformRequest。资源可由 closePreviewServer 回收。

**证据：** [Plugin.configurePreviewServer 声明](../node_modules/.pnpm/vite@8.3.4_@types+node@24.19.2/node_modules/vite/dist/node/index.d.ts)（第 2267 行）。

<details>
<summary>锁定版本类型声明</summary>

```ts
configurePreviewServer?: ObjectHook<PreviewServerHook>;
```

</details>

<a id="hook-closePreviewServer"></a>
### closePreviewServer：预览服务器关闭以后

**输入：** 无位置参数；没有 closeServer 的 reason 对象。

**返回：** void 或 Promise<void>。

**下游：** 当前实现先关闭预览 HTTP 服务器，再等待插件清理。

**场景：** 配对释放 configurePreviewServer 创建的资源。preview 不启动常规构建管线，不能依赖 closeBundle 帮它回收所有资源；上下文无 this.environment。

**证据：** [Plugin.closePreviewServer 声明](../node_modules/.pnpm/vite@8.3.4_@types+node@24.19.2/node_modules/vite/dist/node/index.d.ts)（第 2281 行）。

<details>
<summary>锁定版本类型声明</summary>

```ts
closePreviewServer?: ObjectHook<ClosePreviewServerHook>;
```

</details>

<a id="hook-shouldTransformCachedModule"></a>
### shouldTransformCachedModule：类型可见，但当前不生效

**输入：** 类型声明给出缓存模块的 code、id、meta、moduleSideEffects；这描述兼容 API 的预期输入，不表示当前真的会收到回调。

**返回：** 类型是 boolean/null/void；历史意图是决定缓存模块是否重新 transform。**当前版本不消费它来控制转换。**

**下游：** Vite 8.3.4 的声明明确说明 Rolldown 暂不支持，当前 no-op。不能依赖返回 true 让已缓存模块重转，也不能用一个“没打印日志”的实验推导所有插件都坏了。

**场景：** 读旧 Rollup 插件时识别兼容占位。deprecated 注释在这里包含“当前实现不支持”的含义；应根据宿主支持的依赖登记和缓存失效 API 设计，或核对升级后的实现。

**证据：** [Plugin.shouldTransformCachedModule 声明](../node_modules/.pnpm/vite@8.3.4_@types+node@24.19.2/node_modules/vite/dist/node/index.d.ts)（第 2330 行）；声明前的注释明确标记 no-op；清单只摘取签名，阅读此项状态时同时看原文件注释。

<details>
<summary>锁定版本类型声明</summary>

```ts
shouldTransformCachedModule?: ObjectHook<(this: PluginContext, options: {
    code: string;
    id: string;
    meta: CustomPluginOptions;
    moduleSideEffects: boolean | "no-treeshake";
  }) => boolean | null | void>;
```

</details>

## 9 个配置属性：它们不是逐文件 Hook

| 属性 | 输入/配置与作用 | 容易混淆的点 |
| --- | --- | --- |
| `name` | 必填插件名，供日志、诊断和工具识别 | 不会因为同名就自动合并两个插件对象。 |
| `version` | 可选插件版本，供插件间通信等使用 | 不是宿主版本；宿主版本看 this.meta。 |
| `api` | 可选 A 类型对象，自定义对外 API | `Plugin<MyApi>` 的泛型落在这里，不是 transform 输入类型。Vite 不替你实现该 API。 |
| `meta` | 插件对象上的 PluginMeta 描述性信息，本版实验属性 | 和 `this.meta` 的运行上下文元数据、模块结果里的 `meta` 是三件事。 |
| `enforce` | `'pre'` / `'post'`，改变插件所处层级 | 不是针对全部模块定义一个统一阶段；Hook 的 order 仍会影响同名回调。 |
| `apply` | `'serve'` / `'build'`，或 `(config, env) => boolean`，全局筛选插件 | 同步；不是每模块过滤器。preview 的 command 属于 serve，可用 env.isPreview 进一步区分。 |
| `sharedDuringBuild` | 实验开关，让插件加入整应用构建的共享插件管线 | build --app 默认兼容策略会为环境重建插件；还受 builder.sharedPlugins 控制。共享后闭包变量可能被多个环境使用。 |
| `perEnvironmentStartEndDuringDev` | 实验开关，dev 每环境调用该插件 buildStart/buildEnd | 默认兼容只调用 client；也有 server 级同名全局开关。它不控制 closeBundle。 |
| `perEnvironmentWatchChangeDuringDev` | 实验开关，dev 每环境调用该插件 watchChange | 默认兼容只调用 client；也有 server 级全局开关。它不决定 hotUpdate 是否支持环境。 |

这些属性的准确声明与来源见 [自动提取清单](plugin-hooks.inventory.json) 的 properties。插件通常默认参与 dev/build；只写 `apply:'build'` 会让其 dev server/HMR Hook 也被全局排除。

## 多环境下的实例与状态

下面三层不要混在一起：

```text
一次配置解析的全局 Hook
    config / configEnvironment / configResolved / configureServer / buildApp 等
          ↓
环境自己的插件管线和模块图
    client.resolve/load/transform  ← 同一 src/App.tsx → ssr.resolve/load/transform
          ↓                                      ↓
    浏览器代码、浏览器 HMR                   服务端模块/运行器更新
```

Environment 的 dev/build 模式与 CLI `--mode development/staging` 是两种维度；后者控制配置模式与 env 文件选择，不能用字符串相同就推导关系。

dev 默认可能复用同一个插件对象，但 `buildStart/buildEnd/watchChange` 为兼容旧插件只在 client 调；resolve/load/transform/hotUpdate 则按环境处理。开启上节的属性后，初始化、清理也应按环境设计，不能在第一个环境结束时清掉所有环境共用资源。

整应用生产构建是否共享插件实例，要结合 sharedDuringBuild 与 builder.sharedPlugins。不能因为源码中只写一次插件工厂就认定只会创建一次对象。

```ts
import type { Plugin } from 'vite'

function perEnvironmentCounter(): Plugin {
  const counts = new WeakMap<object, number>()
  return {
    name: 'study:per-environment-counter',
    sharedDuringBuild: true,
    perEnvironmentStartEndDuringDev: true,
    buildStart() {
      counts.set(this.environment, 0)
    },
    transform(code, id) {
      const env = this.environment
      counts.set(env, (counts.get(env) ?? 0) + 1)
    },
    buildEnd() {
      console.log(this.environment.name, counts.get(this.environment))
    },
  }
}
```

这是状态组织示意，不承诺不同环境串行执行。长期缓存还应把 query、编译条件和外部依赖纳入缓存键/失效设计。本版也提供 `perEnvironmentState` 帮助函数，使用前阅读其实验状态与签名。

## `this` 上下文 API 全量补充

这些是 Hook 内部可调用的工具，**不是宿主会自动回调的生命周期 Hook**。另外，`this.load()` 和对象上的 `load()` Hook、`this.resolve()` 和 `resolveId()` Hook 是不同角色：前者请求宿主操作，后者被宿主调用。

### 每个 Hook 拿到的上下文并不相同

| 上下文 | 使用位置示例 | 能力边界 |
| --- | --- | --- |
| ConfigPluginContext | config、configEnvironment | 日志和配置期 meta，去掉 watchMode/environment；没有完整图操作工具。 |
| MinimalPluginContextWithoutEnvironment | configResolved、服务器配置/关闭、HTML、buildApp、旧 HMR | 日志/meta 等，但没有 this.environment。需要 server/builder 时读参数。 |
| MinimalPluginContext | options、outputOptions、onLog | 基础日志/meta；Vite 环境管线中扩展 environment，但不意味着拥有 emitFile/getModuleInfo。 |
| PluginContext | buildStart、resolveId、load、buildEnd、产物 Hook 等 | 基础能力加模块图、解析/加载、文件发射等，仍受生命周期和 dev/build 实现限制。 |
| TransformPluginContext | transform | 完整模块上下文，加位置感知日志和 getCombinedSourcemap。 |
| 新 hotUpdate 的专用上下文 | hotUpdate | MinimalPluginContext + DevEnvironment；不是完整 PluginContext，不要直接假设 this.emitFile 可用。 |

### MinimalPluginContext 的全部成员

| 成员 | 输入 → 输出 / 作用 |
| --- | --- |
| `this.error(error)` | 字符串或 RolldownError → 抛错，返回 never；不是普通日志打印。 |
| `this.warn(log)` | 诊断 → 警告；本质受宿主日志路径消费。 |
| `this.info(log)` | 诊断 → info 级日志。 |
| `this.debug(log)` | 诊断 → debug 级日志，是否输出取决于日志级别。 |
| `this.meta` | 只读上下文信息，含 rolldownVersion、兼容 rollupVersion（占位值）、watchMode；Vite 扩展 viteVersion。配置期类型去掉 watchMode。 |

### PluginContext 新增的全部成员

| 成员 | 输入 → 输出 / 作用与时机 |
| --- | --- |
| `this.fs` | 宿主文件系统接口；应结合实际宿主实现使用，不能据类型直接假定 dev 有完整 Rolldown 文件系统行为。 |
| `this.emitFile(file)` | 发射描述 → referenceId；asset 使用 source，入口 chunk 等类型有不同必需字段。支持范围/时机看具体实现；默认 dev 的输出发射能力有限，不能照搬构建发射方案。 |
| `this.getFileName(referenceId)` | 引用 ID → 发射文件名；名称分配之前可能不可取得最终哈希名，不是源码路径查询 API。 |
| `this.getModuleIds()` | 无参数 → 当前模块 ID 迭代器；建图中不代表最终全集。 |
| `this.getModuleInfo(id)` | 模块 ID → ModuleInfo/null；default dev 是部分信息，不能默认有完整 AST/所有 build 字段。 |
| `this.addWatchFile(id)` | 路径 → void；让额外依赖参与监测。例如 transform 读取另一个模板时登记该模板；它本身不等于声明一个浏览器 import。 |
| `this.load({ id, resolveDependencies?, ... })` | 已解析模块加载选项 → Promise<ModuleInfo>；请求宿主加载模块，不是调用当前插件一个方法。递归加载依赖要避免等待环。 |
| `this.parse(code, options?)` | 源码 → Program AST；读取本版支持的 parser options，不把旧 Acorn 扩展接口直接套进来。 |
| `this.resolve(source, importer?, options?)` | 导入上下文 → Promise<ResolvedId/null>；委托宿主解析，和自己 return 一个绝对路径不同，注意 skipSelf/custom 等控制以避免递归。 |

### TransformPluginContext 新增/覆盖的全部成员

`debug/info/warn/error` 支持当前模块的位置参数，便于给转换后的诊断定位；`getCombinedSourcemap()` 返回当前步骤之前合成的 SourceMap，可用于理解已有转换映射。拿到旧 map 不等于自动描述了本次新修改，仍需返回本次变换的 map。

Vite 的 `this.environment` 可读取当前环境 name/config；dev 环境可用 moduleGraph/hot 等特定能力，build 环境有自己的构建状态。先检查环境模式/类型再用特有能力，不把 dev server 的所有 API 当成 Environment 的共有属性。

上下文全部成员的原始声明也保存在 [清单](plugin-hooks.inventory.json) 的 contextInterfaces，能与本节逐项对照。

## JS Hook 怎样和 Rust 核心接起来

```text
Node 加载 vite.config.ts → 得到插件对象及 JS 函数
  ├─ Vite JS 上层直接调用全局配置 / server / HTML / HMR Hook
  ├─ 默认 dev：Vite 的 JS 插件容器编排 resolve/load/transform
  └─ build：Vite 组织 Rolldown 选项 → 原生绑定登记 JS 回调
                          ↓ Rust 需要解析/加载/转换模块
                       调用相应 JS Hook / 等待 Promise
                          ↓ 返回结构化结果
                       Rust 继续建图、优化、生成
```

Vite 上层主要是 TS/JS，Rolldown 与 Oxc 的基础设施主要使用 Rust。JS 插件没有被自动编译为 Rust；绑定负责传递数据和回调。并非每个 Hook 都跨 Rust/JS 边界，默认 dev 与 build 的宿主也不同。filter 可以减少无关回调，不能由此推导插件函数在 Rust 内执行。

配套最小实验证据见 [JS ↔ Rust 双向调用](../native/01-js-rust/README.md)。该例是同步同线程原生调用，帮助理解回调；不是 Rolldown 的完整异步/线程调度实现。

## 如何复现调研与检查有没有漏项

```bash
pnpm docs:hooks        # 从当前 .d.ts 重新提取，核对版本、37 项说明、9 个属性
pnpm docs:hooks:trace  # 临时项目跑 6 条路径，生成实际调度日志并断言关键边界
```

调研附属文件：

- [接口成员清单](plugin-hooks.inventory.json)：AST 提取准确的成员名、原始签名、来源文件与行号，也保留上下文成员。
- [全量检查脚本](../scripts/check-plugin-docs.mjs)：使用 Vite 导出的 Oxc parseSync 解析类型声明，沿当前继承关系合并，不靠手写计数猜测覆盖率。
- [实际运行日志](plugin-hooks.trace.json)：内存构建、写盘构建、模块转换失败、输出渲染失败、dev、preview。
- [日志复现脚本](../scripts/trace-plugin-lifecycle.mjs)：使用临时目录与随机端口；finally 删除临时文件、关闭服务，不修改七个示例源码。

清单检查会要求正文在箭头图中覆盖所有 Hook，附录每个 Hook 恰好一个锚点和完整的五个说明字段，也会比较当前声明与存档是否一致；**它检查成员覆盖，不自动证明所有语义正确**。升级依赖后若失败，应先重新调研，再执行 `node scripts/check-plugin-docs.mjs --write` 更新清单，不能只更新 JSON 消除错误。

### 受控实验得到的结论

| 路径 | 实际观察与断言 |
| --- | --- |
| 内存构建 | options → outputOptions → buildStart；buildEnd 在 renderStart 前；不调用 writeBundle。 |
| 写盘构建 | 有 generateBundle(isWrite=true)，随后 writeBundle；其他关键阶段与内存构建相近。 |
| HTML 输出 | 本插件 generateBundle 时 hasHtml=false，之后才调用默认 transformIndexHtml。 |
| 文件 URL | pre 插件能接管 resolveFileUrl；普通插件可能被 Vite 内置 first Hook 提前接管。 |
| transform 抛错 | buildEnd 收到错误；此样例中 closeBundle(error) 后又调用一次无错误参数的 closeBundle。 |
| renderChunk 抛错 | buildEnd 已成功结束，随后 renderError；closeBundle 参数未体现该渲染错误。 |
| 默认 dev | 建立 client/ssr 容器，默认 buildStart/buildEnd 只观察到 client；closeBundle 按环境清理；无 moduleParsed/renderStart/generateBundle。 |
| preview | 有 configurePreviewServer 及后置注册函数，关闭时有 closePreviewServer；无普通模块构建 Hook。 |

日志中不同模块的 load/transform/moduleParsed 可交错。两次重跑得到不同的跨模块顺序并不必然是错误；断言只固定需要验证的数据依赖和本版受控路径的行为。

所有 37 项都经过类型与相应说明核对；本次没有声称逐个运行了所有稀有分支。buildApp 的兜底条件、热更新新旧分支、watch 关闭、多环境兼容开关等主要依据本地实现与类型检查；测试脚本不覆盖完整 bundled dev、所有输出格式、所有自定义环境或实际浏览器 HMR。

### 一手来源与继续阅读

安装包是本次可复现基线；每项证据链接指向该仓库安装的文件，行号为本次版本行号。生成文件较长，按函数名搜索比依赖旧版行号更稳妥。

| 来源 | 本次核对的部分 |
| --- | --- |
| [Vite 类型声明](../node_modules/vite/dist/node/index.d.ts) | Plugin 继承/覆盖、13 个新增回调、5 个环境/控制属性、HTML 与上下文类型。 |
| [Vite JS 实现](../node_modules/vite/dist/node/chunks/node.js) | resolveEnvironmentPlugins；runConfigHook/runConfigEnvironmentHook；插件容器 hookParallel/buildStart/close；handleHMRUpdate；createBuilder；服务器/预览关闭。 |
| [Rolldown 类型声明](../node_modules/.pnpm/rolldown@1.2.14/node_modules/rolldown/dist/shared/define-config-BLptERXo.d.mts) | FunctionPluginHooks 20 项、AddonHooks 4 项、对象 Hook 包装/同步分类、4 个元数据/API 属性与上下文工具。 |
| [Rolldown JS 构建入口](../node_modules/.pnpm/rolldown@1.2.14/node_modules/rolldown/dist/shared/rolldown-BYX6bV3R.mjs) | #build 在 native generate/write 前创建输入/输出选项，用运行日志核对 outputOptions 的实际顺序。 |

官方文档用于交叉阅读，可能随最新版更新；遇到差异应回到本项目版本：

- [Vite Plugin API](https://vite.dev/guide/api-plugin)：通用 Hook、dev/build 差别、排序与 HTML。
- [Environment API：插件](https://vite.dev/guide/api-environment-plugins)：环境上下文、环境选择与 HMR。
- [Environment API：框架](https://vite.dev/guide/api-environment-frameworks)：整应用构建和框架编排。
- [Rolldown Plugin API](https://rolldown.rs/apis/plugin-api)、[Plugin 接口](https://rolldown.rs/reference/Interface.Plugin)：继承成员与返回语义。

**边界检查：** 本版接口没有单独声明 resolveImportMeta、renderDynamicImport 等某些旧 Rollup 资料出现的 Hook，也不能把 renderBuiltUrl、manualChunks、configureServer 注册的 middleware、浏览器 accept/dispose、vite.config 默认导出函数都算进 Plugin 的 37 项。遇到“还有一个 Hook”时，先确认属于哪个对象、哪个版本、哪个宿主。
