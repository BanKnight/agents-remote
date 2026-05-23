type JsonValue = null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue };

const input = await Bun.stdin.text();
const payload = parseJson(input);
const candidates = collectStrings(payload).map(normalizePathText);

if (candidates.some(mentionsWorkflow)) {
  const reminders = new Set<string>();

  reminders.add("`.workflow/` 是运行态区域；修改前请确认目标 change 已进入 roadmap，且当前阶段匹配对应 artifact。");

  if (candidates.some((value) => value.includes(".workflow/changes/") && value.includes("/specs/"))) {
    reminders.add("specs 只写 WHAT / 行为契约，不写 HOW、任务拆解或实现细节。");
  }

  if (candidates.some((value) => value.includes(".workflow/changes/") && value.includes("/design/"))) {
    reminders.add("design 写 HOW；通过 verify 前不要把运行态 design 当作长期 docs 结论。");
  }

  if (candidates.some((value) => value.endsWith("tasks.md") || value.includes("/tasks.md"))) {
    reminders.add("tasks.md 应保持任务可执行、可验收、可恢复；完成任务后再勾选。");
  }

  if (candidates.some((value) => value.endsWith("verify.md") || value.includes("/verify.md"))) {
    reminders.add("verify.md 应记录 harness、证据、问题分级与明确结论；无证据不要写通过。");
  }

  printReminder("workflow guard", reminders);
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

function mentionsWorkflow(value: string): boolean {
  return value === ".workflow" || value.startsWith(".workflow/") || value.includes("/.workflow/") || value.includes(" .workflow/") || value.includes("\".workflow/") || value.includes("'.workflow/");
}

function printReminder(title: string, reminders: Set<string>): void {
  console.error(`[${title}]`);
  for (const reminder of reminders) {
    console.error(`- ${reminder}`);
  }
}
