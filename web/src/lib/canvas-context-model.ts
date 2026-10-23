import { atom } from "jotai";

/**
 * 待发画布选区上下文（M3 引用循环）。画布卡「引用到对话」→ 宿主写此单槽
 * （latest-wins：反复引用覆盖，语义 = 「下一条消息要问的对象」）→ composer chip
 * 展示 + 发送时 formatCanvasSelectionContext 并入 prompt 文本（claude-adapter
 * onNew，同附件快照单点）→ 清槽。
 */
export type CanvasSelectionElement = {
  id: string;
  type: string;
  x: number;
  y: number;
  width: number;
  height: number;
  text: string;
};

export type CanvasSelectionContext = {
  kind: "canvas-selection";
  docId: string;
  title: string;
  revision: number;
  elements: CanvasSelectionElement[];
};

export const canvasSelectionContextAtom = atom<CanvasSelectionContext | null>(null);

/** 卡片反向通道 params 形状守卫（卡片对恶意/漂移数据的最小信任面）。 */
export function isCanvasSelectionContext(value: unknown): value is CanvasSelectionContext {
  if (typeof value !== "object" || value === null) return false;
  const r = value as Record<string, unknown>;
  if (
    r.kind !== "canvas-selection" ||
    typeof r.docId !== "string" ||
    typeof r.title !== "string" ||
    typeof r.revision !== "number" ||
    !Array.isArray(r.elements)
  ) {
    return false;
  }
  return r.elements.every((el) => {
    if (typeof el !== "object" || el === null) return false;
    const e = el as Record<string, unknown>;
    return (
      typeof e.id === "string" &&
      typeof e.type === "string" &&
      typeof e.x === "number" &&
      typeof e.y === "number" &&
      typeof e.width === "number" &&
      typeof e.height === "number"
    );
  });
}

/**
 * prompt 注入块：语义概览 + docId 句柄（agent 可用 read_scene(id) 取全量细节）。
 * 几何取整——像素级小数对 agent 无意义,只占 token。
 */
export function formatCanvasSelectionContext(ctx: CanvasSelectionContext): string {
  const lines = ctx.elements.map((el) => {
    const geo = `(${Math.round(el.x)},${Math.round(el.y)}) ${Math.round(el.width)}×${Math.round(el.height)}`;
    return el.text
      ? `- ${el.type} ${el.id}: ${geo} text="${el.text}"`
      : `- ${el.type} ${el.id}: ${geo}`;
  });
  return `[画布选区] ${ctx.title}（r${ctx.revision}, id=${ctx.docId}）\n${lines.join("\n")}`;
}
