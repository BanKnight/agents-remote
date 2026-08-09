import { describe, it, expect } from "bun:test";
import { runCliTool } from "./cli-process";

// 进程组 kill 集成测试覆盖 A1 最关键风险：超时/取消时整组（含 git/npm 孙进程）被清，
// 无孤儿。marker 用独特秒数避免环境噪音，pgrep -f 基线差值法兜底无关进程。

const ORPHAN_MARKER = "99991"; // 独特 sleep 秒数，pgrep -f "sleep 99991" 定位本测试产物

function pgrepCount(pattern: string): number {
  const r = Bun.spawnSync(["pgrep", "-f", pattern]);
  if (r.exitCode !== 0) return 0; // pgrep 无匹配返 1
  return r.stdout.toString().trim().split("\n").filter(Boolean).length;
}

/** 强清残留 marker 进程，防 killProcessGroup bug 留下孤儿污染后续测试。 */
function purgeOrphans(): void {
  try {
    Bun.spawnSync(["pkill", "-9", "-f", `sleep ${ORPHAN_MARKER}`]);
  } catch {
    // pkill 不在则跳过（CI 环境差异）
  }
}

const makeError = (m: string): Error => new Error(m);

describe("runCliTool — 现有路径（killProcessGroup 默认 false）", () => {
  it("正常完成并收集 stdout/stderr", async () => {
    const result = await runCliTool(["sh", "-c", "echo out; echo err 1>&2"], { makeError });
    expect(result.exitCode).toBe(0);
    expect(result.stdout.trim()).toBe("out");
    expect(result.stderr.trim()).toBe("err");
  });

  it("非零 exitCode 透传", async () => {
    const result = await runCliTool(["sh", "-c", "exit 7"], { makeError });
    expect(result.exitCode).toBe(7);
  });
});

describe("runCliTool — 进程组路径（killProcessGroup: true）", () => {
  it("并发 drain stdout/stderr + onChunk 回调", async () => {
    const chunks: string[] = [];
    const result = await runCliTool(["sh", "-c", "echo line1; echo line2 1>&2; echo line3"], {
      killProcessGroup: true,
      onChunk: (_stream, chunk) => chunks.push(chunk),
      makeError,
    });
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("line1");
    expect(result.stdout).toContain("line3");
    expect(result.stderr).toContain("line2");
    // onChunk 收到所有输出（stdout + stderr 混合，顺序由内核）
    const joined = chunks.join("");
    expect(joined).toContain("line1");
    expect(joined).toContain("line2");
    expect(joined).toContain("line3");
  });

  it("大输出（>64KB 管道缓冲）不阻塞——并发 drain 防死锁", async () => {
    // 顺序读（先 exited 后读）会撑爆 64KB 管道 → 进程阻塞写 → 永不 exit → 超时。
    // 并发 drain 持续读，进程正常退出。此测试隐式验证 drain 并发性。
    const result = await runCliTool(["sh", "-c", "yes x | head -c 200000"], {
      killProcessGroup: true,
      timeoutMs: 10_000,
      makeError,
    });
    expect(result.exitCode).toBe(0);
    expect(result.stdout.length).toBeGreaterThanOrEqual(190_000);
  });

  it("超时杀整个进程组——无孤儿孙进程", async () => {
    purgeOrphans();
    const baseline = pgrepCount(`sleep ${ORPHAN_MARKER}`);
    // sh wait 后台 sleep：sh + sleep 同进程组（detached setsid）。超时应整组被杀。
    const cmd = ["sh", "-c", `sleep ${ORPHAN_MARKER} & wait`];
    await expect(
      runCliTool(cmd, { killProcessGroup: true, timeoutMs: 300, makeError }),
    ).rejects.toThrow(/timed out/);
    // SIGTERM 已投递，等内核调度生效后检查无新增孤儿
    await new Promise<void>((r) => setTimeout(r, 300));
    expect(pgrepCount(`sleep ${ORPHAN_MARKER}`)).toBe(baseline);
    purgeOrphans();
  });
});
