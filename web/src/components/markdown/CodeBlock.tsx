import { type CSSProperties, useContext, useEffect, useState } from "react";
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

// mermaid render 的图 id 全局唯一（同 id 复用会 throw），模块级计数器保证跨实例递增。
let mermaidRenderSeq = 0;

// 流式尾沿防抖：聊天流式时未闭合块逐 delta 增长，无防抖则每个 WS delta 都触发一次
// mermaid parse（大图高频渲染抖主线程）；停写 400ms 才尝试渲染，闭合后最后一帧出图。
const MERMAID_RENDER_DEBOUNCE_MS = 400;

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
  // mermaid 自动渲染（批 16 反馈③）：语言标记即出图，消费面一处生效全线（MarkdownString
  // 的 11 个消费方）。渲染器动态 import 拆独立 chunk（bundle 大，入口零增重）。
  const isMermaid = normalized === "mermaid";
  const [mermaidSvg, setMermaidSvg] = useState<string | null>(null);
  const [mermaidError, setMermaidError] = useState<string | null>(null);
  // html 渲染需要工作台动作（context）；无 Provider（如 Files md 预览）按钮隐藏。
  // svg 渲染本地可完成（dataUrl → lightbox），恒可用。
  const canRender = normalized === "svg" || (renderable && onRenderHtml != null);

  useEffect(() => {
    if (!isMermaid) return;
    // 已有旧图时滞留到新结果就绪再替换（流式增长中不闪回源码 pre）；「未完成 ≠ 失败」——
    // 防抖窗口内不写错误行，settle 后仍失败才降级错误行 + 源码 pre。
    let cancelled = false;
    const timer = window.setTimeout(() => {
      void (async () => {
        const id = `mmd-${++mermaidRenderSeq}`;
        try {
          const mermaid = (await import("mermaid")).default;
          // securityLevel "strict" = md 渲染沙箱语义（禁 htmlLabels / 图内脚本 / 点击导航，
          // secure 列表保护不可被 %%{init}%% 指令降级）；suppressErrorRendering 让错误
          // bomb 元素根本不创建（getElementById 清理降级为纯防御）。theme 随 data-theme
          // 切深浅。initialize 全局单例，但 render 期间持有 config scope，双块并发渲染的
          // 是同一当前主题，无分歧。
          mermaid.initialize({
            startOnLoad: false,
            securityLevel: "strict",
            suppressErrorRendering: true,
            theme: resolved === "dark" ? "dark" : "default",
          });
          const { svg } = await mermaid.render(id, code);
          if (!cancelled) {
            setMermaidSvg(svg);
            setMermaidError(null);
          }
        } catch (error) {
          // mermaid 失败时可能把错误 bomb 容器（#d<id>）遗留在 body——手动清掉
          document.getElementById(`d${id}`)?.remove();
          if (!cancelled) {
            setMermaidSvg(null);
            setMermaidError(error instanceof Error ? error.message : String(error));
          }
        }
      })();
    }, MERMAID_RENDER_DEBOUNCE_MS);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [code, isMermaid, resolved]);

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
      {isMermaid && mermaidSvg ? (
        // mermaid 输出的 svg 自带 max-width 内联样式，flex 居中 + 横向滚动兜超宽图；
        // padding 对齐同卡 pre 路径（pt 避让 header 浮层、px 对齐 0.875rem gutter）。
        <div
          className="flex justify-center overflow-x-auto px-3.5 pt-7 pb-3"
          dangerouslySetInnerHTML={{ __html: mermaidSvg }}
        />
      ) : (
        <>
          {isMermaid && mermaidError ? (
            <div className="px-3.5 pt-7 text-xs text-error">
              {t("markdown.mermaidError", { message: mermaidError })}
            </div>
          ) : null}
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
        </>
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
