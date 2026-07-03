import { type CSSProperties, useState } from "react";
import { Check, Copy } from "lucide-react";
import { PrismLight } from "react-syntax-highlighter";
import { oneDark } from "react-syntax-highlighter/dist/esm/styles/prism";
import { useT } from "../../i18n";
import { KNOWN_LANGUAGES } from "./prism-languages";

// 代码块统一容器：Prism 高亮 + 顶部语言标签 + hover 复制按钮 + 横向滚动。
// 高亮引擎隔离在此组件内；聊天流与 Files 预览两条管线都汇聚到这里，视觉完全一致。
//
// 未注册语言（或无语言）时降级为纯文本 <pre>，避免 Prism 对未知语言告警，同时保留标签与复制能力。

const PRE_STYLE: CSSProperties = {
  margin: 0,
  background: "transparent",
  padding: "1.75rem 0.875rem 0.75rem",
  fontSize: "0.75rem",
  lineHeight: 1.6,
  overflowX: "auto",
};

const CODE_STYLE: CSSProperties = {
  background: "transparent",
  padding: 0,
  fontFamily: "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace",
};

const COPY_RESET_MS = 1500;

export type CodeBlockProps = {
  code: string;
  language: string | undefined;
};

export function CodeBlock({ code, language }: CodeBlockProps) {
  const { t } = useT();
  const [copied, setCopied] = useState(false);
  const known = language !== undefined && KNOWN_LANGUAGES.has(language);
  const label = language ?? "text";

  const onCopy = () => {
    void navigator.clipboard.writeText(code).then(
      () => {
        setCopied(true);
        window.setTimeout(() => setCopied(false), COPY_RESET_MS);
      },
      () => {
        // clipboard 不可用（非安全上下文）时静默
      },
    );
  };

  const copyLabel = copied ? t("markdown.copied") : t("markdown.copy");

  return (
    <div className="group/code relative my-3 overflow-hidden rounded-lg border border-neutral-line/40 bg-surface-inset/80">
      <div className="pointer-events-none absolute inset-x-0 top-0 z-10 flex items-center justify-between px-2.5 py-1.5">
        <span className="text-[0.55rem] font-medium uppercase tracking-wider text-on-surface-muted">
          {label}
        </span>
        <button
          type="button"
          className="pointer-events-auto cursor-pointer rounded p-1 text-on-surface-muted transition hover:bg-surface-raised/40 hover:text-on-surface-soft"
          aria-label={copyLabel}
          title={copyLabel}
          onClick={onCopy}
        >
          {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
        </button>
      </div>
      {known ? (
        <PrismLight
          language={language as string}
          style={oneDark}
          customStyle={PRE_STYLE}
          codeTagProps={{ style: CODE_STYLE }}
        >
          {code}
        </PrismLight>
      ) : (
        <pre style={PRE_STYLE}>
          <code style={CODE_STYLE}>{code}</code>
        </pre>
      )}
    </div>
  );
}
