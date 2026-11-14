// Turn 级 checkpoint 服务（T3 Code 学习点③）：git 隐藏 refs 作唯一存储——refs 即索引
//（`refs/ar/checkpoints/<sessionKey>/<ordinal>/<phase>`），元数据 JSON 在 commit message，
// 不建第二存储。捕获走临时 GIT_INDEX_FILE + plumbing（read-tree → add -A → write-tree →
// commit-tree → update-ref），不动用户 index/工作区；恢复 = restore --source --worktree
// --staged + reset + 循环 clean -fd（先打 restore-backup）。决策记录见
// docs/design/checkpoint-rollback.md；能力边界调研见 docs/research/native-checkpoints.md。
//
// 安全：ref 名全部由白名单字符拼装（sessionKey=hex、ordinal=数字、phase=固定枚举），
// sessionId 只进 commit message JSON 不进 ref 名；git 一律 argv 数组零 shell 拼接；
// projectPath 由路由层经 resolveProjectRelativePath 保证在 PROJECTS_ROOT 内。

import { createHash } from "node:crypto";
import { mkdtemp, realpath, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  MESSAGE_UUID_RE,
  type GitDiffFileStatus,
  type SessionCheckpointDiffFile,
  type SessionCheckpointDiffResponse,
  type SessionCheckpointListResponse,
  type SessionCheckpointStatus,
  type SessionCheckpointSummary,
} from "@agents-remote/shared";
import { runGit } from "./git-runner";

// ── 常量（plan 钉死）───────────────────────────────────────────────────
/** baseline 捕获预算：超时降级为本轮无 baseline，绝不阻塞 agent 上行（T3 同款）。 */
export const CHECKPOINT_CAPTURE_TIMEOUT_MS = 5000;
/** 保留最近 N 轮 checkpoint（超出由 prune 删 ref）。 */
export const CHECKPOINT_RETENTION_TURNS = 100;
/** 恢复后循环 clean -fd 上限（新 .gitignore 可能逐轮暴露隐藏文件，T3 同款）。 */
const RESTORE_CLEAN_MAX_PASSES = 4;
/** 恢复链路预算：restore/reset/clean 是用户显式触发的同步动作，给足时间（capture 的 5s
 *  只约束「不能阻塞 agent 上行」的自动路径）。 */
const RESTORE_TIMEOUT_MS = 60_000;
/** 单个 diff 响应内联 diff 字节上限，超出截断（剩余文件只列 path）。 */
const DIFF_MAX_BYTES = 512 * 1024;
const SESSION_KEY_HEX_LEN = 16;

const CHECKPOINT_REF_PREFIX = "refs/ar/checkpoints";
const CHECKPOINT_REF_RE =
  /^refs\/ar\/checkpoints\/([0-9a-f]{16})\/(\d+)\/(baseline|endpoint|restore-backup)$/;

export type CheckpointPhase = "baseline" | "endpoint" | "restore-backup";

export type CheckpointErrorCode =
  | "CHECKPOINT_NOT_FOUND"
  | "CHECKPOINT_NOT_GIT"
  | "CHECKPOINT_CAPTURE_TIMEOUT"
  | "CHECKPOINT_RESTORE_FAILED";

export class CheckpointError extends Error {
  constructor(
    readonly code: CheckpointErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "CheckpointError";
  }
}

/** commit message 承载的元数据（list 时 JSON.parse 容错解析，坏行跳过）。 */
type CheckpointMeta = {
  ar: 1;
  sessionId: string;
  ordinal: number;
  phase: CheckpointPhase;
  anchorUuid: string | null;
  endUuid?: string;
  at: string;
  isError?: boolean;
  stats?: { filesChanged: number; insertions: number; deletions: number };
};

export const checkpointSessionKey = (sessionId: string): string =>
  createHash("sha256").update(sessionId).digest("hex").slice(0, SESSION_KEY_HEX_LEN);

export const checkpointRef = (
  sessionKey: string,
  ordinal: number,
  phase: CheckpointPhase,
): string => `${CHECKPOINT_REF_PREFIX}/${sessionKey}/${ordinal}/${phase}`;

