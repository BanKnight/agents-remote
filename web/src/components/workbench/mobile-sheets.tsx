// M5-a 浮层族 sheet 页（§6.4 摊牌：03l 切换 / 03n 会话历史 / 03j 新建实例）。原语消费
// v2-primitives M5 段（grp/sess/fc/hrow…）；容器 = `MobileSheet`（Radix modal + .msheet）。
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";

import type { AgentSession, ApprovalSummary } from "@agents-remote/shared";

import { listAgentSessions } from "../../api/client";
import { useRespondApproval } from "../../hooks/use-approvals";
import { useT } from "../../i18n";
import { MobileSheet } from "../shell/mobile-sheet";
import { ShellIcon } from "../shell/icons";
import { useGlobalInstanceCandidates } from "./instance-area";
import type { CreateSessionApi } from "./instance-area";
import { relativeTime } from "./history-list";
import { statusToV2DotClass } from "../shell/shell-primitives";

/** 会话状态 → dot 变体（run 绿实心 / err 红实心 / idle 空心描边；03l d2 与 11 acard 共用）。 */
function sessDotClass(status: string): string {
  if (status === "running") return "run";
  if (status === "error") return "err";
  return "idle";
}

/** 11 原型 cmd.hot 强写红判定（记档：原型仅 git push 卡明确红，机械规则 = 写文件族工具恒红；Bash 按内容启发 rm / git push）。 */
const HOT_TOOLS = new Set(["Write", "Edit", "MultiEdit", "NotebookEdit"]);
const HOT_COMMAND_RE = /\b(rm|git push)\b/;

function isHotTool(item: ApprovalSummary): boolean {
  if (HOT_TOOLS.has(item.toolName)) return true;
  if (item.toolName === "Bash") return HOT_COMMAND_RE.test(item.inputSummary);
  return false;
}

/**
 * 03l 项目切换 sheet（nav 标题 ▾ 入口）：按项目分组的活跃会话一步切换（原 2 跳变 1 跳）。
 * 点会话 = 切项目并激活该会话；点分组头 = 只切项目；空组 gempty 引导点分组头进项目；
 * newp 行 = 调用方 openCreate（08 新建/采用项目）。搜索同 match 项目名 + 会话名（编号③）。
 */
export function MobileProjectSwitchSheet({
  currentSessionId,
  onCreateProject,
  onOpenChange,
  onSwitchProject,
  onSwitchSession,
  open,
}: {
  /** 当前聚焦会话（.sess.on 高亮；L3/工具态为 undefined 无高亮）。 */
  currentSessionId?: string;
  onCreateProject: () => void;
  onOpenChange: (open: boolean) => void;
  onSwitchProject: (projectName: string) => void;
  onSwitchSession: (projectName: string, sessionId: string) => void;
  open: boolean;
}) {
  const { t } = useT();
  const [query, setQuery] = useState("");
  const { candidates, projectNames } = useGlobalInstanceCandidates({ kind: "global" });
  const groups = useMemo(() => {
    const q = query.trim().toLowerCase();
    return projectNames
      .map((name) => ({
        name,
        sessions: candidates.filter(
          (c) =>
            c.ref.projectName === name &&
            (!q || name.toLowerCase().includes(q) || c.displayName.toLowerCase().includes(q)),
        ),
      }))
      .filter((g) => !q || g.sessions.length > 0 || g.name.toLowerCase().includes(q));
  }, [candidates, projectNames, query]);
  return (
    <MobileSheet onOpenChange={onOpenChange} open={open} title={t("workbench.switchTitle")}>
      {/* 搜索框（原型 36px elevated2 r10 + 14px + 放大镜） */}
      <div className="mt-2.5 flex h-9 items-center gap-2 rounded-md bg-elevated2 px-3">
        <ShellIcon className="size-[15px] flex-none text-ink-2" name="magnifyingglass" />
        <input
          aria-label={t("workbench.switchSearch")}
          className="w-full bg-transparent text-[14px] text-ink-1 outline-none placeholder:text-ink-2"
          onChange={(event) => setQuery(event.target.value)}
          placeholder={t("workbench.switchSearch")}
          value={query}
        />
      </div>
      {groups.map((group) => (
        <div key={group.name}>
          <button
            className="grp w-full cursor-pointer text-left"
            onClick={() => {
              onOpenChange(false);
              onSwitchProject(group.name);
            }}
            type="button"
          >
            {group.name}
            <span className={`c ${group.sessions.length > 0 ? "text-success-text" : "text-ink-2"}`}>
              {group.sessions.length > 0 ? `● ${group.sessions.length}` : "—"}
            </span>
          </button>
          {group.sessions.length === 0 ? (
            <p className="gempty">{t("workbench.switchEmptyGroup")}</p>
          ) : (
            group.sessions.map((candidate) => (
              <button
                className={`sess w-full cursor-pointer text-left${
                  candidate.ref.sessionId === currentSessionId ? " on" : ""
                }${candidate.status === "running" || candidate.status === "error" ? "" : " off"}`}
                key={candidate.ref.sessionId}
                onClick={() => {
                  onOpenChange(false);
                  onSwitchSession(group.name, candidate.ref.sessionId);
                }}
                type="button"
              >
                <span className={`d2 ${sessDotClass(candidate.status)}`} />
                {candidate.displayName}
              </button>
            ))
          )}
        </div>
      ))}
      <button
        className="newp w-full cursor-pointer"
        onClick={() => {
          onOpenChange(false);
          onCreateProject();
        }}
        type="button"
      >
        <svg fill="none" stroke="currentColor" viewBox="-10 -10 20 20">
          <circle r="9" />
          <path d="M0,-4.5 V4.5 M-4.5,0 H4.5" />
        </svg>
        {t("workbench.switchNewProject")}
      </button>
    </MobileSheet>
  );
}

