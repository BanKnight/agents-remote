import type { SessionStreamServerMessage } from "@agents-remote/shared";
import { describe, expect, mock, test } from "bun:test";
import { chunkBatchLines, createBatchEmitter, type BatchEmit } from "./claude2-stream";

// A minimal legal non-batch row. createBatchEmitter only branches on `type`, so
// the row payload is irrelevant to the batch logic under test.
const dataRow = (): string =>
  JSON.stringify({ type: "ended" } satisfies SessionStreamServerMessage);
const json = (msg: SessionStreamServerMessage): string => JSON.stringify(msg);

const setup = () => {
  const frames: Array<string | Uint8Array> = [];
  const emit: BatchEmit = (frame) => {
    frames.push(frame);
  };
  const onRealtimeRow = mock(
    (_line: string, _parsed: SessionStreamServerMessage, _emit: BatchEmit) => undefined,
  );
  const onData = createBatchEmitter({ emit, onRealtimeRow });
  return { frames, onRealtimeRow, onData };
};

const decodeBlob = (frame: string | Uint8Array): string => {
  if (!(frame instanceof Uint8Array)) throw new Error("expected Uint8Array blob");
  return Buffer.from(Bun.gunzipSync(frame)).toString();
};

describe("createBatchEmitter", () => {
  test("history batch: start text → one gzip blob → end text; rows compressed verbatim", () => {
    const { frames, onRealtimeRow, onData } = setup();
    const rows = [dataRow(), dataRow(), dataRow()];
    onData(json({ type: "history_start", count: rows.length }));
    for (const r of rows) onData(r);
    onData(json({ type: "history_end" }));

    expect(frames).toHaveLength(3);
    expect(frames[0]).toBe(json({ type: "history_start", count: rows.length }));
    expect(frames[2]).toBe(json({ type: "history_end" }));
    expect(decodeBlob(frames[1]!)).toBe(rows.join("\n"));
    expect(onRealtimeRow).not.toHaveBeenCalled();
  });

  test("live batch is compressed the same way", () => {
    const { frames, onData } = setup();
    const rows = [dataRow(), dataRow()];
    onData(json({ type: "live_start", count: rows.length }));
    for (const r of rows) onData(r);
    onData(json({ type: "live_end" }));
    expect(decodeBlob(frames[1]!)).toBe(rows.join("\n"));
  });

  test("count=0 batch emits no binary blob", () => {
    const { frames, onData } = setup();
    onData(json({ type: "history_start", count: 0 }));
    onData(json({ type: "history_end" }));
    expect(frames).toEqual([
      json({ type: "history_start", count: 0 }),
      json({ type: "history_end" }),
    ]);
    expect(frames.every((f) => typeof f === "string")).toBe(true);
  });

  test("rows after a batch closes go to the real-time handler", () => {
    const { onRealtimeRow, onData } = setup();
    onData(json({ type: "history_start", count: 1 }));
    onData(dataRow());
    onData(json({ type: "history_end" }));
    expect(onRealtimeRow).not.toHaveBeenCalled();

    const rt = dataRow();
    onData(rt);
    expect(onRealtimeRow).toHaveBeenCalledTimes(1);
    expect(onRealtimeRow.mock.calls[0]?.[0]).toBe(rt);
  });

  test("gzip failure falls back to per-row text frames", () => {
    const frames: Array<string | Uint8Array> = [];
    const original = Bun.gzipSync;
    const consoleErr = console.error;
    (Bun as unknown as { gzipSync: unknown }).gzipSync = () => {
      throw new Error("gzip boom");
    };
    console.error = mock(() => undefined);
    try {
      const onData = createBatchEmitter({
        emit: (f) => {
          frames.push(f);
        },
        onRealtimeRow: () => undefined,
      });
      const rows = [dataRow(), dataRow()];
      onData(json({ type: "history_start", count: rows.length }));
      for (const r of rows) onData(r);
      onData(json({ type: "history_end" }));
      expect(frames).toEqual([
        json({ type: "history_start", count: rows.length }),
        rows[0],
        rows[1],
        json({ type: "history_end" }),
      ]);
      expect(frames.every((f) => typeof f === "string")).toBe(true);
    } finally {
      (Bun as unknown as { gzipSync: unknown }).gzipSync = original;
      console.error = consoleErr;
    }
  });

  test("unparseable line is skipped silently", () => {
    const { frames, onRealtimeRow, onData } = setup();
    onData("{not valid json");
    expect(frames).toHaveLength(0);
    expect(onRealtimeRow).not.toHaveBeenCalled();
  });
});

describe("chunkBatchLines", () => {
  test("single chunk when total under target", () => {
    expect(chunkBatchLines(["a", "b", "c"], 1024)).toEqual(["a\nb\nc"]);
  });

  test("splits when cumulative size exceeds target and round-trips the original rows", () => {
    // Target 10 bytes; with "\n" separators the lines are "aaa"(4) "bbbb"(5) "cc"(3) "dddddd"(7).
    const chunks = chunkBatchLines(["aaa", "bbbb", "cc", "dddddd"], 10);
    expect(chunks.join("\n")).toBe("aaa\nbbbb\ncc\ndddddd");
    expect(chunks.length).toBeGreaterThan(1);
    for (const chunk of chunks) {
      expect(Buffer.byteLength(chunk)).toBeLessThanOrEqual(10 + 6);
    }
  });

  test("empty input yields no chunks", () => {
    expect(chunkBatchLines([])).toEqual([]);
  });

  test("oversized single line becomes its own chunk", () => {
    const long = "x".repeat(100);
    const chunks = chunkBatchLines(["a", long, "b"], 10);
    expect(chunks.join("\n")).toBe(`a\n${long}\nb`);
    expect(chunks.length).toBe(3);
    expect(Buffer.byteLength(chunks[1]!)).toBe(Buffer.byteLength(long));
  });
});
