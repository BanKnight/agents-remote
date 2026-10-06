import { expect, test, beforeEach } from "bun:test";
import { mkdir, readdir, readFile, rm, stat, utimes, writeFile } from "node:fs/promises";
import { basename, join } from "node:path";
import { homedir } from "node:os";
import {
  clearHistoryCache,
  deleteAgentHistoryEntry,
  deleteAgentHistoryProject,
  inspectHistoryCacheForTesting,
  listAgentHistory,
  migrateAgentHistoryProject,
  paginateAgentHistory,
  projectToSlug,
  HISTORY_PAGE_SIZE,
} from "./agent-history";
import type { AgentHistoryEntry } from "@agents-remote/shared";

const TEST_DIR = join(homedir(), ".claude", "projects", "_test-agent-history-unit");
const TEST_PROJECT = "/test/project";

beforeEach(async () => {
  // 模块级缓存跨 test 持久：每个 test 前清空，避免同 slug 同名文件命中上一 test 的缓存。
  clearHistoryCache();
  await rm(TEST_DIR, { recursive: true, force: true });
  await mkdir(TEST_DIR, { recursive: true });
});

const writeJsonl = async (name: string, lines: Record<string, unknown>[]) => {
  const content = lines.map((l) => JSON.stringify(l)).join("\n");
  await writeFile(join(TEST_DIR, `${name}.jsonl`), content);
};

test("projectToSlug converts ASCII path to slug", () => {
  expect(projectToSlug("/home/deploy/workspace/agents-remote")).toBe(
    "-home-deploy-workspace-agents-remote",
  );
});

test("projectToSlug replaces spaces with dashes", () => {
  expect(projectToSlug("/home/deploy/projects/novel ai writing")).toBe(
    "-home-deploy-projects-novel-ai-writing",
  );
});

test("projectToSlug replaces CJK characters with dashes", () => {
  expect(projectToSlug("/home/deploy/projects/番茄都市轻悬疑日常")).toBe(
    "-home-deploy-projects----------",
  );
});

test("projectToSlug handles mixed ASCII and CJK with spaces", () => {
  expect(projectToSlug("/home/deploy/projects/鲁班 skill")).toBe("-home-deploy-projects----skill");
});

test("projectToSlug replaces consecutive non-alphanumeric characters", () => {
  expect(projectToSlug("/foo//bar baz!")).toBe("-foo--bar-baz-");
});

test("returns empty for nonexistent directory", async () => {
  const entries = await listAgentHistory("/nonexistent/path", new Map(), "all");
  expect(entries).toEqual([]);
});

test("extracts ai-title as session title", async () => {
  await writeJsonl("aaa-111", [
    { type: "system", subtype: "init", session_id: "aaa-111" },
    { type: "ai-title", aiTitle: "My Session Title", sessionId: "aaa-111" },
    {
      type: "user",
      message: { content: [{ type: "text", text: "hello" }] },
      timestamp: "2026-06-01T00:00:00Z",
    },
  ]);

  // Test with the real function by writing to the slug-derived directory
  const realSlug = projectToSlug(TEST_PROJECT);
  const realDir = join(homedir(), ".claude", "projects", realSlug);
  await rm(realDir, { recursive: true, force: true }).catch(() => {});
  await mkdir(realDir, { recursive: true });
  await writeFile(
    join(realDir, "aaa-111.jsonl"),
    [
      JSON.stringify({ type: "ai-title", aiTitle: "My Session Title" }),
      JSON.stringify({
        type: "user",
        message: { content: [{ type: "text", text: "hello" }] },
        timestamp: "2026-06-01T00:00:00Z",
      }),
    ].join("\n"),
  );

  const entries = await listAgentHistory(TEST_PROJECT, new Map(), "all");
  expect(entries.length).toBe(1);
  expect(entries[0]!.title).toBe("My Session Title");
  expect(entries[0]!.firstMessage).toBe("hello");
  expect(entries[0]!.startedAt).toBe("2026-06-01T00:00:00Z");

  await rm(realDir, { recursive: true, force: true });
});

test("uses last ai-title when multiple exist", async () => {
  const realSlug = projectToSlug(TEST_PROJECT);
  const realDir = join(homedir(), ".claude", "projects", realSlug);
  await rm(realDir, { recursive: true, force: true }).catch(() => {});
  await mkdir(realDir, { recursive: true });
  await writeFile(
    join(realDir, "bbb-222.jsonl"),
    [
      JSON.stringify({ type: "ai-title", aiTitle: "Old Title" }),
      JSON.stringify({ type: "ai-title", aiTitle: "Updated Title" }),
    ].join("\n"),
  );

  const entries = await listAgentHistory(TEST_PROJECT, new Map(), "all");
  expect(entries[0]!.title).toBe("Updated Title");

  await rm(realDir, { recursive: true, force: true });
});

