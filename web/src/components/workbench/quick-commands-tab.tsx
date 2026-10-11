import { useEffect, useState } from "react";

import { useT } from "../../i18n";
import { groupedCommands, newCommandId, type QuickCommand } from "../../routes/console-model";
import { LucideIcon } from "../shell/lucide-icon";
import {
  ActionMenu,
  useLongPressActions,
  useRowContextMenu,
  type ActionMenuItem,
} from "../ui/action-menu";

/** 名称长度上限（24，原按键域同口径）：面板行 truncate 兜底，输入端封口。 */
const QUICK_COMMAND_LABEL_MAX = 24;

/** 脚本首行预览截断宽度（行上单行小字，超出省略——多行脚本只示意首行）。 */
const SCRIPT_PREVIEW_MAX = 32;

type QuickCommandsTabProps = {
  /** 命令全集（route 读 terminalQuickCommandsAtom 传入，默认序）。 */
  commands: QuickCommand[];
  /** 可发送（WS connected）：false 时行禁用（与 .qkey 键帽 disabled 态同口径）。 */
  canSend: boolean;
  /** 面板开合（草稿清理：form 挂常驻挂载的本组件上，Portal 卸载不触达实例卸载——
   * 关面板不清则重开带半填表单，同 quick-keys-editor 口径；切到键盘 tab 亦即弃，
   * form 挂 tab 条件分支内，口径记档：轻量输入不做跨 tab 保活）。 */
  open: boolean;
  /** 行点按 = 执行；菜单「仅插入」。发送与关面板由调用方（route）编排。 */
  onAction: (cmd: QuickCommand, mode: "run" | "insert") => void;
  /** 命令保存（id 已存在 = 更新，否则创建——route 写 terminalQuickCommandsAtom）。 */
  onSave: (cmd: QuickCommand) => void;
  /** 命令删除。 */
  onDelete: (id: string) => void;
};

/**
 * 命令 tab（两域分离 2026-10-11 拍板，Termius snippets 侧面板对标）：命令 = 保存的命令
 * 文本（名称/分组/多行脚本），面向 shell 执行——与「按键」（控制序列）分域。行交互 =
 * **tap 执行**；触屏**长按** 或桌面**右键**弹菜单（执行/仅插入/编辑/删除），双行为经
 * useLongPressActions + useRowContextMenu + ActionMenu 三件套（file-tree-rows 同款接线：
 * 行内 hidden trigger ActionMenu，坐标/长按双触发路径）。
 */
