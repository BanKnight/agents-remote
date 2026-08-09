// markdown frontmatter 的 metadata 卡片——置顶于正文，把 frontmatter key:value 展示为语义化
// <dl>（description list = metadata）。token 对齐 DESIGN：surface-inset（凹陷，与正文 surface 区分）
// + neutral-line 边框；key 用 mono + on-surface-muted（metadata 色），value 用 on-surface +
// break-words（超长 description 自然换行）。用 dl/dt/dd 而非 p/div，避免触发 MARKDOWN_CLASS 的
// [&_p]:mb-2 等后代选择器，卡片样式独立。
export function FrontmatterCard({ data }: { data: Record<string, string> }) {
  const entries = Object.entries(data);
  if (entries.length === 0) return null;
  return (
    <dl className="mb-4 space-y-2 rounded-lg border border-neutral-line/40 bg-surface-inset/60 p-3">
      {entries.map(([key, value]) => (
        <div key={key} className="flex flex-col gap-0.5">
          <dt className="font-mono text-[0.7rem] text-on-surface-muted">{key}</dt>
          <dd className="break-words text-xs text-on-surface">{value}</dd>
        </div>
      ))}
    </dl>
  );
}
