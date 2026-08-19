import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate, useParams } from "@tanstack/react-router";
import {
  AssistantRuntimeProvider,
  ComposerPrimitive,
  ThreadPrimitive,
  useAuiState,
  useComposerRuntime,
} from "@assistant-ui/react";
import { useEffect, useRef, useState } from "react";
import { getChatSession } from "../api/client";
import { useT } from "../i18n";
import { useComposerKeyboardAvoidance } from "../lib/use-composer-keyboard-avoidance";
import {
  COMPOSER_DESKTOP_MIN_WIDTH_PX,
  decideDesktopEnterAction,
  insertNewlineAtCursor,
  isMobileComposerMode,
} from "../lib/composer-enter";
import { usePiSession, type PiAttachment } from "./pi-adapter";
import { VirtualizedThreadContent } from "./ClaudeSessionDetailRoute";
import type { RetryInfo } from "./claude-adapter";

/**
 * Chat 会话 detail（设计 workbench-views §3.1，Phase 4 接线）。`/chat/$id` 独立路由
 *（rootRoute 平级，同 settingsRoute 范式）——chat 不绑项目，不进 workbench panel focus
 * 体系（非 InstanceArea panel、不依赖 layout 保活）；移动端「全屏聚焦态」由本页全屏渲染
 * 呈现（无底部 nav、无返回 header 栏之外的 chrome）。
 *
 * 复用 `ClaudeChat` UI 形态（`useExternalStoreRuntime` provider-agnostic）：渲染链复用
 * `VirtualizedThreadContent`（turn 虚拟化 + sticky-bottom + ChatSkeleton），数据源换
 * `/api/chat-sessions/:id/stream`（pi 事件流 → usePiSession storeAdapter），历史走 pi
 * SessionManager JSONL 回放。composer 镜像 `ComposerWithInterrupt` 卡片结构，砍三 selector
 * 与 slash catalog（pi 不暴露 model/permission/effort 运行态切换、无 slash 命令面），
 * 保留发送/中断/Stop-Send 互斥 + 桌面/移动 Enter 决策 + iOS 键盘避让。
 */
export function ChatSessionDetailRoute() {
  const { t } = useT();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { id } = useParams({ from: "/chat/$id" });
  const { data } = useQuery({
    queryKey: ["chat-sessions", id],
    queryFn: () => getChatSession(id),
  });
  // RetryInfo 是 claude 专属（pi 无重试 UI），传 null——VirtualizedThreadContent 的
  // RetryIndicator 在 null 时 no-op。
  const retryInfo: RetryInfo | null = null;
  const {
    runtime,
    connected,
    loading,
    title: liveTitle,
    onCancel,
    attachments,
    addAttachments,
    removeAttachment,
  } = usePiSession(id);

  useComposerKeyboardAvoidance();

  // LLM 标题已落盘 registry 元数据——失效列表 + detail query，列表页 displayName 同步刷新。
  useEffect(() => {
    if (liveTitle) {
      void queryClient.invalidateQueries({ queryKey: ["chat-sessions"] });
    }
  }, [liveTitle, queryClient]);

  const backToList = () => void navigate({ to: "/projects", search: { mode: "chat" } });
  // live 期 chat_title 帧优先（最新）；重连/重启后从元数据 displayName 读。
  const title = liveTitle ?? data?.session.displayName ?? id;

  return (
    <main className="flex h-[var(--app-viewport-height)] flex-col overflow-hidden bg-surface pt-[var(--shell-safe-area-top)] text-on-surface">
      <header className="flex h-11 shrink-0 items-center gap-1 border-b border-on-surface/5 px-3">
        <button
          aria-label={t("chat.backToList")}
          className="inline-flex h-9 w-9 cursor-pointer items-center justify-center rounded-lg text-on-surface-muted transition hover:bg-on-surface/5 hover:text-on-surface active:bg-on-surface/10"
          onClick={backToList}
          type="button"
        >
          <svg aria-hidden="true" className="h-3.5 w-3.5" fill="none" viewBox="0 0 16 16">
            <path
              d="M10 3L5 8l5 5"
              stroke="currentColor"
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={1.5}
            />
          </svg>
        </button>
        <span className="min-w-0 flex-1 truncate text-base font-semibold">{title}</span>
      </header>
      <AssistantRuntimeProvider runtime={runtime}>
        <div className="flex min-h-0 flex-1 min-w-0 flex-col overflow-hidden">
          <ThreadPrimitive.Root className="relative flex min-h-0 flex-1 flex-col overflow-hidden">
            <VirtualizedThreadContent loading={loading} retryInfo={retryInfo} />
            <div
              data-composer-float
              className="pointer-events-none absolute inset-x-0 bottom-0 z-20 px-3 pb-[calc(env(safe-area-inset-bottom,0px)+var(--composer-gap,0.5rem))] lg:static lg:z-auto lg:px-4 lg:py-2.5 lg:pb-2.5"
            >
              <div
                className="pointer-events-auto mx-auto w-full max-w-2xl transition-transform duration-200 ease-out lg:transition-none"
                style={{ transform: "translateY(calc(-1 * var(--composer-keyboard-offset, 0px)))" }}
              >
                <ComposerPrimitive.Root>
                  <ComposerWithInterruptPi
                    connected={connected}
                    onCancel={onCancel}
                    attachments={attachments}
                    addAttachments={addAttachments}
                    removeAttachment={removeAttachment}
                  />
                </ComposerPrimitive.Root>
              </div>
            </div>
          </ThreadPrimitive.Root>
        </div>
      </AssistantRuntimeProvider>
    </main>
  );
}

