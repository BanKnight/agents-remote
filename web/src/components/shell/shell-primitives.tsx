import type { AgentProvider, AgentSession, TerminalSession } from "@agents-remote/shared";
import {
  type ButtonHTMLAttributes,
  type ComponentProps,
  type PointerEvent,
  type ReactNode,
  useEffect,
  useRef,
  useState,
} from "react";

import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { ShellIcon } from "./icons";

/**
 * Shell surface/tone role layer. Values reference DESIGN tokens
 * (docs/design/DESIGN.md, Google DESIGN.md format) via Tailwind v4 @theme inline
 * utilities — surface-* / on-surface-* / neutral-line / primary / secondary /
 * success / warning / error. `shellSurfaceClasses` and the `*ToneClasses` map
 * to DESIGN.md component variants (surface-*, nav-item-*, button-*, chip-*,
 * selected-row, focus-ring). See its Colors 对照表 and Components 节.
 */
export type ShellTone = "default" | "accent" | "success" | "warning" | "danger" | "muted";

const markerToneClasses: Record<ShellTone, string> = {
  default: "border-neutral-line bg-surface-raised text-on-surface-soft",
  accent: "border-primary/30 bg-primary/10 text-primary",
  success: "border-success/30 bg-success/10 text-success",
  warning: "border-warning/30 bg-warning/10 text-warning",
  danger: "border-error/30 bg-error/10 text-error",
  muted: "border-neutral-line bg-surface-inset/80 text-on-surface-muted",
};

export const pillToneClasses: Record<ShellTone, string> = {
  default: "border-neutral-line bg-surface-inset/80 text-on-surface",
  accent: "border-primary/20 bg-primary/10 text-primary",
  success: "border-success/20 bg-success/10 text-success",
  warning: "border-warning/20 bg-warning/10 text-warning",
  danger: "border-error/30 bg-error/10 text-error",
  muted: "border-neutral-line bg-surface-inset/70 text-on-surface-soft",
};

const buttonToneClasses: Record<ShellTone, string> = {
  default: "border-neutral-line bg-surface-raised text-on-surface hover:bg-surface-raised/80",
  accent:
    "border-transparent bg-gradient-to-br from-primary to-secondary text-on-primary shadow-lg shadow-primary/25 hover:brightness-110",
  success:
    "border-success/40 bg-success/10 text-success hover:border-success/70 hover:bg-success/15",
  warning:
    "border-warning/40 bg-warning/10 text-warning hover:border-warning/70 hover:bg-warning/15",
  danger: "border-error/40 bg-error/10 text-error hover:border-error/70 hover:bg-error/15",
  muted:
    "border-neutral-line bg-surface-inset/60 text-on-surface-muted hover:bg-surface-inset/80 hover:border-on-surface-muted",
};

export const shellSurfaceClasses = {
  shell: "bg-surface/20",
  sidebar: "bg-gradient-to-b from-surface-raised/25 to-surface-base/30",
  workspace: "border border-neutral-line bg-surface-raised/15",
  header: "border border-neutral-line bg-surface-inset/20",
  floatingHeader: "sm:border sm:border-neutral-line sm:bg-surface-inset/20",
  runtimeHeader: "border-b border-neutral-line/80",
  runtimeBody: "bg-surface-inset/15",
  runtimeComposer: "border-t border-neutral-line/80",
  terminalTitlebar: "border-b border-neutral-line/45 bg-surface-raised/25",
  raised: "border border-neutral-line/40 bg-surface-raised/25",
  raisedHover: "hover:border-primary/60 hover:bg-surface-raised/40",
  dashed: "border border-dashed border-neutral-line/70 bg-surface-raised/20",
  inset: "border border-neutral-line/35 bg-surface-inset/10",
  code: "border border-neutral-line/45",
  danger: "border border-error/25 bg-error/10",
  warning: "border border-warning/25 bg-warning/10",
};

type IconMarkerProps = {
  children: ReactNode;
  size?: "sm" | "md" | "lg";
  tone?: ShellTone;
};

