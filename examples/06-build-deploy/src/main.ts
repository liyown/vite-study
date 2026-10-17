import { describe } from './shared';
import './style.css';
document.querySelector('#shared')!.textContent = describe('首页');
document.querySelector('#load')!.addEventListener('click', async () => {
  const { message } = await import('./lazy');
  document.querySelector('output')!.textContent = message;
});
