import { useNavigate } from "@tanstack/react-router";
import { useT } from "../../i18n";
import { cn } from "../../lib/utils";
import { OptionMenu } from "../ui/option-menu";
import { useGlobalInstanceCandidates } from "./instance-area";

type ProjectSwitcherProps = {
  /** 当前项目名（scope.key，权威来源，显示在 trigger）。 */
  currentProjectName: string;
  /** 项目名 span 的字体样式（宿主字体基线不同：drawer 顶部行 text-sm / 桌面左栏继承
   *  PanelHeader title 容器 text-base）。 */
  titleClassName?: string;
  /** trigger button 追加 className（cn 合并）。 */
  className?: string;
};

/**
 * 项目切换器（drawer 顶部行 + 桌面左栏 header 共用）：项目名即切换器，点击弹出项目列表
 * （当前项目勾选 disabled），点其他项目直接 navigate 切换。数据源与全局项目列表同源
 * （useGlobalInstanceCandidates kind=global → ["overview"] cache，删建项目自动 invalidate）。
 *
 * isLoaded 未就绪（首次加载 / overview 失败）或 projectNames 为空时降级纯项目名 span
 * （不可点），避免空列表弹出空 sheet。当前项目不在列表（cache stale）时无勾选项，可接受。
 */
export function ProjectSwitcher({
  currentProjectName,
  titleClassName,
  className,
}: ProjectSwitcherProps) {
  const { t } = useT();
  const navigate = useNavigate();
  const { projectNames, isLoaded } = useGlobalInstanceCandidates({ kind: "global" });

  if (!isLoaded || projectNames.length === 0) {
    return (
      <span className={cn("min-w-0 flex-1 truncate px-1", titleClassName)}>
        {currentProjectName}
      </span>
    );
  }

  return (
    <OptionMenu
      accent="user"
      align="start"
      cancelLabel={t("cancel")}
      items={projectNames.map((name) => ({
        label: name,
        isActive: name === currentProjectName,
        onSelect: () => void navigate({ to: "/projects/$key", params: { key: name } }),
      }))}
      trigger={
        <button
          aria-label={t("workbench.switchProject")}
          className={cn(
            "flex min-w-0 flex-1 items-center gap-1 rounded-md px-1 text-left transition hover:bg-on-surface/5 active:bg-on-surface/10",
            className,
          )}
          type="button"
        >
          <span className={cn("min-w-0 flex-1 truncate", titleClassName)}>
            {currentProjectName}
          </span>
          <svg
            aria-hidden="true"
            className="size-3.5 shrink-0 text-on-surface-muted"
            fill="none"
            viewBox="0 0 24 24"
          >
            <path
              d="M6 9l6 6 6-6"
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={1.5}
              stroke="currentColor"
            />
          </svg>
        </button>
      }
    />
  );
}
