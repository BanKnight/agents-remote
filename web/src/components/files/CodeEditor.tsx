import { useMemo } from "react";
import CodeMirror, { EditorView, Prec, minimalSetup } from "@uiw/react-codemirror";
import { oneDark } from "@codemirror/theme-one-dark";
import { extToEditorLanguage } from "./editor-languages";

// 可编辑代码容器：CodeMirror 6 + oneDark 主题，视觉与只读 CodeBlock 对齐（透明背景、等宽字体、
// 0.75rem / 行高 1.6、相同的外层边框/底色）。用 minimalSetup 而非 basicSetup 省去 fold gutter /
// 自动补全等重型功能（约省 75KB）。lineWrapping 让移动端长行自动折行。
//
// 受控 value/onChange：value 是可序列化的纯文本，阶段 3 离线草稿可在此基础上挂接 CodeMirror 的
// initialState.json（EditorState.toJSON/fromJSON）做 IndexedDB 持久化，无需改动此组件契约。

const THEME = EditorView.theme({
  "&": {
    backgroundColor: "transparent",
    fontSize: "0.75rem",
    height: "100%",
  },
  ".cm-scroller": {
    fontFamily: "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace",
    lineHeight: "1.6",
  },
  ".cm-gutters": {
    backgroundColor: "transparent",
    border: "none",
  },
});

export type CodeEditorProps = {
  value: string;
  name: string;
  onChange: (value: string) => void;
};

export function CodeEditor({ value, name, onChange }: CodeEditorProps) {
  // theme="none" 阻止 @uiw 注入默认 light 主题（白背景），外观完全由 extensions 控制。
  // oneDark 提供语法色板；THEME 用 Prec.highest 提升优先级，确保透明背景与字体覆盖 oneDark 默认底色。
  const extensions = useMemo(
    () => [
      ...minimalSetup(),
      oneDark,
      Prec.highest(THEME),
      ...extToEditorLanguage(name),
      EditorView.lineWrapping,
    ],
    [name],
  );

  // CodeMirror 的 @uiw wrapper（.cm-theme-none）默认按内容撑高，.cm-editor 拿不到受限高度、
  // .cm-scroller 无法滚动。用 absolute inset-0 把 wrapper 钉在 flex-1 外层内使其高度确定，
  // .cm-editor height:100% 才能解析、.cm-scroller 才会滚动。
  return (
    <div className="relative min-h-0 flex-1 overflow-hidden rounded-lg border border-neutral-line/40 bg-surface-inset/80 [&>div]:absolute [&>div]:inset-0">
      <CodeMirror
        value={value}
        onChange={onChange}
        height="100%"
        theme="none"
        extensions={extensions}
        basicSetup={false}
      />
    </div>
  );
}
