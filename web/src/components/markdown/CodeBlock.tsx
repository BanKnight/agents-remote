import { type CSSProperties, useContext, useState } from "react";
import { Check, Copy } from "lucide-react";
import PrismLight from "react-syntax-highlighter/dist/esm/prism-light";
import { oneDark, oneLight } from "react-syntax-highlighter/dist/esm/styles/prism";
import { useT } from "../../i18n";
import { useTheme } from "../../theme";
import { ShellIcon } from "../shell/icons";
import { ImageLightbox } from "../ui/image-lightbox";
import { KNOWN_LANGUAGES } from "./prism-languages";
import { HtmlRenderContext } from "./markdown-components";

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

// 可「渲染」的代码块语言：svg → lightbox（dataUrl，<img> 呈现脚本不执行）；
// html/htm → HtmlRenderContext 回调（工作台 render tab，sandbox iframe）。
const RENDERABLE_LANGUAGES = new Set(["svg", "html", "htm"]);

export function CodeBlock({ code, language }: CodeBlockProps) {
  const { t } = useT();
  const { resolved } = useTheme();
  const [copied, setCopied] = useState(false);
  const [svgPreviewOpen, setSvgPreviewOpen] = useState(false);
  const onRenderHtml = useContext(HtmlRenderContext);
  const known = language !== undefined && KNOWN_LANGUAGES.has(language);
  const label = language ?? "text";
  const normalized = language?.toLowerCase() ?? "";
  const renderable = RENDERABLE_LANGUAGES.has(normalized);
  // html 渲染需要工作台动作（context）；无 Provider（如 Files md 预览）按钮隐藏。
  // svg 渲染本地可完成（dataUrl → lightbox），恒可用。
  const canRender = normalized === "svg" || (renderable && onRenderHtml != null);

  const onRender = () => {
    if (normalized === "svg") {
      setSvgPreviewOpen(true);
      return;
    }
    onRenderHtml?.(code);
  };

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
        <div className="pointer-events-auto flex items-center gap-0.5">
          {canRender ? (
            <button
              type="button"
              className="cursor-pointer rounded p-1 text-on-surface-muted transition hover:bg-surface-raised/40 hover:text-primary"
              aria-label={t("markdown.render")}
              title={t("markdown.render")}
              onClick={onRender}
            >
              <ShellIcon className="h-3 w-3" name="eye" />
            </button>
          ) : null}
          <button
            type="button"
            className="cursor-pointer rounded p-1 text-on-surface-muted transition hover:bg-surface-raised/40 hover:text-on-surface-soft"
            aria-label={copyLabel}
            title={copyLabel}
            onClick={onCopy}
          >
            {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
          </button>
        </div>
      </div>
      {known ? (
        <PrismLight
          language={language as string}
          style={resolved === "dark" ? oneDark : oneLight}
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
      {svgPreviewOpen ? (
        <ImageLightbox
          alt={label}
          src={`data:image/svg+xml;base64,${btoa(unescape(encodeURIComponent(code)))}`}
          onOpenChange={setSvgPreviewOpen}
        />
      ) : null}
    </div>
  );
}
