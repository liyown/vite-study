const assert = require('node:assert/strict');
const { add, callJs } = require('./addon.node');

// 1. JS → Rust → JS：调用 Rust 导出函数，取得 number。
console.log('[JS] 调用 Rust add');
const sum = add(2, 3);
assert.equal(sum, 5);
console.log('[JS] Rust 返回：', sum);

// 2. JS → Rust → JS 回调 → Rust → JS：函数引用与字符串跨越绑定层。
const suffix = '来自 JS 闭包';
console.log('[JS] 把回调函数传给 Rust');
const result = callJs('hello', text => {
  console.log('[JS callback] 收到 Rust 参数：', text);

  // JS 回调中还可以再次调用 Rust，同一进程内嵌套调用。
  const nestedSum = add(10, 20);
  return `${text.toUpperCase()} / ${suffix} / Rust 算出 ${nestedSum}`;
});
assert.equal(result, 'HELLO / 来自 JS 闭包 / Rust 算出 30');
console.log('[JS] 最终返回：', result);

// 3. 验证 JS 异常能够经过 Rust Result 返回到 JS，避免吞掉回调错误。
assert.throws(() => callJs('error', () => {
  throw new Error('回调失败示例');
}), /回调失败示例/);
console.log('[JS] 跨语言返回值与异常验证通过');
