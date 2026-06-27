import { MarkdownTextPrimitive } from "@assistant-ui/react-markdown";
import remarkGfm from "remark-gfm";
import { MARKDOWN_COMPONENTS } from "./markdown-components";
import { MARKDOWN_CLASS } from "./markdown-styles";

// 聊天流 assistant message parts 渲染入口。assistant-ui 的 MarkdownTextPrimitive 走同一套
// components（pre → CodeBlock）与 class，与 MarkdownString 视觉一致。
export function MarkdownText() {
  return (
    <MarkdownTextPrimitive
      remarkPlugins={[remarkGfm]}
      className={MARKDOWN_CLASS}
      components={MARKDOWN_COMPONENTS}
    />
  );
}
