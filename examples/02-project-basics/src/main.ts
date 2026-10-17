import './style.css';
import styles from './card.module.css';
import logoUrl from './mark.svg';
import rawText from './note.txt?raw';
import { greeting } from '@/message';

document.querySelector<HTMLImageElement>('#logo')!.src = logoUrl;
document.querySelector('#greeting')!.textContent = greeting;
document.querySelector('#raw')!.textContent = rawText;
document.querySelector('main')!.classList.add(styles.card);
const publicFile = document.querySelector<HTMLAnchorElement>('#public-file')!;
publicFile.href = `${import.meta.env.BASE_URL}handbook.txt`;

// 编译时展开为一组具体的动态 import；模式必须是可静态分析的字面量。
const articles = import.meta.glob<string>('./articles/*.txt', { query: '?raw', import: 'default' });
for (const [file, load] of Object.entries(articles)) {
  const button = document.createElement('button');
  button.textContent = file.split('/').at(-1)!;
  button.onclick = async () => { document.querySelector('#article')!.textContent = await load(); };
  document.querySelector('#articles')!.append(button);
}

// Worker 是另一个执行上下文。构建时 Vite 会追踪这个 URL 并输出 Worker 文件。
const worker = new Worker(new URL('./sum.worker.ts', import.meta.url), { type: 'module' });
worker.onmessage = event => { document.querySelector('#result')!.textContent = String(event.data); };
document.querySelector('#compute')!.addEventListener('click', () => worker.postMessage(100));
