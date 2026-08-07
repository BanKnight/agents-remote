// yaml 库的 YAMLParseError.message 形如：
//   "<reason> at line X, column Y:\n\n<source snippet>\n<caret>"
// snippet 是出错行附近的源码原文——config.yaml(app_password) / settings.yaml(apiKey) /
// providers.json(legacy apiKey) parse 失败时回显含机密的源行，打印到日志或塞进错误响应
// 即机密泄漏（如 claude2-runtime 的 `console.warn(..., err)` 会把 err.message 打到 stderr）。
// summarizeYamlError 只取首行（reason + 行列位置），丢弃 snippet——行列足够定位，源码不外泄。
const messageText = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

export const summarizeYamlError = (error: unknown): string => {
  const msg = messageText(error);
  const newlineIndex = msg.indexOf("\n");
  return newlineIndex === -1 ? msg : msg.slice(0, newlineIndex);
};