const markerSizeClasses: Record<NonNullable<IconMarkerProps["size"]>, string> = {
  sm: "h-7 w-7 rounded-sm text-[0.65rem]",
  md: "h-10 w-10 rounded-lg text-xs",
  // card 头像式：36px，rounded-md 在 @theme inline 覆写下 = 10px = DESIGN md 档（与 md marker 的 rounded-lg 14px 区分）
  lg: "h-9 w-9 rounded-md text-xs",
};

export function IconMarker({ children, size = "md", tone = "default" }: IconMarkerProps) {
  return (
    <span
      aria-hidden="true"
      className={`inline-flex shrink-0 items-center justify-center border font-semibold uppercase ${markerSizeClasses[size]} ${markerToneClasses[tone]}`}
    >
      {children}
    </span>
  );
}

type NavItemContentProps = {
  active?: boolean;
  description?: ReactNode;
  interactive?: boolean;
  label: ReactNode;
  marker: ReactNode;
  meta?: ReactNode;
  orientation?: "horizontal" | "vertical";
};

export function NavItemContent({
  active = false,
  description,
  interactive = false,
  label,
  marker,
  meta,
  orientation = "horizontal",
}: NavItemContentProps) {
  const layoutClass =
    orientation === "vertical"
      ? "grid justify-items-center gap-1 py-1.5 text-center"
      : "flex items-center gap-2.5 px-2 py-1.5 text-left";
  const stateClass =
    orientation === "vertical"
      ? active
        ? "text-primary"
        : interactive
          ? "text-on-surface-muted hover:text-on-surface"
          : "text-on-surface-muted"
      : active
        ? "bg-primary/10 text-primary"
        : interactive
          ? "text-on-surface-muted hover:bg-on-surface/5 hover:text-on-surface"
          : "text-on-surface-muted";
  const shapeClass = orientation === "vertical" ? "" : "rounded-md";
  const interactionClass = interactive ? "cursor-pointer" : "";

  return (
    <span
      className={`w-full min-w-0 transition ${layoutClass} ${stateClass} ${shapeClass} ${interactionClass}`}
    >
      {marker}
      <span className="min-w-0 flex-1">
        <span className="block truncate text-xs font-bold sm:text-sm">{label}</span>
        {description ? (
          <span className="mt-0.5 block truncate text-xs text-on-surface-muted">{description}</span>
        ) : null}
      </span>
      {meta}
    </span>
  );
}

type ShellSectionLabelProps = {
  children: ReactNode;
  className?: string;
};

/** 分组小标题（DESIGN Label-caps：700/0.6rem/uppercase/tracking-0.12em）。typography 固定，
 *  padding 由调用方按所在容器对齐（左栏 px-2 / 中栏 px-3 / 父容器控）。 */
export function ShellSectionLabel({ children, className }: ShellSectionLabelProps) {
  return (
    <p
      className={`text-[0.6rem] font-bold uppercase tracking-[0.12em] text-on-surface-muted ${className ?? ""}`}
    >
      {children}
    </p>
  );
}

type StatusPillProps = {
  label?: string;
  tone?: ShellTone;
  value: ReactNode;
};

export function StatusPill({ label, tone = "default", value }: StatusPillProps) {
  return (
    <Badge
      className={`h-auto max-w-full flex-col rounded-full px-2.5 py-1.5 ${pillToneClasses[tone]}`}
      variant="outline"
    >
      {label ? (
        <span className="text-[0.6rem] uppercase tracking-[0.12em] text-on-surface-muted">
          {label}
        </span>
      ) : null}
      <span className="truncate text-xs font-semibold capitalize">{value}</span>
    </Badge>
  );
}

/**
 * 状态枚举 → StatusPill tone（DESIGN status-pill 四态映射）。running→success、
 * idle→warning（等待输入）、error→danger、其余（closed 等）→muted。与 StatusPill 配套：
 * tone 决定药丸配色，label 由调用方用 sessionStatusLabel + t 生成（i18n 不进本层）。
 */
export function statusToTone(
  status: AgentSession["status"] | TerminalSession["status"],
): ShellTone {
  if (status === "running") return "success";
  if (status === "idle") return "warning";
  if (status === "error") return "danger";
  return "muted";
}

