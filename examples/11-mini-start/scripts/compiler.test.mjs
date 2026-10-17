import test from 'node:test';
import assert from 'node:assert/strict';
import { compileModule, discoverFunctions } from '../mini-start/compiler.mjs';
const file = '/app/src/functions.ts';
const source = `
import {createServerFn as serverFn} from '#mini-start';
import {secret} from './private';
export const label = 'shared';
const prefix = secret;
export const greet = serverFn({method:'POST'}).validator(x => x).handler(async ({data}) => prefix + data.name);
`;
test('同一 AST → client/SSR caller/provider，ID 一致，保留共享导出并移除私有依赖链', () => {
  const entries = discoverFunctions(source, file, '/app');
  const client = compileModule(source, file, '/app', 'client');
  const ssr = compileModule(source, file, '/app', 'ssr');
  const provider = compileModule(source, file, '/app', 'provider');
  for (const output of [client, ssr, provider]) assert.equal(output.functions[0].id, entries[0].id);
  assert.match(client.code, /createClientRpc/);
  assert.match(ssr.code, /createSsrRpc/);
  for (const output of [client, ssr]) {
    assert.match(output.code, /export const label = 'shared'/);
    assert.doesNotMatch(output.code, /private|secret|prefix|data.name/);
    assert.equal(output.map.sourcesContent[0], output.code);
  }
  assert.match(provider.code, /data.name/);
  assert.match(provider.code, /validator/);
  assert.match(provider.code, /handler\(greet_createServerFn_handler,/);
  assert.match(provider.code, /createServerRpc/);
  assert.match(client.code, /serverFn\([\s\S]*\)\.handler/);
  assert.doesNotMatch(client.code, /validator/);
  assert.match(ssr.code, /validator/);
});
test('双端函数只留下当前分支，serverOnly 在客户端只留下抛错代理', () => {
  const code = `import {createIsomorphicFn,createServerOnlyFn} from '#mini-start';
import {platform} from 'node:os';
export const runtime = createIsomorphicFn().server(() => platform()).client(() => 'browser');
export const privateFn = createServerOnlyFn(() => process.env.SECRET_MARKER);`;
  const client = compileModule(code, file, '/app', 'client').code;
  const server = compileModule(code, file, '/app', 'ssr').code;
  assert.doesNotMatch(client, /node:os|platform|SECRET_MARKER/);
  assert.match(client, /browser/); assert.match(client, /serverOnlyGuard/);
  assert.match(server, /node:os/); assert.match(server, /SECRET_MARKER/);
  assert.doesNotMatch(server, /browser|createIsomorphicFn|createServerOnlyFn/);
});
test('作用域里的同名普通函数不误编译；ID 不依赖 handler 内容', () => {
  assert.equal(compileModule(`const createServerFn = () => ({handler: x => x}); const x = createServerFn().handler(() => 1);`, file, '/app', 'client'), null);
  const first = discoverFunctions(source, file, '/app')[0].id;
  assert.equal(discoverFunctions(source.replace('data.name', 'data.other'), file, '/app')[0].id, first);
  assert.notEqual(discoverFunctions(source.replace('export const greet', 'export const other'), file, '/app')[0].id, first);
});