/** 03n 过滤维度（全部 / 进行中 / 已结束）。 */
const HISTORY_FILTERS = ["all", "running", "closed"] as const;

/** 03n 状态行文案（运行中/空闲/已结束 · 相对时间）。 */
function historyStatusText(
  status: "running" | "idle" | "closed" | "error",
  time: string,
  t: ReturnType<typeof useT>["t"],
): string {
  if (status === "running") return t("workbench.historyRunning", { time });
  if (status === "closed") return t("workbench.historyClosed", { time });
  return t("workbench.historyIdle", { time });
}

/**
 * 03n 会话历史 sheet（nav ⋯ →「会话历史」入口，编号①：pill 条只放活跃实例，历史不占常驻位）：
 * filters 三态 + hrow 列表（dot + 名 + st 状态·时间）；已结束（closed）行点击 = 恢复（重开同
 * 一会话，resume 复用同 id，编号④）；活跃态行（running/idle/error）点击 = 聚焦既有实例——
 * resume 对活跃会话会新建重复实例（design-reviewer P1，违反铁律 2 单实例）。end 行 d2 轮次/
 * 费用原型数据无来源不画（诚实呈现，hfoot 承载恢复语义说明）。
 */
export function MobileSessionHistorySheet({
  onFocusExisting,
  onOpenChange,
  onResume,
  open,
  projectName,
}: {
  /** 活跃态行点击：关闭 sheet 聚焦既有实例（不新建）。 */
  onFocusExisting: (sessionId: string) => void;
  onOpenChange: (open: boolean) => void;
  /** closed 行点击：传完整 session（resume 需 claudeSessionId/acpSessionId，见
   * `useResumeAgentSession`），调用方装配恢复 mutation。 */
  onResume: (session: AgentSession) => void;
  open: boolean;
  projectName: string;
}) {
  const { t } = useT();
  const [filter, setFilter] = useState<(typeof HISTORY_FILTERS)[number]>("all");
  const sessions = useQuery({
    enabled: open,
    queryKey: ["projects", projectName, "agent-sessions"],
    queryFn: () => listAgentSessions(projectName),
  });
  const rows = (sessions.data?.sessions ?? [])
    .filter((s) =>
      filter === "all"
        ? true
        : filter === "running"
          ? s.status === "running"
          : s.status === "closed",
    )
    .sort((a, b) => (b.updatedAt ?? b.createdAt).localeCompare(a.updatedAt ?? a.createdAt));
  return (
    <MobileSheet
      aside={projectName}
      onOpenChange={onOpenChange}
      open={open}
      title={t("workbench.historyTitle")}
    >
      <div className="filters">
        {HISTORY_FILTERS.map((f) => (
          <button
            className={`fc cursor-pointer${filter === f ? " on" : " seg"}`}
            key={f}
            onClick={() => setFilter(f)}
            type="button"
          >
            {f === "all"
              ? t("workbench.historyFilterAll")
              : f === "running"
                ? t("workbench.historyFilterRunning")
                : t("workbench.historyFilterClosed")}
          </button>
        ))}
      </div>
      <div className="mt-1.5">
        {rows.length === 0 ? (
          <p className="py-3 text-center text-footnote text-ink-2">{t("workbench.historyEmpty")}</p>
        ) : (
          rows.map((s) => (
            <button
              className={`hrow${
                s.status === "running" ? "" : s.status === "idle" ? " idle" : " end"
              } block w-full cursor-pointer text-left`}
              key={s.id}
              onClick={() => {
                onOpenChange(false);
                // closed = 无实例可聚焦，恢复复用同 id；活跃态聚焦既有实例（P1 守卫）。
                if (s.status === "closed") {
                  onResume(s);
                } else {
                  onFocusExisting(s.id);
                }
              }}
              type="button"
            >
              <span className="r1">
                {/* 已结束行无 dot（原型 03n end 行只有文字，reviewer P2-6）。 */}
                {s.status === "closed" ? null : <span className={statusToV2DotClass(s.status)} />}
                <span className="min-w-0 flex-1 truncate">{s.displayName}</span>
                <span className={`st${s.status === "running" ? " run" : ""}`}>
                  {historyStatusText(s.status, relativeTime(s.updatedAt ?? s.createdAt, t), t)}
                </span>
              </span>
            </button>
          ))
        )}
      </div>
      <p className="hfoot">{t("workbench.historyFoot")}</p>
    </MobileSheet>
  );
}

