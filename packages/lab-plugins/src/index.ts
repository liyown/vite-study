import { readFile } from 'node:fs/promises';
import { relative } from 'node:path';
import MagicString from 'magic-string';
import { normalizePath, type Plugin } from 'vite';

// 01：只观察 src 下模块，避免依赖预构建淹没日志。
export function traceHooks(): Plugin {
  let root = '';
  return {
    name: 'study:trace-hooks',
    enforce: 'pre',
    config(_, env) { console.log('[trace:config]', env.command, env.mode); },
    configResolved(config) { root = normalizePath(config.root); },
    resolveId(source) {
      if (source.startsWith('./')) console.log(`[trace:resolve:${this.environment.name}]`, source);
      return null; // 继续交给后续插件解析；这里没有接管模块。
    },
    transform(code, id) {
      if (normalizePath(id).startsWith(`${root}/src/`)) {
        console.log(`[trace:transform:${this.environment.name}]`, relative(root, id), code.length);
      }
      return null;
    },
  };
}

// 02：磁盘上不存在这个模块，每个 Environment 获得各自的值。
export function virtualBuildInfo(): Plugin {
  const publicId = 'virtual:build-info';
  const resolvedId = '\0' + publicId;
  let command = ''; let mode = '';
  return {
    name: 'study:virtual-build-info',
    configResolved(config) { command = config.command; mode = config.mode; },
    resolveId(source) { return source === publicId ? resolvedId : null; },
    load(id) {
      if (id !== resolvedId) return null;
      return `export default ${JSON.stringify({ environment: this.environment.name, command, mode })}`;
    },
  };
}

// 03：把自定义文本格式变为 JS 模块。JSON.stringify 防止引号/反引号破坏 JS。
export function noteLoader(): Plugin {
  return {
    name: 'study:note-loader',
    enforce: 'pre',
    async load(id) {
      const file = id.split('?')[0];
      if (!file.endsWith('.note.md')) return null;
      this.addWatchFile(file);
      return `export default ${JSON.stringify(await readFile(file, 'utf8'))}`;
    },
    hotUpdate({ file }) {
      if (this.environment.name === 'client' && file.endsWith('.note.md')) {
        this.environment.hot.send({ type: 'custom', event: 'study:note-updated', data: { name: file.split('/').pop() } });
      }
      // 不返回 []，让 Vite 继续执行正常的模块更新传播。
    },
  };
}

// 04：一个范围刻意受限的词法宏实验。通用语义改写应使用 AST。
export function lessonMacro(): Plugin {
  return {
    name: 'study:lesson-macro',
    enforce: 'pre',
    transform(code, id) {
      if (!id.split('?')[0].endsWith('.lesson.ts')) return null;
      const output = new MagicString(code);
      for (const match of code.matchAll(/\b__LESSON_WORD__\b/g)) {
        output.overwrite(match.index!, match.index! + match[0].length, JSON.stringify('这句话由 transform Hook 生成'));
      }
      if (!output.hasChanged()) return null;
      return { code: output.toString(), map: output.generateMap({ hires: true, source: id, includeContent: true }) };
    },
  };
}

// 05：HTML Hook 与开发中间件。configureServer 不会进入生产产物。
export function htmlAndDevApi(): Plugin {
  return {
    name: 'study:html-and-dev-api',
    transformIndexHtml() {
      return [{ tag: 'meta', attrs: { name: 'study-plugin', content: 'html-hook-was-here' }, injectTo: 'head' }];
    },
    configureServer(server) {
      server.middlewares.use('/__study', (_req, res) => {
        res.setHeader('Content-Type', 'application/json; charset=utf-8');
        res.end(JSON.stringify({ source: 'configureServer', environments: Object.keys(server.environments) }));
      });
    },
  };
}

// 06：按 Environment 独立收集状态，防止 client/ssr 的模块混在一起。
export function bundleReport(): Plugin {
  const modules = new Map<object, Set<string>>();
  let root = '';
  return {
    name: 'study:bundle-report',
    configResolved(config) { root = config.root; },
    perEnvironmentStartEndDuringDev: true,
    buildStart() { modules.set(this.environment, new Set()); },
    transform(_code, id) {
      if (!id.includes('node_modules') && !id.startsWith('\0')) {
        modules.get(this.environment)?.add(normalizePath(relative(root, id.split('?')[0])));
      }
      return null;
    },
    generateBundle(_options, bundle) {
      const chunks = Object.values(bundle).filter(item => item.type === 'chunk').map(item => ({
        file: item.fileName, entry: item.isEntry, dynamic: item.isDynamicEntry,
        imports: item.imports, dynamicImports: item.dynamicImports,
      }));
      this.emitFile({
        type: 'asset', fileName: 'study-report.json', source: JSON.stringify({
          environment: this.environment.name, modules: [...(modules.get(this.environment) ?? [])].sort(), chunks,
        }, null, 2)
      });
    },
  };
}
