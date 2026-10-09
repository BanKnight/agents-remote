import { useAtom } from "jotai";
import { atom } from "jotai";
import { useState } from "react";

import { useT } from "../../i18n";
import { workbenchLastProjectAtom } from "../../routes/workbench-model";
import { LucideIcon } from "../shell/lucide-icon";
import { Popover, PopoverContent, PopoverTrigger } from "../ui/popover";
import { useGlobalInstanceCandidates } from "./instance-area";
import { useCreateProjectDialog } from "../shell/project-setup";

/**
 * 09mb iPad/Mac 作用域切换 Popover（v1.4 批6）：锚于作用域分段 ▾ 向下弹出（Radix Popover）。
 * 标题「切换作用域」→ 全局行（on ✓）→「项目」组（点行 = 换绑项目 + 切 project scope）→
 * 「＋ 新建项目」。iPhone 保持 03l 半屏 sheet（容器不同，行为面收敛三动作）。
 * scope/lastProject 与 home 页共享 atom（下方 export，home import 反向）。
 */
export const pluginsMobileScopeAtom = atom<"global" | "project">("global");

export function ScopeSwitchPopover() {
  const [open, setOpen] = useState(false);
  const { t } = useT();
  const [scope, setScope] = useAtom(pluginsMobileScopeAtom);
  const [lastProject, setLastProject] = useAtom(workbenchLastProjectAtom);
  const { projectNames } = useGlobalInstanceCandidates({ kind: "global" });
  const createProjectDialog = useCreateProjectDialog();

  const pickProject = (name: string) => {
    setLastProject(name);
    setScope("project");
    setOpen(false);
  };

  return (
    <>
      <Popover open={open} onOpenChange={setOpen}>
        {/* asChild → span：宿主分段控件本身是 button，Trigger 默认再渲染原生 button 会构成
            button 嵌 button（无效 HTML，点击语义被浏览器修正）；span[role=button] 承载键盘可达。
            caret Lucide 化（批 13 反馈⑦）：`.caret` CSS 类退役 → LucideIcon size-3.5（显式
            尺寸防 WebKit flex 收缩隐形，frontend-notes §15⑤）。 */}
        <PopoverTrigger asChild>
          <span
            aria-label={t("plugins.switchProject")}
            className="cursor-pointer"
            role="button"
            tabIndex={0}
            onClick={(event) => event.stopPropagation()}
          >
            <LucideIcon className="size-3.5" name="chevron-down" />
          </span>
        </PopoverTrigger>
        <PopoverContent align="end" className="spop w-[300px] p-0" side="bottom" sideOffset={8}>
          <div className="ttl">{t("plugins.scopeSwitchTitle")}</div>
          <button
            className={`row${scope === "global" ? " on" : ""}`}
            type="button"
            onClick={() => {
              setScope("global");
              setOpen(false);
            }}
          >
            <span className="nm">{t("plugins.scopeGlobal")}</span>
            {scope === "global" ? <span className="ck">✓</span> : <span className="ar">›</span>}
          </button>
          <div className="sep" />
          <div className="grp">{t("plugins.scopeProjectsGroup")}</div>
          {projectNames.map((name) => {
            const on = name === lastProject && scope === "project";
            return (
              <button
                key={name}
                className={`row${on ? " on" : ""}`}
                type="button"
                onClick={() => pickProject(name)}
              >
                <span className="nm">{name}</span>
                {on ? <span className="ck">✓</span> : <span className="ar">›</span>}
              </button>
            );
          })}
          <button
            className="newp"
            type="button"
            onClick={() => {
              setOpen(false);
              createProjectDialog.openCreate();
            }}
          >
            ＋ {t("workbench.switchNewProject")}
          </button>
        </PopoverContent>
      </Popover>
      {createProjectDialog.dialog}
    </>
  );
}