// commit 身份固定注入，不读用户 git config（headless 环境可能没有 user.name/email，
// commit-tree 会直接失败）。日期用 turn 时刻，让 commit date 反映真实时间线。
const CHECKPOINT_IDENTITY_ENV = {
  GIT_AUTHOR_NAME: "agents-remote",
  GIT_AUTHOR_EMAIL: "checkpoint@agents-remote.local",
  GIT_COMMITTER_NAME: "agents-remote",
  GIT_COMMITTER_EMAIL: "checkpoint@agents-remote.local",
};

export type CaptureInput = {
  projectPath: string;
  sessionId: string;
  ordinal: number;
  phase: CheckpointPhase;
  anchorUuid: string | null;
  endUuid?: string;
  at: string;
  isError?: boolean;
};

export class CheckpointService {
  /** argv 数组 + 超时 + 统一错误包装。 */
  private async git(
    projectPath: string,
    args: string[],
    env?: Record<string, string | undefined>,
    timeoutMs: number = CHECKPOINT_CAPTURE_TIMEOUT_MS,
  ): Promise<{ stdout: string; stderr: string; exitCode: number }> {
    const result = await runGit(projectPath, args, { env, timeoutMs });
    return result;
  }

  /** 捕获链路的一步：非零退出立即失败（静默继续会把「add 超时」写成内容 = HEAD 的
   *  假 baseline，回滚时丢失全部未提交工作）。 */
  private async captureStep(
    projectPath: string,
    args: string[],
    env: Record<string, string | undefined>,
  ): Promise<string> {
    const result = await this.git(projectPath, args, env);
    if (result.exitCode !== 0) {
      throw new CheckpointError(
        "CHECKPOINT_CAPTURE_TIMEOUT",
        `git ${args[0]} failed (${result.exitCode}): ${result.stderr.trim()}`,
      );
    }
    return result.stdout.trim();
  }

  /** 项目根 = worktree 根（共享工作区前提；嵌套 worktree/submodule 不做 checkpoint）。 */
  async isProjectWorktree(projectPath: string): Promise<boolean> {
    let real: string;
    try {
      real = await realpath(projectPath);
    } catch {
      return false;
    }
    const result = await this.git(projectPath, ["rev-parse", "--show-toplevel"]);
    if (result.exitCode !== 0) return false;
    let topLevel: string;
    try {
      topLevel = await realpath(result.stdout.trim());
    } catch {
      return false;
    }
    return topLevel === real;
  }

