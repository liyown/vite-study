import { resolve } from 'node:path';
import { createServer } from 'vite';
for (const name of ['03-react-bare', '04-react-refresh']) {
  const vite = await createServer({ root: resolve('examples', name), server: { middlewareMode: true, watch: null }, logLevel: 'error' });
  try {
    const result = await vite.transformRequest('/src/Counter.tsx');
    const code = result.code;
    console.log(`\n${name}`);
    console.log({ jsxWasTransformed: !code.includes('<section>'), hasRefreshInstrumentation: /\$RefreshReg\$|registerExportsForReactRefresh/.test(code) });
    console.log(code.slice(0, 1100));
  } finally { await vite.close(); }
}
