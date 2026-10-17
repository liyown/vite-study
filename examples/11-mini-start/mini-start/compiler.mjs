/**
 * 【编译阶段】这个文件在 Node 中运行，浏览器不会执行这里的 Babel 代码。
 *
 * 从 compileModule 开始读即可：
 *   原始代码 → AST → 按目标改写三个 API → 清理无用依赖 → 新代码
 *
 * 本例有两个 Environment，却有三种编译角色：
 *   client   = 浏览器调用者：函数变为 HTTP 代理
 *   ssr      = 服务器调用者：函数变为本地查表代理
 *   provider = 服务器实现者：保留真正函数体，提供可被查表调用的入口
 * provider 是服务器图中的另一种模块身份，不是第三个 Environment。
 */
import { createHash } from 'node:crypto';
import { relative } from 'node:path';
import { parse } from '@babel/parser';
import traverseModule from '@babel/traverse';
import generateModule from '@babel/generator';
import * as t from '@babel/types';

// 兼容这些 Babel 包的 CommonJS/ESM 导出形式，与双端编译原理无关。
const traverse = traverseModule.default ?? traverseModule;
const generate = generateModule.default ?? generateModule;

const RPC_RUNTIME = {
  client: { name: 'createClientRpc', module: 'virtual:mini-start/client' },
  ssr: { name: 'createSsrRpc', module: 'virtual:mini-start/ssr-rpc' },
  provider: { name: 'createServerRpc', module: 'virtual:mini-start/server-rpc' },
};

/**
 * 入口：Vite 的 transform 把某个模块交给这里。
 * 输入 code/file 是同一份业务源码，mode 决定输出哪一种实现。
 * 返回新代码给 Vite；这里不会运行 getGreeting，也不会启动 HTTP。
 */
export function compileModule(code, file, root, mode) {
  const ast = parseModule(code, file);
  const { program, originallyReferenced } = inspectOriginalBindings(ast);
  const runtime = RPC_RUNTIME[mode];
  const context = {
    ast, file, root, mode,
    // 生成不与用户代码重名的局部变量，如 _createClientRpc。
    rpcIdentifier: program.scope.generateUidIdentifier(runtime.name),
    guardIdentifier: program.scope.generateUidIdentifier('serverOnlyGuard'),
    functions: [],
    needsRpc: false,
    needsGuard: false,
    changed: false,
  };

  // Babel 会访问代码里的声明/调用；只处理确实来自 #mini-start 的 API。
  traverse(ast, {
    VariableDeclarator(path) {
      const expression = readCallChain(path.node.init);
      if (!expression) return;
      const factory = getImportedFactory(path, expression.root);

      if (factory === 'createServerFn') {
        rewriteServerFunction(path, expression, context);
      } else if (factory === 'createIsomorphicFn') {
        rewriteIsomorphicFunction(path, expression, context);
      }
    },
    CallExpression(path) {
      if (!t.isIdentifier(path.node.callee)) return;
      if (getImportedFactory(path, path.node.callee.name) === 'createServerOnlyFn') {
        rewriteServerOnlyFunction(path, context);
      }
    },
  });
  if (!context.changed) return null;

  // 同一文件里的 pageTitle 等共享导出留在 caller；provider 只公开提取入口。
  if (mode === 'provider' && context.functions.length) {
    keepOnlyProviderExports(ast, context.functions);
  }

  // handler 被拿掉后，node:crypto 等 import 可能再无人使用，应一起拿掉。
  removeUnusedBindings(program, originallyReferenced);
  addRuntimeImports(context, runtime);

  // AST 再变回文本，继续交给 Vite/Oxc/Rolldown 转译与打包。
  const output = generate(ast, { comments: false, sourceMaps: false }, code).code;
  return { code: output, map: makeSafeSourceMap(output, file, mode), functions: context.functions };
}

// ── 三条改写规则：先看这里，再按需看下面的 AST 小工具 ──

