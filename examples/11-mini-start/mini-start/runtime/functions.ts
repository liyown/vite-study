/**
 * 【运行阶段】编译器生成的代码会调用本文件。
 * 泛型 Input/Output 只帮助 TS 检查；理解流程时先看 handler 的函数体。
 */
export type CallOptions<Input> = { data: Input; signal?: AbortSignal };
// result/error 是协议外壳；业务调用方最后拿到的只有 Output。
export type RpcResult<Output> = { result: Output } | { error: string };
export type RpcFn<Input, Output> = ((options: CallOptions<Input>) => Promise<RpcResult<Output>>) & { id?: string };
export type ServerFn<Input, Output> = ((options: CallOptions<Input>) => Promise<Output>) & {
  id?: string;
  __executeServer?: (options: CallOptions<Input>) => Promise<RpcResult<Output>>;
};
type Handler<Input, Output> = (context: { data: Input }) => Output | Promise<Output>;
export class InputError extends Error {}

class ServerFnBuilder<Input = undefined> {
  constructor(private validate: (input: unknown) => Input = input => input as Input) {}

  // .validator(fn) 现在只保存校验规则，等 provider 真正执行时才校验输入。
  validator<Next>(validate: (input: unknown) => Next) {
    return new ServerFnBuilder(validate);
  }
  inputValidator<Next>(validate: (input: unknown) => Next) {
    return this.validator(validate);
  }

  // 第一行描述用户写的 API；第二行描述编译器生成的 provider 调用形式。
  handler<Output>(handler: Handler<Input, Output>): ServerFn<Input, Output>;
  handler<Output>(extracted: RpcFn<Input, Output>, handler: Handler<Input, Output>): ServerFn<Input, Output>;
  handler<Output>(first: Handler<Input, Output> | RpcFn<Input, Output>, implementation?: Handler<Input, Output>): ServerFn<Input, Output> {
    // 编译后，first 始终是 RPC 入口：client HTTP / SSR 本地代理 / provider 提取入口。
    // 只有 provider 还传入第二个参数 implementation，也就是真正的业务 handler。
    const extracted = first as RpcFn<Input, Output>;

    // 对外调用的函数：getGreeting({data}) → 当前 RPC 入口 → 解开 result 外壳。
    const fn = async (options: CallOptions<Input>) => {
      const reply = await extracted(options);
      if ('error' in reply) throw new Error(reply.error);
      return reply.result;
    };

    // provider 的 extracted 会反过来调用这个属性；这才进入真实业务实现。
    // caller 没有 implementation，所以不会在浏览器意外执行服务端函数体。
    const executeServer = implementation
      ? async (options: CallOptions<Input>) => {
          const data = this.validate(options?.data);
          return { result: await implementation({ data }) };
        }
      : undefined;

    return Object.assign(fn, { id: extracted.id, __executeServer: executeServer });
  }
}

// createServerFn 本身先创建 builder，并不意味着定义时已经发送 HTTP。
export function createServerFn(options: { method: 'POST' } = { method: 'POST' }) {
  if (options.method !== 'POST') throw new Error('本实验的 RPC 只实现 POST');
  return new ServerFnBuilder();
}

// 下面两个 API 在业务代码中的调用会被替换；正常流程不会执行这个双端 builder。
export function createIsomorphicFn() {
  return {
    server<Fn extends (...args: never[]) => unknown>(_server: Fn) {
      return {
        client<Client extends (...args: never[]) => ReturnType<Fn>>(_client: Client): Fn {
          throw new Error('createIsomorphicFn 必须由 miniStart 插件编译');
        },
      };
    },
  };
}

// 服务器编译留下 fn；浏览器编译会整段替换成抛错函数，不会只靠这个 return 隔离。
export function createServerOnlyFn<Fn extends (...args: never[]) => unknown>(fn: Fn): Fn {
  return fn;
}
