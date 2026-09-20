import type { AgentSession, TerminalSession } from "@agents-remote/shared";
import { type ReactNode, useEffect, useRef } from "react";

import { useT } from "../../i18n";
import { ShellIcon } from "../shell/icons";
import { statusToV2DotClass } from "../shell/shell-primitives";
import { ActionMenu } from "../ui/action-menu";
import {
  type CreateSessionApi,
  AutoRetryHeaderButton,
  type ProjectInstanceEntry,
} from "./instance-area";

/** row2 尾部工具入口（原型 .ticon ×3：folder/branch/book）。工具原位主体 = 同名 ?tab 维度
 * （与桌面 ProjectLeftPanel middle tab 同构，v2 IA 两端同构约定）。 */
export type MobileProjectTool = "files" | "git" | "wiki";

/** row2 ＋ 与 03h 空态卡 CTA 共用的新建实例菜单项（单一装配来源防漂移——design-reviewer
 * M3-c #5；review 指出当时已有 5 处 createClaude 菜单声明，本收口覆盖移动两处）。 */
export function useCreateSessionMenuItems(create: CreateSessionApi) {
  const { t } = useT();
  return [
    {
      label: t("workbench.createClaude"),
      icon: <ShellIcon name="anthropic" />,
      onSelect: () => create.createAgent("claude"),
    },
    {
      label: t("workbench.createOmp"),
      icon: <ShellIcon name="agent-nav" />,
      onSelect: () => create.createAgent("omp"),
    },
    {
      label: t("workbench.createTerminal"),
      icon: <ShellIcon name="terminal" />,
      onSelect: create.createTerminal,
    },
  ];
}

type MobileProjectHeaderProps = {
  projectName: string;
  /** 项目实例（pills 源 = useProjectInstances 单一数据管道）。 */
  instances: ProjectInstanceEntry[];
  /** 已打开 skill tab（v2 pills 兼职承载；file/git 由工具 ticon 承载不进 pills）。 */
  skillTabs: { tabId: string; leafId: string; name: string }[];
  /** 当前 focus tab id（pill active 判定；file/git/skill 之外 focus 时 pills 无 active）。 */
  activeTabId?: string;
  /** 项目工具原位（?tab 维度）。undefined = 实例主体。 */
  tool?: MobileProjectTool;
  /** 工具态 pills 区替换 chip（03m gitchip / 03o crumb / 03p wsearch）——数据与交互
   * （gitchip 计数、crumb 路径导航、wsearch 查询输入）在调用方装配，header 只呈现。 */
  toolChip?: ReactNode;
  /** L3 详情页 nav 形态（03q/03r/03u/03s）：非空时 header 只渲染 nav 行——back 显示
   * backLabel（父目录/Git 检视/提交历史/分组名）、标题切 L3 标题（文件名/commit hash/页名）、
   * 右侧 actions（03q ⋯ 菜单）。row2/chips 行不渲染（L3 是内容区替换的独立页面）。 */
  l3?: { backLabel: string; title: string; onClick: () => void; actions?: ReactNode };
  onBack: () => void;
  onSelectInstance: (sessionId: string) => void;
  onSelectTab: (leafId: string, tabId: string) => void;
  /** 工具切换；再点同工具由调用方传 null 退出（回实例主体）。 */
  onToolChange: (tool: MobileProjectTool | null) => void;
  create: CreateSessionApi;
  /** 聚焦 session 态 nav 右侧 ℹ/✕（info/confirm holder 由调用方渲染）。 */
  focusActions?: ReactNode;
  /** 聚焦 agent 实例（chips 运行摘要行数据源；工具态无 chips 行）。 */
  focusedAgent: AgentSession | null;
  /** 聚焦 terminal 实例（03f：chips 行只剩 tmux 会话 chip，无模型/权限/effort）。 */
  focusedTerminal: TerminalSession | null;
};

