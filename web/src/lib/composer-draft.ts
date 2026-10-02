import { useEffect, useRef } from "react";
import { useAuiState, useComposerRuntime } from "@assistant-ui/react";

// Composer 草稿持久化（2026-10-02 用户需求）：输入内容只要未发送 / 未主动删除，就一直保留——
// 刷新、PWA 重开、切会话回来都在。三个 agent composer（claude / pi / acp，全部 assistant-ui
// 同构）共用本 hook 单源；storageKey 由调用方按 runtime 类型 + sessionId 组装（互不串档）。
//
// 数据流：text 经 useAuiState 订阅（ComposerState.text），变化即落 localStorage；mount /
// key 变化时从 localStorage 恢复。「发送清空」（runtime 发送后自动 clear）与「手动删空」
// 都表现为 text → ""，落盘空 = 清草稿——两个语义由同一条数据流自然覆盖，无需额外状态。
//
// localStorage 直读直写而非 atomWithLocalOnlyStorage：草稿值由 assistant-ui runtime 持有，
// React 层无需响应式读它，只在 mount / key 切换读一次，没有第二个读者。
//
// 时序门闩（lastSavedRef）：persist 与 hydrate 两个 effect 同 commit 内按声明序执行——
// persist 在前声明、基线未建时跳过，mount 首帧不会抢在恢复前把空串写盘清掉已有草稿；
// hydrate 恢复后基线记为 runtime 实际值，「恢复引发的 text 回显」与基线相等，persist
// 自然跳过，不多写。
const DRAFT_PREFIX = "composerDraft:";

export function loadComposerDraft(storageKey: string): string {
  try {
    return localStorage.getItem(DRAFT_PREFIX + storageKey) ?? "";
  } catch {
    return "";
  }
}

export function saveComposerDraft(storageKey: string, text: string): void {
  try {
    if (text) localStorage.setItem(DRAFT_PREFIX + storageKey, text);
    else localStorage.removeItem(DRAFT_PREFIX + storageKey);
  } catch {
    // 配额满 / 隐私模式：草稿是增强能力，静默降级为不持久化。
  }
}

export function useComposerDraft(storageKey: string) {
  const composer = useComposerRuntime();
  const text = useAuiState((s) => s.composer.text);
  const lastSavedRef = useRef<{ key: string; text: string } | null>(null);

  // persist：text 偏离基线才落盘（含发送 / 删空 → 清档）。声明在 hydrate 之前——
  // mount 帧基线未建直接跳过。
  useEffect(() => {
    const saved = lastSavedRef.current;
    if (!saved) return;
    if (saved.key !== storageKey) {
      // 挂载槽位复用切了会话：runtime 里还是旧会话文本，先落回旧 key；新 key 由下方
      // hydrate effect 无条件接管（旧内容不串会话）。
      saveComposerDraft(saved.key, saved.text);
      return;
    }
    if (saved.text === text) return;
    lastSavedRef.current = { key: storageKey, text };
    saveComposerDraft(storageKey, text);
  }, [storageKey, text]);

  // hydrate + 基线：mount / key 变化时把该会话草稿写回 composer（draft 为空即清掉
  // 上一会话残留），并把基线记为恢复后的 runtime 实际值。
  useEffect(() => {
    const draft = loadComposerDraft(storageKey);
    composer.setText(draft);
    lastSavedRef.current = { key: storageKey, text: composer.getState().text };
  }, [composer, storageKey]);
}