const statusDotToneBg: Record<ShellTone, string> = {
  default: "bg-on-surface-muted",
  accent: "bg-primary",
  success: "bg-success",
  warning: "bg-warning",
  danger: "bg-error",
  muted: "bg-on-surface-muted",
};

const STATUS_DOT_SIZE_CLASS = "h-2 w-2";

type StatusDotProps = {
  className?: string;
  label: string;
  pulse?: boolean;
  tone: ShellTone;
};

/**
 * 状态小圆点 indicator（设计文档 §10）：纯色圆点 + aria-label 承载文字（不显示），
 * 替代 InstanceCard 等位置原带背景文字 badge（StatusPill）的「纯状态指示」用法——形态更轻。
 * tone 由 statusToTone 映射（running→success/idle→warning/error→danger/其余→muted）；
 * pulse 用于 running/活跃强调（脉动）。StatusPill 保留给需要可见文字 label 的场景。
 * `className` 由 StatusMarker 叠加到 marker 右上角时传入（absolute 定位 + ring 描边）。
 */
export function StatusDot({ className, label, pulse = false, tone }: StatusDotProps) {
  return (
    <span
      aria-label={label}
      className={`inline-block shrink-0 rounded-full ${STATUS_DOT_SIZE_CLASS} ${statusDotToneBg[tone]}${
        pulse ? " animate-pulse" : ""
      }${className ? ` ${className}` : ""}`}
      role="img"
    />
  );
}

type StatusMarkerProps = {
  marker: ReactNode;
  status?: { label: string; tone: ShellTone; pulse?: boolean };
};

/**
 * marker + 状态圆点叠加层（设计文档 §10）：把 StatusDot 作为 badge 叠加到 marker（IconMarker）
 * 右上角（`-right-1 -top-1`），ring 描边与所在 surface 融合（视觉挖空）。跨位置统一 InstanceCard /
 * split header / table 类型列的「marker + 状态」呈现——圆点不再独立占位，精简密度。`status` 缺省时
 * 仅渲染 marker（无圆点）。`pulse` 默认 `tone === "success"`（running 脉动），调用方显式覆盖。
 */
export function StatusMarker({ marker, status }: StatusMarkerProps) {
  return (
    <span className="relative inline-flex shrink-0">
      {marker}
      {status ? (
        <StatusDot
          className="absolute -right-1 -top-1 ring-2 ring-surface-raised"
          label={status.label}
          pulse={status.pulse ?? status.tone === "success"}
          tone={status.tone}
        />
      ) : null}
    </span>
  );
}

type ActionButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  tone?: ShellTone;
};

type ActionButtonClassOptions = {
  className?: string;
  tone?: ShellTone;
};

export function actionButtonClasses({
  className = "",
  tone = "default",
}: ActionButtonClassOptions = {}) {
  return `inline-flex h-auto cursor-pointer items-center justify-center rounded-xl border px-3 py-1.5 text-xs font-bold transition ${buttonToneClasses[tone]} ${className}`;
}

type ResizeGutterProps = {
  edge: "left" | "right";
  onResize: (deltaRem: number) => void;
};

/**
 * 通用 resize 分隔条 primitive（贴容器某侧边缘，全高 absolute）。pointer-event 拖拽：
 * 增量式（每次 move 算 deltaX / rootFontSize → deltaRem → onResize），上层 clamp 到 MIN/MAX。
 * setPointerCapture 锁定指针，拖拽时即使滑出容器仍持续。edge="right" 贴右边缘（向右拖
 * deltaRem 正 = 增宽左侧容器）；edge="left" 贴左边缘（向左拖增宽，翻转 deltaRem）。与
 * workbench-shell `ColumnResizeGutter` 同源 pointer 逻辑，edge 语义面向容器内侧边缘。
 */
