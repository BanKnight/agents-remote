// v2 表单原语单源（设置二级换代 2026-10-11 拍板，2026-10-12 自 settings-dialog 抽出：
// 终端 ⚙ 面板 Apple 换代要复用同一档——类串散写两处必然漂移）。原型缺位部分按 Apple
// Settings 语言 + token 自行设计，消费方：settings-dialog / quick-keys-editor /
// quick-commands-tab。

// 输入框：elevated2 内嵌面 + sep-strong 描边 + r10（对齐 retry .fld 形态，instance-area）。
export const settingsInputClasses =
  "w-full rounded-[10px] border border-sep-strong bg-elevated2 px-3 py-2 text-sm text-ink-1 placeholder:text-ink-2 transition focus:border-primary focus:outline-none";

// 主色实心钮（保存）：bg-primary + on-accent 文字 + 按压 scale（移动动效批统一契约）。
export const settingsPrimaryButtonClasses =
  "cursor-pointer rounded-[10px] bg-primary px-4 py-1.5 text-[13px] font-semibold text-on-accent transition-[scale,background-color,opacity] active:scale-[0.98] disabled:cursor-default disabled:opacity-40";

// 次级面钮（测试连接）：elevated2 内嵌面实感，弱于主钮一档。
export const settingsGhostButtonClasses =
  "cursor-pointer rounded-[10px] border border-sep-strong bg-elevated2 px-3 py-1.5 text-[13px] text-ink-1 transition-[scale,background-color] active:scale-[0.98] disabled:cursor-default disabled:opacity-40";

// 文字钮（取消）：无面 muted 文字 + hover 淡底。
export const settingsTextButtonClasses =
  "cursor-pointer rounded-[10px] px-3 py-1.5 text-[13px] text-ink-2 transition-[scale,background-color] hover:bg-ink-1/5 active:scale-[0.98]";

/** 行内副文本（12px ink-2）——值行/开关行/输入行的 hint 与 sgroup 脚注共用档。 */
export const settingsHintClasses = "mt-0.5 block text-xs leading-5 text-ink-2";
