use napi::bindgen_prelude::*;
use napi_derive::napi;

// 方向一：JS 调用 Rust。宏负责生成 Node-API 导出与参数转换。
#[napi]
pub fn add(a: i32, b: i32) -> i32 {
    println!("[Rust] add({a}, {b})");
    a + b
}

// 方向二：Rust 调用传入的 JS 函数。String 参数与返回值跨绑定层转换。
// Rust 的 call_js 默认会以 callJs 名称导出给 JS。
#[napi]
pub fn call_js(input: String, callback: Function<'_, String, String>) -> Result<String> {
    println!("[Rust] 即将调用 JS 回调，参数：{input}");
    let result = callback.call(input)?;
    println!("[Rust] 收到 JS 回调返回值：{result}");
    Ok(result)
}
