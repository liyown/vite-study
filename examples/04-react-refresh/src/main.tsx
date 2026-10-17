import { createRoot } from 'react-dom/client';
import Counter from './Counter';
import './style.css';

createRoot(document.getElementById('root')!).render(
  <main><p className="eyebrow">03 ↔ 04 / REACT REFRESH</p>
    <h1>JSX 转换与 Fast Refresh</h1><Counter />
    <p>打开 DevTools Network，查看 Counter.tsx 的实际响应源码。</p>
  </main>,
);
