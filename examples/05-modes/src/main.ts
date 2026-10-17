import './style.css';
const observed = {
  configMode: __CONFIG_MODE__,
  MODE: import.meta.env.MODE,
  DEV: import.meta.env.DEV,
  PROD: import.meta.env.PROD,
  SSR: import.meta.env.SSR,
  label: import.meta.env.VITE_LABEL,
  apiBase: import.meta.env.VITE_API_BASE,
  featureRaw: import.meta.env.VITE_FEATURE,
  featureEnabled: import.meta.env.VITE_FEATURE === 'true',
  secret: import.meta.env.SERVER_SECRET ?? '未暴露给浏览器',
};
document.querySelector('#app')!.innerHTML = `<p class="eyebrow">05 / MODE ≠ ENVIRONMENT</p>
<h1>mode 选择配置，Environment 选择运行目标</h1><pre id="values"></pre>
<p>分别执行 dev、dev:staging、build:staging，再比较这些值。</p>`;
document.querySelector('#values')!.textContent = JSON.stringify(observed, null, 2);
