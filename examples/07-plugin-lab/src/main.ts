import info from 'virtual:build-info';
import note from './lesson.note.md';
import { message } from './message.lesson';
import './style.css';

const app = document.querySelector('#app')!;
app.innerHTML = `<p class="eyebrow">07 / WRITE A PLUGIN</p><h1>沿着 Hook 走一遍</h1>
<pre id="info"></pre><p id="macro"></p><button id="counter">点击：0</button><pre id="note"></pre>
<p id="hmr" role="status">等待 note 文件变更</p><button id="api">请求开发中间件</button><pre id="response"></pre>`;
document.querySelector('#info')!.textContent = JSON.stringify(info, null, 2);
document.querySelector('#macro')!.textContent = message;
document.querySelector('#note')!.textContent = note;
let count = 0;
document.querySelector('#counter')!.addEventListener('click', e => { (e.currentTarget as HTMLElement).textContent = `点击：${++count}`; });
document.querySelector('#api')!.addEventListener('click', async () => {
  const output = document.querySelector('#response')!;
  if (import.meta.env.PROD) { output.textContent = 'configureServer 仅在 dev 中存在，生产需要真实 API。'; return; }
  try {
    const response = await fetch('/__study');
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    output.textContent = JSON.stringify(await response.json(), null, 2);
  } catch (error) { output.textContent = String(error); }
});
if (import.meta.hot) {
  import.meta.hot.accept('./lesson.note.md', updated => {
    if (updated) document.querySelector('#note')!.textContent = updated.default;
  });
  import.meta.hot.on('study:note-updated', ({ name }) => {
    document.querySelector('#hmr')!.textContent = `hotUpdate 收到文件：${name}`;
  });
}