export function ResizeGutter({ edge, onResize }: ResizeGutterProps) {
  const dragRef = useRef<{ lastX: number; rootFont: number } | null>(null);

  const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    const rootFont = parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
    dragRef.current = { lastX: event.clientX, rootFont };
    void event.currentTarget.setPointerCapture(event.pointerId);
  };
  const onPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag) return;
    const delta = event.clientX - drag.lastX;
    drag.lastX = event.clientX;
    const deltaRem = delta / drag.rootFont;
    onResize(edge === "right" ? deltaRem : -deltaRem);
  };
  const endDrag = (event: PointerEvent<HTMLDivElement>) => {
    dragRef.current = null;
    void event.currentTarget.releasePointerCapture(event.pointerId);
  };

  return (
    <div
      aria-hidden
      className={`absolute bottom-0 top-0 z-20 w-1 cursor-col-resize bg-transparent transition-colors hover:bg-primary/30 ${
        edge === "right" ? "right-0" : "left-0"
      }`}
      onPointerCancel={endDrag}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={endDrag}
    />
  );
}

export function ActionButton({
  children,
  className = "",
  tone = "default",
  type = "button",
  ...props
}: ActionButtonProps) {
  return (
    <Button
      {...props}
      className={actionButtonClasses({
        tone,
        className: `disabled:cursor-not-allowed disabled:opacity-50 ${className}`,
      })}
      size="sm"
      type={type}
      variant="ghost"
    >
      {children}
    </Button>
  );
}

type ShellInputProps = ComponentProps<typeof Input>;

export function ShellInput({ className = "", ...props }: ShellInputProps) {
  return (
    <Input
      {...props}
      className={`h-auto rounded-lg border-neutral-line bg-surface-inset px-4 py-3 text-sm text-on-surface placeholder:text-on-surface-muted/60 focus-visible:border-primary focus-visible:ring-primary/30 ${className}`}
    />
  );
}

type ListRowProps = Omit<ButtonHTMLAttributes<HTMLButtonElement>, "title"> & {
  actions?: ReactNode;
  marker?: ReactNode;
  meta?: ReactNode;
  selected?: boolean;
  subtitle?: ReactNode;
  title: ReactNode;
};

export function ListRow({
  actions,
  className = "",
  marker,
  meta,
  selected = false,
  subtitle,
  title,
  ...props
}: ListRowProps) {
  return (
    <div
      {...(props as React.HTMLAttributes<HTMLDivElement>)}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          (e.currentTarget as HTMLDivElement).click();
        }
      }}
      className={`flex h-auto w-full min-w-0 cursor-pointer items-center justify-start rounded-xl px-3 py-2.5 text-left transition interactive-row ${
        selected
          ? "border border-primary/60 bg-primary/10"
          : `${shellSurfaceClasses.raised} ${shellSurfaceClasses.raisedHover}`
      } ${className}`}
    >
      <span className="flex min-w-0 grow items-center justify-between gap-2">
        <span className="flex min-w-0 items-center gap-3">
          {marker}
          <span className="min-w-0">
            <span className="block truncate font-semibold text-on-surface" data-list-row-title>
              {title}
            </span>
            {subtitle ? (
              <span className="mt-0.5 block truncate text-xs text-on-surface-muted">
                {subtitle}
              </span>
            ) : null}
          </span>
        </span>
        {meta ? <span className="flex shrink-0 items-center gap-1.5">{meta}</span> : null}
        {actions ? <span className="flex shrink-0 items-center">{actions}</span> : null}
      </span>
    </div>
  );
}

type MobilePageHeaderProps = {
  actions?: ReactNode;
  back?: { label: string; onClick: () => void };
  title: ReactNode;
};

/**
 * 移动端一级 / 二级页面统一 header（设计文档 §7）。结构 = 可选 ◄ 返回 + text-base 大标题 +
 * 可选右侧 actions，h-11 高、border-b 分隔。无 eyebrow 小标题（与桌面 ShellHeaderSurface 区别）。
 * 跨页一致性契约：Projects / 实例 / Settings 一级 tab + 项目总览 / 聚焦态二级页都用此 primitive。
 */
