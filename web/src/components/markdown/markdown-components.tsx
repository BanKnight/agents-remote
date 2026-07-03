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

// 判断 markdown 链接是否为外部域名 → 决定是否 target="_blank" 新标签打开。
// currentHostname 默认渲染时取 window.location.hostname（部署无关，自动适配当前访问域名）；
// 作为参数暴露便于单测注入，避免依赖 DOM。
export function isExternalLink(
  href: string | undefined,
  currentHostname: string = typeof window !== "undefined" ? window.location.hostname : "",
): boolean {
  if (!href) return false;
  let url: URL;
  try {
    // 用 currentHostname 构造 base，使相对路径解析与 hostname 比对同源（测试/运行时一致）。
    url = new URL(href, `https://${currentHostname}`);
  } catch {
    return false;
  }
  // 仅 http(s) 外部链接新标签；mailto/tel/相对路径/anchor/同源都保持本页。
  if (url.protocol !== "http:" && url.protocol !== "https:") return false;
  // 用 hostname（不含端口），避免同站不同端口被误判为外部。
  return url.hostname !== currentHostname;
}

export const MARKDOWN_COMPONENTS: Components = {
  a: ({ href, children, node: _node, ...rest }) => {
    if (isExternalLink(href)) {
      return (
        <a href={href} target="_blank" rel="noopener noreferrer" {...rest}>
          {children}
        </a>
      );
    }
    return (
      <a href={href} {...rest}>
        {children}
      </a>
    );
  },
  table: ({ children }) => (
    <div className="my-2 overflow-x-auto rounded-lg border border-neutral-line/50">
      <table className="w-full border-collapse text-xs">{children}</table>
    </div>
  ),
  th: ({ children }) => (
    <th className="border border-neutral-line bg-surface/50 px-2 py-1 text-left font-medium text-on-surface-soft">
      {children}
    </th>
  ),
  td: ({ children }) => (
    <td className="border border-neutral-line px-2 py-1 text-on-surface-soft">{children}</td>
  ),
  pre: ({ children, node }) => {
    const extracted = extractCodeBlock(node as unknown as HastNode | undefined);
    if (!extracted) return <pre>{children}</pre>;
    return <CodeBlock code={extracted.code} language={extracted.language} />;
  },
};
