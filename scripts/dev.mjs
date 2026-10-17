import { spawn } from 'node:child_process';
const names = ["01-vanilla", "02-project-basics", "03-react-bare", "04-react-refresh", "05-modes", "06-build-deploy", "07-plugin-lab", "08-environments-ssr", "09-fullstack-api", "10-tiny-rpc", "11-mini-start"];
const number = Number(process.argv[2] ?? 1);
if (!Number.isInteger(number) || !names[number - 1]) {
  console.error('用法：pnpm dev 01（01 到 11）'); process.exit(1);
}
const child = spawn('pnpm', ['--filter', `@vite-study/${names[number - 1]}`, 'dev'], { stdio: 'inherit' });
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => child.kill(signal));
child.on('exit', code => process.exit(code ?? 0));
