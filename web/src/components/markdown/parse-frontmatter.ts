// 前端 markdown frontmatter（YAML `---` 块）解析——零依赖轻量解析，同构复用后端
// `parseFrontmatter`（api/src/claude2-slash-commands.ts）的逐行 colon split + 引号剥离模式。
//
// 用途：把 markdown 原文拆成 { frontmatter, body }。文档开头的 frontmatter 块存在即从 body
// 剥离（避免 remark 把 `---` 当 <hr>、把 yaml 当正文段落），有字段时由 FrontmatterCard 在
// 正文顶部展示为 metadata 卡片。仅识别文档开头（^）的 frontmatter，非开头的 `---` 不识别。

const FRONTMATTER_RE = /^---[ \t]*\r?\n([\s\S]*?)(?:\r?\n)?---/;

/** 解析 frontmatter 原始文本（`key: value` 行）为 record。复用后端 parseFrontmatter 逻辑。 */
function parseFrontmatterRaw(raw: string): Record<string, string> {
  const result: Record<string, string> = {};
  for (const line of raw.split(/\r?\n/)) {
    const colon = line.indexOf(":");
    if (colon < 0) continue;
    const key = line.slice(0, colon).trim();
    let value = line.slice(colon + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (key) result[key] = value;
  }
  return result;
}

export type ParsedMarkdown = {
  /** frontmatter 字段；无 frontmatter 块或块内无可解析字段时为 null（不渲染卡片）。 */
  frontmatter: Record<string, string> | null;
  /** 去掉 frontmatter 块后的正文（无 frontmatter 时为原 text）。 */
  body: string;
};

/** 把 markdown 原文拆成 { frontmatter, body }。仅识别文档开头的 `---` 块。 */
export function parseMarkdownFrontmatter(text: string): ParsedMarkdown {
  const match = text.match(FRONTMATTER_RE);
  if (!match) return { frontmatter: null, body: text };
  const body = text.slice(match[0].length).replace(/^[\r\n]+/, "");
  const fm = parseFrontmatterRaw(match[1]);
  return { frontmatter: Object.keys(fm).length > 0 ? fm : null, body };
}
