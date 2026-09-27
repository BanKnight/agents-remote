import { LUCIDE_ICONS, type LucideIconName } from "@/assets/icons";

export type { LucideIconName };

/**
 * Lucide 图标 React 消费单源（v1.4 spec §10.3 图标系统）：24 网格、stroke-2 圆头描边，
 * stroke=currentColor 跟随文字色。body 来自 scripts/build-icons.mjs 生成物（受控静态
 * 字符串，非用户输入），React 控制外层 svg 属性。尺寸由消费方 CSS（如 .iicn svg）或
 * className utility 定。
 */
export function LucideIcon({ className, name }: { className?: string; name: LucideIconName }) {
  const icon = LUCIDE_ICONS[name];
  return (
    <svg
      aria-hidden="true"
      className={className}
      dangerouslySetInnerHTML={{ __html: icon.body }}
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={2}
      viewBox={icon.viewBox}
    />
  );
}