test("falls back to firstMessage when no ai-title", async () => {
  const realSlug = projectToSlug(TEST_PROJECT);
  const realDir = join(homedir(), ".claude", "projects", realSlug);
  await rm(realDir, { recursive: true, force: true }).catch(() => {});
  await mkdir(realDir, { recursive: true });
  await writeFile(
    join(realDir, "ccc-333.jsonl"),
    [
      JSON.stringify({
        type: "user",
        message: { content: [{ type: "text", text: "This is the first message" }] },
        timestamp: "2026-06-02T00:00:00Z",
      }),
    ].join("\n"),
  );

  const entries = await listAgentHistory(TEST_PROJECT, new Map(), "all");
  expect(entries[0]!.title).toBeNull();
  expect(entries[0]!.firstMessage).toBe("This is the first message");

  await rm(realDir, { recursive: true, force: true });
});

test("marks active sessions from the map", async () => {
  const realSlug = projectToSlug(TEST_PROJECT);
  const realDir = join(homedir(), ".claude", "projects", realSlug);
  await rm(realDir, { recursive: true, force: true }).catch(() => {});
  await mkdir(realDir, { recursive: true });
  await writeFile(
    join(realDir, "ddd-444.jsonl"),
    [
      JSON.stringify({
        type: "user",
        message: { content: [{ type: "text", text: "hi" }] },
        timestamp: "2026-06-03T00:00:00Z",
      }),
    ].join("\n"),
  );

  const activeMap = new Map([["ddd-444", "agent_abc123"]]);
  const entries = await listAgentHistory(TEST_PROJECT, activeMap, "all");
  expect(entries[0]!.hasActiveSession).toBe(true);
  expect(entries[0]!.activeSessionId).toBe("agent_abc123");

  await rm(realDir, { recursive: true, force: true });
});

test("sorts by lastActivityAt descending", async () => {
  const realSlug = projectToSlug(TEST_PROJECT);
  const realDir = join(homedir(), ".claude", "projects", realSlug);
  await rm(realDir, { recursive: true, force: true }).catch(() => {});
  await mkdir(realDir, { recursive: true });

  // Create two files with different timestamps
  await writeFile(
    join(realDir, "old-session.jsonl"),
    [
      JSON.stringify({
        type: "user",
        message: { content: [{ type: "text", text: "old" }] },
        timestamp: "2026-06-01T00:00:00Z",
      }),
    ].join("\n"),
  );

  // Ensure different mtime by touching the second file slightly later
  await new Promise((r) => setTimeout(r, 50));
  await writeFile(
    join(realDir, "new-session.jsonl"),
    [
      JSON.stringify({
        type: "user",
        message: { content: [{ type: "text", text: "new" }] },
        timestamp: "2026-06-02T00:00:00Z",
      }),
    ].join("\n"),
  );

  const entries = await listAgentHistory(TEST_PROJECT, new Map(), "all");
  expect(entries.length).toBe(2);
  expect(entries[0]!.claudeSessionId).toBe("new-session");
  expect(entries[1]!.claudeSessionId).toBe("old-session");

  await rm(realDir, { recursive: true, force: true });
});

// range 过滤：用 mtime（非 startedAt）作为窗口判据——week 默认只列近 7 天。
test("range=week filters out sessions older than 7 days by mtime", async () => {
  const realSlug = projectToSlug(TEST_PROJECT);
  const realDir = join(homedir(), ".claude", "projects", realSlug);
  await rm(realDir, { recursive: true, force: true }).catch(() => {});
  await mkdir(realDir, { recursive: true });

  const writeSession = async (name: string, mtimeDaysAgo: number) => {
    const filePath = join(realDir, `${name}.jsonl`);
    await writeFile(
      filePath,
      [
        JSON.stringify({
          type: "user",
          message: { content: [{ type: "text", text: name }] },
          timestamp: "2026-06-01T00:00:00Z",
        }),
      ].join("\n"),
    );
    // 把 mtime 倒拨到 mtimeDaysAgo 天前，模拟旧 session。
    const old = new Date(Date.now() - mtimeDaysAgo * 24 * 60 * 60 * 1000);
    await utimes(filePath, old, old);
  };

  await writeSession("recent-session", 1); // 1 天前 → week 窗口内
  await writeSession("old-session", 30); // 30 天前 → week 窗口外

  const weekEntries = await listAgentHistory(TEST_PROJECT, new Map(), "week");
  expect(weekEntries.map((e) => e.claudeSessionId)).toEqual(["recent-session"]);

  const allEntries = await listAgentHistory(TEST_PROJECT, new Map(), "all");
  expect(allEntries.map((e) => e.claudeSessionId).sort()).toEqual([
    "old-session",
    "recent-session",
  ]);

  await rm(realDir, { recursive: true, force: true });
});