/**
 * 移动项目工作台三行头部（v2 M3-b，对标 03-workspace-agent.html / 03c-idle / 03h-empty）：
 *
 * - nav 行：`.back`「项目」（push 回项目 Tab）+ `.nv-t` 项目名标题 + 右侧 slot（聚焦态 ℹ/✕）。
 *   标题旁 `.sw`▾（切项目 sheet 03l）与 ⋯ 菜单留 M5 浮层批次。
 * - row2 行：`.pills` 实例横滑区（agent = 状态 dot + 名；terminal = `>_ 名` monospace；skill
 *   tab 兼职 pill）+ `.plus` 新建实例 ActionMenu + `.sep` + 3 个工具 ticon。无实例时 pills 区
 *   显示「项目工具」lb（03h：无实例不渲染 pill 条，工具是项目级仍可用）。
 * - chips 行：随聚焦实例类型切换（M3-c 逐状态）——agent = 运行摘要 chip（`✦ model · 权限
 *   模式 · effort`，03 编号②）+ 自动重试开关 chip；terminal = `tmux · 名` mono chip（03f）；
 *   工具态/skill focus 无 chips 行（原型 03h 空态也无）。
 *
 * 原语类（.nav/.back/.nv-t/.row2/.pills/.pill/.plus/.sep/.ticon/.chips/.chip/.dot）消费
 * v2-primitives.css 单源；pills 横滑在消费处叠 overflow-x-auto（原型 .pills overflow:hidden
 * 是示意，横滑区语义见 03 编号①）。
 */
