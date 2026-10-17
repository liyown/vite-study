import { createHmac } from 'node:crypto';
import { createServerFn, InputError } from '#mini-start';
import { getSigningKey } from './private';
import { getRuntime } from './runtime';

// 共享导出仍会保留在客户端：不是把整个文件一刀切丢掉。
export const pageTitle = '同一源码，两个 bundle';
const greetingPrefix = '来自服务端的问候';

// 定义时不发请求。编译后只有 provider 保留此 handler；
// 页面导入的是 caller：SSR 本地查表，浏览器发送 HTTP。
export const getGreeting = createServerFn({ method: 'POST' })
  .validator((input: unknown) => {
    const name = (input as { name?: unknown } | null)?.name;
    if (typeof name !== 'string' || !name.trim() || name.length > 40) {
      throw new InputError('name 必须是 1–40 个字符的字符串');
    }
    return { name: name.trim() };
  })
  .handler(async ({ data }) => {
    const signature = createHmac('sha256', getSigningKey()).update(data.name).digest('hex').slice(0, 12);
    return { message: `${greetingPrefix}，${data.name}！`, runtime: getRuntime(), signature };
  });
