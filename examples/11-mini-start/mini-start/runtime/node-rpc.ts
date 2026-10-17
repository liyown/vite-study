/**
 * 【HTTP 运行阶段】浏览器代理发出的请求从这里进入。
 * 先跳过请求检查，直接看 try 中的三步：读 data → 按 ID 找函数 → 执行并返回。
 * 这里不会重新编译源码，也不会执行客户端上传的函数文本。
 */
import type { IncomingMessage, ServerResponse } from 'node:http';
import { registry } from 'virtual:mini-start/registry';
import { InputError } from './functions';
function send(res: ServerResponse, status: number, payload: unknown) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(payload));
}
export async function handleNodeRpc(req: IncomingMessage, res: ServerResponse) {
  // /_server/abc123 → abc123。注册表就是允许被 HTTP 调用的函数集合。
  const id = req.url?.split('?')[0].slice('/_server/'.length) ?? '';
  if (!Object.hasOwn(registry, id)) return send(res, 404, { ok: false, error: '未知服务端函数' });
  if (req.method !== 'POST') { res.setHeader('Allow', 'POST'); return send(res, 405, { ok: false, error: '仅支持 POST' }); }
  const origin = req.headers.origin;
  if (req.headers['x-mini-rpc'] !== '1' || req.headers['sec-fetch-site'] === 'cross-site' || (origin && origin !== `http://${req.headers.host}`)) {
    return send(res, 403, { ok: false, error: 'RPC 需要同源请求和 X-Mini-Rpc 请求头' });
  }
  if (!req.headers['content-type']?.startsWith('application/json')) return send(res, 415, { ok: false, error: '需要 application/json' });
  try {
    // ① HTTP 的字节流 → JSON 对象 { data: ... }。长度等检查不属于编译机制。
    let bytes = 0;
    const chunks: Buffer[] = [];
    for await (const chunk of req) {
      bytes += Buffer.byteLength(chunk);
      if (bytes <= 16 * 1024) chunks.push(Buffer.from(chunk));
    }
    if (bytes > 16 * 1024) return send(res, 413, { ok: false, error: '请求体超过 16 KiB' });
    let payload;
    try { payload = JSON.parse(Buffer.concat(chunks).toString('utf8')); }
    catch { return send(res, 400, { ok: false, error: 'JSON 格式错误' }); }
    // ② 找 provider 的提取入口。load 内的 import() 可对应构建后的动态 chunk。
    const fn = await registry[id].load();
    // ③ 提取入口 → __executeServer → validator → 用户写的 handler。
    const envelope = await fn({ data: payload?.data });
    // 浏览器代理读取 JSON，createServerFn 外壳再解出业务 result。
    send(res, 200, { ok: true, ...envelope });
  } catch (error) {
    if (error instanceof InputError) send(res, 400, { ok: false, error: error.message });
    else { console.error('[mini-start RPC]', error); send(res, 500, { ok: false, error: '服务端执行失败' }); }
  }
}