  /**
   * 捕获工作区快照为隐藏 ref。endpoint 相位自动计算与参照点（上一轮 endpoint，缺失退化
   * 为本轮 baseline）的 numstat 并写进 meta——查询零成本。超时抛 CHECKPOINT_CAPTURE_TIMEOUT
   *（turn-checkpointer 降级，不阻塞 agent）。
   */
  async capture(input: CaptureInput): Promise<{ commit: string }> {
    const { projectPath, sessionId, ordinal, phase } = input;
    if (!(await this.isProjectWorktree(projectPath))) {
      throw new CheckpointError("CHECKPOINT_NOT_GIT", "Project is not a git worktree root");
    }

    const sessionKey = checkpointSessionKey(sessionId);
    const ref = checkpointRef(sessionKey, ordinal, phase);
    const indexDir = await mkdtemp(join(tmpdir(), "ar-checkpoint-"));
    const indexFile = join(indexDir, "index");
    try {
      const env = {
        ...CHECKPOINT_IDENTITY_ENV,
        GIT_INDEX_FILE: indexFile,
        GIT_AUTHOR_DATE: input.at,
        GIT_COMMITTER_DATE: input.at,
      };

      // 空仓库（无 HEAD）从空树起步，commit-tree 不带 parent（orphan，remodex 同款）。
      // rev-parse 的「无 HEAD」是预期分支，用 exitCode 分流而非 captureStep。
      const head = await this.git(projectPath, ["rev-parse", "--verify", "--quiet", "HEAD"], env);
      const hasHead = head.exitCode === 0 && head.stdout.trim().length > 0;
      await this.captureStep(projectPath, ["read-tree", hasHead ? "HEAD" : "--empty"], env);
      await this.captureStep(projectPath, ["add", "-A", "--", "."], env);
      const tree = await this.captureStep(projectPath, ["write-tree"], env);

      // numstat 对裸 tree 也适用；参照点缺失（首轮且无 baseline）则不写 stats。
      let stats: CheckpointMeta["stats"];
      if (phase === "endpoint") {
        const prevRef =
          (await this.resolveRef(
            projectPath,
            checkpointRef(sessionKey, ordinal - 1, "endpoint"),
          )) ??
          (await this.resolveRef(projectPath, checkpointRef(sessionKey, ordinal, "baseline")));
        if (prevRef) {
          stats = await this.numstat(projectPath, prevRef, tree, env);
        }
      }

      const meta: CheckpointMeta = {
        ar: 1,
        sessionId,
        ordinal,
        phase,
        anchorUuid: input.anchorUuid,
        ...(input.endUuid !== undefined ? { endUuid: input.endUuid } : {}),
        at: input.at,
        ...(input.isError ? { isError: true } : {}),
        ...(stats ? { stats } : {}),
      };
      const commitArgs = hasHead
        ? ["commit-tree", tree, "-p", "HEAD", "-m", JSON.stringify(meta)]
        : ["commit-tree", tree, "-m", JSON.stringify(meta)];
      const commit = await this.captureStep(projectPath, commitArgs, env);
      await this.captureStep(projectPath, ["update-ref", ref, commit], env);
      // update-ref 的 exitCode 之外的保险：ref 必须真的指向这个 commit（并发 prune /
      // 目录权限等静默失败时，调用方以为捕获成功）。
      if ((await this.resolveRef(projectPath, ref)) !== commit) {
        throw new CheckpointError(
          "CHECKPOINT_CAPTURE_TIMEOUT",
          `checkpoint ref not written: ${ref}`,
        );
      }
      return { commit };
    } catch (error) {
      if (error instanceof CheckpointError) throw error;
      // 超时（runner SIGKILL 后 git 以非零退出，或 spawn 异常）→ 统一降级信号。
      if (error instanceof Error && error.name === "GitRunnerError") {
        throw new CheckpointError("CHECKPOINT_CAPTURE_TIMEOUT", error.message);
      }
      // 非 runner 错误（mkdtemp 失败等）同样按超时降级处理——capture 永不阻塞上行。
      throw new CheckpointError(
        "CHECKPOINT_CAPTURE_TIMEOUT",
        error instanceof Error ? error.message : String(error),
      );
    } finally {
      await rm(indexDir, { recursive: true, force: true }).catch(() => undefined);
    }
  }

  async listCheckpoints(
    projectPath: string,
    sessionId: string,
  ): Promise<SessionCheckpointListResponse> {
    if (!(await this.isProjectWorktree(projectPath))) {
      return { repository: false, projectName: "", reason: "not_git_repository" };
    }
    const sessionKey = checkpointSessionKey(sessionId);
    const result = await this.git(projectPath, [
      "for-each-ref",
      `${CHECKPOINT_REF_PREFIX}/${sessionKey}`,
      "--format=%(refname)%00%(objectname)%00%(contents)",
    ]);
    if (result.exitCode !== 0) {
      return { repository: true, checkpoints: [] };
    }

    // refname 字典序不等于数字序（10 < 9），解析后按 ordinal 排序；同一 ordinal 只取
    // endpoint 作 summary（有 baseline 无 endpoint 的半 turn 跳过不展示）。
    const endpoints = new Map<number, { commit: string; meta: CheckpointMeta }>();
    for (const line of result.stdout.split("\n")) {
      if (!line) continue;
      const [refname, objectname, contents] = line.split("\0");
      if (!refname || !objectname) continue;
      const match = CHECKPOINT_REF_RE.exec(refname);
      if (!match || match[1] !== sessionKey) continue;
      if (match[3] !== "endpoint") continue;
      let meta: CheckpointMeta | null = null;
      try {
        const parsed = JSON.parse(contents.trim()) as CheckpointMeta;
        if (parsed?.ar === 1) meta = parsed;
      } catch {
        meta = null;
      }
      endpoints.set(Number(match[2]), {
        commit: objectname,
        meta: meta ?? {
          ar: 1,
          sessionId,
          ordinal: Number(match[2]),
          phase: "endpoint",
          anchorUuid: null,
          at: "",
        },
      });
    }

    const checkpoints: SessionCheckpointSummary[] = [...endpoints.entries()]
      .sort(([a], [b]) => a - b)
      .map(([ordinal, { commit, meta }]) => ({
        ordinal,
        commit,
        anchorUuid: meta.anchorUuid,
        ...(meta.endUuid !== undefined ? { endUuid: meta.endUuid } : {}),
        at: meta.at,
        filesChanged: meta.stats?.filesChanged ?? 0,
        insertions: meta.stats?.insertions ?? 0,
        deletions: meta.stats?.deletions ?? 0,
        status: "ready" satisfies SessionCheckpointStatus,
      }));
    return { repository: true, checkpoints };
  }

