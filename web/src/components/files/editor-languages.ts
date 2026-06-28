// CodeMirror 语言扩展按文件扩展名映射。
//
// 只覆盖常见编程语言（与已装的 @codemirror/lang-* 包对齐）；yaml/toml/bash/diff 等无对应语言包时
// 退化为纯文本编辑——编辑器聚焦代码文件，覆盖面不必与只读 CodeBlock 的 Prism 高亮完全一致。
// 语言包独立 ESM、tree-shakeable，不会像 PrismAsyncLight 那样触发全量语言 chunk
//（见 prism-languages.ts 的同类教训）。

import { css } from "@codemirror/lang-css";
import { go } from "@codemirror/lang-go";
import { html } from "@codemirror/lang-html";
import { javascript } from "@codemirror/lang-javascript";
import { json } from "@codemirror/lang-json";
import { markdown } from "@codemirror/lang-markdown";
import { python } from "@codemirror/lang-python";
import { rust } from "@codemirror/lang-rust";
import { sql } from "@codemirror/lang-sql";
import type { Extension } from "@uiw/react-codemirror";

const EXT_TO_EDITOR_LANG: Readonly<Record<string, () => Extension>> = {
  ts: () => javascript({ typescript: true }),
  tsx: () => javascript({ jsx: true, typescript: true }),
  mts: () => javascript({ typescript: true }),
  cts: () => javascript({ typescript: true }),
  js: () => javascript(),
  mjs: () => javascript(),
  cjs: () => javascript(),
  jsx: () => javascript({ jsx: true }),
  py: () => python(),
  css: () => css(),
  scss: () => css(),
  html: () => html(),
  htm: () => html(),
  xml: () => html(),
  svg: () => html(),
  json: () => json(),
  json5: () => json(),
  md: () => markdown(),
  markdown: () => markdown(),
  go: () => go(),
  rs: () => rust(),
  sql: () => sql(),
};

// 文件名 → CodeMirror 语言扩展数组；未知扩展名返回空数组（纯文本编辑）。
export function extToEditorLanguage(name: string): Extension[] {
  const dot = name.lastIndexOf(".");
  if (dot < 0) return [];
  const factory = EXT_TO_EDITOR_LANG[name.slice(dot + 1).toLowerCase()];
  return factory ? [factory()] : [];
}
