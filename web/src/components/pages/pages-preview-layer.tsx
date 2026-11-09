import { useEffect, useRef, useState } from "react";

import { useT } from "../../i18n";
import { isStandaloneDisplay } from "../../lib/display-mode";
import { Dialog, DialogContent, DialogTitle } from "../ui/dialog";
import { ShellIcon } from "../shell/icons";
import { LucideIcon } from "../shell/lucide-icon";
import { SHEET_UNMOUNT_DELAY_MS } from "../shell/mobile-sheet";

type PagesPreviewLayerProps = {
  /** 站点 serve URL（/p/{project}/…），顶栏展示 + iframe 加载 + 新窗口钮共用。 */
  serveUrl: string;
  onClose: () => void;
};

/**
 * pages 站点 app 内预览层（全屏 Dialog + iframe，双端同构零分支——全屏形态在桌面/移动
 * 本就是同一容器，iframe 也不跨容器移动）。行点击进入此层是 iOS standalone PWA 的唯一
 * 出路：同源链接开不了新窗口是平台硬限制（target=_blank / window.open 都降级成当前
 * 视图导航，2026-11-09 真机报障三轮定案）。
 *
 * 三个刻意取舍（后续维护易误改，记档）：
 * ① iframe 不加 sandbox——技术前提：allow-scripts+allow-same-origin 等价于无隔离；
 *   opaque origin 丢 cookie（SameSite=Strict 视其为 cross-site）→ token 根 401。信任
 *   边界（诚实模型，security review 2026-11-10）：项目目录内容可能被 Agent 工作流污染
 *  （prompt injection / 拉取的模板 / CDN 脚本），同源 iframe 内 JS 可骑 HttpOnly cookie
 *   调 /api 全量（无需读 token）、可达 parent DOM 与本地存储——该暴露与顶层新开 /p/
 *   相同（既有基线，非本层新增），本层增量仅 parent 可达一层；单用户控制平面下接受。
 * ② 不设 z-[100]（区别于 FullscreenReader/image-lightbox）：预览层开着时 token 过期 →
 *   AuthGate（z-50 按需挂载 portal）必须靠 portal DOM 序压上；本层无 route 局部 elevated
 *   chrome 需要压（FullscreenReader 的 z-[100] 是 chat route 场景）。
 * ③ modal focus trap 只管宿主 document：iframe 文档内 Tab 不可达（跨 document），指针/
 *   触摸可用（本层动机场景就是 iOS PWA 触摸）；焦点在 iframe 内时 Esc 落 iframe document
 *   不关层，需点关闭钮。换 modal=false 会丢 body pointer-lock ghost-click 防线，不值。
 */
export function PagesPreviewLayer({ onClose, serveUrl }: PagesPreviewLayerProps) {
  const { t } = useT();
  // 组件按需挂载，单次读取即可（matchMedia 变化不需要响应——层生命周期内形态不变）。
  const standalone = isStandaloneDisplay();

  // 受控关闭桥（照抄 PagesRootDialog，**追加** clearTimeout 先行——原版没有，其双触发
  // 只是覆盖 timer 良性顺延；本层双触发同理防御，语义同 mobile-sheet close 桥）：先内部
  // open=false 播完 exit 动画再回调父级——父级立即置 null 会连坐 serveUrl，exit 动画
  // 期间 iframe 白闪。
  const [open, setOpen] = useState(true);
  const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (closeTimerRef.current) clearTimeout(closeTimerRef.current);
    },
    [],
  );
  const requestClose = () => {
    clearTimeout(closeTimerRef.current ?? undefined);
    setOpen(false);
    closeTimerRef.current = setTimeout(() => onClose(), SHEET_UNMOUNT_DELAY_MS);
  };

  return (
    <Dialog onOpenChange={(o) => !o && requestClose()} open={open}>
      <DialogContent
        aria-describedby={undefined}
        // 拦关闭回焦（frontend-notes §33 同族预判）：关闭后 Radix 焦点还原到预览前的
        // 行根 <a>，iOS WebKit 对 tap 后脚本 focus 判 :focus-visible → 整行浏览器蓝环
        // ——本层动机平台（iOS PWA touch）必然复现，故桌面 Dialog 政策在此让位；代价
        // = 桌面键盘用户关闭后焦点落 body（轻微，可 Tab 恢复）。
        onCloseAutoFocus={(e) => e.preventDefault()}
        // 全屏三件套照 gen-ui 全屏卡（inset-0/twMerge/safe-area）；不设 z-[100]（见头
        // 注释②）。data-pages-preview = 探针锚点。
        className="fixed inset-0 max-w-none sm:max-w-none w-full translate-x-0 translate-y-0 flex flex-col border-0 bg-surface-inset/95 backdrop-blur-sm"
        data-pages-preview=""
        style={{
          paddingBottom: "max(env(safe-area-inset-bottom, 0px), 0.75rem)",
          paddingLeft: "max(env(safe-area-inset-left, 0px), 0.75rem)",
          paddingRight: "max(env(safe-area-inset-right, 0px), 0.75rem)",
          paddingTop: "max(env(safe-area-inset-top, 0px), 0.75rem)",
        }}
      >
        <DialogTitle className="sr-only">{t("pages.previewTitle")}</DialogTitle>
        <div className="flex items-center gap-2 rounded-t-lg border-b border-neutral-line/60 bg-surface-raised/60 px-3 py-2 sm:px-5">
          <span
            className="min-w-0 flex-1 truncate font-mono text-xs text-on-surface-soft"
            title={serveUrl}
          >
            {serveUrl}
          </span>
          {!standalone ? (
            // standalone PWA 里同源 target=_blank 降级成当前视图导航 = 点了把工作台顶
            // 掉（本层刚治好的老 bug）→ 整钮不渲染；桌面浏览器/iOS Safari 正常。
            <a
              aria-label={t("pages.openInNewWindow")}
              className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-md text-on-surface-muted transition hover:bg-neutral-line/60 hover:text-on-surface"
              href={serveUrl}
              rel="noopener noreferrer"
              target="_blank"
              title={t("pages.openInNewWindow")}
            >
              <LucideIcon className="h-4 w-4" name="external-link" />
            </a>
          ) : null}
          <button
            aria-label={t("session.close")}
            className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-md text-on-surface-muted transition hover:bg-neutral-line/60 hover:text-on-surface"
            onClick={requestClose}
            type="button"
          >
            <ShellIcon className="h-4 w-4" name="close" />
          </button>
        </div>
        <div className="min-h-0 flex-1">
          {/* bg-white = 站点渲染面缺省底色（iframe 承载用户 HTML 页，instance-area 先例
              同款），非 UI token 面——tokens 机检 strict 收紧时勿改这里。 */}
          <iframe className="h-full w-full border-0 bg-white" src={serveUrl} title={serveUrl} />
        </div>
      </DialogContent>
    </Dialog>
  );
}
