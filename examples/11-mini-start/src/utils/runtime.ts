import { platform } from 'node:os';
import { createIsomorphicFn } from '#mini-start';
// 同一声明变成两种实现；调用它不会发 RPC。
export const getRuntime = createIsomorphicFn()
  .server(() => `server:${platform()}`)
  .client(() => 'client:browser');