  /** 本轮 per-turn diff：endpoint_{n} 对（endpoint_{n-1} ?? baseline_{n}），双缺 → 空 diff。 */
  async turnDiff(
    projectPath: string,
    sessionId: string,
    ordinal: number,
  ): Promise<SessionCheckpointDiffResponse> {
    const sessionKey = checkpointSessionKey(sessionId);
    const target = await this.resolveRef(
      projectPath,
      checkpointRef(sessionKey, ordinal, "endpoint"),
    );
    if (!target)
      throw new CheckpointError("CHECKPOINT_NOT_FOUND", `No endpoint for turn ${ordinal}`);
    const from =
      (await this.resolveRef(projectPath, checkpointRef(sessionKey, ordinal - 1, "endpoint"))) ??
      (await this.resolveRef(projectPath, checkpointRef(sessionKey, ordinal, "baseline")));
    if (!from) {
      return { repository: true, ordinal, files: [], truncated: false };
    }

    const status = await this.git(projectPath, [
      "diff",
      "--name-status",
      "--no-renames",
      "-z",
      from,
      target,
    ]);
    if (status.exitCode !== 0) {
      throw new CheckpointError("CHECKPOINT_RESTORE_FAILED", "diff --name-status failed");
    }
    // -z 流：`<status>\0<path>\0` 交替（--no-renames 下 rename 拆成 D+A，路径单值）。
    const tokens = status.stdout.split("\0").filter((token) => token.length > 0);
    const entries: Array<{ path: string; gitStatus: string }> = [];
    for (let i = 0; i + 1 < tokens.length; i += 2) {
      entries.push({ gitStatus: tokens[i]!, path: tokens[i + 1]! });
    }

    const files: SessionCheckpointDiffFile[] = [];
    let truncated = false;
    let budget = DIFF_MAX_BYTES;
    for (const entry of entries) {
      let diff = "";
      if (!truncated && budget > 0) {
        const fileDiff = await this.git(projectPath, ["diff", from, target, "--", entry.path]);
        if (fileDiff.exitCode === 0) {
          diff = fileDiff.stdout;
          if (diff.length > budget) {
            diff = "";
            truncated = true;
          } else {
            budget -= diff.length;
          }
        }
      } else {
        truncated = true;
      }
      files.push({
        path: entry.path,
        status: mapGitStatus(entry.gitStatus),
        diff,
      });
    }
    return { repository: true, ordinal, files, truncated };
  }

