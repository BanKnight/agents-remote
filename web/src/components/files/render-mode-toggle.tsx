import { useT } from "../../i18n";

/**
 * md/html 预览「渲染/源码」分段 toggle（03q3:13-15,51 `.mseg` 原型单源；2026-10-01
 * reviewer 补审抽取——此前桌面 FilePreviewPanel / 移动 MobileL3FilePreview 两处逐字
 * 复制非单源，on 态 bg-primary/10 还绕开了 segmented-thumb 语义 token）。容器 24px 高
 * bg-elevated3 无描边轨、段 11.5px、on 态 bg-segmented-thumb + text-on-surface 600；
 * 渲染段在前（原型 :51）。位置（桌面 grid 居中 / 移动 meta 行靠右）由调用方 className
 * 注入。触屏默认扩热区（touch:after 伪元素，frontend-notes §7 点击区口径）。
 */
export function RenderModeToggle({
  mode,
  onChange,
  className,
}: {
  mode: "source" | "render";
  onChange: (mode: "source" | "render") => void;
  /** 调用方语境定位（桌面 justify-self-center / 移动 ml-auto）。 */
  className?: string;
}) {
  const { t } = useT();
  return (
    <div
      className={`inline-flex h-6 shrink-0 items-center rounded-lg bg-elevated3 p-0.5 ${className ?? ""}`}
      role="group"
    >
      {(["render", "source"] as const).map((m) => (
        <button
          key={m}
          className={`relative flex h-full cursor-pointer items-center rounded-md px-2.5 text-[11.5px] leading-none transition ${
            mode === m
              ? "bg-segmented-thumb font-semibold text-on-surface"
              : "text-on-surface-muted hover:text-on-surface"
          } touch:after:absolute touch:after:inset-x-0 touch:after:-inset-y-1.5 touch:after:content-['']`}
          type="button"
          onClick={() => onChange(m)}
        >
          {m === "source" ? t("files.sourceMode") : t("files.renderMode")}
        </button>
      ))}
    </div>
  );
}
