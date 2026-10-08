import type { ButtonHTMLAttributes, ReactElement } from "react";

import { useT } from "../../i18n";
import { ShellIcon } from "../shell/icons";
import { ActionMenu, type ActionMenuItem } from "../ui/action-menu";

/**
 * 03oa 添加菜单单源（v1.4 批4）：固定两项「新建… / 上传…」，目标目录由调用方按各自语境
 * 解析（检视面板 FAB = 当前 cwd、/files 页 = 当前作用域目录）。容器复用 ActionMenu
 *（桌面锚定 popover / 移动 action sheet 两端分流），本组件只收敛 items 声明与语义回调——
 * 新建 → 03y NewItemSheet、上传 → 03z 上传队列（enqueueUploads）由调用方装配。
 */
export function AddMenu({
  onNew,
  onUpload,
  trigger,
}: {
  onNew: () => void;
  onUpload: () => void;
  /** 触发元素（FAB ＋ / h1 行 ＋ / 工具栏方钮），ActionMenu asChild 注入 toggle/aria。 */
  trigger: ReactElement<ButtonHTMLAttributes<HTMLButtonElement>>;
}) {
  const { t } = useT();
  const items: ActionMenuItem[] = [
    {
      label: t("files.linkCreate"),
      icon: <ShellIcon name="folder-plus" />,
      onSelect: onNew,
    },
    {
      label: t("files.addUpload"),
      icon: <ShellIcon name="upload" />,
      onSelect: onUpload,
    },
  ];
  return <ActionMenu align="end" cancelLabel={t("cancel")} items={items} trigger={trigger} />;
}
