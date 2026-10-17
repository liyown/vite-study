import { useState } from 'react';
export interface InitialData { message: string; serverEnvironment: string }

// App 是共享源码：不在模块顶层读取 window，也不把 Node 专用模块导入这里。
export default function App({ message, serverEnvironment }: InitialData) {
  const [count, setCount] = useState(0);
  return <><p className="eyebrow">08 / CLIENT + SSR</p><h1>同一组件，两份程序</h1>
    <section><p>{message}</p><p>HTML 来自 Environment：<strong>{serverEnvironment}</strong></p>
      <button onClick={() => setCount(n => n + 1)}>水合计数：{count}</button>
    </section><p>查看页面源代码能看到完整正文；禁用 JS 仍有内容，但按钮不能计数。</p></>;
}
