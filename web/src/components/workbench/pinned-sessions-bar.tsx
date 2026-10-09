import { useEffect, useMemo, useRef, useState } from "react";

import { useT } from "../../i18n";
import { sessionStatusLabel } from "../../routes/console-model";
import { type GlobalInstanceCandidate } from "../../routes/workbench-model";
import { useGlobalInstanceCandidates } from "./instance-area";
import { usePinnedSessions } from "../../hooks/pinned-sessions";
import { statusToV2DotClass } from "../shell/shell-primitives";

/**
 * 置顶会话条（v1.6 workspace.html 行1 之下 / workspace-pinned-bubble，spec 变更④）：
 * 24px 色点行，每颗色点 = 一个置顶会话——点色点 = 一步切换（零销毁，错误/断线态照常可点 =
 * 逃生通道）；白环描边（.pdot.cur）= 当前会话；长按色点 500ms = 名字气泡（松手收起，临时
 * 确认「哪颗色是哪个会话」；色点上无长按菜单——置顶管理入口唯一在 ⋯ 菜单）；置顶数 0 时
 * 整行不出现；宽端不设（移动工作台专属）。
 *
 * 颜色分配（diverge 于 spec §8 持久化方案，用户拍板）：`pickPinnedColors` 按 sessionId 哈希
 * 取基准色 + 当前置顶集合内撞色顺延消解——零持久化，同一会话哈希恒定故 unpin/再 pin 颜色
 * 不变、跨设备一致；仅当基准色被集合内其他会话占用时让位。
 *
 * 数据 = usePinnedSessions()（服务端 pin 列表）∩ 活跃实例候选（已关闭会话不显示）。
 */

/** 色板槽位数（tokens.json session1-8）。 */
export const PINNED_COLOR_SLOTS = 8;

/** FNV-1a 32 位哈希（无依赖、跨端一致；>>>0 归无符号）。 */
function hashSessionId(id: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < id.length; i += 1) {
    h ^= id.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/**
 * 置顶色板分配（纯函数，单测覆盖）：按 pinned 数组序遍历，slot = hash(id) % 8 + 1；
 * 撞色取最小未用索引消解（同一集合 + 同一顺序 → 分配确定）；集合全满（>8 置顶，超出
 * spec「上限建议 5」的边界）时保持哈希色（重复不可避免）。
 */
export function pickPinnedColors(pinnedIds: string[]): Map<string, number> {
  const colors = new Map<string, number>();
  const used = new Set<number>();
  for (const id of pinnedIds) {
    let slot = (hashSessionId(id) % PINNED_COLOR_SLOTS) + 1;
    if (used.has(slot)) {
      for (let s = 1; s <= PINNED_COLOR_SLOTS; s += 1) {
        if (!used.has(s)) {
          slot = s;
          break;
        }
      }
    }
    used.add(slot);
    colors.set(id, slot);
  }
  return colors;
}

/** 长按识别窗口（ms）：iOS 长按放大约 500ms 触发，取同量级。 */
const LONG_PRESS_MS = 500;

export function PinnedSessionsBar({
  focusId,
  onSelectInstance,
}: {
  /** 当前聚焦会话 id（白环 .pdot.cur 判定；非会话聚焦时调用方不渲染本组件）。 */
  focusId: string;
  onSelectInstance: (projectName: string, sessionId: string) => void;
}) {
  const { t } = useT();
  const { pinned, isLoaded } = usePinnedSessions();
  const { candidates } = useGlobalInstanceCandidates({ kind: "global" });
  // 活跃交集（保持 pinned 服务端数组序 = pin 先后序）：已关闭会话不在候选里，不显示。
  const rows = useMemo(() => {
    if (!isLoaded) return [];
    const byId = new Map<string, GlobalInstanceCandidate>(
      candidates.map((candidate) => [candidate.ref.sessionId, candidate]),
    );
    const list: { id: string; candidate: GlobalInstanceCandidate }[] = [];
    for (const id of pinned) {
      const candidate = byId.get(id);
      if (candidate) list.push({ id, candidate });
    }
    return list;
  }, [pinned, candidates, isLoaded]);
  const colors = useMemo(() => pickPinnedColors(rows.map((row) => row.id)), [rows]);

  // 长按名字气泡：pointerdown 起 500ms 定时；显示后松手/移出/取消即收（原型「点外部 /
  // 松手收起」），且吞掉本次 click（长按确认不切换）。§23 手势失联清理：pending 定时在
  // leave/cancel/卸载全部路径清除，不留「幽灵长按」。
  const [bubbleId, setBubbleId] = useState<string | null>(null);
  const timerRef = useRef(0);
  const longPressRef = useRef(false);
  const clearTimer = () => {
    if (timerRef.current) {
      window.clearTimeout(timerRef.current);
      timerRef.current = 0;
    }
  };
  useEffect(() => clearTimer, []);

  if (rows.length === 0) return null;
  return (
    <div
      className="pinned shrink-0 select-none [-webkit-touch-callout:none]"
      role="toolbar"
      aria-label={t("workbench.pinnedSessions")}
    >
      {rows.map(({ id, candidate }) => {
        const current = id === focusId;
        return (
          <span className="relative inline-flex" key={id}>
            <button
              aria-current={current ? "true" : undefined}
              aria-label={candidate.displayName}
              className={`pdot cursor-pointer ${current ? "cur" : ""}`}
              onClick={() => {
                if (longPressRef.current) {
                  longPressRef.current = false;
                  return;
                }
                onSelectInstance(candidate.ref.projectName, id);
              }}
              onPointerCancel={clearTimer}
              onPointerDown={() => {
                clearTimer();
                longPressRef.current = false;
                timerRef.current = window.setTimeout(() => {
                  timerRef.current = 0;
                  longPressRef.current = true;
                  setBubbleId(id);
                }, LONG_PRESS_MS);
              }}
              onPointerLeave={() => {
                clearTimer();
                setBubbleId(null);
              }}
              onPointerUp={() => {
                clearTimer();
                setBubbleId(null);
              }}
              style={{ background: `var(--c-session-${colors.get(id) ?? 1})` }}
              type="button"
            />
            {bubbleId === id ? (
              <span className="popb" role="status">
                <span className="min-w-0 truncate font-semibold">{candidate.displayName}</span>
                <span
                  className={`flex flex-none items-center gap-1 text-[11px] font-normal ${
                    candidate.status === "running" ? "text-success-text" : "text-ink-2"
                  }`}
                >
                  <span className={statusToV2DotClass(candidate.status)} />
                  {t(sessionStatusLabel(candidate.status))}
                </span>
              </span>
            ) : null}
          </span>
        );
      })}
    </div>
  );
}
