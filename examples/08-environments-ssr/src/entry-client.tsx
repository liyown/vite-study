import { hydrateRoot } from 'react-dom/client';
import info from 'virtual:build-info';
import App, { type InitialData } from './App';
import './style.css';

// 水合的第一遍渲染必须使用服务器的同一份数据。
const data = JSON.parse(document.getElementById('initial-data')!.textContent!) as InitialData;
hydrateRoot(document.getElementById('root')!, <App {...data} />);
document.getElementById('client-env')!.textContent = info.environment;
console.log('[client module]', info);
