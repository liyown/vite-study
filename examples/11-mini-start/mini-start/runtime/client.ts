import type { RpcFn } from './functions';

/** 【浏览器】输入函数 ID，返回一个函数；调用返回的函数时才发送 HTTP。 */
export function createClientRpc<Input, Output>(id: string): RpcFn<Input, Output> {
  const callOverHttp = async ({ data, signal }: { data: Input; signal?: AbortSignal }) => {
    // 只传 ID 与业务参数。真正的函数体没有被发送，也没有在浏览器中执行。
    const response = await fetch(`/_server/${id}`, {
      method: 'POST',
      credentials: 'same-origin',
      signal,
      headers: { 'Content-Type': 'application/json', 'X-Mini-Rpc': '1' },
      body: JSON.stringify({ data }),
    });
    const payload = await response.json();
    if (!response.ok || !payload.ok) throw new Error(payload.error ?? `RPC HTTP ${response.status}`);
    // functions.ts 中的 handler 外壳会再取出 .result，交给页面业务代码。
    return { result: payload.result };
  };
  return Object.assign(callOverHttp, { id });
}

// 这是另一个改写规则的运行时：serverOnly 不是 RPC，调用时直接报错。
export function serverOnlyGuard(file: string) {
  return (..._args: unknown[]): never => {
    throw new Error(`服务端专属函数不能在浏览器执行：${file}`);
  };
}