export function MobilePageHeader({ actions, back, title }: MobilePageHeaderProps) {
  return (
    <header className="flex h-11 shrink-0 items-center gap-1 border-b border-on-surface/5 px-3">
      {back ? (
        <button
          aria-label={back.label}
          className="inline-flex h-11 w-11 items-center justify-center rounded-lg text-sm text-on-surface-muted transition hover:bg-on-surface/5 hover:text-on-surface"
          onClick={back.onClick}
          type="button"
        >
          <svg aria-hidden="true" className="h-3.5 w-3.5" fill="none" viewBox="0 0 16 16">
            <path
              d="M10 3L5 8l5 5"
              stroke="currentColor"
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={1.5}
            />
          </svg>
        </button>
      ) : null}
      <span className="min-w-0 flex-1 truncate text-base font-semibold text-on-surface">
        {title}
      </span>
      {actions ? <div className="flex shrink-0 items-center gap-1">{actions}</div> : null}
    </header>
  );
}

export type InstanceCardProps = {
  /** 折叠操作区触发器（⋯）aria-label。 */
  actionsLabel?: string;
  activity?: string;
  closeLabel?: string;
  marker: ReactNode;
  onClose?: () => void;
  onSelect: () => void;
  projectName?: string;
  /** 改名回调；缺失则展开后不渲染改名按钮。 */
  onRename?: () => void;
  renameLabel?: string;
  status?: { label: string; tone: ShellTone };
  /** 第二行内容（agent=AI 回复 / terminal=最近命令），1 行截断；缺失则不渲染第二行。 */
  subtitle?: ReactNode;
  title: ReactNode;
};

/**
 * 实例卡片（设计文档 §7）。微信朋友圈式头像布局：左侧 marker 头像（lg=36px，`items-start` 上下
 * 置顶）独占一列 + 右侧内容区竖排 3 行：① title（会话名）；② subtitle（agent lastAssistantMessage
 * / terminal lastCommand，1 行截断，弱化色）；③ meta 行（项目名 · 最后活动时间，弱化色，从左往右
 * 紧凑排列）。subtitle 缺失退化 2 行；meta 文本缺失不渲染 meta 行。raised surface + rounded-lg，
 * 点击 onSelect 进详情。
 *
 * **折叠操作区**：卡片右上角 absolute ⋯ 触发按钮（`absolute top-2 right-2`），点击后向下方展开
 * **纵向 dropdown menu**（改名 / 关闭两项）。展开是局部 state（每卡独立），外部点击 / Esc 收起
 * （conditional effect，仅 expanded 时挂 listener，避免每卡常驻）。各菜单项 stopPropagation（click
 * + keydown 两路），与卡片 onKeyDown（Enter/Space → onSelect）隔离。`onRename`/`onClose` 缺省时
 * 对应菜单项不渲染；两者都缺省时不渲染触发器（退化纯展示卡）。
 */
