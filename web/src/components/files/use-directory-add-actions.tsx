import { useQuery } from "@tanstack/react-query";
import { useRef, useState } from "react";

import { listProjectFiles } from "../../api/client";
import { NewItemSheet } from "./new-item-sheet";
import { enqueueUploads } from "./upload-queue";

/**
 * 目录「新建/上传」装配双端单源 hook（03y 新建 sheet + 03oa 上传 picker 三件套，全局同构
 * review 批收敛）：此前 4 处手写同构装配（桌面 mainPage / 桌面右栏 FAB / 移动检视面板 FAB /
 * 移动全局文件页），其中 mainPage 与全局文件页 siblingNames 硬编码 []——重名即时校验失效
 *（本批修复为真实 query）。hook 内置：newItemParentPath state（非空持有 open）+ hidden
 * input ref 时序（targetRef 先写再 click）+ sibling files query（sheet 开启才启用，与页面
 * files 列表同 queryKey dedupe 零常态网络）。触发钮形态留调用方（AddMenu trigger prop）；
 * enabled=false（服务器根目录不可写——Project-safe resolver 无项目名）时 onNew/onUpload
 * no-op。新建/上传都落到调用方给定的当前目录。
 */
export function useDirectoryAddActions({
  dir,
  enabled = true,
  projectName,
}: {
  /** 目标父目录（项目内相对路径，"" = 项目根）。 */
  dir: string;
  /** 目录可写门（false 时动作 no-op；newItemSheet/uploadInput 不渲染内容，恒可安全挂载）。 */
  enabled?: boolean;
  /** 目标项目名。 */
  projectName: string;
}) {
  const [newItemParentPath, setNewItemParentPath] = useState<string | null>(null);
  const uploadInputRef = useRef<HTMLInputElement>(null);
  const uploadTargetRef = useRef("");
  // 重名即时校验数据源：与页面 files 列表同 key 共享缓存（sheet 开启才启用，零常态网络）。
  const filesListing = useQuery({
    enabled: newItemParentPath !== null,
    queryFn: () => listProjectFiles(projectName, dir || undefined),
    queryKey: ["projects", projectName, "files", dir],
  });
  return {
    addProps: {
      onNew: () => {
        if (enabled) setNewItemParentPath(dir);
      },
      onUpload: () => {
        if (!enabled) return;
        uploadTargetRef.current = dir;
        uploadInputRef.current?.click();
      },
    },
    newItemSheet:
      newItemParentPath !== null ? (
        <NewItemSheet
          onOpenChange={(next) => {
            if (!next) setNewItemParentPath(null);
          }}
          open
          parentPath={newItemParentPath}
          projectName={projectName}
          siblingNames={
            newItemParentPath === dir ? (filesListing.data?.entries ?? []).map((e) => e.name) : []
          }
        />
      ) : null,
    uploadInput: (
      <input
        className="hidden"
        multiple
        onChange={(e) => {
          if (e.target.files && e.target.files.length > 0) {
            enqueueUploads(projectName, uploadTargetRef.current, Array.from(e.target.files));
          }
          e.target.value = "";
        }}
        ref={uploadInputRef}
        type="file"
      />
    ),
  };
}
