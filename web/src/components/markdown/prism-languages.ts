// Prism 语言注册 + 扩展名映射。
//
// 用 PrismLight（同步 light build）而非 PrismAsyncLight：后者通过 async-languages/prism.js
// 静态声明了 refractor 全部语言的动态 import，会让打包为每一种语言（cobol/abap/vim…）生成 chunk
// 并被 PWA precache 全量缓存。PrismLight 只依赖 refractor/core + 这里显式注册的语言，产物干净。
// 引擎隔离在 CodeBlock 内，未来切 Shiki 只需替换 CodeBlock，此文件不变。
// 直接走 ESM 路径（bundle-barrel-imports 约束）。

import { createElement, type CSSProperties, type ReactNode } from "react";
import { PrismLight } from "react-syntax-highlighter";
import { refractor } from "refractor/core";
import oneDark from "react-syntax-highlighter/dist/esm/styles/prism/one-dark";
import bash from "react-syntax-highlighter/dist/esm/languages/prism/bash";
import css from "react-syntax-highlighter/dist/esm/languages/prism/css";
import diff from "react-syntax-highlighter/dist/esm/languages/prism/diff";
import go from "react-syntax-highlighter/dist/esm/languages/prism/go";
import javascript from "react-syntax-highlighter/dist/esm/languages/prism/javascript";
import json from "react-syntax-highlighter/dist/esm/languages/prism/json";
import jsx from "react-syntax-highlighter/dist/esm/languages/prism/jsx";
import markdown from "react-syntax-highlighter/dist/esm/languages/prism/markdown";
import markup from "react-syntax-highlighter/dist/esm/languages/prism/markup";
import python from "react-syntax-highlighter/dist/esm/languages/prism/python";
import rust from "react-syntax-highlighter/dist/esm/languages/prism/rust";
import sql from "react-syntax-highlighter/dist/esm/languages/prism/sql";
import toml from "react-syntax-highlighter/dist/esm/languages/prism/toml";
import tsx from "react-syntax-highlighter/dist/esm/languages/prism/tsx";
import typescript from "react-syntax-highlighter/dist/esm/languages/prism/typescript";
import yaml from "react-syntax-highlighter/dist/esm/languages/prism/yaml";

// 每个语言定义注册一次。PrismLight.registerLanguage 的 name 参数会被忽略，refractor 按定义自身的
// name + aliases 识别（typescript→ts, javascript→js, markup→html/xml/svg 等），故别名无需重复注册。
type LangModule = Parameters<typeof PrismLight.registerLanguage>[1];
const REGISTRATIONS: ReadonlyArray<readonly [string, LangModule]> = [
  ["bash", bash],
  ["css", css],
  ["diff", diff],
  ["go", go],
  ["javascript", javascript],
  ["json", json],
  ["jsx", jsx],
  ["markdown", markdown],
  ["markup", markup],
  ["python", python],
  ["rust", rust],
  ["sql", sql],
  ["toml", toml],
  ["tsx", tsx],
  ["typescript", typescript],
  ["yaml", yaml],
];

for (const [name, module] of REGISTRATIONS) {
  PrismLight.registerLanguage(name, module);
}

// CodeBlock 用它判断是否走 Prism 高亮；未命中时降级为纯文本渲染，避免 Prism 对未知语言告警。
// 覆盖已注册定义的 name + refractor 识别的常见 aliases。
export const KNOWN_LANGUAGES: ReadonlySet<string> = new Set([
  "tsx",
  "typescript",
  "ts",
  "jsx",
  "javascript",
  "js",
  "python",
  "py",
  "bash",
  "sh",
  "shell",
  "json",
  "yaml",
  "yml",
  "toml",
  "css",
  "markup",
  "html",
  "xml",
  "svg",
  "go",
  "rust",
  "rs",
  "sql",
  "markdown",
  "md",
  "diff",
]);

// 文件扩展名 → Prism 语言 id。Files source 模式用它决定是否高亮。
const EXT_TO_LANG: Readonly<Record<string, string>> = {
  tsx: "tsx",
  ts: "typescript",
  mts: "typescript",
  cts: "typescript",
  jsx: "jsx",
  js: "javascript",
  mjs: "javascript",
  cjs: "javascript",
  py: "python",
  sh: "bash",
  bash: "bash",
  zsh: "bash",
  json: "json",
  json5: "json",
  yml: "yaml",
  yaml: "yaml",
  toml: "toml",
  css: "css",
  scss: "css",
  html: "html",
  htm: "html",
  xml: "xml",
  svg: "svg",
  go: "go",
  rs: "rust",
  sql: "sql",
  md: "markdown",
  diff: "diff",
  patch: "diff",
};

export function extToLang(name: string): string | undefined {
  const dot = name.lastIndexOf(".");
  if (dot < 0) return undefined;
  return EXT_TO_LANG[name.slice(dot + 1).toLowerCase()];
}

// ── diff/单行源码高亮（R7）─────────────────────────────────────────
// 复用 CodeBlock 同款 refractor（rsh PrismLight 共享 refractor/core 单例，上方 REGISTRATIONS
// 已注册全部语言）+ oneDark 主题。逐行 tokenize：diff 每行独立高亮，叠加在 diff 行级红绿背景上。
// oneDark key 形如 "keyword, regex"（纯 token 名）或 "code[class*=language-]"（全局选择器），
// 只取纯 token 名建 class→inline-style 表，运行时按 refractor 输出的 token class 查表着色。

type HastNode = {
  type: string;
  value?: string;
  properties?: { className?: unknown };
  children?: HastNode[];
};

const TOKEN_STYLE_BY_CLASS: ReadonlyMap<string, CSSProperties> = (() => {
  const map = new Map<string, CSSProperties>();
  for (const [selector, style] of Object.entries(oneDark)) {
    if (selector.includes("[") || selector.includes("::") || selector.includes(">")) continue;
    for (const name of selector.split(",")) {
      const trimmed = name.trim();
      if (trimmed && !trimmed.includes(":")) map.set(trimmed, style as CSSProperties);
    }
  }
  return map;
})();

function renderHastNode(node: HastNode, key: number): ReactNode {
  if (node.type === "text") return node.value ?? "";
  const className = (node.properties?.className ?? []) as unknown[];
  // refractor 输出 className = ['token', '<name>']；取 token 后的语义 class 查 oneDark。
  const tokenClass = className.find((c) => c !== "token") as string | undefined;
  const style = tokenClass ? TOKEN_STYLE_BY_CLASS.get(tokenClass) : undefined;
  const children = (node.children ?? []).map((child, i) => renderHastNode(child, i));
  return createElement("span", { key, style }, ...children);
}

/**
 * 单行源码语法高亮（diff content cell 用）。lang 未命中或 tokenize 失败时原样返回文本。
 * 跨行结构（块注释/多行模板串）逐行不延续状态，diff 片段以单行为主，已知取舍。
 */
export function highlightCodeLine(code: string, lang: string): ReactNode {
  try {
    const root = refractor.highlight(code, lang) as unknown as { children: HastNode[] };
    return root.children.map((child, i) => renderHastNode(child, i));
  } catch {
    return code;
  }
}
