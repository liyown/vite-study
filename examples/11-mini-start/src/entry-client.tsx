import { hydrateRoot } from 'react-dom/client';
import { RouterProvider } from '#mini-start/router';
import { Root } from './routes/__root';
import { getRouter } from './router';
import './style.css';
const router = getRouter();
const Page = router.route.component;
// HTML 已包含服务端算好的数据。水合沿用它，避免首屏两端内容不一致。
const data = JSON.parse(document.getElementById('loader-data')!.textContent!);
hydrateRoot(document.getElementById('root')!, <RouterProvider data={data}><Root><Page /></Root></RouterProvider>);
