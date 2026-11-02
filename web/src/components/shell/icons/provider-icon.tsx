import type { AgentProvider } from "@agents-remote/shared";
import { BRAND_ICONS_SVG } from "../../../assets/brand-icons";

/** provider → 品牌件 key 映射（brand-icons.ts 生成物键同名——新 provider 注册时两者各加一行）。 */
const PROVIDER_BRAND = {
  claude: "claude",
  codex: "codex",
  omp: "omp",
} as const satisfies Record<AgentProvider, keyof typeof BRAND_ICONS_SVG>;

/** 单色品牌件消费端染色（claude/codex 彩色件自带品牌 fill 不染色）。omp = π 单色件染
 *  warning 橙——延续创建菜单 omp 行 tint-orange/warning 的品牌橙语义（lobe 无 omp 专属件，
 *  π 贴 Oh My Pi）。 */
const MONO_TONE: Partial<Record<AgentProvider, string>> = {
  omp: "text-warning",
};

/**
 * Provider 品牌图标（2026-11-02 起 provider 身份图标单源，替代手绘 BRAND_SVG 与通用
 * sparkles/bot/bolt 行标）：容器模式同 ShellIcon——span 定尺寸 + 内嵌 svg size-full
 * （frontend-notes §15⑤ 显式尺寸契约，防 WebKit flex 收缩 0×0）。data-provider-icon =
 * 探针/测试锚点。
 *
 * svg 挂 inline style：icon.style（生成物——单色件 fill:currentColor 等，压过容器层
 * `.dicon svg`/`.tile svg` 等 fill:none 规则，presentation attribute 会被 CSS 压掉）+
 * stroke:none 阻断容器 `.X svg { stroke:currentColor }` 经继承给品牌 path 加描边
 * （stroke 是继承属性，彩色 path 无自身声明时会继承 svg 的 computed stroke）。
 */
export function ProviderIcon({
  className = "size-4",
  provider,
}: {
  className?: string;
  provider: AgentProvider;
}) {
  const icon = BRAND_ICONS_SVG[PROVIDER_BRAND[provider]];
  // 运行期防御：provider 若来自服务端未收录值（版本错配/新增 provider 未跑生成），退不渲染
  // 而非 undefined.viewBox 崩子树。
  if (!icon) return null;
  const tone = MONO_TONE[provider];
  const html = `<svg viewBox="${icon.viewBox}" class="size-full" aria-hidden="true" style="${icon.style ? icon.style + ";" : ""}stroke:none">${icon.body}</svg>`;
  return (
    <span
      aria-hidden="true"
      className={"inline-flex items-center justify-center " + (tone ? `${tone} ` : "") + className}
      data-provider-icon={provider}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
