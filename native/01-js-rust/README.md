# 最小 JS ↔ Rust 原生调用

这个补充实验用两个 Rust 函数演示双向调用：JS 调用 add；JS 把函数引用传给 callJs，由 Rust 调用它、拿到结果并返回给 JS。回调里还会再次调用 Rust add。

## 一条命令运行

在 vite-study 根目录：

```bash
pnpm native:demo
```

本机需要 Node、Rust/Cargo 和原生链接工具。首次编译需要从 crates.io 下载依赖；Cargo.lock 固定解析版本。本次验证环境是 macOS、Node 24.22.0、Rust/Cargo 1.94.1。

只运行已编译的示例、不重新编译：

```bash
node native/01-js-rust/index.cjs
```

只构建：`pnpm --dir native/01-js-rust build`。本例没有额外 npm 依赖，也没有接入原先七节的 pnpm workspace build，因此原有 Vite 检查不要求安装 Rust。

## 先读这两个文件

1. [src/lib.rs](src/lib.rs)：两个 Rust 导出函数。
2. [index.cjs](index.cjs)：加载原生模块、传入 JS 回调、验证返回值与错误。

构建只需 [Cargo.toml](Cargo.toml)、[build.rs](build.rs) 和薄薄一层 [build.mjs](build.mjs)：Cargo 编译 cdylib，脚本将本机动态库复制为 addon.node。

```text
src/lib.rs + napi / napi-derive
    ↓ cargo build
本机原生动态库
    ↓ 复制为 addon.node
Node require('./addon.node')
    ↓
JS 获得 add / callJs 两个可调用函数
```

`#[napi]` 宏生成 Node-API 绑定与类型转换；`napi_build::setup()` 配置平台所需构建选项。`.node` 是加载到 Node 进程中的原生库，运行时没有启动一个独立 Rust 程序。

## 第一段：JS 调用 Rust

Rust：

```rust
#[napi]
pub fn add(a: i32, b: i32) -> i32 {
    println!("[Rust] add({a}, {b})");
    a + b
}
```

JS：

```js
const { add } = require('./addon.node');
console.log(add(2, 3)); // 5
```

JS number 通过绑定变为 Rust i32，返回的 i32 又变回 JS number。这里用小整数演示，不涉及大整数与溢出策略。

## 第二段：Rust 调用 JS

Rust 接收 `Function<'_, String, String>`：参数是 String、返回值也是 String 的 JS 函数引用。

```rust
let result = callback.call(input)?;
```

JS 传入的是真实函数，可以使用它创建时的闭包变量：

```js
const suffix = '来自 JS 闭包';
const result = callJs('hello', text => {
  const nestedSum = add(10, 20);
  return `${text.toUpperCase()} / ${suffix} / Rust 算出 ${nestedSum}`;
});
```

这一段的执行顺序：

```text
JS callJs('hello', callback)
  → Rust call_js
    → callback.call('hello')
      → JS 回调执行，读取 suffix
        → Rust add(10, 20) 返回 30
      ← JS 回调返回字符串
    ← Rust 获取字符串，返回 Ok(result)
  ← JS 获得最终字符串
```

没有把函数转成 JSON，也没有把 JS 源码编译成 Rust。函数引用与参数由 Node-API/napi-rs 适配。Rust 的 call_js 默认导出名称为 JS 的 callJs。

## 预期日志

```text
[JS] 调用 Rust add
[Rust] add(2, 3)
[JS] Rust 返回： 5
[JS] 把回调函数传给 Rust
[Rust] 即将调用 JS 回调，参数：hello
[JS callback] 收到 Rust 参数： hello
[Rust] add(10, 20)
[Rust] 收到 JS 回调返回值：HELLO / 来自 JS 闭包 / Rust 算出 30
[JS] 最终返回： HELLO / 来自 JS 闭包 / Rust 算出 30
[Rust] 即将调用 JS 回调，参数：error
[JS] 跨语言返回值与异常验证通过
```

最后还验证了异常路径：JS 回调抛错后，Rust 的 `?` 经 Result 传播错误，JS 外层能够捕获，不会打印 Rust 的“收到返回值”日志。

## 与 Rolldown 的对应关系

本例先演示最小的同线程同步回调，使用 `Function`，回调返回值是字符串。Rolldown 需要从异步/工作线程触发 JS Hook 时，会使用之前讲到的 `ThreadsafeFunction` 并调度回 JS 运行时，还要处理 Promise、插件 this 上下文和结构化返回值。这个同步例子没有声称实现了完整的跨线程插件系统。

下一步可以将字符串回调扩展为 transform(code, id)，再加入 ThreadsafeFunction；先确认这个小例子的调用栈和返回路径。

参考：[napi-rs Function](https://napi.rs/docs/concepts/function)、[手动配置原生扩展](https://napi.rs/docs/introduction/manual-setup)。
