import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";

import { createFolder, listProjectFiles } from "../../api/client";
import { useIsMobile } from "../../lib/use-is-mobile";
import { useT } from "../../i18n";
import { Dialog, DialogContent, DialogTitle } from "../ui/dialog";
import { MobileSheet } from "../shell/mobile-sheet";

/**
 * 03w3 移动到… 目录选择 sheet（v1.4 批4）。项目根起树逐层浏览（pin②）：当前目录行（✓ =
 * 选中目标）+ .. 返回 + 子目录行进入（排除被移动对象自身与子级）；「＋ 新建文件夹…」就地
 * 创建（03y 文件夹态内联，不离开本 sheet）；「移动到此处」= 确认 browsePath。
 * mutation 留调用方（onSubmit(targetDir)——rename targetDir 链路在调用方已有）。
 */
export function MoveSheet({
  entryName,
  excludePath,
  onOpenChange,
  onSubmit,
  open,
  projectName,
}: {
  entryName: string;
  excludePath: string;
  onOpenChange: (open: boolean) => void;
  onSubmit: (targetDir: string) => void;
  open: boolean;
  projectName: string;
}) {
  const { t } = useT();
  const queryClient = useQueryClient();
  const isMobile = useIsMobile();
  // 浏览目录（根起树；open 沿重置，上次浏览位不残留）。
  const [browsePath, setBrowsePath] = useState("");
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [nameConflict, setNameConflict] = useState(false);
  useEffect(() => {
    if (open) {
      setBrowsePath("");
      setCreating(false);
      setNewName("");
      setNameConflict(false);
    }
  }, [open]);

  // 与 FilesToolPanel 同 key（缓存去重）；browsePath 逐键切 key 用 keepPreviousData 不闪。
  const listing = useQuery({
    placeholderData: keepPreviousData,
    queryFn: () => listProjectFiles(projectName, browsePath || undefined),
    queryKey: ["projects", projectName, "files", browsePath],
  });
  // 排除自身与子级（pin② 默认排除）：目录候选 = 当前层子目录 − 被移动对象子树。
  const dirs = (listing.data?.entries ?? []).filter(
    (e) =>
      e.type === "directory" && e.path !== excludePath && !e.path.startsWith(`${excludePath}/`),
  );
  const originalDir = excludePath.includes("/")
    ? excludePath.slice(0, excludePath.lastIndexOf("/"))
    : "";

  const createMutation = useMutation({
    mutationFn: (name: string) => createFolder(projectName, browsePath, name),
    onSuccess: (_data, name) => {
      void queryClient.invalidateQueries({ queryKey: ["projects", projectName, "files"] });
      setBrowsePath(browsePath.length > 0 ? `${browsePath}/${name}` : name);
      setCreating(false);
    },
    onError: (error) => {
      if (error.message.endsWith(": 409")) setNameConflict(true);
    },
  });

  const dirRows = dirs.map((dir) => (
    <button
      className="mvrow"
      key={dir.path}
      onClick={() => {
        setBrowsePath(dir.path);
        setCreating(false);
      }}
      type="button"
    >
      <span className="nm dir">{dir.name}</span>
    </button>
  ));

  // 每层视图 = 当前目录行（✓ = 选中目标）+ .. 行（非根）+ 子目录行 + 新建文件夹行。
  const body = (
    <div className="flex flex-col">
      {/* 当前目录行：当前浏览目录即选中目标（✓），点击无操作。 */}
      <div className="mvrow">
        <span className="nm dir">
          {browsePath.length > 0 ? browsePath.slice(browsePath.lastIndexOf("/") + 1) : projectName}
          {browsePath.length === 0 ? (
            <span className="sub">（{t("files.projectRoot")}）</span>
          ) : null}
        </span>
        <span className="ck">✓</span>
      </div>
      {browsePath.length > 0 ? (
        <button
          className="mvrow"
          onClick={() => {
            setBrowsePath(browsePath.slice(0, browsePath.lastIndexOf("/")));
            setCreating(false);
          }}
          type="button"
        >
          <span className="nm">..</span>
        </button>
      ) : null}
      {dirRows}
      {creating ? (
        <div className="flex flex-col">
          <div className="kfield mono mt-1">
            <input
              aria-label={t("files.moveCreateFolder")}
              autoComplete="off"
              autoFocus
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  const n = newName.trim();
                  if (n.length === 0) return;
                  setNameConflict(false);
                  createMutation.mutate(n);
                }
                if (e.key === "Escape") setCreating(false);
              }}
              placeholder={t("files.newFolder")}
              type="text"
              value={newName}
            />
          </div>
          {nameConflict ? (
            <div className="mt-1 text-[11px] text-error">{t("files.nameExists")}</div>
          ) : null}
        </div>
      ) : (
        <button
          className="mnew"
          onClick={() => {
            setCreating(true);
            setNewName("");
            setNameConflict(false);
          }}
          type="button"
        >
          <span aria-hidden="true">＋</span>
          {t("files.moveCreateFolder")}
        </button>
      )}
      <div className="kbtns">
        <button className="c" onClick={() => onOpenChange(false)} type="button">
          {t("cancel")}
        </button>
        <button
          className="p solid"
          disabled={browsePath === originalDir}
          onClick={() => {
            onOpenChange(false);
            onSubmit(browsePath);
          }}
          type="button"
        >
          {t("files.moveToHere")}
        </button>
      </div>
    </div>
  );

  if (isMobile) {
    return (
      <MobileSheet
        onOpenChange={onOpenChange}
        open={open}
        title={t("files.moveTitle", { name: entryName })}
      >
        {body}
      </MobileSheet>
    );
  }
  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent className="max-w-sm">
        <div className="rounded-2xl p-5">
          <DialogTitle className="text-base font-semibold text-on-surface">
            {t("files.moveTitle", { name: entryName })}
          </DialogTitle>
          {body}
        </div>
      </DialogContent>
    </Dialog>
  );
}
