declare module 'virtual:build-info' {
  const info: { environment: string; command: string; mode: string };
  export default info;
}
declare module '*.note.md' { const text: string; export default text; }
declare const __LESSON_WORD__: string;
declare const __CONFIG_MODE__: string;
