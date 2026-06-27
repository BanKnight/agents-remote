import type { Components } from "react-markdown";
import { CodeBlock } from "./CodeBlock";

// react-markdown / assistant-ui 共用的 components override。
//
// pre override 是两条管线的统一点：从 hast AST 提取 code 文本 + 语言标记，
// 一律渲染 <CodeBlock>，使聊天流气泡、tool_result、ExitPlanMode、AskUserQuestion preview
// 与 Files 预览的代码块视觉完全一致。table/th/td 保持与原聊天流一致的紧凑表格样式。

type HastNode = {
  type?: string;
  value?: string;
  tagName?: string;
  properties?: { className?: unknown };
  children?: HastNode[];
};

function collectText(node: HastNode): string {
  if (node.type === "text") return node.value ?? "";
  if (node.children) return node.children.map(collectText).join("");
  return "";
}

function extractCodeBlock(
  node: HastNode | undefined,
): { code: string; language: string | undefined } | null {
  if (!node?.children) return null;
  const codeNode = node.children.find((child) => child.tagName === "code");
  if (!codeNode) return null;
  const className = codeNode.properties?.className;
  const classes = Array.isArray(className) ? className : [className];
  const language = classes
    .find((c): c is string => typeof c === "string" && c.startsWith("language-"))
    ?.replace("language-", "");
  return { code: collectText(codeNode), language };
}

export const MARKDOWN_COMPONENTS: Components = {
  table: ({ children }) => (
    <div className="my-2 overflow-x-auto rounded-lg border border-slate-700/50">
      <table className="w-full border-collapse text-xs">{children}</table>
    </div>
  ),
  th: ({ children }) => (
    <th className="border border-slate-600 bg-slate-800/50 px-2 py-1 text-left font-medium text-slate-300">
      {children}
    </th>
  ),
  td: ({ children }) => (
    <td className="border border-slate-600 px-2 py-1 text-slate-300">{children}</td>
  ),
  pre: ({ children, node }) => {
    const extracted = extractCodeBlock(node as unknown as HastNode | undefined);
    if (!extracted) return <pre>{children}</pre>;
    return <CodeBlock code={extracted.code} language={extracted.language} />;
  },
};
