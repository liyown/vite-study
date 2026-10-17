/**
 * 【Vite 编排】阅读时先看 transform 的环境分流，再看 load 和 buildApp。
 * 构建时：configResolved → buildApp 选择环境 → 各环境 buildStart / 模块处理 / generateBundle。
 *
 * 本文件负责“何时调用编译器、把结果放进哪张图”；
 * compiler.mjs 负责“某个 AST 节点具体怎么改”。
 */
import { readFile, readdir } from 'node:fs/promises';
import { resolve, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { isRunnableDevEnvironment } from 'vite';
import { compileModule, discoverFunctions } from './compiler.mjs';

const here = fileURLToPath(new URL('.', import.meta.url));
const registryId = '\0virtual:mini-start/registry';
const providerQuery = '?server-fn-provider';
const runtimeFiles = new Map([
  ['#mini-start', 'runtime/functions.ts'],
  ['#mini-start/router', 'runtime/router.tsx'],
  ['virtual:mini-start/client', 'runtime/client.ts'],
  ['virtual:mini-start/server-rpc', 'runtime/server-rpc.ts'],
  ['virtual:mini-start/ssr-rpc', 'runtime/ssr-rpc.ts'],
]);

export function miniStart() {
  let root;
  let functions = [];
  // 只用于输出对照文件；两端虽然共享插件实例，转换记录仍按环境分开存。
  const transformed = new Map();

  async function scanServerFunctions() {
    const files = await sourceFiles(resolve(root, 'src'));
    const discoveries = await Promise.all(files.map(async file => {
      const code = await readFile(file, 'utf8');
      return discoverFunctions(code, file, root);
    }));
    functions = discoveries.flat();
    if (new Set(functions.map(fn => fn.id)).size !== functions.length) {
      throw new Error('函数 ID 冲突');
    }
    // functions 只是 [{ id, file, exportName, functionName }]，没有执行 handler。
  }

  return {
    name: 'study:mini-start',
    enforce: 'pre', // 在常规源码处理之前先移除不属于当前端的实现。
    sharedDuringBuild: true,
    perEnvironmentStartEndDuringDev: true,
    perEnvironmentWatchChangeDuringDev: true,

    // ① 最终配置就绪：知道项目 root，扫描函数身份，为注册表做准备。
    async configResolved(config) {
      root = config.root;
      await scanServerFunctions();
    },
    async buildStart() {
      await scanServerFunctions();
      transformed.set(this.environment.name, new Map());
    },

    // ② 整应用构建：同一配置中的两个 Environment 分别建图/打包。
    // 两边都交给 Rolldown；无需换成另一种打包器。
    async buildApp(builder) {
      for (const name of ['client', 'ssr']) {
        const environment = builder.environments[name];
        if (environment && !environment.isBuilt) await builder.build(environment);
      }
    },

    // ③ import 中的特殊名字 → 真实运行时文件 / 内部虚拟模块 ID。
    resolveId(source) {
      if (runtimeFiles.has(source)) return resolve(here, runtimeFiles.get(source));
      if (source === 'virtual:mini-start/registry') {
        if (this.environment.name === 'client') throw new Error('服务端注册表不能进入浏览器');
        return registryId;
      }
    },

    // ④ 虚拟模块没有磁盘文件，load 直接返回生成的源码。
    // 源码里写 import(provider) → Rolldown 发现动态依赖 → 可生成独立 chunk。
    async load(id) {
      if (id !== registryId) return;
      await scanServerFunctions();
      return buildRegistrySource(functions);
    },

    // ⑤ 同一磁盘文件在这里分流。决定输出的，不只是文件后缀，还有环境与 query。
    transform(code, id) {
      const [file, query] = id.split('?');
      if (!file.startsWith(resolve(root, 'src') + '/') || !/\.[jt]sx?$/.test(file)) return null;

      let mode;
      if (this.environment.name === 'client') mode = 'client';
      else if (query === 'server-fn-provider') mode = 'provider';
      else mode = 'ssr';

      const output = compileModule(code, file, root, mode);
      if (!output) return null; // 普通模块交给后续插件，继续正常编译。

      // 保存可读快照，generateBundle 再写进 compiled/，方便和原源码并排看。
      const key = relative(root, file).replaceAll('\\', '/') + (mode === 'provider' ? '.provider' : '');
      if (!transformed.has(this.environment.name)) transformed.set(this.environment.name, new Map());
      transformed.get(this.environment.name).set(key, output.code);
      return { code: output.code, map: output.map };
    },

    // 下面是开发刷新/HTTP 接入和调试产物，初读编译原理时可以稍后再看。
    async watchChange() {
      await scanServerFunctions();
      if (this.environment.mode === 'dev') {
        const module = this.environment.moduleGraph.getModuleById(registryId);
        if (module) this.environment.moduleGraph.invalidateModule(module);
      }
    },
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        if (!req.url?.startsWith('/_server/')) return next();
        const ssr = server.environments.ssr;
        if (!isRunnableDevEnvironment(ssr)) return next(new Error('本实验需要 Node SSR 环境'));
        // 每次请求都通过 SSR 运行器取模块，让 Vite 处理开发缓存与变更。
        // 普通 HTML 的 SSR 由 server.mjs 负责，这里只接 RPC。
        void ssr.runner.import('/src/entry-server.tsx')
          .then(entry => entry.handleNodeRpc(req, res))
          .catch(next);
      });
    },
    generateBundle(_options, bundle) {
      const environment = this.environment.name;
      const entries = functions.map(fn => ({
        ...fn,
        file: relative(root, fn.file).replaceAll('\\', '/'),
        url: '/_server/' + fn.id,
      }));
      this.emitFile({ type: 'asset', fileName: 'function-manifest.json', source: JSON.stringify(entries, null, 2) });
      for (const [fileName, code] of transformed.get(environment) ?? []) {
        this.emitFile({ type: 'asset', fileName: 'compiled/' + fileName + '.txt', source: code });
      }
      const chunks = Object.values(bundle).filter(file => file.type === 'chunk').map(chunk => ({
        file: chunk.fileName,
        entry: chunk.isEntry,
        dynamic: chunk.isDynamicEntry,
        imports: chunk.imports,
        dynamicImports: chunk.dynamicImports,
        modules: Object.keys(chunk.modules)
          .filter(id => id.startsWith(root))
          .map(id => relative(root, id).replaceAll('\\', '/')),
      }));
      this.emitFile({ type: 'asset', fileName: 'build-report.json', source: JSON.stringify({ environment, chunks }, null, 2) });
    },
  };
}

function buildRegistrySource(functions) {
  // 返回的是“模块源码文本”，不是当前立即执行的一组 import()。
  // 函数调用时才 load()；生产中由 Node 模块加载器加载对应 chunk。
  const entries = functions.map(fn => {
    const id = JSON.stringify(fn.id);
    const exportName = JSON.stringify(fn.exportName);
    const providerId = JSON.stringify(fn.file + providerQuery);
    const providerExport = JSON.stringify(fn.functionName);
    return `${id}: { exportName: ${exportName}, load: () => import(${providerId}).then(m => m[${providerExport}]) }`;
  });
  return 'export const registry = {\n' + entries.join(',\n') + '\n};';
}

async function sourceFiles(dir) {
  const files = await readdir(dir, { withFileTypes: true });
  const groups = await Promise.all(files.map(file => {
    if (file.isDirectory()) return sourceFiles(resolve(dir, file.name));
    return /\.[jt]sx?$/.test(file.name) ? [resolve(dir, file.name)] : [];
  }));
  return groups.flat().sort();
}
