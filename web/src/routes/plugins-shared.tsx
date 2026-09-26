import type { SkillAgent } from "@agents-remote/shared";

import { useT } from "../i18n";
import { MarkdownString } from "../components/markdown/MarkdownString";
import { LoadingBlock } from "../components/shell/shell-primitives";
import { useSkillPreview } from "../hooks/skills";

/**
 * 插件能力跨页共享件（自 PluginsRoute.tsx 退役迁出——桌面/移动插件页均已改用
 * MobilePluginsOverview/MobileMarket 形态，旧 PluginsPanel 面板族随之删除，仅存以下活导出）。
 */

/**
 * 默认 skill agent（SkillTabPreview / 移动插件页共用）。当前固定 claude-code——单 agent，
 * tabId 不编码 agent（`skill_${name}` 足够去重）；未来支持 codex 同名 skill 再扩展。
 */
export const DEFAULT_SKILL_AGENT: SkillAgent = "claude-code";

/** MCP 新增表单 env 文本域解析：每行 `KEY=value`，忽略空行与无 `=` 行（取首个 `=` 切分，值保留 `=`）。 */
export function parseEnvLines(text: string): Record<string, string> | undefined {
  const out: Record<string, string> = {};
  for (const line of text.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    const value = trimmed.slice(eq + 1).trim();
    if (key) out[key] = value;
  }
  return Object.keys(out).length ? out : undefined;
}

/**
 * skill 详情预览面板（中栏 skill tab / 全局插件详情深度页共用，对标 FileTabPreview）。
 * 只读渲染本地 SKILL.md（useSkillPreview → MarkdownString）——无编辑无保存（区别于 FileTabPreview
 * 可编辑）。**不带 h4 标题栏**：SKILL.md 正文自带 `# H1` 标题，再加 h4 会重复（区别于 FilePreviewPanel
 * 保留 h4——文件正文不带 `# 标题` 不重复）；section 直接从 loading/error/内容态开始。桌面由
 * PanelRouter 渲染、移动由插件详情深度页（mobile-workbench pluginView 分流）渲染 body。顶层组件
 *（rerender-no-inline-components），不嵌套定义。
 */
export function SkillTabPreview({ name, projectName }: { name: string; projectName?: string }) {
  const { t } = useT();
  const preview = useSkillPreview(name, DEFAULT_SKILL_AGENT, projectName);

  return (
    <section
      aria-label={name}
      className="flex min-h-0 min-w-0 flex-1 flex-col bg-surface-raised/25"
    >
      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
        {preview.isLoading ? (
          // 父容器必须是 flex container，flex-1 才有高度约束（frontend-notes §8）——
          // review 修复：原缺 flex 链，加载块贴顶不居中。
          <LoadingBlock className="flex-1 p-4" label={t("skills.previewLoading")} />
        ) : preview.error ? (
          <div className="flex flex-1 items-center justify-center p-4">
            <p className="rounded-lg bg-error/10 px-3 py-2 text-xs text-error">
              {preview.error.message}
            </p>
          </div>
        ) : preview.data ? (
          <div className="p-4">
            {/* name 与 tab 标签重复（第七轮去重），description 同口径排除。 */}
            <MarkdownString
              frontmatterExclude={["name", "description"]}
              text={preview.data.content}
            />
          </div>
        ) : null}
      </div>
    </section>
  );
}