  /**
   * 恢复工作区到指定 ref（phase 参数化）：先打 restore-backup，再 restore --worktree --staged +
   * reset + 循环 clean -fd。restore 非零退出 → CHECKPOINT_RESTORE_FAILED（backup ref
   * 已在场，可手动还原）。同一 ordinal 重复回滚会覆盖旧 backup（最近一次胜出，v1 接受）。
   *
   * 顺序不可换：capture 自校验 update-ref 落地（失败即抛），backup 不在场时绝不进入
   * 不可逆的 restore——否则用户失去唯一的还原点。
   */
  async restoreTo(
    projectPath: string,
    sessionId: string,
    ordinal: number,
    phase: CheckpointPhase,
    at: string,
  ): Promise<{ backupRef: string }> {
    const sessionKey = checkpointSessionKey(sessionId);
    const targetRef = checkpointRef(sessionKey, ordinal, phase);
    const target = await this.resolveRef(projectPath, targetRef);
    if (!target) throw new CheckpointError("CHECKPOINT_NOT_FOUND", "target missing");

    const backupRef = checkpointRef(sessionKey, ordinal, "restore-backup");
    await this.capture({
      projectPath,
      sessionId,
      ordinal,
      phase: "restore-backup",
      anchorUuid: null,
      at,
    });

    // --no-overlay：源里不存在的路径要一并删掉（默认 overlay 只覆盖共有路径，
    // 本轮新增的文件会残留 = 「回滚了但文件还在」）。
    const restore = await this.git(
      projectPath,
      ["restore", "--source", target, "--worktree", "--staged", "--no-overlay", "--", "."],
      undefined,
      RESTORE_TIMEOUT_MS,
    );
    if (restore.exitCode !== 0) {
      throw new CheckpointError("CHECKPOINT_RESTORE_FAILED", restore.stderr.trim());
    }
    // index 退回 HEAD（mixed），工作区保持 target 内容 → diff 呈现为未提交修改，用户自决。
    const reset = await this.git(
      projectPath,
      ["reset", "--quiet", "--", "."],
      undefined,
      RESTORE_TIMEOUT_MS,
    );
    if (reset.exitCode !== 0) {
      throw new CheckpointError("CHECKPOINT_RESTORE_FAILED", reset.stderr.trim());
    }

    for (let pass = 0; pass < RESTORE_CLEAN_MAX_PASSES; pass += 1) {
      const clean = await this.git(
        projectPath,
        ["clean", "-fd", "--", "."],
        undefined,
        RESTORE_TIMEOUT_MS,
      );
      if (clean.exitCode !== 0 || clean.stdout.trim().length === 0) break;
    }
    return { backupRef };
  }

  /**
   * 本轮最大 ordinal（扫全部 phase 的 ref，含只有 baseline 的半 turn）——turn 编排分配新
   * ordinal 用。只从 endpoint 推导会让「上轮 capture 降级」的半 turn 被覆盖。
   */
  async maxOrdinal(projectPath: string, sessionId: string): Promise<number> {
    const sessionKey = checkpointSessionKey(sessionId);
    const result = await this.git(projectPath, [
      "for-each-ref",
      `${CHECKPOINT_REF_PREFIX}/${sessionKey}`,
      "--format=%(refname)",
    ]);
    if (result.exitCode !== 0) return 0;
    let max = 0;
    for (const refname of result.stdout.split("\n")) {
      const match = CHECKPOINT_REF_RE.exec(refname);
      if (!match || match[1] !== sessionKey) continue;
      max = Math.max(max, Number(match[2]));
    }
    return max;
  }

  /** 本轮 endpoint commit（= 列表 summary 的 `commit`，乐观并发 `expectedCommit` 的比对源）。 */
  async resolveTurnEndpoint(
    projectPath: string,
    sessionId: string,
    ordinal: number,
  ): Promise<string | null> {
    const sessionKey = checkpointSessionKey(sessionId);
    return this.resolveRef(projectPath, checkpointRef(sessionKey, ordinal, "endpoint"));
  }

  /**
   * 回滚目标裁决（「回到这轮之前」）：优先本轮 baseline（turn 前原态——不回滚其它会话
   * 在两轮之间的改动），缺失降级上一轮 endpoint，双缺 → null（CHECKPOINT_NOT_FOUND）。
   */
  async resolveRollbackTarget(
    projectPath: string,
    sessionId: string,
    ordinal: number,
  ): Promise<{ commit: string; ordinal: number; phase: CheckpointPhase } | null> {
    const sessionKey = checkpointSessionKey(sessionId);
    const baseline = await this.resolveRef(
      projectPath,
      checkpointRef(sessionKey, ordinal, "baseline"),
    );
    if (baseline) return { commit: baseline, ordinal, phase: "baseline" };
    if (ordinal > 1) {
      const prev = await this.resolveRef(
        projectPath,
        checkpointRef(sessionKey, ordinal - 1, "endpoint"),
      );
      if (prev) return { commit: prev, ordinal: ordinal - 1, phase: "endpoint" };
    }
    return null;
  }

