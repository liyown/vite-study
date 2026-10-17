import { useState } from 'react';

// 实验时只改下面的标题，保持组件导出与 Hook 顺序不变。
export default function Counter() {
  const [count, setCount] = useState(0);
  return <section><h2>计数器实验</h2>
    <button onClick={() => setCount(n => n + 1)}>计数：{count}</button>
    <p>先点到 3，再修改 Counter.tsx 中的标题，观察状态是否保留。</p>
  </section>;
}
