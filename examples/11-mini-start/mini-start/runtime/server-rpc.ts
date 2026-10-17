import type { RpcFn, RpcResult, CallOptions } from './functions';

/**
 * 【服务器实现者】给编译器造出的提取入口附加 ID 等信息。
 * execute 通常是 opts => getGreeting.__executeServer(opts)。
 * 这个函数本身没有 HTTP，也没有在创建时执行 handler；调用时才进入 execute。
 */
export function createServerRpc<Input, Output>(
  meta: { id: string; name: string; filename: string },
  execute: (options: CallOptions<Input>) => Promise<RpcResult<Output>>,
): RpcFn<Input, Output> {
  return Object.assign(execute, { id: meta.id, serverFnMeta: meta });
}