// 缓存：同 mtime/size 的文件第二次调用命中缓存，结果一致正确（缓存命中是性能优化，
// 正确性由「多次调用结果一致」保证；提速幅度由真实 377 文件性能探针验证）。
test("extract is cached: repeated calls return consistent results", async () => {
  const realSlug = projectToSlug(TEST_PROJECT);
  const realDir = join(homedir(), ".claude", "projects", realSlug);
  await rm(realDir, { recursive: true, force: true }).catch(() => {});
  await mkdir(realDir, { recursive: true });
  await writeFile(
    join(realDir, "cached-1.jsonl"),
    [
      JSON.stringify({
        type: "user",
        message: { content: [{ type: "text", text: "cached first msg" }] },
        timestamp: "2026-06-01T00:00:00Z",
      }),
    ].join("\n"),
  );

  const first = await listAgentHistory(TEST_PROJECT, new Map(), "all");
  expect(first[0]!.firstMessage).toBe("cached first msg");

  // 第二次调用：mtime/size 未变 → 命中缓存，结果一致。
  const second = await listAgentHistory(TEST_PROJECT, new Map(), "all");
  expect(second[0]!.firstMessage).toBe("cached first msg");
  expect(second[0]!.claudeSessionId).toBe("cached-1");

  await rm(realDir, { recursive: true, force: true });
});

// early-exit：读到首条 user 行即 break。把 ai-title 放在 user 之后——若 break 生效，extract
// 在 user 行就停，漏掉后面的 ai-title（title=null）；若 break 失效（全扫），title 会变成
// "should-be-skipped"。以此区分 break 是否生效。
test("early-exit: does not scan beyond first user line", async () => {
  const realSlug = projectToSlug(TEST_PROJECT);
  const realDir = join(homedir(), ".claude", "projects", realSlug);
  await rm(realDir, { recursive: true, force: true }).catch(() => {});
  await mkdir(realDir, { recursive: true });
  const lines: string[] = [
    JSON.stringify({ type: "queue-operation", queuedType: "user" }), // 首行 queue-operation
    JSON.stringify({
      type: "user",
      message: { content: [{ type: "text", text: "first real message" }] },
      timestamp: "2026-06-01T00:00:00Z",
    }),
    // user 之后的 ai-title：early-exit 应漏掉它。
    JSON.stringify({ type: "ai-title", aiTitle: "should-be-skipped" }),
  ];
  await writeFile(join(realDir, "early-exit.jsonl"), lines.join("\n"));

  const entries = await listAgentHistory(TEST_PROJECT, new Map(), "all");
  expect(entries[0]!.firstMessage).toBe("first real message");
  // break 生效 → 没读到 user 之后的 ai-title → title 保持 null。
  expect(entries[0]!.title).toBeNull();

  await rm(realDir, { recursive: true, force: true });
});

// ── 标题规则对齐 claude cli / orca（Phase B）──
// 以下测试验证 extractEntry 的 firstMessage = 首条「有意义」user prompt（跳 isMeta / command-name 无参 /
// SKIP pattern / command-only），title 优先级 custom-title > ai-title > firstMessage。

const titleSlugDir = () => {
  const realSlug = projectToSlug(TEST_PROJECT);
  const realDir = join(homedir(), ".claude", "projects", realSlug);
  return { realSlug, realDir };
};

const setupTitleDir = async () => {
  const { realDir } = titleSlugDir();
  await rm(realDir, { recursive: true, force: true }).catch(() => {});
  await mkdir(realDir, { recursive: true });
  return realDir;
};

// 跳过 isMeta 行：isMeta=true 的 local-command-caveat 不应成为 firstMessage，取后续真实 prompt。
test("skips isMeta user line, takes next meaningful prompt", async () => {
  const realDir = await setupTitleDir();
  await writeFile(
    join(realDir, "ismeta.jsonl"),
    [
      JSON.stringify({
        type: "user",
        isMeta: true,
        message: {
          content: [
            { type: "text", text: "<local-command-caveat>Caveat...</local-command-caveat>" },
          ],
        },
        timestamp: "2026-06-01T00:00:00Z",
      }),
      JSON.stringify({
        type: "user",
        message: { content: [{ type: "text", text: "real prompt here" }] },
        timestamp: "2026-06-01T00:00:05Z",
      }),
    ].join("\n"),
  );

  const entries = await listAgentHistory(TEST_PROJECT, new Map(), "all");
  expect(entries[0]!.firstMessage).toBe("real prompt here");
  // startedAt 仍记首条 user 行（isMeta 行），不漂移。
  expect(entries[0]!.startedAt).toBe("2026-06-01T00:00:00Z");

  await rm(realDir, { recursive: true, force: true });
});

