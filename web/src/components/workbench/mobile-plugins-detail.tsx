import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import type { AddMcpServerRequest, McpServerType } from "@agents-remote/shared";

import { useT } from "../../i18n";
import { DEFAULT_SKILL_AGENT, parseEnvLines } from "../../routes/plugins-shared";
import { useWorkbenchBack } from "../../routes/workbench-model";
import {
  useAddMcpServer,
  useMcpServers,
  useRemoveMcpServer,
  useSetMcpDisabled,
} from "../../hooks/mcp";
import {
  useCheckSkillUpdates,
  useInstalledSkills,
  useSetSkillDisabled,
  useSkillPreview,
  useUninstallSkill,
  useUpdateSkill,
} from "../../hooks/skills";
import { MarkdownString } from "../markdown/MarkdownString";
import { useConfirm } from "../shell/confirm-dialog";
import { MobileSheet } from "../shell/mobile-sheet";
import { PluginNav } from "./mobile-plugins-market";

/**
 * 12 技能详情移动页（v2 M6，spec §3.5）：nav（‹ 已安装技能 / mono 名 = name 单点展示）→
 * dtitle（仅「有更新」时承载 chip）→ dmeta（来源 · 作用域）→ ddesc（frontmatter description）→
 * SKILL.md 正文段（FrontmatterCard 排除 name/description，第七轮去重）→ 更新
 * CTA（有更新时）→ 卸载 → 卸载确认 Alert(spec §5:删除类确认走 useConfirm,不走 sheet)。
 *
 * 能力边界（§6.6 摊牌 + M6-b 记档）：原型 12 的 upcard（更新内容 changelog）与「注入给 Agent 的
 * 能力」arow 无数据源（SkillUpdateStatus 只有 hasUpdate/manageable/sourceUrl；skill 无
 * capabilities 声明）不画；「已启用」toggle（v1.4 批6，09b）= 停用/启用（保留文件、停止注入，
 * 服务端 rename 进/出停用区 + reload 闭环）；版本号
 * 无数据源（npx skills 不回版本），dmeta/CTA 均不带版本。更新流 = 列表页手动「检查更新」→
 * hasUpdate 出 chip + CTA → update 202 + SSE waitForSkillTask（hook 内置乐观 hasUpdate:false，
 * 完成后 chip/CTA 消失）。SKILL.md 正文段是实现扩展（有据：useSkillPreview 读本地文件），保留
 * v1 起的只读预览能力。
 */
