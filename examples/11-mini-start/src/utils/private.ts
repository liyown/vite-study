import { createServerOnlyFn } from '#mini-start';
// 这个函数没有 RPC 地址。浏览器版本会被替换成抛错函数。
export const getSigningKey = createServerOnlyFn(() => {
  return process.env.DEMO_SERVER_SECRET ?? 'SERVER_IMPLEMENTATION_ONLY_11';
});
