export function format(text: string) { return `Vite says: ${text.toUpperCase()}`; }
// 没有副作用且没有被使用，构建时应该被 tree shaking 移除。
export function unused() { return 'UNUSED_TREE_SHAKING_MARKER'; }