// 跳过 command-name 无参内置命令（/clear）：取后续真实 prompt。
test("skips built-in command-name without args, takes next prompt", async () => {
  const realDir = await setupTitleDir();
  await writeFile(
    join(realDir, "cmdclear.jsonl"),
    [
      JSON.stringify({
        type: "user",
        message: {
          content: [
            {
              type: "text",
              text: "<command-name>/clear</command-name>\n<command-message>clear</command-message>\n<command-args></command-args>",
            },
          ],
        },
        timestamp: "2026-06-01T00:00:00Z",
      }),
      JSON.stringify({
        type: "user",
        message: { content: [{ type: "text", text: "after clear prompt" }] },
        timestamp: "2026-06-01T00:00:05Z",
      }),
    ].join("\n"),
  );

  const entries = await listAgentHistory(TEST_PROJECT, new Map(), "all");
  expect(entries[0]!.firstMessage).toBe("after clear prompt");

  await rm(realDir, { recursive: true, force: true });
});

// command-name 有参（custom 命令带参）：格式化为 `<command-name> <args>` 作为 firstMessage。
// 注意：claude cli 对内置命令无论有无 args 都跳过（/model sonnet 仍无意义），故此处用 custom 命令 /review
// ——但 /review 在我们的内置集合里，所以改用不在集合的 custom 命令 /myreport 验证「有 args 保留」分支。
test("command-name with args becomes formatted firstMessage", async () => {
  const realDir = await setupTitleDir();
  await writeFile(
    join(realDir, "cmdargs.jsonl"),
    [
      JSON.stringify({
        type: "user",
        message: {
          content: [
            {
              type: "text",
              text: "<command-name>/myreport</command-name>\n<command-args>reticulate splines</command-args>",
            },
          ],
        },
        timestamp: "2026-06-01T00:00:00Z",
      }),
    ].join("\n"),
  );

  const entries = await listAgentHistory(TEST_PROJECT, new Map(), "all");
  // /myreport 非内置 + 有 args → 保留为格式化 firstMessage。
  expect(entries[0]!.firstMessage).toBe("/myreport reticulate splines");

  await rm(realDir, { recursive: true, force: true });
});

// bash-input tag：格式化为 `! ${input}` 作为 firstMessage。
test("bash-input tag formatted with bang prefix", async () => {
  const realDir = await setupTitleDir();
  await writeFile(
    join(realDir, "bash.jsonl"),
    [
      JSON.stringify({
        type: "user",
        message: {
          content: [{ type: "text", text: "<bash-input>ls -la</bash-input>" }],
        },
        timestamp: "2026-06-01T00:00:00Z",
      }),
    ].join("\n"),
  );

  const entries = await listAgentHistory(TEST_PROJECT, new Map(), "all");
  expect(entries[0]!.firstMessage).toBe("! ls -la");

  await rm(realDir, { recursive: true, force: true });
});

// SKIP pattern（小写 XML 开头如 system-reminder 包裹）+ strip 后空 → 跳过，取下一条。
test("skips SKIP-pattern / tag-only first prompt, takes next", async () => {
  const realDir = await setupTitleDir();
  await writeFile(
    join(realDir, "skip.jsonl"),
    [
      JSON.stringify({
        type: "user",
        message: {
          content: [
            {
              type: "text",
              text: "<system-reminder>some system injection</system-reminder>",
            },
          ],
        },
        timestamp: "2026-06-01T00:00:00Z",
      }),
      JSON.stringify({
        type: "user",
        message: { content: [{ type: "text", text: "meaningful after skip" }] },
        timestamp: "2026-06-01T00:00:05Z",
      }),
    ].join("\n"),
  );

  const entries = await listAgentHistory(TEST_PROJECT, new Map(), "all");
  expect(entries[0]!.firstMessage).toBe("meaningful after skip");

  await rm(realDir, { recursive: true, force: true });
});

// custom-title 优先于 ai-title（对齐 orca session-scanner-claude-title 测试）。
test("custom-title wins over ai-title", async () => {
  const realDir = await setupTitleDir();
  await writeFile(
    join(realDir, "customwin.jsonl"),
    [
      JSON.stringify({ type: "ai-title", aiTitle: "Generated that must lose" }),
      JSON.stringify({ type: "custom-title", customTitle: "User set title" }),
      JSON.stringify({
        type: "user",
        message: { content: [{ type: "text", text: "first prompt" }] },
        timestamp: "2026-06-01T00:00:00Z",
      }),
    ].join("\n"),
  );

  const entries = await listAgentHistory(TEST_PROJECT, new Map(), "all");
  expect(entries[0]!.title).toBe("User set title");

  await rm(realDir, { recursive: true, force: true });
});

