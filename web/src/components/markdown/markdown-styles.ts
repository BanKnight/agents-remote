// 统一 markdown 容器样式。聊天流（assistant-ui）与 Files 预览（react-markdown）共用。
//
// block code 的样式由 CodeBlock 自带（容器背景 / 语言标签 / 复制按钮 / Prism 渲染），
// 故这里不再挂 [&_pre] 选择器；只保留 inline code（行内 `code`）的浅背景，并用
// [&_pre_code] 把 CodeBlock 内的 code 重置为透明，避免行内样式污染 Prism 输出。
export const MARKDOWN_CLASS =
  "text-sm leading-relaxed text-slate-100 " +
  "[&_h1]:mt-4 [&_h1]:mb-2 [&_h1]:text-lg [&_h1]:font-bold " +
  "[&_h2]:mt-3 [&_h2]:mb-2 [&_h2]:text-base [&_h2]:font-bold " +
  "[&_h3]:mt-3 [&_h3]:mb-1 [&_h3]:text-sm [&_h3]:font-semibold " +
  "[&_p]:mb-2 " +
  "[&_ul]:mb-2 [&_ul]:list-disc [&_ul]:pl-5 " +
  "[&_ol]:mb-2 [&_ol]:list-decimal [&_ol]:pl-5 " +
  "[&_li]:mb-1 " +
  "[&_code]:rounded [&_code]:bg-slate-900/60 [&_code]:px-1 [&_code]:py-0.5 [&_code]:font-mono [&_code]:text-xs " +
  "[&_pre_code]:bg-transparent [&_pre_code]:px-0 [&_pre_code]:py-0 " +
  "[&_a]:text-primary [&_a]:underline " +
  "[&_blockquote]:border-l-2 [&_blockquote]:border-slate-600 [&_blockquote]:pl-3 [&_blockquote]:text-slate-400 " +
  "[&_hr]:my-3 [&_hr]:border-slate-700";