/**
 * 03j 新建实例 sheet（row2 ＋ 与 03h 空态卡 CTA 共用入口，编号②）：srow/tile 富行取代
 * ActionMenu 菜单形态。按现状能力诚实呈现 3 行（Claude/OMP/终端）——原型 Codex/Chat（Pi）
 * 行无接入能力不画（M3 同拍板）。行点击 = onOpenChange(false) + create（命名 prompt 弹窗
 * 由 workbench 顶层 holder 承载，sheet 卸载后可见）。
 */
export function MobileCreateInstanceSheet({
  create,
  onOpenChange,
  open,
  projectName,
}: {
  create: CreateSessionApi;
  onOpenChange: (open: boolean) => void;
  open: boolean;
  projectName: string;
}) {
  const { t } = useT();
  const dismiss = (action: () => void) => {
    onOpenChange(false);
    action();
  };
  return (
    <MobileSheet
      aside={projectName}
      onOpenChange={onOpenChange}
      open={open}
      title={t("workbench.createTitle")}
    >
      <div className="slabel">{t("workbench.createGroupAgent")}</div>
      <button
        className="srow w-full cursor-pointer text-left"
        disabled={create.isCreating}
        onClick={() => dismiss(() => create.createAgent("claude"))}
        type="button"
      >
        <span className="tile bg-tint-blue text-pin">
          <ShellIcon className="size-[19px]" name="sparkles" />
        </span>
        <span className="tx">
          <span className="n">＋ {t("workbench.createClaude")}</span>
          <span className="d">{t("workbench.createClaudeDesc")}</span>
        </span>
        <span className="ar">›</span>
      </button>
      <button
        className="srow w-full cursor-pointer text-left"
        disabled={create.isCreating}
        onClick={() => dismiss(() => create.createAgent("omp"))}
        type="button"
      >
        <span className="tile bg-tint-orange text-warning">
          <ShellIcon className="size-[19px]" name="bolt" />
        </span>
        <span className="tx">
          <span className="n">＋ {t("workbench.createOmp")}</span>
          <span className="d">{t("workbench.createOmpDesc")}</span>
        </span>
        <span className="ar">›</span>
      </button>
      <div className="slabel">{t("workbench.createGroupTerminal")}</div>
      <button
        className="srow w-full cursor-pointer text-left"
        disabled={create.isCreating}
        onClick={() => dismiss(create.createTerminal)}
        type="button"
      >
        <span className="tile bg-tint-green text-success">
          <ShellIcon className="size-[19px]" name="terminal" />
        </span>
        <span className="tx">
          <span className="n">{t("workbench.createTerminalFull")}</span>
          <span className="d">{t("workbench.createTerminalDesc")}</span>
        </span>
        <span className="ar">›</span>
      </button>
    </MobileSheet>
  );
}