export function MobileProjectHeader({
  projectName,
  instances,
  skillTabs,
  activeTabId,
  tool,
  toolChip,
  l3,
  onBack,
  onSelectInstance,
  onSelectTab,
  onToolChange,
  create,
  focusActions,
  focusedAgent,
  focusedTerminal,
}: MobileProjectHeaderProps) {
  const { t } = useT();
  const scrollRef = useRef<HTMLDivElement>(null);
  const createMenuItems = useCreateSessionMenuItems(create);
  const hasPills = instances.length > 0 || skillTabs.length > 0;
  const activePillId =
    instances.some((entry) => entry.session.id === activeTabId) ||
    skillTabs.some((st) => st.tabId === activeTabId)
      ? activeTabId
      : undefined;

  // 激活 pill 滚入视野（自 MobileTabStrip 迁移，v2 pills 同交互：pill 多时横滚区停留原位，
  // 激活 pill 可能视野外。activeTabId 变化时手动算 scrollLeft；pill 宽度异步稳定前用 interval
  // 周期校准，布局稳定后自停）。
  useEffect(() => {
    const el = scrollRef.current;
    if (!el || !activePillId) return;
    const align = () => {
      const pill = el.querySelector<HTMLElement>('[data-active="true"]');
      if (!pill) return false;
      const left =
        pill.getBoundingClientRect().left - el.getBoundingClientRect().left + el.scrollLeft;
      const right = left + pill.offsetWidth;
      if (left < el.scrollLeft) {
        el.scrollTo({ left, behavior: "smooth" });
        return true;
      }
      if (right > el.scrollLeft + el.clientWidth) {
        el.scrollTo({ left: right - el.clientWidth, behavior: "smooth" });
        return true;
      }
      return false;
    };
    align();
    const timer = window.setInterval(() => {
      if (!align()) window.clearInterval(timer);
    }, 200);
    return () => window.clearInterval(timer);
  }, [activePillId, instances.length, skillTabs.length]);

  return (
    <>
      {/* nav 行（原型 .nav：back + 标题 + ℹ⋯；safe-area 顶带由外层 wrapper 消费）。
        L3 态（03q/03r/03u/03s）：back 换语义 label、标题换 L3 标题（mono 14px，原型规格）。 */}
      <div className="nav shrink-0">
        <button
          className="back cursor-pointer touch:px-2 touch:py-2"
          onClick={l3 ? l3.onClick : onBack}
          type="button"
        >
          {l3 ? l3.backLabel : t("nav.projects")}
        </button>
        <h1 className={`nv-t min-w-0${l3 ? " font-mono text-[14px]" : ""}`}>
          <span className="block truncate">{l3 ? l3.title : projectName}</span>
        </h1>
        {l3 ? l3.actions : focusActions}
      </div>
      {l3 ? null : (
        <>
          {/* row2 行（原型 .row2：实例 pills + ＋ + sep + 工具 ticon）。
        工具态 pills 区替换为工具 chip（03m gitchip / 03o crumb / 03p wsearch——调用方装配，
        原型 row2 工具态 pills 隐藏只留当前工具 chip）；chip 超宽横滑（crumb 多级路径）。 */}
          <div className="row2 shrink-0">
            {toolChip ? (
              <div className="flex min-w-0 flex-1 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                {toolChip}
              </div>
            ) : hasPills ? (
              <div
                className="pills overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
                ref={scrollRef}
              >
                {instances.map((entry) => {
                  const active = entry.session.id === activePillId;
                  return (
                    <button
                      className={`pill cursor-pointer${active ? " on" : ""}`}
                      data-active={active ? "true" : undefined}
                      key={entry.session.id}
                      onClick={() => onSelectInstance(entry.session.id)}
                      type="button"
                    >
                      {entry.type === "agent" ? (
                        <span className={statusToV2DotClass(entry.session.status)} />
                      ) : null}
                      {/* terminal/skill pill 11px mono（03 原型内联规格，叠层覆盖原语 12px） */}
                      <span
                        className={entry.type === "terminal" ? "font-mono text-[11px]" : undefined}
                      >
                        {entry.type === "terminal"
                          ? `>_ ${entry.session.displayName}`
                          : entry.session.displayName}
                      </span>
                    </button>
                  );
                })}
                {skillTabs.map((st) => {
                  const active = st.tabId === activePillId;
                  return (
                    <button
                      className={`pill cursor-pointer font-mono text-[11px]${active ? " on" : ""}`}
                      data-active={active ? "true" : undefined}
                      key={st.tabId}
                      onClick={() => onSelectTab(st.leafId, st.tabId)}
                      type="button"
                    >
                      ✦ {st.name}
                    </button>
                  );
                })}
              </div>
            ) : (
              // 03h：无实例不渲染 pill 条，「项目工具」lb 占位（工具是项目级仍可用）。
              <span className="min-w-0 flex-1 text-micro text-ink-3">
                {t("workbench.projectTools")}
              </span>
            )}
            <ActionMenu
              align="end"
              cancelLabel={t("cancel")}
              items={createMenuItems}
              trigger={
                <button
                  aria-label={t("workbench.createSessionAria")}
                  className="flex h-9 w-9 shrink-0 cursor-pointer items-center justify-center text-primary transition hover:bg-ink-1/5 active:bg-ink-1/10"
                  disabled={create.isCreating}
                  type="button"
                >
                  {/* 裸＋字形（iOS 惯例，.plus::before/after 画笔画） */}
                  <span className="plus" />
                </button>
              }
            />
            <span className="sep" />
            {(
              [
                { id: "files", icon: "project", label: t("workbench.tabFiles") },
                { id: "git", icon: "git-nav", label: t("workbench.tabGit") },
                { id: "wiki", icon: "book", label: t("workbench.tabWiki") },
              ] as const
            ).map((item) => (
              <button
                aria-label={item.label}
                className={`ticon cursor-pointer p-1 touch:h-9 touch:w-9${tool === item.id ? " hl" : ""}`}
                key={item.id}
                onClick={() => onToolChange(tool === item.id ? null : item.id)}
                title={item.label}
                type="button"
              >
                {/* 19×19 = 原型 .ticon svg 规格（components.css 单源）；ShellIcon svg size-full
              跟随外层 span，span 由 utility 定尺寸（utility 层胜 .ticon svg components 层）。 */}
                <ShellIcon className="h-[19px] w-[19px]" name={item.icon} />
              </button>
            ))}
          </div>

          {/* chips 行（原型 .chips：随聚焦实例类型切换——agent = 运行摘要 ② + 自动重试；
        terminal = tmux 会话 chip（03f 编号①「只剩 tmux 会话选择，无模型/权限/effort」；
        终端实例 1:1 绑定 tmux 会话无切换能力，chip 静态展示不画 ▾）；工具态/skill 无 chips 行） */}
          {focusedAgent ? (
            <div className="chips shrink-0">
              <span className="chip">
                ✦{" "}
                {[focusedAgent.modelAlias, focusedAgent.permissionMode, focusedAgent.effort]
                  .filter(Boolean)
                  .join(" · ")}
              </span>
              {/* 摘要 chip 与重试开关间分隔（03 原型 chips 行 chip + sep + 重试区） */}
              <span className="sep" />
              <AutoRetryHeaderButton
                projectName={focusedAgent.projectName}
                sessionId={focusedAgent.id}
                variant="chip"
              />
            </div>
          ) : focusedTerminal ? (
            <div className="chips shrink-0">
              <span className="chip font-mono">tmux · {focusedTerminal.displayName}</span>
            </div>
          ) : null}
        </>
      )}
    </>
  );
}