/**
 * pi composer：镜像 `ComposerWithInterrupt` 卡片结构（rounded-xl border bg-surface-raised
 * + Input + 底行 Stop/Send 互斥同槽），砍 ModelSelector/PermissionModeSelector/EffortSelector
 * 与 slash catalog（pi 不暴露这些运行态切换）。Stop/Send 互斥、桌面/移动 Enter 决策、
 * iOS 键盘避让（useComposerKeyboardAvoidance 在页层调用）全部复用 claude 同款逻辑。
 */
function ComposerWithInterruptPi({
  connected,
  onCancel,
  attachments,
  addAttachments,
  removeAttachment,
}: {
  connected: boolean;
  onCancel?: () => void;
  attachments: PiAttachment[];
  addAttachments: (files: File[]) => void;
  removeAttachment: (id: string) => void;
}) {
  const { t } = useT();
  const isRunning = useAuiState((s) => s.thread.isRunning);
  const isEmpty = useAuiState((s) => s.composer.isEmpty);
  const composer = useComposerRuntime();
  const [isMobileComposer] = useState(() => {
    if (typeof window === "undefined" || !window.matchMedia) return false;
    return isMobileComposerMode({
      coarse: window.matchMedia("(pointer: coarse)").matches,
      wide: window.matchMedia(`(min-width: ${COMPOSER_DESKTOP_MIN_WIDTH_PX}px)`).matches,
    });
  });
  const [isMac] = useState(
    () =>
      typeof navigator !== "undefined" &&
      /Mac|iPhone|iPad|iPod/i.test(navigator.platform || navigator.userAgent),
  );
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const disconnected = !connected;
  const inputDisabled = disconnected;
  const running = isRunning;
  const hasInput = !isEmpty;
  const showSend = hasInput && isMobileComposer && !inputDisabled;
  const showStop = running && !disconnected && !showSend && !!onCancel;

  const handleFiles = (files: FileList | null) => {
    if (!files || files.length === 0) return;
    addAttachments(Array.from(files));
  };

  return (
    <div className="relative flex flex-col rounded-xl border border-on-surface/10 bg-surface-raised/60 shadow-2xl shadow-black/40 backdrop-blur-xl backdrop-saturate-150 transition focus-within:border-user/50 focus-within:bg-surface-raised/80 lg:bg-surface-raised/80 lg:backdrop-blur-none lg:shadow-none">
      {attachments.length > 0 ? (
        <div className="flex flex-wrap gap-2 px-3 pt-2.5">
          {attachments.map((a) => (
            <div
              key={a.id}
              className="group relative h-14 w-14 overflow-hidden rounded-lg border border-on-surface/10"
            >
              <img src={a.previewUrl} alt="" className="h-full w-full object-cover" />
              <button
                type="button"
                onClick={() => removeAttachment(a.id)}
                aria-label={t("pi.attachRemove")}
                title={t("pi.attachRemove")}
                className="absolute right-0.5 top-0.5 inline-flex h-5 w-5 items-center justify-center rounded-full bg-black/60 text-white transition hover:bg-black/80 cursor-pointer"
              >
                <svg aria-hidden="true" className="h-3 w-3" fill="none" viewBox="0 0 16 16">
                  <path
                    d="M4 4l8 8M12 4l-8 8"
                    stroke="currentColor"
                    strokeLinecap="round"
                    strokeWidth={1.5}
                  />
                </svg>
              </button>
            </div>
          ))}
        </div>
      ) : null}
      <ComposerPrimitive.Input
        placeholder={disconnected ? t("claude.disconnected") : t("claude.inputPlaceholder")}
        disabled={inputDisabled}
        unstable_insertNewlineOnTouchEnter
        className="block min-h-[2.5rem] max-h-32 sm:min-h-[4.5rem] w-full resize-none bg-transparent px-3.5 pt-2.5 pb-1 text-sm text-on-surface placeholder:text-on-surface-muted outline-none"
        rows={1}
        onKeyDown={(e) => {
          if (e.key !== "Enter") return;
          if (e.nativeEvent.isComposing) return;
          if (inputDisabled) return;
          if (isMobileComposer) return;
          if (
            decideDesktopEnterAction({ shiftKey: e.shiftKey, metaKey: e.metaKey, isMac }) ===
            "newline"
          ) {
            if (e.shiftKey) return;
            e.preventDefault();
            insertNewlineAtCursor(e.currentTarget, (text) => composer.setText(text));
            return;
          }
          e.preventDefault();
          void composer.send();
        }}
        onPaste={(e) => {
          const items = e.clipboardData?.items;
          if (!items) return;
          const files: File[] = [];
          for (const item of items) {
            if (item.kind !== "file") continue;
            const file = item.getAsFile();
            if (file && file.type.startsWith("image/")) files.push(file);
          }
          if (files.length > 0) {
            e.preventDefault();
            addAttachments(files);
          }
        }}
      />
      <div className="flex h-9 items-center gap-2 px-2.5 pb-2 pt-0.5">
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          aria-label={t("pi.attachAria")}
          title={t("pi.attach")}
          disabled={inputDisabled}
          className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-on-surface-muted transition hover:bg-on-surface/5 hover:text-on-surface disabled:opacity-40 cursor-pointer"
        >
          <svg aria-hidden="true" className="h-4 w-4" fill="none" viewBox="0 0 24 24">
            <path
              d="M21.44 11.05l-9.19 9.19a6 6 0 01-8.49-8.49l9.19-9.19a4 4 0 015.66 5.66l-9.2 9.19a2 2 0 01-2.83-2.83l8.49-8.48"
              stroke="currentColor"
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={1.5}
            />
          </svg>
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          multiple
          className="hidden"
          onChange={(e) => {
            handleFiles(e.target.files);
            e.target.value = "";
          }}
        />
        {showStop ? (
          <button
            type="button"
            onClick={onCancel}
            aria-label={t("session.stop")}
            title={t("session.stop")}
            className="ml-auto inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-error text-on-error shadow-lg transition cursor-pointer"
          >
            <span className="h-2.5 w-2.5 rounded-[2px] bg-on-error/90" />
          </button>
        ) : null}
        {showSend ? (
          <button
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => composer.send()}
            aria-label={t("claude.composer.send")}
            title={t("claude.composer.send")}
            className="ml-auto inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-primary text-on-primary shadow-lg transition hover:opacity-90 cursor-pointer"
          >
            <svg aria-hidden="true" className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24">
              <path
                d="M12 19V5M5 12l7-7 7 7"
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                stroke="currentColor"
              />
            </svg>
          </button>
        ) : null}
      </div>
    </div>
  );
}
