import './style.css';
import { format } from './utils';

const app = document.querySelector<HTMLElement>('#app')!;
app.innerHTML = `<p class="eyebrow">01 / MODULE GRAPH</p><h1>从 HTML 追到模块图</h1>
<p id="message"></p><button id="load">加载编辑器</button><section id="editor">还没加载异步模块</section>
<p>打开 Network，过滤 JS。点击按钮前后对比；再比较 pnpm build 后的 dist。</p>`;
document.querySelector('#message')!.textContent = format('hello');
document.querySelector('#load')!.addEventListener('click', async () => {
  const editor = await import('./editor');
  editor.open(document.querySelector('#editor')!);
});