export function MobileSkillDetail({ name }: { name: string }) {
  const { t } = useT();
  const navigate = useNavigate();
  const updates = useCheckSkillUpdates(DEFAULT_SKILL_AGENT);
  const preview = useSkillPreview(name, DEFAULT_SKILL_AGENT);
  const update = useUpdateSkill();
  const uninstall = useUninstallSkill();
  const installed = useInstalledSkills(DEFAULT_SKILL_AGENT);
  const setDisabled = useSetSkillDisabled();
  const { confirm, holder } = useConfirm();

  const skillEntry = (installed.data?.skills ?? []).find((s) => s.name === name);
  // 停用态（批6）：列表项 disabled 字段（服务端 rename 进停用区）。undefined = 未检出（防御）。
  const skillDisabled = Boolean(skillEntry?.disabled);
  // 来源行（原型 12 dmeta「来源:x · 全局作用域」，2026-10-04 对齐）：与 09 列表副行同源
  //（installed 的锁 slug）；不用 preview.source（realpath 文件路径，非来源语义）。
  // skillEntry 未检出（installed 加载窗，深链/刷新直达 query 缓存冷）= 未知 ≠ 本地，
  // 来源段不渲染（design review P2：防「先本地后跳变 slug」闪变）。
  const sourceLabel = skillEntry
    ? skillEntry.source
      ? t("plugins.skillSource", { source: skillEntry.source })
      : t("plugins.skillLocal")
    : null;

  // 「有更新」仅手动检测出结果后出现（updates.data undefined = 尚未检测），与 09 列表 chip 同源。
  const hasUpdate = (updates.data?.updates ?? []).some((u) => u.name === name && u.hasUpdate);
  // back pop 优先（导航栈同族，第十一轮复验）；深链直达无来路时 push /plugins 兜底。
  const backNav = useWorkbenchBack();
  const back = () => backNav(() => void navigate({ to: "/plugins" }));

  return (
    <div className="flex h-full min-h-0 flex-col">
      <PluginNav backLabel={t("skills.installedTitle")} mono onBack={back} title={name} />
      <div className="min-h-0 flex-1 overflow-y-auto pb-[max(16px,var(--shell-mobile-bottom-nav-space,0px))]">
        {/* name 已在 nav h1 单点展示（第七轮去重）；dtitle 仅在「有更新」时承载 chip。 */}
        {hasUpdate ? (
          <div className="dtitle">
            <span className="dchips">
              <span className="dchip up">{t("skills.hasUpdate")}</span>
            </span>
          </div>
        ) : null}
        <div className="dmeta">
          {[sourceLabel, t("plugins.scopeGlobal")].filter(Boolean).join(" · ")}
        </div>
        {preview.data?.description ? <div className="ddesc">{preview.data.description}</div> : null}

        {/* 已启用 toggle（v1.4 批6，09b）：停用 = 保留文件与配置、停止注入（目录 rename 进停用区）。
            停用后详情页保留（文件未删），toggle 可再启用；停用中更新 CTA 隐藏（服务端守卫拒绝更新停用技能）。 */}
        <button
          aria-checked={!skillDisabled}
          className="flex w-full cursor-pointer items-center justify-between gap-3 rounded-lg px-4 py-1 text-left transition hover:bg-surface-inset/40 disabled:cursor-default disabled:opacity-60"
          disabled={setDisabled.isPending}
          onClick={() =>
            setDisabled.mutate({ name, agent: DEFAULT_SKILL_AGENT, disabled: !skillDisabled })
          }
          role="switch"
          type="button"
        >
          <span className="min-w-0">
            <span className="block text-sm font-semibold text-on-surface">
              {t("plugins.enabledToggle")}
            </span>
            <span className="block text-xs leading-5 text-on-surface-muted">
              {t("plugins.enabledToggleNote")}
            </span>
          </span>
          {/* on 态 = success 绿（对齐原型 12 toggle；thumb 用三元互斥，不同时挂两个 bg 类
              ——Tailwind 生成顺序赌注，frontend-notes §11 同族）。 */}
          <span
            className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition ${!skillDisabled ? "bg-success" : "bg-surface-inset"}`}
          >
            <span
              className={`inline-block size-5 transform rounded-full shadow transition ${!skillDisabled ? "translate-x-[1.375rem] bg-on-success" : "translate-x-0.5 bg-on-surface"}`}
            />
          </span>
        </button>
        {setDisabled.error ? (
          <p className="mx-4 mt-2 rounded-lg bg-error/10 px-3 py-2 text-xs text-error">
            {setDisabled.error.message}
          </p>
        ) : null}

        {/* SKILL.md 正文（有据扩展：本地只读预览，原型 12 无此段） */}
        <div className="dsect">
          <span>{t("skills.skillMdSection")}</span>
        </div>
        {preview.isLoading ? (
          <p className="px-4 py-2 text-[11.5px] text-ink-2">…</p>
        ) : preview.error ? (
          <p className="mx-4 rounded-lg bg-error/10 px-3 py-2 text-xs text-error">
            {preview.error.message}
          </p>
        ) : preview.data ? (
          <div className="mx-4 mb-2 rounded-[10px] border border-sep bg-elevated p-3">
            <MarkdownString
              frontmatterExclude={["name", "description"]}
              text={preview.data.content}
            />
          </div>
        ) : null}

        {/* 更新 CTA：仅手动检测出 hasUpdate 后出现（更新流见 JSDoc）；停用中隐藏——
            服务端 update 守卫拒绝停用技能（防复活），CTA 出来也必败。 */}
        {hasUpdate && !skillDisabled ? (
          <>
            <button
              className="cta cursor-pointer"
              disabled={update.isPending}
              onClick={() => {
                void update.mutateAsync({ name, agent: DEFAULT_SKILL_AGENT }).catch(() => {
                  // 失败保留 CTA 区（下方 error 行），可重试。
                });
              }}
              type="button"
            >
              {update.isPending ? t("skills.updating") : t("skills.update")}
            </button>
            {update.error ? (
              <p className="mt-2 rounded-lg bg-error/10 px-3 py-2 text-xs text-error">
                {update.error.message}
              </p>
            ) : (
              <div className="ctanote">{t("skills.updateNote")}</div>
            )}
          </>
        ) : null}

        <button
          className="rm cursor-pointer"
          disabled={uninstall.isPending}
          onClick={() => {
            void confirm({
              cancelLabel: t("cancel"),
              confirmLabel: t("skills.uninstall"),
              message: t("skills.uninstallConfirmBody"),
              title: t("skills.uninstallConfirmTitle"),
              tone: "danger",
            }).then((ok) => {
              if (!ok) return;
              void uninstall
                .mutateAsync({ name, agent: DEFAULT_SKILL_AGENT })
                .then(() => back())
                .catch(() => {
                  // 失败:error 行显示在 rmnote 下方,可重试。
                });
            });
          }}
          type="button"
        >
          {t("skills.uninstall")}…
        </button>
        <div className="rmnote">{t("skills.uninstallNote")}</div>
        {uninstall.error ? (
          <p className="mx-4 mt-2 rounded-lg bg-error/10 px-3 py-2 text-xs text-error">
            {uninstall.error.message}
          </p>
        ) : null}
      </div>
      {holder}
    </div>
  );
}

/** MCP 类型文案（i18n 单一实现：09 副行 / 13 配置行 / 14 stabseg 三处共用）。 */
export function mcpTypeLabel(s: { type: McpServerType }, t: ReturnType<typeof useT>["t"]): string {
  if (s.type === "stdio") return t("mcp.typeStdio");
  if (s.type === "sse") return t("mcp.typeSse");
  return t("mcp.typeHttp");
}

/**
 * 13 MCP 服务器详情移动页（v2 M6，spec §3.5）：nav（‹ 插件 / mono 名）→ 配置段（cfg 键值行：
 * 类型/命令/参数/URL/环境变量脱敏）→ 注入范围 → 移除 → 移除确认 Alert(spec §5:删除类确认走 useConfirm,不走 sheet)。
 *
 * 能力边界（§6.6 摊牌）：原型 13 的 stcard（● 已连接/重启/启动时间）与工具清单 trow 不画——
 * 后端不 connect、无运行时状态与工具列表（McpServerEntry 只有静态配置）。env 值脱敏回显
 *（原型编号③「密钥存服务器、脱敏回显」：•••• 不出真值）。编辑走桌面/后续（⋯ 菜单本页不画，
 * 原型编号③的「修改走编辑」入口无移动容器，记档）。
 */
export function MobileMcpDetail({ name }: { name: string }) {
  const { t } = useT();
  const navigate = useNavigate();
  const servers = useMcpServers("user");
  const removeServer = useRemoveMcpServer("user");
  const setMcpDisabled = useSetMcpDisabled("user");
  const { confirm, holder } = useConfirm();

  const entry = (servers.data?.servers ?? []).find((s) => s.name === name);
  // back pop 优先（同 MobileSkillDetail）；深链直达无来路时 push /plugins 兜底。
  const backNav = useWorkbenchBack();
  const back = () => backNav(() => void navigate({ to: "/plugins" }));

  return (
    <div className="flex h-full min-h-0 flex-col">
      <PluginNav backLabel={t("plugins.title")} mono onBack={back} title={name} />
      <div className="min-h-0 flex-1 overflow-y-auto pb-[max(16px,var(--shell-mobile-bottom-nav-space,0px))]">
        <div className="dsect">
          <span>{t("mcp.detailConfig")}</span>
        </div>
        {servers.isLoading ? (
          <p className="px-4 py-2 text-[11.5px] text-ink-2">…</p>
        ) : entry ? (
          <div className="cfg">
            <div className="krow">
              <span className="k">{t("mcp.type")}</span>
              <span className="v">{mcpTypeLabel(entry, t)}</span>
            </div>
            {entry.command ? (
              <div className="krow">
                <span className="k">{t("mcp.command")}</span>
                <span className="v">{[entry.command, ...(entry.args ?? [])].join(" ")}</span>
              </div>
            ) : null}
            {entry.url ? (
              <div className="krow">
                <span className="k">{t("mcp.url")}</span>
                <span className="v">{entry.url}</span>
              </div>
            ) : null}
            {entry.env
              ? Object.keys(entry.env).map((key) => (
                  <div className="krow" key={key}>
                    <span className="k">{key}</span>
                    <span className="v">{t("mcp.envMasked")}</span>
                  </div>
                ))
              : null}
          </div>
        ) : (
          <p className="px-4 py-2 text-[11.5px] text-ink-2">{t("mcp.empty")}</p>
        )}

        <div className="dsect">
          <span>{t("mcp.detailScope")}</span>
        </div>
        <div className="scope">{t("mcp.scopeGlobalValue")}</div>

        {/* 已启用 toggle（v1.4 批6，09b）：停用 = CLI remove + stash 保留配置；启用 = 取回重加。 */}
        <button
          aria-checked={!entry?.disabled}
          className="flex w-full cursor-pointer items-center justify-between gap-3 rounded-lg px-4 py-1 text-left transition hover:bg-surface-inset/40 disabled:cursor-default disabled:opacity-60"
          disabled={setMcpDisabled.isPending}
          onClick={() => setMcpDisabled.mutate({ name, disabled: !entry?.disabled })}
          role="switch"
          type="button"
        >
          <span className="min-w-0">
            <span className="block text-sm font-semibold text-on-surface">
              {t("plugins.enabledToggle")}
            </span>
            <span className="block text-xs leading-5 text-on-surface-muted">
              {t("plugins.enabledToggleNote")}
            </span>
          </span>
          <span
            className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition ${!entry?.disabled ? "bg-primary" : "bg-surface-inset"}`}
          >
            <span
              className={`inline-block size-5 transform rounded-full bg-on-primary shadow transition ${!entry?.disabled ? "translate-x-[1.375rem]" : "translate-x-0.5"} ${!entry?.disabled ? "" : "bg-on-surface"}`}
            />
          </span>
        </button>

        <button
          className="rm cursor-pointer"
          disabled={removeServer.isPending}
          onClick={() => {
            void confirm({
              cancelLabel: t("cancel"),
              confirmLabel: t("mcp.removeConfirmCta"),
              message: t("mcp.removeConfirmBody"),
              title: t("mcp.removeConfirmTitle"),
              tone: "danger",
            }).then((ok) => {
              if (!ok) return;
              void removeServer
                .mutateAsync(name)
                .then(() => back())
                .catch(() => {
                  // 失败:error 行显示在 rmnote 下方,可重试。
                });
            });
          }}
          type="button"
        >
          {t("mcp.remove")}…
        </button>
        <div className="rmnote">{t("mcp.removeNote")}</div>
        {removeServer.error ? (
          <p className="mx-4 mt-2 rounded-lg bg-error/10 px-3 py-2 text-xs text-error">
            {removeServer.error.message}
          </p>
        ) : null}
      </div>
      {holder}
    </div>
  );
}