// 只有 custom-title 行 → title = customTitle。
test("custom-title alone becomes title", async () => {
  const realDir = await setupTitleDir();
  await writeFile(
    join(realDir, "customonly.jsonl"),
    [
      JSON.stringify({ type: "custom-title", customTitle: "My custom title" }),
      JSON.stringify({
        type: "user",
        message: { content: [{ type: "text", text: "prompt" }] },
        timestamp: "2026-06-01T00:00:00Z",
      }),
    ].join("\n"),
  );

  const entries = await listAgentHistory(TEST_PROJECT, new Map(), "all");
  expect(entries[0]!.title).toBe("My custom title");

  await rm(realDir, { recursive: true, force: true });
});

// command-only 无后续 user（纯 /clear，无下一条）→ firstMessage = null，title = null（UI 退化 id）。
test("command-only with no following user yields null firstMessage", async () => {
  const realDir = await setupTitleDir();
  await writeFile(
    join(realDir, "cmdonly.jsonl"),
    [
      JSON.stringify({
        type: "user",
        message: {
          content: [
            {
              type: "text",
              text: "<command-name>/clear</command-name>\n<command-args></command-args>",
            },
          ],
        },
        timestamp: "2026-06-01T00:00:00Z",
      }),
    ].join("\n"),
  );

  const entries = await listAgentHistory(TEST_PROJECT, new Map(), "all");
  expect(entries[0]!.firstMessage).toBeNull();
  expect(entries[0]!.title).toBeNull();

  await rm(realDir, { recursive: true, force: true });
});

// ── 缓存释放：孤儿/空 slug 必须回收，避免「没用的缓存」长期占内存 ──

// 删掉某 session 文件后，下次 listAgentHistory 应从缓存释放该条目（不留过期孤儿）。
test("cache: deleted session file is released from cache", async () => {
  const realDir = await setupTitleDir();
  await writeFile(
    join(realDir, "keep.jsonl"),
    [
      JSON.stringify({
        type: "user",
        message: { content: [{ type: "text", text: "keep" }] },
        timestamp: "2026-06-01T00:00:00Z",
      }),
    ].join("\n"),
  );
  const gonePath = join(realDir, "gone.jsonl");
  await writeFile(
    gonePath,
    [
      JSON.stringify({
        type: "user",
        message: { content: [{ type: "text", text: "gone" }] },
        timestamp: "2026-06-01T00:00:00Z",
      }),
    ].join("\n"),
  );

  // 首次：两条都进缓存。
  await listAgentHistory(TEST_PROJECT, new Map(), "all");
  const slug = projectToSlug(TEST_PROJECT);
  expect(inspectHistoryCacheForTesting().get(slug)).toBe(2);

  // 删 gone.jsonl，再调一次：对账应释放 gone，只留 keep。
  await rm(gonePath, { force: true });
  await listAgentHistory(TEST_PROJECT, new Map(), "all");
  expect(inspectHistoryCacheForTesting().get(slug)).toBe(1);

  await rm(realDir, { recursive: true, force: true });
});

// 删掉该项目全部 session 文件（目录变空）→ 外层 slug Map 条目也回收（不残留空 Map）。
test("cache: empty project dir releases entire slug map", async () => {
  const realDir = await setupTitleDir();
  await writeFile(
    join(realDir, "solo.jsonl"),
    [
      JSON.stringify({
        type: "user",
        message: { content: [{ type: "text", text: "solo" }] },
        timestamp: "2026-06-01T00:00:00Z",
      }),
    ].join("\n"),
  );

  await listAgentHistory(TEST_PROJECT, new Map(), "all");
  const slug = projectToSlug(TEST_PROJECT);
  expect(inspectHistoryCacheForTesting().has(slug)).toBe(true);

  // 删掉唯一文件 → 目录空 → 下次 listAgentHistory 早退前对账应释放整个 slug。
  await rm(join(realDir, "solo.jsonl"), { force: true });
  await listAgentHistory(TEST_PROJECT, new Map(), "all");
  expect(inspectHistoryCacheForTesting().has(slug)).toBe(false);

  await rm(realDir, { recursive: true, force: true });
});

