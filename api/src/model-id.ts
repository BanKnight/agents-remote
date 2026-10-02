// model token 归一单源（claude-runtime 的 echo 解析出口 / session-registry 的 metadata
// 读写边界共用；独立成叶子模块避免 registry ← runtime 的反向依赖）。
//
// 背景（2026-10-01~02，§6.13 第十三批③/⑤）：CLI 对 in-process set_model 的回执是
// `<local-command-stdout>Set model to <display></local-command-stdout>`，其中 `<display>`
// 是 modelDisplayString 输出的**人类可读显示串**（实测 markdown code span 包裹 +
// ` (resolved)` 注解，如 `` `opus[1m] (claude-opus-4-8[1m])` ``），不是裸 model 名。
// 一旦整串进 metadata.model/modelAlias，会①经 --resume --model 传给 CLI 令网关 422
// model not found；②前端优先读 modelAlias，显示两侧多出反引号。故所有「model 进入系统」
// 的边界都必须过这道归一。

// 合法 model token = 已验证的全部真实取值形状：Claude tier alias（opus/sonnet/haiku/
// opusplan）、具体 ID（claude-opus-4-8）、网关改写 ID（glm-5.3-flash），可选 [1m] 后缀。
// 显示串的构成特征——空白、反引号、括号、ANSI 控制字符——全部落在此字符集之外，
// 天然被拒。白名单取「窄」：宁可拒绝未知取值（调用方跳过更新）也不放脏串过关。
const MODEL_TOKEN_PATTERN = /^[A-Za-z0-9._-]+(?:\[1m\])?$/;

/**
 * CLI「Set model to」显示串 / 任何候选 model 串 → 可持久化、可传给 CLI 的裸 model 名。
 * ① 剥 markdown code span 包裹（`…`）；② 剥尾部 ` (resolved)` 展示注解（display-only）；
 * ③ 白名单闸——只放行 model token 形状。帮助文案（`(id)`）、ANSI 样式文本、剥不出
 * 合法 token 的长尾文案一律拒绝（返回 undefined），调用方跳过更新——宁可保守也不让
 * 显示串进链路（跳过 = 前端回落已存值 / CLI resume 用默认模型，均优于传脏值）。
 */
export function sanitizePersistedModel(raw: string | undefined): string | undefined {
  if (!raw) return undefined;
  let s = raw.trim();
  if (s.length >= 2 && s.startsWith("`") && s.endsWith("`")) s = s.slice(1, -1).trim();
  if (s.endsWith(")")) {
    const paren = s.indexOf(" (");
    if (paren > 0) s = s.slice(0, paren).trim();
  }
  return MODEL_TOKEN_PATTERN.test(s) ? s : undefined;
}