function rewriteServerFunction(path, expression, context) {
  const { mode, rpcIdentifier } = context;
  const fn = describeServerFunction(path, expression, context.file, context.root);
  const handlerCall = expression.steps.at(-1).node;
  if (handlerCall.arguments.length !== 1) {
    throw new Error(`${context.file}: 原始 handler 必须只有一个函数参数`);
  }
  context.functions.push(fn);

  if (mode === 'provider') {
    // 原来：getGreeting = createServerFn().handler(原始函数)
    // 改成：const extracted = createServerRpc(meta, opts => getGreeting.__executeServer(opts))
    //       getGreeting = createServerFn().handler(extracted, 原始函数)
    // 这里的 arrow 只是创建闭包，稍后收到调用时才访问 getGreeting。
    const extractedDeclaration = makeProviderDeclaration(fn, context);
    context.ast.program.body.unshift(extractedDeclaration);
    handlerCall.arguments = [t.identifier(fn.functionName), handlerCall.arguments[0]];
  } else {
    // client：.handler(原始函数) → .handler(createClientRpc(ID))
    // ssr：   .handler(原始函数) → .handler(createSsrRpc(ID))
    // 注意只替换参数，createServerFn().handler(...) 外壳继续负责解包结果。
    handlerCall.arguments = [t.callExpression(rpcIdentifier, [t.stringLiteral(fn.id)])];
    if (mode === 'client') {
      // 浏览器不需要执行服务端输入校验；provider 仍会校验所有外部输入。
      handlerCall.callee.object = stripValidatorCalls(handlerCall.callee.object);
    }
  }
  context.needsRpc = true;
  context.changed = true;
}

function rewriteIsomorphicFunction(path, expression, context) {
  // createIsomorphicFn().server(fnA).client(fnB) → 当前端的 fnA 或 fnB。
  // 这是直接选择函数表达式，不产生函数 ID、不调用 RPC。
  const branchName = context.mode === 'client' ? 'client' : 'server';
  const branch = expression.steps.find(step => step.name === branchName);
  if (!branch || branch.node.arguments.length !== 1 || !t.isExpression(branch.node.arguments[0])) {
    throw new Error(`${context.file}: 双端函数需要 .server(fn).client(fn)`);
  }
  path.get('init').replaceWith(t.cloneNode(branch.node.arguments[0], true));
  context.changed = true;
}

function rewriteServerOnlyFunction(path, context) {
  const originalFunction = path.node.arguments[0];
  if (!t.isExpression(originalFunction)) {
    throw new Error(`${context.file}: createServerOnlyFn 需要函数参数`);
  }
  if (context.mode === 'client') {
    // 浏览器只得到“被调用时抛错”的函数，原函数体已删除，不是请求服务器。
    const fileName = relative(context.root, context.file);
    path.replaceWith(t.callExpression(context.guardIdentifier, [t.stringLiteral(fileName)]));
    context.needsGuard = true;
  } else {
    // 服务器端直接留下原函数：createServerOnlyFn(fn) → fn。
    path.replaceWith(t.cloneNode(originalFunction, true));
  }
  context.changed = true;
  path.skip();
}

// ── 函数发现：只登记身份，用于生成注册表，不执行函数 ──

export function discoverFunctions(code, file, root) {
  const functions = [];
  traverse(parseModule(code, file), {
    VariableDeclarator(path) {
      const expression = readCallChain(path.node.init);
      if (!expression || getImportedFactory(path, expression.root) !== 'createServerFn') return;
      functions.push(describeServerFunction(path, expression, file, root));
    },
  });
  return functions;
}

function describeServerFunction(path, expression, file, root) {
  const exportedDeclaration = path.parentPath.parentPath.isExportNamedDeclaration();
  const simpleName = t.isIdentifier(path.node.id);
  const endsWithHandler = expression.steps.at(-1)?.name === 'handler';
  if (!exportedDeclaration || !simpleName || !endsWithHandler) {
    throw new Error(`${file}: createServerFn 必须直接赋给 export const，并以 .handler(...) 结束`);
  }
  const exportName = path.node.id.name;
  const functionName = exportName + '_createServerFn_handler';
  const relativeFile = relative(root, file).replaceAll('\\', '/');
  // 两端独立算出相同 ID，才能把“浏览器代理”与“服务器实现”配对。
  // 不包含函数体：只改返回文案时，ID 不变。
  const id = createHash('sha256').update(relativeFile + '#' + functionName).digest('hex').slice(0, 16);
  return { id, file, exportName, functionName };
}

// ── AST 小工具：初读时可跳过，理解原理后再逐行看 ──

function parseModule(code, file) {
  return parse(code, { sourceType: 'module', sourceFilename: file, plugins: ['typescript', 'jsx'] });
}

// Babel 的 Node 是语法数据；NodePath 还提供父节点、作用域和 replaceWith 等操作。
// 链式调用读成 root 名字和 steps；每步包含 name（如 'handler'）与对应的调用节点 node。
function readCallChain(node) {
  if (!t.isCallExpression(node)) return null;
  if (t.isIdentifier(node.callee)) return { root: node.callee.name, steps: [] };
  if (!t.isMemberExpression(node.callee) || node.callee.computed || !t.isIdentifier(node.callee.property)) return null;
  const base = readCallChain(node.callee.object);
  return base && { ...base, steps: [...base.steps, { name: node.callee.property.name, node }] };
}