// range=week 命中缓存复用旧文件：mtime 超出 week 窗口的文件仍在磁盘，缓存条目保留（非孤儿）。
test("cache: range-filtered (still-on-disk) entries are retained, not purged", async () => {
  const realDir = await setupTitleDir();
  const filePath = join(realDir, "stale.jsonl");
  await writeFile(
    filePath,
    [
      JSON.stringify({
        type: "user",
        message: { content: [{ type: "text", text: "stale" }] },
        timestamp: "2026-06-01T00:00:00Z",
      }),
    ].join("\n"),
  );
  // mtime 倒拨到 30 天前。
  const old = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  await utimes(filePath, old, old);

  // range=all 先填满缓存（30天前文件也进）。
  await listAgentHistory(TEST_PROJECT, new Map(), "all");
  const slug = projectToSlug(TEST_PROJECT);
  expect(inspectHistoryCacheForTesting().get(slug)).toBe(1);

  // range=week：文件 mtime 超出窗口不进候选，但仍在磁盘 → 对账保留缓存条目（可复用）。
  const weekEntries = await listAgentHistory(TEST_PROJECT, new Map(), "week");
  expect(weekEntries).toEqual([]);
  expect(inspectHistoryCacheForTesting().get(slug)).toBe(1);

  await rm(realDir, { recursive: true, force: true });
});

// 空壳 session 文件（CLI 启动即写 last-prompt/atis-latch 占位、从未发消息）三者全空 → 过滤，
// 不列进历史（M10 用户反馈「历史标题除了最新的几个都不对」的真实数据形态）。
test("filters out placeholder-only sessions (no title, no user line)", async () => {
  const realSlug = projectToSlug(TEST_PROJECT);
  const realDir = join(homedir(), ".claude", "projects", realSlug);
  await rm(realDir, { recursive: true, force: true }).catch(() => {});
  await mkdir(realDir, { recursive: true });
  // 空壳：CLI 启动即写 last-prompt/atis-latch 占位、从未发消息（真实数据 ~207 字节）。
  await writeFile(
    join(realDir, "bbb-222.jsonl"),
    [
      JSON.stringify({ type: "last-prompt", leafUuid: "u1", sessionId: "bbb-222" }),
      JSON.stringify({ type: "atis-latch", atis: "", sessionId: "bbb-222" }),
    ].join("\n"),
  );
  // 对照：同目录有真实首条 prompt 的 session 仍正常列出。
  await writeFile(
    join(realDir, "ccc-333.jsonl"),
    [
      JSON.stringify({ type: "last-prompt", leafUuid: "u2", sessionId: "ccc-333" }),
      JSON.stringify({
        type: "user",
        message: { content: [{ type: "text", text: "real prompt" }] },
        timestamp: "2026-06-01T00:00:00Z",
      }),
    ].join("\n"),
  );

  const entries = await listAgentHistory(TEST_PROJECT, new Map(), "all");
  expect(entries.map((e) => e.claudeSessionId)).toEqual(["ccc-333"]);

  await rm(realDir, { recursive: true, force: true });
});

// ────────────────── v1.5 批5：规模化查询 paginateAgentHistory ──────────────────

let entrySeq = 0;
const mkEntry = (overrides: Partial<AgentHistoryEntry> = {}): AgentHistoryEntry => {
  entrySeq += 1;
  const id = `00000000-0000-4000-8000-${String(entrySeq).padStart(12, "0")}`;
  return {
    provider: "claude",
    claudeSessionId: id,
    title: null,
    firstMessage: null,
    startedAt: null,
    lastActivityAt: null,
    fileSize: 0,
    hasActiveSession: false,
    ...overrides,
  };
};

const mkPage = (n: number, baseMs: number) =>
  Array.from({ length: n }, (_, i) =>
    mkEntry({ lastActivityAt: new Date(baseMs - i * 60_000).toISOString() }),
  );

test("paginateAgentHistory filters by search across title and firstMessage", () => {
  const entries = [
    mkEntry({ title: "Fix login bug", firstMessage: null }),
    mkEntry({ title: null, firstMessage: "please REFACTOR the parser" }),
    mkEntry({ title: "unrelated", firstMessage: "hello world" }),
  ];
  const response = paginateAgentHistory(entries, { filter: "all", search: "refactor", cursor: "" });
  expect(response.entries).toHaveLength(1);
  expect(response.entries[0]!.firstMessage).toBe("please REFACTOR the parser");
  // 计数在 search 之后聚合：只统计命中词的条目
  expect(response.counts).toEqual({ all: 1, active: 0, ended: 1 });
});

