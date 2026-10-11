import { useMemo } from "react";
import CodeMirror, { EditorView, Prec, lineNumbers, minimalSetup } from "@uiw/react-codemirror";
import { redoDepth, undoDepth } from "@codemirror/commands";
import { oneDark } from "@codemirror/theme-one-dark";
import { useTheme } from "../../theme";
import { extToEditorLanguage } from "./editor-languages";

// 可编辑代码容器：CodeMirror 6 + oneDark 主题。画布与排印对齐 03q2 编辑态（.ed）与 03q 查看
// 态（.code，v2-primitives）的**同一规格**：bg-codeblock 全幅、无圆角无边框、上下 10px、
// 11.5px/20px 等宽、行号列（2026-10-02 用户反馈两轮：①旧 rounded+border「输入框」壳跳变；
// ②md 源码 toggle 与编辑态字号/行高/行号不同——两处皆因编辑态偏离
// 原型，对齐后查看/编辑只差语法着色，着色收敛是 spec 既定方向另批做）。用 minimalSetup
// 而非 basicSetup 省去 fold gutter / 自动补全等重型功能（约省 75KB），行号单独加回
//（lineNumbers 随 @uiw re-export，零新增依赖）。lineWrapping 让移动端长行自动折行。
//
// 受控 value/onChange：value 是可序列化的纯文本，阶段 3 离线草稿可在此基础上挂接 CodeMirror 的
// initialState.json（EditorState.toJSON/fromJSON）做 IndexedDB 持久化，无需改动此组件契约。

const THEME = EditorView.theme({
  "&": {
    backgroundColor: "transparent",
    fontSize: "11.5px",
    height: "100%",
  },
  ".cm-content": {
    // 原型左缘留白由行号列（.no 34px + padding-right 10px）充当；行号 gutter 落位后
    // content 左侧不再补 padding，右侧 16px 对齐查看态 .tx。
    padding: "0 16px",
  },
  ".cm-scroller": {
    fontFamily: "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace",
    lineHeight: "20px",
  },
  ".cm-gutters": {
    backgroundColor: "transparent",
    border: "none",
  },
  ".cm-lineNumbers .cm-gutterElement": {
    color: "var(--ink-3)",
  },
});

export type CodeEditorProps = {
  value: string;
  name: string;
  /** 变更回调；只读消费（editable=false）不传——@uiw 内部判函数后才调用，undefined 安全。 */
  onChange?: (value: string) => void;
  /** 只读展示（v2 §6.10-8 file tab 预览只读化）。默认 true（可编辑，FilesPanel 编辑路径不变）。 */
  editable?: boolean;
  /** EditorView 就绪回调（v1.5 批3 aux 条：撤销/重做走 @codemirror/commands 的 view 命令、
   * 收起键盘 blur contentDOM——编辑器实例外置给容器层）。key=name@historyEpoch：换文件/
   * 编辑会话边界重建实例时重新触发（容器据此刷新 view 引用）。 */
  onCreateEditor?: (view: EditorView) => void;
  /** undo 栈可用性（2026-10-12 反馈③「撤销/重做恒灰不符合直觉」）：@codemirror/commands
   * 的 undoDepth/redoDepth（6.x history 已并入 commands）逐事务上抛；容器侧自行按值
   * bail-out，无翻转零 re-render。 */
  onHistoryChange?: (s: { canUndo: boolean; canRedo: boolean }) => void;
  /** 编辑会话号：递增即重建实例清 undo 栈（放弃/完成的不可逆边界——栈不清则放弃的内容
   * 再进编辑还能撤回、完成后撤销会把已保存内容退回草稿态，探针 Part 2b 实抓）。 */
  historyEpoch?: number;
};

export function CodeEditor({
  editable = true,
  name,
  onChange,
  onCreateEditor,
  onHistoryChange,
  historyEpoch = 0,
  value,
}: CodeEditorProps) {
  const { resolved } = useTheme();
  const isDark = resolved === "dark";
  // theme 按 resolved 切：dark = "none"（阻止 @uiw 默认 light 白底）+ oneDark 语法色板；
  // light = "light"（@uiw 内置 light），不加 oneDark。THEME 用 Prec.highest 提升优先级，
  // 确保透明背景与字体覆盖主题默认底色（light/dark 通用）。
  const extensions = useMemo(
    () => [
      ...minimalSetup(),
      lineNumbers(),
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
  // key=name@historyEpoch：换文件重建（@uiw 对同一实例的 value 整体替换走普通 dispatch 会
  // 进 undo 栈——跨文件 undo 会把旧文件内容撤进新文件草稿，故重建让历史随文档清零）；epoch
  // 递增重建（放弃/完成 = 编辑会话不可逆边界，栈不清则放弃的内容还能撤回——探针 Part 2b
  // 实抓）。同文件三态切换 name/epoch 不变仍复用（④b 零跳变前提）。
  return (
    <div className="relative min-h-0 flex-1 overflow-hidden bg-codeblock [&>div]:absolute [&>div]:inset-0">
      <CodeMirror
        key={`${name}@${historyEpoch}`}
        value={value}
        onChange={onChange}
        onCreateEditor={onCreateEditor}
        onUpdate={
          onHistoryChange
            ? (vu) =>
                onHistoryChange({
                  canRedo: redoDepth(vu.state) > 0,
                  canUndo: undoDepth(vu.state) > 0,
                })
            : undefined
        }
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
