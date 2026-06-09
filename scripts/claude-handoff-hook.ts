#!/usr/bin/env bun

import { readFileSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { spawn } from "node:child_process";

type Payload = Record<string, unknown>;

type GitSummary = {
  branch: string;
  status: string;
  diffStat: string;
};

function readPayload(): Payload {
  try {
    return JSON.parse(readFileSync(0, "utf8")) as Payload;
  } catch {
    return {};
  }
}

async function tailText(path: string, limit = 250): Promise<string> {
  try {
    const text = await readFile(path, "utf8");
    return text.split(/\r?\n/).slice(-limit).join("\n");
  } catch {
    return "";
  }
}

async function run(
  cmd: string,
  args: string[],
  cwd?: string,
  inputText?: string,
): Promise<{ stdout: string; exitCode: number }> {
  const env = { ...process.env, CLAUDE_CODE_SIMPLE: "1" };
  return await new Promise((resolveResult) => {
    const child = spawn(cmd, args, {
      cwd,
      env,
      stdio: "pipe",
    });

    let stdout = "";
    child.stdout.setEncoding("utf8");
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });

    child.on("error", () => {
      resolveResult({ stdout: "", exitCode: 1 });
    });

    child.on("close", (code) => {
      resolveResult({ stdout, exitCode: code ?? 1 });
    });

    if (inputText !== undefined) {
      child.stdin.write(inputText);
    }
    child.stdin.end();
  });
}

async function gitSummary(projectRoot: string): Promise<GitSummary> {
  try {
    const stat = await import("node:fs/promises").then((m) => m.stat(resolve(projectRoot, ".git")));
    if (!stat.isDirectory() && !stat.isFile()) {
      return { branch: "", status: "", diffStat: "" };
    }
  } catch {
    return { branch: "", status: "", diffStat: "" };
  }

  const [branch, status, diffStat] = await Promise.all([
    run("git", ["-C", projectRoot, "branch", "--show-current"]),
    run("git", ["-C", projectRoot, "status", "--short"]),
    run("git", ["-C", projectRoot, "diff", "--stat"]),
  ]);

  return {
    branch: branch.stdout.trim(),
    status: status.stdout.trim(),
    diffStat: diffStat.stdout.trim(),
  };
}

function buildSummaryPrompt({
  payload,
  projectRoot,
  transcriptTail,
  git,
}: {
  payload: Payload;
  projectRoot: string;
  transcriptTail: string;
  git: GitSummary;
}) {
  const cwd = String(payload.cwd ?? projectRoot);
  const sessionId = String(payload.session_id ?? "unknown");
  const transcriptPath = String(payload.transcript_path ?? "");

  return `You are writing a handoff checkpoint for a Claude Code session before context compaction.

Write concise Markdown with exactly these sections:
# Handoff checkpoint
## Big picture
## Confirmed facts
## Unresolved questions
## Current working hypothesis
## Next action
## Evidence pointers

Rules:
- Preserve the system-wide picture, not just the most recent branch of work.
- Prefer explicit facts over guesses.
- Capture the current position in the data flow, the active goal, the confirmed invariants, and the next decision point.
- Mention relevant file names, logs, or commands only if they are supported by the inputs below.
- Keep it brief and useful for resuming work later.

Session metadata:
- session_id: ${sessionId}
- cwd: ${cwd}
- transcript_path: ${transcriptPath}
- git branch: ${git.branch}
- git status:
${git.status || "(clean)"}
- git diff --stat:
${git.diffStat || "(none)"}

Recent transcript tail:
\`\`\`text
${transcriptTail || "(empty)"}
\`\`\`
`;
}

function fallbackSummary({
  payload,
  projectRoot,
  transcriptTail,
  git,
}: {
  payload: Payload;
  projectRoot: string;
  transcriptTail: string;
  git: GitSummary;
}) {
  const cwd = String(payload.cwd ?? projectRoot);
  const transcriptPath = String(payload.transcript_path ?? "");
  return [
    "# Handoff checkpoint",
    "",
    "## Big picture",
    "- Save the current session state so the next turn can resume from the same data-flow and bug context.",
    "",
    "## Confirmed facts",
    `- cwd: ${cwd}`,
    `- transcript_path: ${transcriptPath}`,
    `- git branch: ${git.branch || "(unknown)"}`,
    `- git status: ${git.status || "(clean)"}`,
    "",
    "## Unresolved questions",
    "- The model summary step failed or returned nothing, so the remaining context should be re-derived from the transcript tail and live files.",
    "",
    "## Current working hypothesis",
    "- Continue from the most recent history/replay or hook automation branch and re-check against current logs if anything looks stale.",
    "",
    "## Next action",
    "- Reload the current evidence, confirm the active message semantics or hook trigger, and only then continue editing.",
    "",
    "## Evidence pointers",
    `- transcript: ${transcriptPath}`,
    `- git diff --stat: ${git.diffStat || "(none)"}`,
    "",
    "## Recent transcript tail",
    "```text",
    transcriptTail || "(empty)",
    "```",
    "",
  ].join("\n");
}

async function main() {
  if (
    process.argv.length !== 3 ||
    !["precompact", "sessionstart"].includes(process.argv[2] ?? "")
  ) {
    console.error("usage: claude-handoff-hook.ts [precompact|sessionstart]");
    process.exit(2);
  }

  const event = process.argv[2] as "precompact" | "sessionstart";
  const payload = readPayload();
  const projectRoot = resolve(
    String(process.env.CLAUDE_PROJECT_DIR ?? payload.cwd ?? process.cwd()),
  );
  const handoffDir = resolve(projectRoot, ".claude", "handsoff");
  await mkdir(handoffDir, { recursive: true });
  const checkpointPath = resolve(handoffDir, "latest.md");

  if (event === "sessionstart") {
    try {
      const summary = (await readFile(checkpointPath, "utf8")).trim();
      if (!summary) {
        console.log(JSON.stringify({ continue: true, suppressOutput: true }));
        return;
      }
      const additionalContext =
        "Recovered handoff checkpoint from the previous session. Use this as the starting map, but re-verify against current evidence if anything looks stale.\n\n" +
        summary;
      console.log(
        JSON.stringify({
          continue: true,
          suppressOutput: true,
          hookSpecificOutput: {
            hookEventName: "SessionStart",
            additionalContext,
          },
        }),
      );
    } catch {
      console.log(JSON.stringify({ continue: true, suppressOutput: true }));
    }
    return;
  }

  const git = await gitSummary(projectRoot);
  const transcriptPath = String(payload.transcript_path ?? "");
  const transcriptTail = transcriptPath ? await tailText(transcriptPath) : "";
  const prompt = buildSummaryPrompt({ payload, projectRoot, transcriptTail, git });
  const result = await run("claude", ["-p"], projectRoot, prompt);
  let summary = result.stdout.trim();

  if (result.exitCode !== 0 || !summary) {
    summary = fallbackSummary({ payload, projectRoot, transcriptTail, git });
  }

  await writeFile(checkpointPath, summary.trimEnd() + "\n", "utf8");
  console.log(
    JSON.stringify({
      continue: true,
      suppressOutput: true,
      systemMessage: `Saved handoff checkpoint to ${checkpointPath}`,
    }),
  );
}

await main();