/**
 * M5-b 审批中心 sheet（11 原型）：shd = 标题 + .cnt 计数 + .all 全部允许（二次确认）；
 * acard = dot + 会话名 + pj 项目 chip + cmd mono 摘要 + 拒绝/允许；sfoot 操作说明。
 * runtimeAlive=false 卡置灰禁响应（断线冻结，spec 验收）；点卡跳会话由 onOpenSession 装配。
 */
export function MobileApprovalSheet({
  approvals,
  onOpenChange,
  onOpenSession,
  open,
}: {
  /** 待审批快照（调用方 useApprovals 单订阅，页面与 sheet 共用一份数据）。 */
  approvals: ApprovalSummary[];
  onOpenChange: (open: boolean) => void;
  /** 点卡跳会话（断线冻结卡不可点）。 */
  onOpenSession: (projectName: string, sessionId: string) => void;
  open: boolean;
}) {
  const { t } = useT();
  const respond = useRespondApproval();
  // 「全部允许」二次确认：首点进入待确认态（文案切换），再点执行；关 sheet 或应答完还原。
  const [confirmAll, setConfirmAll] = useState(false);
  const pendingCount = approvals.length;

  const respondAll = () => {
    // 逐个转发（§6.4：批量允许=逐个调用，同会话内 CLI 逐条消费）。allSettled：部分失败时
    // 失败卡留在列表可重试（成功卡已被服务端注销广播移除），全部落定后退出确认态。
    void Promise.allSettled(
      approvals.map((item) =>
        respond.mutateAsync({
          controlRequestId: item.controlRequestId,
          decision: "allow",
          projectName: item.projectName,
          sessionId: item.sessionId,
        }),
      ),
    ).then(() => setConfirmAll(false));
  };

  return (
    <MobileSheet
      headerExtra={
        pendingCount > 0 ? (
          <>
            <span className="cnt">{t("approvals.nPending", { count: pendingCount })}</span>
            <button
              className="all cursor-pointer"
              disabled={respond.isPending}
              onClick={() => (confirmAll ? respondAll() : setConfirmAll(true))}
              type="button"
            >
              {confirmAll
                ? t("approvals.confirmAll", { count: pendingCount })
                : t("approvals.allowAll")}
            </button>
          </>
        ) : null
      }
      onOpenChange={(next) => {
        if (!next) setConfirmAll(false);
        onOpenChange(next);
      }}
      open={open}
      title={t("approvals.title")}
    >
      {pendingCount === 0 ? (
        <p className="hfoot">{t("approvals.empty")}</p>
      ) : (
        approvals.map((item) => (
          <div className={`acard${item.runtimeAlive ? "" : " off"}`} key={item.controlRequestId}>
            <div className="r1">
              <span className={`dot ${item.runtimeAlive ? "run" : "ring"}`} />
              <button
                className="min-w-0 cursor-pointer truncate bg-transparent text-left font-inherit"
                disabled={!item.runtimeAlive}
                onClick={() => {
                  onOpenChange(false);
                  onOpenSession(item.projectName, item.sessionId);
                }}
                title={item.sessionName}
                type="button"
              >
                {item.sessionName}
              </button>
              <span className="pj">{item.projectName}</span>
            </div>
            <div className={`cmd${isHotTool(item) ? " hot" : ""}`}>{item.inputSummary}</div>
            <div className="r3">
              <button
                className="btn ghost cursor-pointer"
                disabled={!item.runtimeAlive || respond.isPending}
                onClick={() =>
                  respond.mutate({
                    controlRequestId: item.controlRequestId,
                    decision: "deny",
                    projectName: item.projectName,
                    sessionId: item.sessionId,
                  })
                }
                type="button"
              >
                {t("claude.permission.deny")}
              </button>
              <button
                className="btn ok cursor-pointer"
                disabled={!item.runtimeAlive || respond.isPending}
                onClick={() =>
                  respond.mutate({
                    controlRequestId: item.controlRequestId,
                    decision: "allow",
                    projectName: item.projectName,
                    sessionId: item.sessionId,
                  })
                }
                type="button"
              >
                {t("claude.permission.allow")}
              </button>
            </div>
          </div>
        ))
      )}
      {/* 应答失败行内提示（mutation isError；再点任意按钮自动重置——SessionDetailRoute 先例）。 */}
      {respond.isError ? (
        <p className="hfoot text-error">{t("api.approvalsRespondFailed")}</p>
      ) : null}
      <div className="sfoot">{t("approvals.foot")}</div>
    </MobileSheet>
  );
}
