import { registry } from 'virtual:mini-start/registry';
import type { CallOptions, RpcFn, RpcResult } from './functions';

/** 【服务器调用者】和浏览器共用 ID，但在本机找实现，不发 HTTP。 */
export function createSsrRpc<Input, Output>(id: string): RpcFn<Input, Output> {
  const callLocally = async (options: CallOptions<Input>) => {
    // registry 是 plugin.load 生成的模块；load() 内部动态 import provider。
    const extracted = await registry[id].load();
    return await extracted(options) as RpcResult<Output>;
  };
  return Object.assign(callLocally, { id });
}
