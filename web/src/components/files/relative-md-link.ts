/**
 * md 相对链接的识别与解析（真机反馈⑤：md 里的相对 .md 链接点击 = 打开项目内对应文件，
 * 而非浏览器默认导航 → SPA 404）。
 *
 * 纯函数，两侧分工：
 * - markdown-components 的 a 组件用 isRelativeMdHref 判定是否接管点击（经 MarkdownLinkContext）；
 * - Provider 侧（文件预览容器）闭进「当前文件路径」用 resolveRelativeFilePath 把 href
 *   原样解析成项目相对路径再打开。
 */

/** RFC 3986 scheme 前缀——http(s)://、mailto:、javascript:、tel: 等一切绝对协议都排除，只认相对/根相对（无协议）链接。 */
const SCHEME_RE = /^[a-zA-Z][a-zA-Z0-9+.-]*:/;

/**
 * 判断 markdown 链接是否为项目内相对 .md 链接：剥掉 #hash 与 ?query 后以 .md 结尾，
 * 且不带协议（相对 ./x.md、../x.md、根相对 /x.md）。
 *
 * - isRelativeMdHref("docs/next.md") → true
 * - isRelativeMdHref("https://example.com/a.md") → false（http 协议，走外链新 tab）
 * - isRelativeMdHref("//host/a.md") → false（协议相对 URL 指向外部 host，非项目内路径）
 * - isRelativeMdHref("mailto:a@b.c") / ("#anchor") / ("img/logo.png") → false
 */
export function isRelativeMdHref(href: string): boolean {
  if (SCHEME_RE.test(href)) return false;
  // 协议相对（RFC 3986 network-path reference）：继承当前页协议指向外部 host，不匹配
  // SCHEME_RE 但绝不能按项目相对路径解析（会得出 host/a.md 这样的伪路径）。
  if (href.startsWith("//")) return false;
  return stripHashAndQuery(href).endsWith(".md");
}

/**
 * 以当前文件所在目录为基准，把相对 .md href 归一成项目相对路径（剥 hash/query）。
 * href 以 / 开头 = 项目根相对，直接归一；`../` 越出根时留在根，不做语义校验。
 *
 * - resolveRelativeFilePath("README.md", "docs/next.md") → "docs/next.md"
 * - resolveRelativeFilePath("docs/a.md", "../src/x.md") → "src/x.md"
 * - resolveRelativeFilePath("docs/a.md", "/readme.md#sec") → "readme.md"
 */
export function resolveRelativeFilePath(currentPath: string, href: string): string {
  const raw = stripHashAndQuery(href);
  const segments = raw.startsWith("/") ? [] : currentPath.split("/").slice(0, -1);
  for (const seg of raw.split("/")) {
    if (seg === "" || seg === ".") continue;
    if (seg === "..") segments.pop();
    else segments.push(seg);
  }
  return segments.join("/");
}

/** 首个 # 或 ? 之前的路径段（md 路径本身不含这两类字符，其后一律视为 hash/query 丢弃）。 */
function stripHashAndQuery(href: string): string {
  return /^[^?#]*/.exec(href)?.[0] ?? "";
}
