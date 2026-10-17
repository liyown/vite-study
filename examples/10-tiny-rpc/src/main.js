import greet from './greet.server.js';

// 看似直接调用 greet；浏览器拿到的其实是插件生成的 fetch 函数。
const form = document.querySelector('form');
const output = document.querySelector('output');
form.addEventListener('submit', async event => {
  event.preventDefault();
  output.textContent = '等待服务器…';
  try {
    output.textContent = await greet(new FormData(form).get('name'));
  } catch (error) {
    output.textContent = error.message;
  }
});