test("paginateAgentHistory counts stay stable across filter switches", () => {
  const entries = [
    mkEntry({ title: "a", hasActiveSession: true }),
    mkEntry({ title: "b" }),
    mkEntry({ title: "c" }),
  ];
  const all = paginateAgentHistory(entries, { filter: "all", search: "", cursor: "" });
  expect(all.counts).toEqual({ all: 3, active: 1, ended: 2 });
  const active = paginateAgentHistory(entries, { filter: "active", search: "", cursor: "" });
  expect(active.entries).toHaveLength(1);
  expect(active.counts).toEqual({ all: 3, active: 1, ended: 2 });
  const ended = paginateAgentHistory(entries, { filter: "ended", search: "", cursor: "" });
  expect(ended.entries.map((e) => e.title)).toEqual(["c", "b"]);
  expect(ended.counts).toEqual({ all: 3, active: 1, ended: 2 });
});

test("paginateAgentHistory pages 20+cursor and reports nextCursor null on last page", () => {
  const base = Date.parse("2026-10-06T12:00:00Z");
  const entries = mkPage(HISTORY_PAGE_SIZE + 5, base);
  const page1 = paginateAgentHistory(entries, { filter: "all", search: "", cursor: "" });
  expect(page1.entries).toHaveLength(HISTORY_PAGE_SIZE);
  expect(page1.nextCursor).not.toBeNull();
  // 倒序：首页 = 最新 20 条
  expect(page1.entries[0]!.lastActivityAt).toBe(new Date(base).toISOString());
  const page2 = paginateAgentHistory(entries, {
    filter: "all",
    search: "",
    cursor: page1.nextCursor!,
  });
  expect(page2.entries).toHaveLength(5);
  expect(page2.nextCursor).toBeNull();
  // 第二页首条 = 第 21 新（首页末条之后）
  expect(page2.entries[0]!.lastActivityAt).toBe(
    new Date(base - HISTORY_PAGE_SIZE * 60_000).toISOString(),
  );
});

test("paginateAgentHistory falls back to first page on forged cursor", () => {
  const entries = mkPage(25, Date.parse("2026-10-06T12:00:00Z"));
  const forged = paginateAgentHistory(entries, {
    filter: "all",
    search: "",
    cursor: Buffer.from("not json").toString("base64url"),
  });
  expect(forged.entries).toHaveLength(HISTORY_PAGE_SIZE);
  expect(forged.nextCursor).not.toBeNull();
  // 不足一页 → nextCursor null
  const short = paginateAgentHistory(entries.slice(0, 3), {
    filter: "all",
    search: "",
    cursor: "",
  });
  expect(short.entries).toHaveLength(3);
  expect(short.nextCursor).toBeNull();
});

// ────────────────── v1.5 批5：删除 deleteAgentHistoryEntry ──────────────────

const UUID_OK = "a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d";
const UUID_OTHER = "ffffffff-ffff-4fff-8fff-ffffffffffff";

test("deleteAgentHistoryEntry rejects non-uuid session ids", async () => {
  await expect(deleteAgentHistoryEntry(TEST_PROJECT, "../evil", "claude")).rejects.toThrow();
  await expect(deleteAgentHistoryEntry(TEST_PROJECT, "", "claude")).rejects.toThrow();
  await expect(deleteAgentHistoryEntry(TEST_PROJECT, "not-a-uuid-at-all", "omp")).rejects.toThrow();
});

test("deleteAgentHistoryEntry removes claude jsonl and stays idempotent when missing", async () => {
  const dir = join(homedir(), ".claude", "projects", projectToSlug(TEST_PROJECT));
  await rm(dir, { recursive: true, force: true }).catch(() => {});
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, `${UUID_OK}.jsonl`), "{}");

  await expect(deleteAgentHistoryEntry(TEST_PROJECT, UUID_OK, "claude")).resolves.toBe(true);
  await expect(rm(join(dir, `${UUID_OK}.jsonl`))).rejects.toThrow();
  // 已删再删 = 幂等 false（不 500）
  await expect(deleteAgentHistoryEntry(TEST_PROJECT, UUID_OK, "claude")).resolves.toBe(false);
  await expect(deleteAgentHistoryEntry(TEST_PROJECT, UUID_OTHER, "claude")).resolves.toBe(false);
  await rm(dir, { recursive: true, force: true });
});

test("deleteAgentHistoryEntry removes omp jsonl by suffix match", async () => {
  const dir = join(homedir(), ".omp", "agent", "sessions", projectToSlug(TEST_PROJECT));
  await rm(dir, { recursive: true, force: true }).catch(() => {});
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, `20261006T120000Z_${UUID_OK}.jsonl`), "{}");
  // 同 id 不同 ts 的多文件（omp 分段）全删
  await writeFile(join(dir, `20261005T080000Z_${UUID_OK}.jsonl`), "{}");
  await writeFile(join(dir, `20261006T120000Z_${UUID_OTHER}.jsonl`), "{}");

  await expect(deleteAgentHistoryEntry(TEST_PROJECT, UUID_OK, "omp")).resolves.toBe(true);
  const left = (await import("node:fs/promises")).readdir;
  expect((await left(dir)).sort()).toEqual([`20261006T120000Z_${UUID_OTHER}.jsonl`]);
  await rm(dir, { recursive: true, force: true });
});