  /**
   * 对话截断锚：上一轮 endpoint 的 endUuid（--resume-session-at 含锚语义 → 必须取「上一条
   * 消息」= 上一轮的最后一条）。首轮无前驱 / 上一轮缺失或捕获降级无 endUuid → null
   *（调用方开全新会话）。
   */
  async resolveConversationAnchor(
    projectPath: string,
    sessionId: string,
    ordinal: number,
  ): Promise<string | null> {
    if (ordinal <= 1) return null;
    const sessionKey = checkpointSessionKey(sessionId);
    const meta = await this.readRefMeta(
      projectPath,
      checkpointRef(sessionKey, ordinal - 1, "endpoint"),
    );
    // 元数据落盘后可被改写（agent 自己也能 update-ref）：读回处再校验一次形态，
    // 它最终进 `--resume-session-at` 的 argv。
    const endUuid = meta?.endUuid;
    return typeof endUuid === "string" && MESSAGE_UUID_RE.test(endUuid) ? endUuid : null;
  }

  /** 保留最近 N 轮，删除更早 ordinal 的全部 ref（含 baseline/restore-backup）。 */
  async prune(projectPath: string, sessionId: string): Promise<void> {
    if (!(await this.isProjectWorktree(projectPath))) return;
    const sessionKey = checkpointSessionKey(sessionId);
    const result = await this.git(projectPath, [
      "for-each-ref",
      `${CHECKPOINT_REF_PREFIX}/${sessionKey}`,
      "--format=%(refname)",
    ]);
    if (result.exitCode !== 0) return;

    const ordinals = new Set<number>();
    const refsByOrdinal = new Map<number, string[]>();
    for (const refname of result.stdout.split("\n")) {
      const match = CHECKPOINT_REF_RE.exec(refname);
      if (!match || match[1] !== sessionKey) continue;
      const ordinal = Number(match[2]);
      ordinals.add(ordinal);
      const list = refsByOrdinal.get(ordinal) ?? [];
      list.push(refname);
      refsByOrdinal.set(ordinal, list);
    }
    if (ordinals.size <= CHECKPOINT_RETENTION_TURNS) return;

    const sorted = [...ordinals].sort((a, b) => a - b);
    const dropCount = sorted.length - CHECKPOINT_RETENTION_TURNS;
    for (const ordinal of sorted.slice(0, dropCount)) {
      for (const refname of refsByOrdinal.get(ordinal) ?? []) {
        await this.git(projectPath, ["update-ref", "-d", refname]);
      }
    }
  }

  private async resolveRef(projectPath: string, ref: string): Promise<string | null> {
    const result = await this.git(projectPath, ["rev-parse", "--verify", "--quiet", ref]);
    return result.exitCode === 0 && result.stdout.trim().length > 0 ? result.stdout.trim() : null;
  }

  /** 读单 ref 的 commit message 元数据（JSON.parse 容错，坏数据返回 null）。 */
  private async readRefMeta(projectPath: string, ref: string): Promise<CheckpointMeta | null> {
    const result = await this.git(projectPath, ["for-each-ref", ref, "--format=%(contents)"]);
    if (result.exitCode !== 0) return null;
    try {
      const parsed = JSON.parse(result.stdout.trim()) as CheckpointMeta;
      return parsed?.ar === 1 ? parsed : null;
    } catch {
      return null;
    }
  }

  private async numstat(
    projectPath: string,
    from: string,
    to: string,
    env: Record<string, string | undefined>,
  ): Promise<CheckpointMeta["stats"]> {
    const result = await this.git(projectPath, ["diff", "--numstat", from, to], env);
    if (result.exitCode !== 0) return { filesChanged: 0, insertions: 0, deletions: 0 };
    let filesChanged = 0;
    let insertions = 0;
    let deletions = 0;
    for (const line of result.stdout.split("\n")) {
      const match = /^(\d+|-)\t(\d+|-)\t/.exec(line);
      if (!match) continue;
      filesChanged += 1;
      insertions += match[1] === "-" ? 0 : Number(match[1]);
      deletions += match[2] === "-" ? 0 : Number(match[2]);
    }
    return { filesChanged, insertions, deletions };
  }
}

function mapGitStatus(gitStatus: string): GitDiffFileStatus {
  switch (gitStatus[0]) {
    case "A":
      return "added";
    case "D":
      return "deleted";
    case "R":
      return "renamed";
    default:
      return "modified";
  }
}
