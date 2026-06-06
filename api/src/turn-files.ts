import { mkdir, readdir, readFile, stat, unlink } from "node:fs/promises";
import { createReadStream } from "node:fs";
import { join } from "node:path";

const TURN_FILE_RE = /^turn_\d{3}\.jsonl$/;

export const getTurnDir = (runDir: string, sessionName: string) =>
  join(runDir, "claude2-turn", sessionName);

export const getStdinFifo = (runDir: string, sessionName: string) =>
  join(runDir, "claude2-fifo", `${sessionName}.stdin`);

export const ensureTurnDir = async (runDir: string, sessionName: string) => {
  const dir = getTurnDir(runDir, sessionName);
  await mkdir(dir, { recursive: true });
  return dir;
};

export const listTurnFiles = async (turnDir: string): Promise<string[]> => {
  try {
    const entries = await readdir(turnDir);
    return entries
      .filter((e) => TURN_FILE_RE.test(e))
      .sort()
      .map((e) => join(turnDir, e));
  } catch {
    return [];
  }
};

export const readFileLines = async (filePath: string): Promise<string[]> => {
  try {
    const raw = await readFile(filePath, "utf8");
    return raw.split("\n").filter((l) => l.trim());
  } catch {
    return [];
  }
};

export const isCompletedTurn = async (filePath: string): Promise<boolean> => {
  const lines = await readFileLines(filePath);
  if (lines.length === 0) return false;
  return lines[lines.length - 1]!.includes('"type":"result"');
};

export const countReplayLines = async (turnDir: string): Promise<number> => {
  const files = await listTurnFiles(turnDir);
  let total = 0;
  for (const file of files) {
    const lines = await readFileLines(file);
    total += lines.length;
  }
  return total;
};

export const removeTurnFile = async (filePath: string) => {
  try {
    await unlink(filePath);
  } catch {
    // best effort
  }
};

export const removeTurnDir = async (turnDir: string) => {
  try {
    const files = await listTurnFiles(turnDir);
    await Promise.all(files.map((f) => unlink(f).catch(() => {})));
  } catch {
    // best effort
  }
};

/**
 * Tail a growing file. First poll records the current file size as baseline.
 * Subsequent polls read new bytes appended after that baseline.
 * Stops and calls onResult when a line containing "type":"result" is detected.
 */
export const tailFile = (
  filePath: string,
  onLine: (line: string) => void,
  onResult: (line: string) => void,
): { stop: () => void; done: Promise<void> } => {
  let stopped = false;
  let lastSize = 0;
  let firstPoll = true;

  const stop = () => {
    stopped = true;
  };

  const poll = async () => {
    let missingPolls = 0;
    const MAX_MISSING = 1500; // 5 min at 200ms — wait for file creation
    while (!stopped) {
      try {
        let fstat;
        try {
          fstat = await stat(filePath);
        } catch {
          // File doesn't exist (yet or anymore)
          if (firstPoll) {
            // Haven't seen the file at all — keep waiting for creation
            missingPolls++;
            if (missingPolls > MAX_MISSING) return;
            await sleep(200);
            continue;
          }
          // Saw the file before, now it's gone — deleted, done.
          return;
        }

        if (firstPoll) {
          lastSize = fstat.size;
          firstPoll = false;
          await sleep(200);
          continue;
        }

        if (fstat.size <= lastSize) {
          await sleep(200);
          continue;
        }

        const text = await readTailBytes(filePath, lastSize);
        lastSize = fstat.size;

        for (const line of text.split("\n")) {
          const trimmed = line.trim();
          if (!trimmed) continue;
          if (stopped) return;
          if (trimmed.includes('"type":"result"')) {
            onResult(trimmed);
            return;
          }
          onLine(trimmed);
        }
      } catch {
        await sleep(200);
      }
    }
  };

  const done = poll();
  return { stop, done };
};

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

const readTailBytes = (filePath: string, startByte: number): Promise<string> =>
  new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    const stream = createReadStream(filePath, { start: startByte });
    stream.on("data", (chunk: Buffer) => chunks.push(chunk));
    stream.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    stream.on("error", reject);
  });
