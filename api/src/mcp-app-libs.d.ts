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
