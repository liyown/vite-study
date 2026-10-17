import { useState, type FormEvent } from 'react';
import { createFileRoute } from '#mini-start/router';
import { getGreeting, pageTitle } from '../utils/greeting.functions';
import { getRuntime } from '../utils/runtime';
import { getSigningKey } from '../utils/private';

// 首次页面请求：entry-server 调 loader，本机执行 getGreeting/getRuntime。
// 浏览器水合直接使用注入的 loader 数据，不在这里再发一次请求。
export const Route = createFileRoute('/')({
  loader: async () => ({ greeting: await getGreeting({ data: { name: '首次 SSR' } }), runtime: getRuntime() }),
  component: HomePage,
});
function HomePage() {
  const initial = Route.useLoaderData();
  const [name, setName] = useState('浏览器同学');
  const [result, setResult] = useState(initial.greeting);
  const [localRuntime, setLocalRuntime] = useState('尚未在浏览器调用');
  const [privateResult, setPrivateResult] = useState('尚未尝试');
  const [error, setError] = useState('');
  const [pending, setPending] = useState(false);
  async function submit(event: FormEvent) {
    event.preventDefault(); setPending(true); setError('');
    // 同一个导入，在 client 编译中已变成 HTTP 代理。
    try { setResult(await getGreeting({ data: { name } })); }
    catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)); }
    finally { setPending(false); }
  }
  return <>
    <p className="eyebrow">11 / MINI START COMPILER</p>
    <h1>{pageTitle}</h1>
    <p>同一个 import：SSR 本地调用，浏览器经 HTTP 调用。双端函数则各用各的实现。</p>
    <section>
      <h2>1. 双端函数：createIsomorphicFn</h2>
      <p>SSR loader 的执行结果：<code id="ssr-runtime">{initial.runtime}</code></p>
      <button onClick={() => setLocalRuntime(getRuntime())}>在浏览器本地执行</button>
      <output id="client-runtime">{localRuntime}</output>
      <p>点击后没有 RPC 请求，浏览器编译的是 .client() 实现。</p>
    </section>
    <section>
      <h2>2. 服务端函数：createServerFn</h2>
      <form onSubmit={submit}>
        <label htmlFor="name">问候谁</label>
        <input id="name" value={name} maxLength={40} onChange={event => setName(event.target.value)} required />
        <button disabled={pending}>{pending ? '等待服务器…' : '从浏览器调用服务端函数'}</button>
      </form>
      <p role="alert" className="error">{error}</p>
      <pre id="rpc-result" aria-live="polite">{JSON.stringify(result, null, 2)}</pre>
      <p>首次结果来自 SSR 的本地调用；提交后打开 Network 查看 <code>/_server/…</code>。</p>
    </section>
    <section>
      <h2>3. 服务端专属函数：createServerOnlyFn</h2>
      <button onClick={() => {
        try { getSigningKey(); setPrivateResult('意外执行'); }
        catch (cause) { setPrivateResult(cause instanceof Error ? cause.message : String(cause)); }
      }}>尝试在浏览器调用</button>
      <pre id="private-result" aria-live="polite">{privateResult}</pre>
      <p>它没有 RPC 接口，浏览器版本只会抛错；真正实现只留在服务器。</p>
    </section>
  </>;
}