/**
 * 14 添加 MCP 服务器 sheet（v2 M6，spec §3.5 编号①）：名称 → 传输类型 stabseg（stdio/sse/http
 * 三段，字段随类型切换）→ 命令/参数/环境变量（mono）或 URL → 作用域（只读，随入口 scope）→
 * 取消/添加。
 *
 * 能力边界（§6.6 摊牌 + M6-b 记档）：原型主钮「添加并连接 ›」的自动连接与工具列举无后端面
 *（spawn 时 --mcp-config 注入，无独立 connect 生命周期）——按钮 = 「添加」，snote 说明真实
 * 生效时机（新会话加载）。安全面：snote 保留桌面 McpConfirmDialog 的信任警告（外部 MCP 可访问
 * 本机资源并执行命令），表单提交即确认（移动 sheet 一屏流程，桌面为常驻表单才需二段确认）。
 * 作用域由 09 入口 scope 决定（§3.5 作用域规则），sheet 内不切换。
 */
export function MobileAddMcpSheet({
  open,
  onOpenChange,
  projectName,
  scope,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** project scope 时为项目名（写 <project>/.mcp.json）；undefined = user scope。 */
  projectName?: string;
  scope: "project" | "user";
}) {
  const { t } = useT();
  const addServer = useAddMcpServer(scope, projectName);
  const [name, setName] = useState("");
  const [type, setType] = useState<McpServerType>("stdio");
  const [command, setCommand] = useState("");
  const [args, setArgs] = useState("");
  const [env, setEnv] = useState("");
  const [url, setUrl] = useState("");

  const buildDraft = (): AddMcpServerRequest | null => {
    const trimmedName = name.trim();
    if (!trimmedName) return null;
    if (type === "stdio") {
      const trimmedCommand = command.trim();
      if (!trimmedCommand) return null;
      const argList = args.split(/\s+/).filter(Boolean);
      const envMap = parseEnvLines(env);
      return {
        name: trimmedName,
        type,
        command: trimmedCommand,
        ...(argList.length ? { args: argList } : {}),
        ...(envMap ? { env: envMap } : {}),
      };
    }
    const trimmedUrl = url.trim();
    if (!trimmedUrl) return null;
    return { name: trimmedName, type, url: trimmedUrl };
  };

  const close = () => {
    setName("");
    setType("stdio");
    setCommand("");
    setArgs("");
    setEnv("");
    setUrl("");
    addServer.reset();
    onOpenChange(false);
  };

  return (
    <MobileSheet
      onOpenChange={(next) => {
        // busy 守卫：pending 中禁关（scrim/Esc），防迟到 settle 的 error 残留到下次打开。
        if (!next && !addServer.isPending) close();
      }}
      open={open}
      title={t("mcp.addConfirmTitle")}
    >
      <div className="pb-2">
        <div className="klabel">{t("mcp.name")}</div>
        <input
          aria-label={t("mcp.name")}
          className="kfield cursor-text"
          onChange={(event) => setName(event.target.value)}
          value={name}
        />

        <div className="klabel">{t("mcp.type")}</div>
        <div className="stabseg">
          {(["stdio", "sse", "http"] as const).map((ty) => (
            <button
              className={`cursor-pointer${type === ty ? " on" : ""}`}
              key={ty}
              onClick={() => setType(ty)}
              type="button"
            >
              {mcpTypeLabel({ type: ty }, t)}
            </button>
          ))}
        </div>

        {type === "stdio" ? (
          <>
            <div className="klabel">{t("mcp.command")}</div>
            <input
              aria-label={t("mcp.command")}
              className="kfield mono cursor-text"
              onChange={(event) => setCommand(event.target.value)}
              value={command}
            />
            <div className="klabel">{t("mcp.args")}</div>
            <input
              aria-label={t("mcp.args")}
              className="kfield mono plain cursor-text"
              onChange={(event) => setArgs(event.target.value)}
              value={args}
            />
            <div className="klabel">{t("mcp.env")}</div>
            <textarea
              aria-label={t("mcp.env")}
              className="kfield mono plain h-auto cursor-text items-start py-2"
              onChange={(event) => setEnv(event.target.value)}
              placeholder="KEY=value"
              rows={2}
              value={env}
            />
          </>
        ) : (
          <>
            <div className="klabel">{t("mcp.url")}</div>
            <input
              aria-label={t("mcp.url")}
              className="kfield mono plain cursor-text"
              onChange={(event) => setUrl(event.target.value)}
              value={url}
            />
          </>
        )}

        <div className="skrow">
          <span>{t("plugins.scopeField")}</span>
          <span className="v">
            {scope === "user"
              ? t("mcp.scopeGlobalValue")
              : t("mcp.scopeProjectValue", { name: projectName ?? "" })}
          </span>
        </div>

        {addServer.error ? (
          <p className="mt-2 rounded-lg bg-error/10 px-3 py-2 text-xs text-error">
            {addServer.error.message}
          </p>
        ) : null}
        <div className="kbtns">
          <button
            className="c cursor-pointer"
            disabled={addServer.isPending}
            onClick={close}
            type="button"
          >
            {t("cancel")}
          </button>
          <button
            className="p cursor-pointer"
            disabled={addServer.isPending || !buildDraft()}
            onClick={() => {
              const draft = buildDraft();
              if (!draft) return;
              void addServer
                .mutateAsync(draft)
                .then(() => close())
                .catch(() => {
                  // 失败保留 sheet（error 文案显示），用户可修正后重试。
                });
            }}
            type="button"
          >
            {addServer.isPending ? t("mcp.adding") : `${t("mcp.add")} ›`}
          </button>
        </div>
        <div className="snote">{t("mcp.addSheetNote")}</div>
      </div>
    </MobileSheet>
  );
}
