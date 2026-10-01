import { useMemo } from "react";
import CodeMirror, { EditorView, Prec, minimalSetup } from "@uiw/react-codemirror";
import { oneDark } from "@codemirror/theme-one-dark";
import { useTheme } from "../../theme";
import { extToEditorLanguage } from "./editor-languages";

// 可编辑代码容器：CodeMirror 6 + oneDark 主题。画布对齐 03q2 编辑态（.ed）与 03q 查看态
//（.code，v2-primitives）的同一规格：bg-codeblock 全幅、无圆角无边框、上下 10px——查看/编辑
// 切换只有内容渲染层变化，容器零跳变（2026-10-02 用户反馈：旧 rounded-lg + border +
// surface-inset「输入框」壳使编辑模式观感跳变过大）。等宽字体、0.875rem（对齐渲染模式
// markdown 正文 text-sm）/ 行高 1.6。用 minimalSetup 而非 basicSetup 省去 fold gutter /
// 自动补全等重型功能（约省 75KB）。lineWrapping 让移动端长行自动折行。
//
// 受控 value/onChange：value 是可序列化的纯文本，阶段 3 离线草稿可在此基础上挂接 CodeMirror 的
// initialState.json（EditorState.toJSON/fromJSON）做 IndexedDB 持久化，无需改动此组件契约。

const THEME = EditorView.theme({
  "&": {
    backgroundColor: "transparent",
    fontSize: "0.875rem",
    height: "100%",
  },
  ".cm-content": {
    // 原型 .ed 左缘留白由 34px 行号列充当；本实现 minimalSetup 无行号，以水平 padding
    // 等效（16px 对齐查看态 .tx 的 padding-right）。
    padding: "0 16px",
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
  /** 只读展示（v2 §6.10-8 file tab 预览只读化）。默认 true（可编辑，FilesPanel 编辑路径不变）。 */
  editable?: boolean;
};

export function CodeEditor({ editable = true, name, onChange, value }: CodeEditorProps) {
  const { resolved } = useTheme();
  const isDark = resolved === "dark";
  // theme 按 resolved 切：dark = "none"（阻止 @uiw 默认 light 白底）+ oneDark 语法色板；
  // light = "light"（@uiw 内置 light），不加 oneDark。THEME 用 Prec.highest 提升优先级，
  // 确保透明背景与字体覆盖主题默认底色（light/dark 通用）。
  const extensions = useMemo(
    () => [
      ...minimalSetup(),
      ...(isDark ? [oneDark] : []),
      Prec.highest(THEME),
      ...extToEditorLanguage(name),
      EditorView.lineWrapping,
    ],
    [name, isDark],
  );

  // CodeMirror 的 @uiw wrapper（.cm-theme-none）默认按内容撑高，.cm-editor 拿不到受限高度、
  // .cm-scroller 无法滚动。用 absolute inset-0 把 wrapper 钉在 flex-1 外层内使其高度确定，
  // .cm-editor height:100% 才能解析、.cm-scroller 才会滚动。
  // 画布 = bg-codeblock 全幅（03q2 .ed / 03q .code 同款），上下 10px 由外层调用方 py-2.5 承担。
  return (
    <div className="relative min-h-0 flex-1 overflow-hidden bg-codeblock [&>div]:absolute [&>div]:inset-0">
      <CodeMirror
        value={value}
        onChange={onChange}
        editable={editable}
        readOnly={!editable}
        height="100%"
        theme={isDark ? "none" : "light"}
        extensions={extensions}
        basicSetup={false}
      />
    </div>
  );
}
