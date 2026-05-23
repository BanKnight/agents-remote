type JsonValue = null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue };

const input = await Bun.stdin.text();
const payload = parseJson(input);
const candidates = collectStrings(payload).map(normalizePathText);

if (candidates.some(mentionsDocs)) {
  const reminders = new Set<string>();

  reminders.add("`docs/` 是长期沉淀区；不要写入活跃 roadmap、change 过程、任务状态或未验证设计。");
  reminders.add("修改 `docs/**/*.md` 后，请检查同层 `index.md` 是否需要同步更新。");
  reminders.add("index 条目描述必须阅读文档内容后编写，不能根据文件名猜测。");

  if (candidates.some((value) => value.startsWith("docs/specs/") || value.includes("/docs/specs/"))) {
    reminders.add("docs/specs/ 保存长期 WHAT，通常应由 distill-change 在 verify 后沉淀。");
  }

  if (candidates.some((value) => value.startsWith("docs/design/") || value.includes("/docs/design/"))) {
    reminders.add("docs/design/ 保存已验证后提炼的长期 design，不直接复制运行态 change design。");
  }

  if (candidates.some((value) => value.startsWith("docs/architecture/") || value.includes("/docs/architecture/"))) {
    reminders.add("docs/architecture/ 只保存具备长期复用价值的系统级 HOW、边界或 ADR。");
  }

  if (candidates.some((value) => value.startsWith("docs/runbooks/") || value.includes("/docs/runbooks/"))) {
    reminders.add("docs/runbooks/ 应面向可执行操作，不记录临时讨论过程。");
  }

  if (candidates.some((value) => value === "docs/project.md" || value.endsWith("/docs/project.md"))) {
    reminders.add("docs/project.md 只记录项目 big picture，不记录单次需求、任务状态或临时实现细节。");
  }

  printReminder("docs guard", reminders);
}

function parseJson(value: string): JsonValue {
  if (!value.trim()) return null;

  try {
    return JSON.parse(value) as JsonValue;
  } catch {
    return value;
  }
}

function collectStrings(value: JsonValue): string[] {
  if (typeof value === "string") return [value];
  if (typeof value === "number" || typeof value === "boolean" || value === null) return [];
  if (Array.isArray(value)) return value.flatMap(collectStrings);

  return Object.entries(value).flatMap(([key, nested]) => [key, ...collectStrings(nested)]);
}

function normalizePathText(value: string): string {
  return value.replaceAll("\\", "/");
}

function mentionsDocs(value: string): boolean {
  return value === "docs" || value.startsWith("docs/") || value.includes("/docs/") || value.includes(" docs/") || value.includes("\"docs/") || value.includes("'docs/");
}

function printReminder(title: string, reminders: Set<string>): void {
  console.error(`[${title}]`);
  for (const reminder of reminders) {
    console.error(`- ${reminder}`);
  }
}