export function QuickCommandsTab({
  canSend,
  commands,
  open,
  onAction,
  onSave,
  onDelete,
}: QuickCommandsTabProps) {
  const { t } = useT();
  // 命令编辑表单（id 空 = 新建）：面板内局部态，关闭面板不自动提交（取消即弃）。
  const [form, setForm] = useState<{
    group: string;
    id: string;
    label: string;
    script: string;
  } | null>(null);
  // 草稿清理（code review 2026-10-11 同族）：面板关闭清表单草稿。
  useEffect(() => {
    if (!open) setForm(null);
  }, [open]);
  // 长按/右键菜单（file-tree-rows 同款）：ctx 持坐标态，lp 绑触屏长按（500ms + slop +
  // guardClick 抑制长按后合成 click——tap=执行 与长按菜单互斥的判定面）。
  const ctx = useRowContextMenu();
  const lp = useLongPressActions(ctx.openAt);
  const groups = groupedCommands(commands);
  const knownGroups = [...new Set(commands.map((c) => c.group).filter(Boolean))];

  const menuItems = (cmd: QuickCommand): ActionMenuItem[] => [
    { label: t("session.quickCommandsRun"), onSelect: () => onAction(cmd, "run") },
    { label: t("session.quickCommandsInsert"), onSelect: () => onAction(cmd, "insert") },
    { label: t("session.quickCommandsEdit"), onSelect: () => setForm({ ...cmd }) },
    {
      label: t("session.quickCommandsDelete"),
      onSelect: () => onDelete(cmd.id),
      variant: "destructive",
    },
  ];

  /** 命令保存：名称/脚本 trim 非空校验 + id 生成（新建），提交后收表单。 */
  const saveCommand = () => {
    if (!form) return;
    const label = form.label.trim();
    const script = form.script.trim();
    if (!label || !script) return;
    onSave({ id: form.id || newCommandId(), label, script, group: form.group.trim() });
    setForm(null);
  };

  return (
    <>
      <p className="mt-0.5 text-xs font-semibold text-ink-2">{t("session.quickCommandsHint")}</p>
      {commands.length === 0 && !form ? (
        <p className="py-6 text-center text-sm text-ink-2">{t("session.quickCommandsEmpty")}</p>
      ) : null}
      {groups.map((g) => (
        <section key={g.group || "default"}>
          <p className="mb-1 mt-3 text-xs font-semibold text-ink-2">
            {g.group || t("session.quickCommandsDefaultGroup")}
          </p>
          <ul className="border-t border-sep-row">
            {g.items.map((cmd) => (
              <li
                className="relative flex items-center border-b border-sep-row last:border-b-0"
                key={cmd.id}
              >
                <button
                  className="flex min-w-0 flex-1 cursor-pointer items-center gap-3 py-2.5 text-left disabled:cursor-default disabled:opacity-40"
                  disabled={!canSend}
                  onClick={(e) => {
                    // ActionMenu scrim click 按 fiber 冒泡到行（frontend-notes §4）：target 在
                    // body 不在行内 → 忽略；guardClick 抑制长按后紧随的合成 click（02c 同款）。
                    if (e.target !== e.currentTarget && !e.currentTarget.contains(e.target as Node))
                      return;
                    if (lp.guardClick()) return;
                    onAction(cmd, "run");
                  }}
                  onContextMenu={(e) => ctx.openAt(cmd.id, e)}
                  type="button"
                  {...lp.bind(cmd.id)}
                >
                  <span className="min-w-0 flex-1 truncate text-sm">{cmd.label}</span>
                  <span className="shrink-0 font-mono text-xs text-ink-2">
                    {scriptPreview(cmd.script)}
                  </span>
                </button>
                {/* 行尾编辑入口（36px 热区同键盘 tab pencil 口径：-m-2 p-2.5 + ml-1 缝）。 */}
                <button
                  aria-label={t("session.quickCommandsEdit")}
                  className="-m-2 ml-1 flex shrink-0 cursor-pointer items-center justify-center rounded-md p-2.5 text-ink-2 transition hover:bg-ink-1/5 hover:text-ink-1"
                  onClick={() => setForm({ ...cmd })}
                  title={t("session.quickCommandsEdit")}
                  type="button"
                >
                  <LucideIcon className="size-4" name="pencil" />
                </button>
                <ActionMenu
                  cancelLabel={t("cancel")}
                  contextMenuPoint={ctx.pointFor(cmd.id)}
                  items={menuItems(cmd)}
                  onContextMenuClose={ctx.close}
                  trigger={<span className="hidden" />}
                />
              </li>
            ))}
          </ul>
        </section>
      ))}
      {/* 添加行 + 命令编辑表单（键盘 tab 添加行/表单同款布局：表单展开时隐藏添加行）。 */}
      <button
        className={`mt-1 flex w-full cursor-pointer items-center justify-center gap-2 py-3 text-sm font-semibold text-primary ${
          form ? "hidden" : ""
        }`}
        onClick={() => setForm({ id: "", label: "", script: "", group: "" })}
        type="button"
      >
        <LucideIcon className="size-4" name="plus" />
        {t("session.quickCommandsAdd")}
      </button>
      {form ? (
        <div className="mt-1 flex flex-col gap-2 rounded-[10px] border border-sep-strong p-3">
          <label className="text-xs font-semibold text-ink-2" htmlFor="qc-form-label">
            {t("session.quickCommandsNameLabel")}
          </label>
          <input
            className="w-full rounded-[10px] border border-sep-strong bg-elevated2 px-3 py-2 text-sm text-ink-1 placeholder:text-ink-2 transition focus:border-primary focus:outline-none"
            id="qc-form-label"
            maxLength={QUICK_COMMAND_LABEL_MAX}
            onChange={(e) => setForm({ ...form, label: e.target.value })}
            placeholder={t("session.quickCommandsNamePlaceholder")}
            value={form.label}
          />
          <label className="text-xs font-semibold text-ink-2" htmlFor="qc-form-group">
            {t("session.quickCommandsGroupLabel")}
          </label>
          {/* 分组 = 自由文本标签 + datalist 提示既有组名（空 = 默认分组；不做组管理页）。 */}
          <input
            className="w-full rounded-[10px] border border-sep-strong bg-elevated2 px-3 py-2 text-sm text-ink-1 placeholder:text-ink-2 transition focus:border-primary focus:outline-none"
            id="qc-form-group"
            list="qc-group-options"
            onChange={(e) => setForm({ ...form, group: e.target.value })}
            placeholder={t("session.quickCommandsGroupPlaceholder")}
            value={form.group}
          />
          <datalist id="qc-group-options">
            {knownGroups.map((g) => (
              <option key={g} value={g} />
            ))}
          </datalist>
          <label className="text-xs font-semibold text-ink-2" htmlFor="qc-form-script">
            {t("session.quickCommandsScriptLabel")}
          </label>
          <textarea
            className="w-full resize-none rounded-[10px] border border-sep-strong bg-elevated2 px-3 py-2 font-mono text-sm text-ink-1 placeholder:text-ink-2 transition focus:border-primary focus:outline-none"
            id="qc-form-script"
            onChange={(e) => setForm({ ...form, script: e.target.value })}
            placeholder={t("session.quickCommandsScriptPlaceholder")}
            rows={3}
            value={form.script}
          />
          <div className="flex items-center justify-between gap-2">
            {/* 删除 = 编辑已有命令时的显式动作（左下红字；新建态无此钮）——危险动作
               收进表单，行上不留高频误触面（键盘 tab 同款口径）。 */}
            {form.id ? (
              <button
                className="cursor-pointer rounded-[10px] px-3 py-2 text-[13px] font-semibold text-error transition hover:bg-error/5"
                onClick={() => {
                  onDelete(form.id);
                  setForm(null);
                }}
                type="button"
              >
                {t("session.quickCommandsDelete")}
              </button>
            ) : null}
            <div className="flex gap-2">
              <button
                className="cursor-pointer rounded-[10px] px-3 py-2 text-[13px] text-ink-2 transition hover:bg-ink-1/5"
                onClick={() => setForm(null)}
                type="button"
              >
                {t("cancel")}
              </button>
              <button
                className="cursor-pointer rounded-[10px] bg-primary px-3 py-2 text-[13px] font-semibold text-on-accent disabled:cursor-default disabled:opacity-40"
                disabled={!form.label.trim() || !form.script.trim()}
                onClick={saveCommand}
                type="button"
              >
                {t("session.quickCommandsSave")}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}

/** 脚本首行预览（行上单行小字；Termius 行有脚本预览），超出截断省略。 */
function scriptPreview(script: string): string {
  const line = script.split("\n", 1)[0] ?? "";
  return line.length > SCRIPT_PREVIEW_MAX ? `${line.slice(0, SCRIPT_PREVIEW_MAX)}…` : line;
}
