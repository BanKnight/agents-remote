import { useEffect, useRef, useState } from "react";

import { useT } from "../../i18n";
import { Dialog, DialogContent, DialogTitle } from "../ui/dialog";
import { ShellIcon } from "../shell/icons";
import { SHEET_UNMOUNT_DELAY_MS } from "../shell/mobile-sheet";

type PagesPreviewLayerProps = {
  /** 站点 serve URL（/p/{project}/…），预览层入口地址（iframe 初始加载）。 */
  serveUrl: string;
  onClose: () => void;
};

/**
 * pages 站点 app 内预览层（全屏 Dialog + iframe，双端同构零分支——全屏形态在桌面/移动
 * 本就是同一容器，iframe 也不跨容器移动）。**只在「移动安装的 PWA」打开**：行点击的
 * gate 在 pages-panel（isMobileStandaloneDisplay = standalone + 触屏 primary pointer）
 * ——其他一切平台（桌面/移动浏览器、桌面安装的 Chrome/Edge PWA）点行放行原生
 * target=_blank 新标签（2026-11-10 用户拍板两段式：「pwa 才是内嵌 iframe 方案」→ 追加
 * 「桌面端跳出浏览器更合适」——Chromium 的 _blank 正常开浏览器新标签）；进层的动机是
 * iOS/Android WebKit standalone 同源链接开不了新窗口是平台硬限制（target=_blank /
 * window.open 都降级成当前视图导航，2026-11-09 真机报障三轮定案）。
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
 *
 * 地址栏（2026-11-10 用户反馈「非 PWA 下可以自由输入地址」）：点击变输入框可改路径
 * 导航（内置浏览器语义），iframe 内点站内链接时顶栏地址跟随（同源读
 * contentWindow.location）；非 / 开头输入按站点根相对解析。
 */
export function PagesPreviewLayer({ onClose, serveUrl: entryUrl }: PagesPreviewLayerProps) {
  const { t } = useT();
  // 预览层内导航地址（内部 state）：入口 = serveUrl prop，地址栏编辑 / iframe 内点链
  // 接都在这里演进。关闭即弃——下次打开回入口页（对齐浏览器新开标签语义），不污染
  // 父级 previewing（存入口串防脏引用的契约保持）。
  const [currentUrl, setCurrentUrl] = useState(entryUrl);
  // 地址栏编辑态：默认只读展示（点击变输入框，Enter 提交 / Esc·blur 取消）——常驻
  // input 在窄顶栏里全是输入框形态，视觉噪音大于价值。
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const frameRef = useRef<HTMLIFrameElement | null>(null);
  // 顶栏展示完整地址（含域名，2026-11-10 用户反馈「地址没有域名部分，看起来很奇怪」）；
  // iframe src 用相对 currentUrl（同源语义不变）。
  const displayUrl = window.location.origin + currentUrl;

  // 地址栏提交：非 / 开头按站点根相对解析（浏览器地址栏根相对直觉；./ ../ 相对解析
  // 不做——magic 步骤多、404 自然呈现已够用）。不 clamp 路径：输什么加载什么，失败态
  // 自然呈现（404 错误页 / app shell 被 frame-ancestors 'none' 拒——语义自洽护栏）。
  const navigate = (raw: string) => {
    const value = raw.trim();
    if (!value) return;
    setCurrentUrl(value.startsWith("/") ? value : `/${value}`);
  };

  // 地址跟随（同源红利）：iframe 内点站内链接 → onLoad 读 contentWindow.location 同步
  // 顶栏。跨源（地址栏输外站 URL）读 location 抛 SecurityError → 保持当前显示，不炸。
  const syncFromFrame = () => {
    try {
      const loc = frameRef.current?.contentWindow?.location;
      if (loc) setCurrentUrl(loc.pathname + loc.search + loc.hash);
    } catch {
      // 跨源文档 location 不可读——顶栏保持原值。
    }
  };

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
          {editing ? (
            <input
              aria-label={t("pages.addressBar")}
              autoFocus
              className="min-w-0 flex-1 rounded-md border border-neutral-line/60 bg-surface-raised/60 px-2 py-1 font-mono text-xs text-on-surface outline-none focus:border-primary/60"
              onBlur={() => setEditing(false)}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  navigate(draft);
                  setEditing(false);
                } else if (e.key === "Escape") {
                  setEditing(false);
                }
              }}
              spellCheck={false}
              value={draft}
            />
          ) : (
            // 只读地址（cursor-text 提示可点进编辑）；title = 完整地址（truncate 后
            // 悬停可读全文）。
            <button
              className="min-w-0 flex-1 cursor-text truncate text-left font-mono text-xs text-on-surface-soft transition hover:text-on-surface"
              onClick={() => {
                setDraft(currentUrl);
                setEditing(true);
              }}
              title={displayUrl}
              type="button"
            >
              {displayUrl}
            </button>
          )}
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
          <iframe
            className="h-full w-full border-0 bg-white"
            onLoad={syncFromFrame}
            ref={frameRef}
            src={currentUrl}
            title={displayUrl}
          />
        </div>
      </DialogContent>
    </Dialog>
  );
}
