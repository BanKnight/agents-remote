import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { MARKDOWN_COMPONENTS } from "./markdown-components";
import { MARKDOWN_CLASS } from "./markdown-styles";
import { parseMarkdownFrontmatter } from "./parse-frontmatter";
import { FrontmatterCard } from "./FrontmatterCard";

// 渲染原始 markdown 字符串（Agent tool_result、ExitPlanMode、AskUserQuestion preview、Files 预览、
// skill preview）。复用与聊天流相同的 class + components（pre → CodeBlock），保证代码块视觉一致。
// 文档开头的 YAML frontmatter 由 parseMarkdownFrontmatter 拆出，置顶渲染为 FrontmatterCard
// metadata 卡片 + 下方正文（避免 remark 把 `---` 当 <hr>、yaml 当正文段落）。
export function MarkdownString({ text }: { text: string }) {
  const { frontmatter, body } = parseMarkdownFrontmatter(text);
  return (
    <div className={MARKDOWN_CLASS}>
      {frontmatter ? <FrontmatterCard data={frontmatter} /> : null}
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={MARKDOWN_COMPONENTS}>
        {body}
      </ReactMarkdown>
    </div>
  );
}