function getImportedFactory(path, localName) {
  // 看 binding 可以识别 import 别名，也能避开用户自定义的同名普通函数。
  const binding = path.scope.getBinding(localName);
  if (!binding?.path.isImportSpecifier() || binding.path.parent.source.value !== '#mini-start') return null;
  return binding.path.node.imported.name;
}

function inspectOriginalBindings(ast) {
  let program;
  const originallyReferenced = new Set();
  traverse(ast, { Program(path) {
    program = path;
    for (const [name, binding] of Object.entries(path.scope.bindings)) {
      if (binding.referenced) originallyReferenced.add(name);
    }
  } });
  return { program, originallyReferenced };
}

function stripValidatorCalls(node) {
  if (!t.isCallExpression(node) || !t.isMemberExpression(node.callee)) return node;
  const method = node.callee.property;
  if (t.isIdentifier(method) && ['validator', 'inputValidator'].includes(method.name)) {
    return stripValidatorCalls(node.callee.object);
  }
  node.callee.object = stripValidatorCalls(node.callee.object);
  return node;
}

function makeProviderDeclaration(fn, context) {
  // 下面每个 t.xxx 都在造语法节点，不是在调用 createServerRpc。
  const meta = t.objectExpression([
    t.objectProperty(t.identifier('id'), t.stringLiteral(fn.id)),
    t.objectProperty(t.identifier('name'), t.stringLiteral(fn.exportName)),
    t.objectProperty(t.identifier('filename'), t.stringLiteral(relative(context.root, context.file))),
  ]);
  // opts => getGreeting.__executeServer(opts)
  const executeServer = t.memberExpression(t.identifier(fn.exportName), t.identifier('__executeServer'));
  const delegate = t.arrowFunctionExpression(
    [t.identifier('opts')],
    t.callExpression(executeServer, [t.identifier('opts')]),
  );
  // const getGreeting_createServerFn_handler = createServerRpc(meta, delegate)
  const extracted = t.callExpression(context.rpcIdentifier, [meta, delegate]);
  return t.variableDeclaration('const', [t.variableDeclarator(t.identifier(fn.functionName), extracted)]);
}

function keepOnlyProviderExports(ast, functions) {
  ast.program.body = ast.program.body.flatMap(node => {
    if (t.isExportNamedDeclaration(node)) return node.declaration ? [node.declaration] : [];
    if (t.isExportDefaultDeclaration(node)) return [];
    return [node];
  });
  const exports = functions.map(fn => t.exportSpecifier(t.identifier(fn.functionName), t.identifier(fn.functionName)));
  ast.program.body.push(t.exportNamedDeclaration(null, exports));
}

function removeUnusedBindings(program, originallyReferenced) {
  // 原来 handler → helper → import；删 handler 后，可能要多轮才能清完这条依赖链。
  // 只清理本来被引用、现在不被引用的绑定，保留顶层副作用和共享导出。
  for (let again = true; again;) {
    again = false;
    program.scope.crawl();
    for (const [name, binding] of Object.entries(program.scope.bindings)) {
      if (!originallyReferenced.has(name) || binding.referenced) continue;
      const path = binding.path;
      if (!path.node || path.removed) continue;
      if (path.isImportSpecifier() || path.isImportDefaultSpecifier() || path.isImportNamespaceSpecifier()) {
        const declaration = path.parentPath;
        path.remove();
        if (declaration.node && !declaration.node.specifiers.length) declaration.remove();
        again = true;
      } else if (path.isFunctionDeclaration() && !path.parentPath.isExportNamedDeclaration()) {
        path.remove();
        again = true;
      } else if (path.isVariableDeclarator() && !path.parentPath.parentPath.isExportNamedDeclaration() && (!path.node.init || path.get('init').isPure())) {
        const declaration = path.parentPath;
        path.remove();
        if (declaration.node && !declaration.node.declarations.length) declaration.remove();
        again = true;
      }
    }
  }
}

function addRuntimeImports(context, runtime) {
  if (!context.needsRpc && !context.needsGuard) return;
  const imports = [];
  if (context.needsRpc) imports.push(t.importSpecifier(context.rpcIdentifier, t.identifier(runtime.name)));
  if (context.needsGuard) imports.push(t.importSpecifier(context.guardIdentifier, t.identifier('serverOnlyGuard')));
  context.ast.program.body.unshift(t.importDeclaration(imports, t.stringLiteral(runtime.module)));
}

function makeSafeSourceMap(code, file, mode) {
  // .map 也会被浏览器下载。必须映射到生成后的代码，不能把原 handler 填进 sourcesContent。
  return {
    version: 3,
    sources: [file + '?mini-start-' + mode],
    sourcesContent: [code],
    names: [],
    mappings: code.split('\n').map((_, line) => line === 0 ? 'AAAA' : 'AACA').join(';'),
  };
}