// ── 项目级历史目录操作（v1.5 §3.2 重命名迁移/删除清除）─────────────────────────
const MIGRATE_PROJ_A = () => join(homedir(), "ar-proj-migrate-a");
const MIGRATE_PROJ_B = () => join(homedir(), "ar-proj-migrate-b");
const claudeDirOf = (p: string) => join(homedir(), ".claude", "projects", projectToSlug(p));
// home 内一层路径的 omp slug = "-" + dirname（/[/\\:]/→"-"）
const ompDirOf = (p: string) => join(homedir(), ".omp", "agent", "sessions", `-${basename(p)}`);

test("deleteAgentHistoryProject removes claude+omp history dirs", async () => {
  const a = MIGRATE_PROJ_A();
  const claudeDir = claudeDirOf(a);
  const ompDir = ompDirOf(a);
  await rm(claudeDir, { recursive: true, force: true });
  await rm(ompDir, { recursive: true, force: true });
  await mkdir(claudeDir, { recursive: true });
  await mkdir(ompDir, { recursive: true });
  await writeFile(join(claudeDir, `${UUID_OK}.jsonl`), "{}");
  await writeFile(join(ompDir, `20261006T120000Z_${UUID_OK}.jsonl`), "{}");

  await expect(deleteAgentHistoryProject(a)).resolves.toBeUndefined();
  await expect(stat(claudeDir)).rejects.toMatchObject({ code: "ENOENT" });
  await expect(stat(ompDir)).rejects.toMatchObject({ code: "ENOENT" });
  // 清理（测试自清理纪律）。
  await rm(claudeDir, { recursive: true, force: true });
  await rm(ompDir, { recursive: true, force: true });
});

test("migrateAgentHistoryProject renames both slug dirs to the new slug", async () => {
  const a = MIGRATE_PROJ_A();
  const b = MIGRATE_PROJ_B();
  const claudeA = claudeDirOf(a);
  const claudeB = claudeDirOf(b);
  const ompA = ompDirOf(a);
  const ompB = ompDirOf(b);
  for (const d of [claudeA, claudeB, ompA, ompB]) {
    await rm(d, { recursive: true, force: true });
  }
  await mkdir(claudeA, { recursive: true });
  await mkdir(ompA, { recursive: true });
  await writeFile(join(claudeA, "old.jsonl"), "{}");
  await writeFile(join(ompA, "old.jsonl"), "{}");

  await expect(migrateAgentHistoryProject(a, b)).resolves.toBeUndefined();
  await expect(stat(claudeB)).resolves.toBeTruthy();
  await expect(stat(ompB)).resolves.toBeTruthy();
  expect(await readdir(claudeB)).toEqual(["old.jsonl"]);
  expect(await readdir(ompB)).toEqual(["old.jsonl"]);
  await expect(stat(claudeA)).rejects.toMatchObject({ code: "ENOENT" });
  await expect(stat(ompA)).rejects.toMatchObject({ code: "ENOENT" });
  for (const d of [claudeA, claudeB, ompA, ompB]) {
    await rm(d, { recursive: true, force: true });
  }
});

test("migrateAgentHistoryProject merges into existing target without losing files", async () => {
  const a = MIGRATE_PROJ_A();
  const b = MIGRATE_PROJ_B();
  const claudeA = claudeDirOf(a);
  const claudeB = claudeDirOf(b);
  for (const d of [claudeA, claudeB]) {
    await rm(d, { recursive: true, force: true });
  }
  await mkdir(claudeA, { recursive: true });
  await mkdir(claudeB, { recursive: true });
  await writeFile(join(claudeA, "src-only.jsonl"), "{}");
  await writeFile(join(claudeB, "dst-keep.jsonl"), "{}");
  // 同名冲突文件：目标侧保留、源侧跳过（不丢任何一侧）。
  await writeFile(join(claudeA, "both.jsonl"), "from-src");
  await writeFile(join(claudeB, "both.jsonl"), "from-dst");

  await expect(migrateAgentHistoryProject(a, b)).resolves.toBeUndefined();
  expect((await readdir(claudeB)).sort()).toEqual([
    "both.jsonl",
    "dst-keep.jsonl",
    "src-only.jsonl",
  ]);
  expect(await readFile(join(claudeB, "both.jsonl"), "utf8")).toBe("from-dst");
  await expect(stat(claudeA)).rejects.toMatchObject({ code: "ENOENT" });
  for (const d of [claudeA, claudeB]) {
    await rm(d, { recursive: true, force: true });
  }
});
