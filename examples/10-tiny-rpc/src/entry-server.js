import { registry } from 'virtual:rpc-registry';

// 收到 POST /rpc/greet，下面就是“根据 ID 找函数”的完整过程。
export async function handleRpc(req, res) {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  const id = req.url.split('?')[0].slice('/rpc/'.length); // 得到 greet
  if (!Object.hasOwn(registry, id)) return res.writeHead(404).end('{"error":"函数不存在"}');
  if (req.method !== 'POST') return res.writeHead(405).end('{"error":"需要 POST"}');
  try {
    let body = '';
    for await (const chunk of req) body += chunk;
    const { name } = JSON.parse(body);          // 1. 从请求取参数
    const fn = await registry[id]();            // 2. import 模块，拿到 default 函数
    const result = await fn(name);              // 3. 真正执行 greet(name)
    res.end(JSON.stringify({ result }));        // 4. 结果交回浏览器
  } catch (error) {
    res.writeHead(400).end(JSON.stringify({ error: error.message }));
  }
}
