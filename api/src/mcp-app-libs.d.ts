/** 渲染库 dist 源码的 Bun text import 类型（`with { type: "text" }` 读文件文本;
 *  用于 MCP Apps 卡片模板构建期内联渲染库、零运行时外域,见 mcp-hub-server.ts 模板头注释）。 */
declare module "marked/marked.min.js" {
  const source: string;
  export default source;
}

declare module "dompurify/dist/purify.min.js" {
  const source: string;
  export default source;
}

declare module "mermaid/dist/mermaid.min.js" {
  const source: string;
  export default source;
}

// 画布卡 vendored 产物（src/assets/canvas/dist/，相对路径 import 的 ambient 声明
// 只能走单 * 通配；命名 *.bundle.* 由 assets/canvas/README.md 重建配方固定）。
declare module "*.bundle.css" {
  const source: string;
  export default source;
}

declare module "*.bundle.js" {
  const source: string;
  export default source;
}
