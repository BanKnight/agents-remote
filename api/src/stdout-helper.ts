/**
 * stdout-helper — pipes CLI stdout into turn files, rotating on result boundaries.
 *
 * Usage: bun run stdout-helper.ts <outputDir>
 *
 * Zero project dependencies. Only uses node: builtins.
 * Designed to run inside a tmux session as the last stage of:
 *   claude ... | bun run stdout-helper.ts /run/.../claude2-{id}/
 *
 * All file operations are synchronous to ensure correctness during rapid
 * turn rotations — no races between create/read/delete.
 */

import {
  mkdirSync,
  readdirSync,
  readFileSync,
  unlinkSync,
  existsSync,
  appendFileSync,
} from "node:fs";
import { createInterface } from "node:readline";
import { join } from "node:path";

const MAX_TURN_FILES = 3;
const RESULT_MARKER = '"type":"result"';
const padIndex = (n: number) => String(n).padStart(3, "0");

const outputDir = process.argv[2];
if (!outputDir) {
  console.error("usage: stdout-helper <outputDir>");
  process.exit(1);
}

mkdirSync(outputDir, { recursive: true });

let counter = 0;

const currentPath = () => join(outputDir, `turn_${padIndex(counter)}.jsonl`);

const deleteOldestCompleted = () => {
  try {
    if (!existsSync(outputDir)) return;

    const entries = readdirSync(outputDir);
    const turnFiles = entries.filter((e) => e.startsWith("turn_") && e.endsWith(".jsonl")).sort();

    if (turnFiles.length <= MAX_TURN_FILES) return;

    let remaining = turnFiles.length;
    for (const name of turnFiles) {
      if (remaining <= MAX_TURN_FILES) break;
      const path = join(outputDir, name);
      try {
        const raw = readFileSync(path, "utf8");
        const lines = raw.trim().split("\n");
        const lastLine = lines[lines.length - 1] ?? "";
        if (lastLine.includes(RESULT_MARKER)) {
          unlinkSync(path);
          remaining--;
        }
      } catch {
        // best effort
      }
    }
  } catch {
    // best effort
  }
};

const rl = createInterface({ input: process.stdin });
rl.on("line", (line) => {
  if (!line.trim()) return;

  appendFileSync(currentPath(), line + "\n");

  if (line.includes(RESULT_MARKER)) {
    counter++;
    deleteOldestCompleted();
  }
});

rl.on("close", () => {
  // Remove the empty "next" file if the last turn was completed
  const emptyPath = currentPath();
  try {
    if (existsSync(emptyPath)) {
      const raw = readFileSync(emptyPath, "utf8").trim();
      if (!raw) unlinkSync(emptyPath);
    }
  } catch {
    // ignore
  }
});