export function InstanceCard({
  actionsLabel,
  activity,
  closeLabel,
  marker,
  onClose,
  onSelect,
  onRename,
  projectName,
  renameLabel,
  status,
  subtitle,
  title,
}: InstanceCardProps) {
  const [expanded, setExpanded] = useState(false);
  const actionsRef = useRef<HTMLDivElement | null>(null);
  const hasMetaText = projectName || activity;
  const hasActions = onRename || onClose;

  // 外部点击 / Esc 收起展开态。conditional effect——仅 expanded 时挂 listener，避免每卡常驻。
  useEffect(() => {
    if (!expanded) return;
    const onMouseDown = (event: MouseEvent) => {
      if (actionsRef.current && !actionsRef.current.contains(event.target as Node)) {
        setExpanded(false);
      }
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setExpanded(false);
    };
    document.addEventListener("mousedown", onMouseDown);
    window.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onMouseDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [expanded]);

  return (
    <div
      className={`group relative flex min-w-0 cursor-pointer items-start gap-3 rounded-lg p-3 transition interactive-row ${shellSurfaceClasses.raised} ${shellSurfaceClasses.raisedHover}`}
      onClick={onSelect}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onSelect();
        }
      }}
      role="button"
      tabIndex={0}
    >
      <StatusMarker marker={marker} status={status} />
      <div className="min-w-0 flex-1 flex flex-col gap-1">
        <span className="min-w-0 truncate pr-6 text-sm font-semibold text-on-surface group-hover:text-primary">
          {title}
        </span>
        {subtitle ? (
          <div className="min-w-0 truncate text-xs text-on-surface-muted">{subtitle}</div>
        ) : null}
        {hasMetaText ? (
          <div className="flex items-center gap-1.5 text-xs text-on-surface-muted">
            {projectName ? <span className="min-w-0 truncate">{projectName}</span> : null}
            {projectName && activity ? <span aria-hidden="true">·</span> : null}
            {activity ? <span className="whitespace-nowrap shrink-0">{activity}</span> : null}
          </div>
        ) : null}
      </div>
      {hasActions ? (
        <div className="absolute right-2 top-2 z-10" ref={actionsRef}>
          <button
            aria-expanded={expanded}
            aria-label={actionsLabel}
            className="inline-flex h-7 w-7 items-center justify-center rounded-md text-on-surface-muted transition hover:bg-on-surface/5 hover:text-on-surface"
            onClick={(e) => {
              e.stopPropagation();
              setExpanded((prev) => !prev);
            }}
            onKeyDown={(e) => {
              // Enter/Space 由卡片 onKeyDown 处理（→ onSelect），此处隔离避免误触发；
              // Esc 放行让 window listener 收起菜单。
              if (e.key === "Enter" || e.key === " ") e.stopPropagation();
            }}
            type="button"
          >
            <ShellIcon className="h-4 w-4" name="ellipsis" />
          </button>
          {expanded ? (
            <div className="absolute right-0 top-full mt-1 flex min-w-[120px] flex-col gap-0.5 rounded-lg border border-neutral-line bg-surface-raised p-1 shadow-2xl shadow-black/40 z-20">
              {onRename ? (
                <button
                  aria-label={renameLabel}
                  className="inline-flex h-8 items-center gap-2 rounded-md px-2 text-sm text-on-surface transition hover:bg-on-surface/5"
                  onClick={(e) => {
                    e.stopPropagation();
                    setExpanded(false);
                    onRename();
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") e.stopPropagation();
                  }}
                  type="button"
                >
                  <ShellIcon className="h-3.5 w-3.5" name="edit" />
                  <span>{renameLabel}</span>
                </button>
              ) : null}
              {onClose ? (
                <button
                  aria-label={closeLabel}
                  className="inline-flex h-8 items-center gap-2 rounded-md px-2 text-sm text-on-surface transition hover:bg-error/10 hover:text-error"
                  onClick={(e) => {
                    e.stopPropagation();
                    setExpanded(false);
                    onClose();
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") e.stopPropagation();
                  }}
                  type="button"
                >
                  <svg aria-hidden="true" className="h-3.5 w-3.5" fill="none" viewBox="0 0 16 16">
                    <path
                      d="M4 4l8 8M12 4l-8 8"
                      stroke="currentColor"
                      strokeLinecap="round"
                      strokeWidth={1.5}
                    />
                  </svg>
                  <span>{closeLabel}</span>
                </button>
              ) : null}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

/**
 * 实例 marker：agent 按 provider 选 tone/icon（codex→success/openai，其余→accent/anthropic），
 * terminal→muted/terminal。size 默认 sm（GroupHeader h-9 紧凑 header、table 紧凑行场景）；card
 * 场景显式传 `"lg"`（h-9 w-9=36px 头像式独立左列，icon h-4 w-4）。消化移动卡片总览两处
 *（ProjectInstances card variant + GlobalInstanceCard）的重复 marker 构造。桌面 list（AgentNavItem）
 * 用 ShellNavigationButton 包 IconMarker，不复用此 helper。
 */
export function sessionMarker(
  type: "agent" | "terminal",
  provider?: AgentProvider,
  size: "sm" | "lg" = "sm",
): ReactNode {
  const iconClass = size === "lg" ? "h-4 w-4" : "h-3.5 w-3.5";
  if (type === "terminal") {
    return (
      <IconMarker size={size} tone="muted">
        <ShellIcon className={iconClass} name="terminal" />
      </IconMarker>
    );
  }
  return (
    <IconMarker size={size} tone={provider === "codex" ? "success" : "accent"}>
      <ShellIcon className={iconClass} name={provider === "codex" ? "openai" : "anthropic"} />
    </IconMarker>
  );
}

type ViewSwitcherView<T extends string> = {
  id: T;
  label: string;
};

type ViewSwitcherProps<T extends string> = {
  /** 整组按钮的可访问名（如「视图切换」）。单个按钮的 aria-label 取每项 `label`。 */
  ariaLabel?: string;
  onChange: (next: T) => void;
  view: T;
  /** 已按作用域/视口过滤的视图列表，渲染顺序 = 数组顺序（从左到右）。 */
  views: ViewSwitcherView<T>[];
};

/**
 * 视图切换器（设计文档 workbench-views.md §15）：segmented control，icon-only，常驻中栏
 * 总览 tab 右上角。纯 presentational —— `views`（含 id + label）由调用方构造并完成
 * scope/视口过滤（`filterWorkbenchViews`），icon 由 `id` 内部映射，避免本层 import routes。
 * active 项 `aria-pressed` + primary 高亮；非 active hover 转 on-surface。尺寸 h-7 w-7
 *（与 ActionButton 视觉密度对齐）。
 */
export function ViewSwitcher<T extends string>({
  ariaLabel,
  onChange,
  view,
  views,
}: ViewSwitcherProps<T>) {
  return (
    <div
      aria-label={ariaLabel}
      className="inline-flex shrink-0 items-center gap-0.5 rounded-lg border border-neutral-line/60 bg-surface-inset/60 p-0.5"
      role="group"
    >
      {views.map((v) => {
        const active = v.id === view;
        return (
          <button
            aria-label={v.label}
            aria-pressed={active}
            className={`inline-flex h-7 w-7 items-center justify-center rounded-md transition ${
              active
                ? "bg-primary/15 text-primary"
                : "text-on-surface-muted hover:bg-on-surface/5 hover:text-on-surface-soft"
            }`}
            key={v.id}
            onClick={() => onChange(v.id)}
            title={v.label}
            type="button"
          >
            <ViewSwitcherIcon kind={v.id} />
          </button>
        );
      })}
    </div>
  );
}

function ViewSwitcherIcon({ kind }: { kind: string }) {
  if (kind === "table") return <TableViewIcon />;
  if (kind === "grouped") return <GroupedViewIcon />;
  return <GridViewIcon />;
}

function GridViewIcon() {
  return (
    <svg aria-hidden="true" className="h-3.5 w-3.5" fill="none" viewBox="0 0 16 16">
      <rect
        height="4.5"
        rx="1"
        stroke="currentColor"
        strokeWidth="1.3"
        width="4.5"
        x="2.5"
        y="2.5"
      />
      <rect height="4.5" rx="1" stroke="currentColor" strokeWidth="1.3" width="4.5" x="9" y="2.5" />
      <rect height="4.5" rx="1" stroke="currentColor" strokeWidth="1.3" width="4.5" x="2.5" y="9" />
      <rect height="4.5" rx="1" stroke="currentColor" strokeWidth="1.3" width="4.5" x="9" y="9" />
    </svg>
  );
}

function TableViewIcon() {
  return (
    <svg aria-hidden="true" className="h-3.5 w-3.5" fill="none" viewBox="0 0 16 16">
      <rect height="10" rx="1" stroke="currentColor" strokeWidth="1.3" width="12" x="2" y="3" />
      <line stroke="currentColor" strokeWidth="1.3" x1="2" x2="14" y1="6.3" y2="6.3" />
      <line stroke="currentColor" strokeWidth="1.3" x1="2" x2="14" y1="9.7" y2="9.7" />
    </svg>
  );
}

function GroupedViewIcon() {
  return (
    <svg aria-hidden="true" className="h-3.5 w-3.5" fill="none" viewBox="0 0 16 16">
      <path
        d="M2.5 4.5h4M2.5 8h9M2.5 11.5h6"
        stroke="currentColor"
        strokeLinecap="round"
        strokeWidth="1.3"
      />
    </svg>
  );
}
