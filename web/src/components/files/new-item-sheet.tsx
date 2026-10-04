import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";

import { createFile, createFolder } from "../../api/client";
import { useIsMobile } from "../../lib/use-is-mobile";
import { useT } from "../../i18n";
import { gitDiffListQueryKey } from "../git/git-diff-viewer";
import { Dialog, DialogContent, DialogTitle } from "../ui/dialog";
import { MobileSheet } from "../shell/mobile-sheet";
import { shellSurfaceClasses } from "../shell/shell-primitives";

/**
 * 03y 新建 sheet 单源（v1.4 批4）：文件 | 文件夹 segc 二选一 + 名称 kfield + 位置只读
 * .skrow + 取消/创建 kbtns；创建的是空文件/空文件夹（内容交给 Agent，03y 编号④）。
 *
 * 多端同容器：移动 = MobileSheet 半屏（03y 原型形态），桌面 = 居中 Dialog（04c 形制），
 * 内容同一段。重名即时行内校验（对比 siblingNames，创建钮禁用）+ 服务端 409 兜底
 *（PROJECT_FILE_TARGET_EXISTS 是本链路唯一 409，api/src/index.ts 错误映射单点）行内红字。
 * 成功失效 files 列表 + git diff（新文件即未跟踪条目）。
 */
export function NewItemSheet({
  open,
  onOpenChange,
  projectName,
  parentPath,
  siblingNames,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectName: string;
  /** 目标父目录（项目内相对路径，"" = 项目根）。 */
  parentPath: string;
  /** 同目录既有条目名（即时重名校验用；调用方从 files 列表派生）。 */
  siblingNames: string[];
}) {
  const { t } = useT();
  const queryClient = useQueryClient();
  const isMobile = useIsMobile();
  const [kind, setKind] = useState<"file" | "folder">("file");
  const [name, setName] = useState("");
  const [serverConflict, setServerConflict] = useState(false);
  // 服务端 409 竞态兜底：客户端 siblingNames 快照可能过期（他人/进程新建同名校验不到）。
  const createMutation = useMutation({
    mutationFn: ({ kind: k, name: n }: { kind: "file" | "folder"; name: string }) =>
      k === "file"
        ? createFile(projectName, parentPath, n)
        : createFolder(projectName, parentPath, n),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["projects", projectName, "files"] });
      void queryClient.invalidateQueries({ queryKey: gitDiffListQueryKey(projectName) });
      onOpenChange(false);
    },
    onError: (error) => {
      if (error.message.endsWith(": 409")) setServerConflict(true);
    },
  });
  // 每次打开重置（上次输入/冲突提示不残留；卸载复位对常驻挂载的 holder 不适用——本组件
  // 由调用方条件渲染或常驻，open 沿触发统一重置）。
  useEffect(() => {
    if (open) {
      setKind("file");
      setName("");
      setServerConflict(false);
    }
  }, [open]);

  const trimmed = name.trim();
  // 03y 编号③：重名即时行内提示（红字 + 创建禁用）；服务端 409 兜底同位显示。
  const nameConflict = siblingNames.includes(trimmed);
  const canCreate = trimmed.length > 0 && !nameConflict && !createMutation.isPending;

  const submit = () => {
    if (!canCreate) return;
    setServerConflict(false);
    createMutation.mutate({ kind, name: trimmed });
  };

  const body = (
    <div className="flex flex-col">
      <div aria-label={t("files.newItemType")} className="segc" role="tablist">
        <span
          aria-selected={kind === "file"}
          className={`cursor-pointer ${kind === "file" ? "on" : ""}`}
          key="file"
          onClick={() => setKind("file")}
          role="tab"
          tabIndex={0}
        >
          {t("files.newItemTypeFile")}
        </span>
        <span
          aria-selected={kind === "folder"}
          className={`cursor-pointer ${kind === "folder" ? "on" : ""}`}
          key="folder"
          onClick={() => setKind("folder")}
          role="tab"
          tabIndex={0}
        >
          {t("files.newItemTypeFolder")}
        </span>
      </div>
      <label className="klabel" htmlFor="new-item-name">
        {t("files.newItemName")}
      </label>
      <div className="kfield mono">
        {/* 不 autoFocus（MobileSheet 基座统一拦 initial focus）：键盘与 sheet 升起动画
            同时唤起打架，聚焦交用户点击输入框的主动行为（2026-10-04 用户拍板）。 */}
        <input
          aria-label={t("files.newItemName")}
          autoComplete="off"
          id="new-item-name"
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") submit();
          }}
          placeholder={kind === "file" ? t("files.newItemName") : t("files.newFolder")}
          type="text"
          value={name}
        />
      </div>
      {nameConflict || serverConflict ? (
        <div className="mt-1.5 text-[11px] text-error" role="alert">
          {t("files.nameExists")}
        </div>
      ) : null}
      <div className="skrow">
        <span>{t("files.newItemLocation")}</span>
        <span className="v mono">
          {parentPath.length > 0 ? parentPath : t("files.projectRoot")}
        </span>
      </div>
      <div className="kbtns">
        <button className="c" onClick={() => onOpenChange(false)} type="button">
          {t("cancel")}
        </button>
        <button className="p solid" disabled={!canCreate} onClick={submit} type="button">
          {t("files.create")}
        </button>
      </div>
    </div>
  );

  if (isMobile) {
    return (
      <MobileSheet onOpenChange={onOpenChange} open={open} title={t("files.newItemTitle")}>
        {body}
      </MobileSheet>
    );
  }
  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent className="max-w-sm sm:max-w-sm">
        <div
          className={`rounded-2xl p-5 shadow-2xl shadow-black/40 ${shellSurfaceClasses.workspace}`}
        >
          <DialogTitle className="text-base font-semibold text-on-surface">
            {t("files.newItemTitle")}
          </DialogTitle>
          {body}
        </div>
      </DialogContent>
    </Dialog>
  );
}
