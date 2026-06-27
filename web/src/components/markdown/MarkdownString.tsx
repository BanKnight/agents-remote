import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { MARKDOWN_COMPONENTS } from "./markdown-components";
import { MARKDOWN_CLASS } from "./markdown-styles";

// 渲染原始 markdown 字符串（Agent tool_result、ExitPlanMode、AskUserQuestion preview、Files 预览）。
// 复用与聊天流相同的 class + components（pre → CodeBlock），保证代码块视觉一致。
export function MarkdownString({ text }: { text: string }) {
  return (
    <div className={MARKDOWN_CLASS}>
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={MARKDOWN_COMPONENTS}>
        {text}
      </ReactMarkdown>
    </div>
  );
}
