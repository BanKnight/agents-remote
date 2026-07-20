import { appendFile, mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { type ClaudePreset, type EffortLevel } from "@agents-remote/shared";
import type { RuntimeResources, RuntimeStream, SessionMetadata } from "./session-registry";
import { Claude2SessionRelay } from "./session-relay";
import {
  SettingsStore,
  activePresetView,
  buildAvailableAliases,
  type ModelMappingView,
} from "./settings-store";

type BunSubprocess = ReturnType<typeof Bun.spawn>;

// Build the scalar seed init line for replay. Carries CURRENT model/permissionMode
// so the client's scalar fold has a seed (system.init is stdout-only, absent from
// JSONL/tail). Uses a DISTINCT subtype "seed_init" (not "init") so both server-side
// init capture (claude2-stream onRealtimeRow + runtime captureSystemInitFromLine,
// which match subtype === "init") and client render (normalizeChatStream skips it)
// both ignore it — it only folds scalars via a dedicated seed_init branch; model /
// permissionMode surface in the session header, no bubble.
// See docs/design/message-replay.md 「特殊时期 history 缩容」.
export function buildSeedInitLine(model?: string, permissionMode?: string): string | undefined {
  if (!model && !permissionMode) return undefined;
  return JSON.stringify({
    type: "system",
    subtype: "seed_init",
    ...(model ? { model } : {}),
    ...(permissionMode ? { permissionMode } : {}),
  });
}

// Extract the model the CLI stores after an in-process model switch. After a
// control_request{set_model} switch the CLI emits a breadcrumb user message:
//   <local-command-stdout>Set model to <display></local-command-stdout>
// where <display> = modelDisplayString(requestedModel) — either a bare concrete
// id (`claude-sonnet-4-6`) when the requested model is already concrete, or
// `<alias> (<resolved>)` (`opusplan (claude-sonnet-4-6)`, `haiku (claude-haiku-4-5-…)`)
// when the CLI resolved an alias. See CLI print.ts set_model handler +
// utils/messages.ts createModelSwitchBreadcrumbs.
//
// We capture the RAW requested model (the token before ` (` when present, else
// the whole tail) — mirroring the CLI, which stores activeUserSpecifiedModel =
// requestedModel verbatim and resolves aliases at query time. Capturing the
// resolved id instead would persist e.g. `claude-sonnet-4-6` for an `opusplan`
// switch, so an API restart (--resume --model <state.model>) would lose the
// plan-mode-aware Opus/Sonnet semantics. control_response carries no model and
// system.init is spawn-time only, so this echo is the ONLY stdout signal of the
// switch — symmetric to capturePermissionModeFromLine. Extracted as a pure
// function so the parse is unit-testable (cf. buildSeedInitLine).
export function extractModelFromStdoutLine(
  parsed: Record<string, unknown> | null,
): string | undefined {
  if (!parsed || parsed.type !== "user") return undefined;
  const message = parsed.message as { content?: unknown } | undefined;
  if (!message) return undefined;
  const contents = Array.isArray(message.content) ? message.content : [message.content];
  for (const block of contents) {
    const text = typeof block === "string" ? block : (block as { text?: string } | null)?.text;
    if (typeof text !== "string") continue;
    const match = text.match(
      /<local-command-stdout>\s*Set model to (.+?)\s*(?:\([^)]*\))?\s*<\/local-command-stdout>/,
    );
    if (match?.[1]) {
      // group 1 = raw requested model (alias or concrete); the optional
      // `(resolved)` group is display-only and intentionally discarded.
      return match[1].trim();
    }
  }
  return undefined;
}

// Detect a successful /reload-skills from its CLI echo.
//
// /reload-skills is a local slash command (same class as /cost). On the live
// stream-json stdout the CLI does NOT echo it as a user message — it persists
// the output as a system{subtype:"local_command"} record (JSONL), then yields a
// SYNTHETIC ASSISTANT message for the stream: QueryEngine.ts routes
// system/local_command through localCommandOutputToSDKAssistantMessage
// (mappers.ts), which strips the <local-command-stdout> tag and wraps the clean
// text in an assistant message with model "<synthetic>".
//
// So the live carrier is an assistant message whose text content is the STRIPPED
// output ("Reloaded skills: N skills available ...") — NOT a user message with a
// <local-command-stdout> tag. This is the key difference from model-switch,
// whose "Set model to" signal rides a user message (the control_request path).
// Scan every text location (message.content of any type + top-level content) and
// match the stripped-text pattern so the fold fires regardless of carrier; the
// "Reloaded skills: N skills" shape is specific enough that the carrier-agnostic
// scan does not produce false positives.
//
// The catalog is filesystem-scanned (not a process scalar), so this returns only
// a boolean signal — captureSkillReloadFromLine fires onSkillReload so index.ts
// can broadcast. Pure function so the parse is unit-testable without a
// Claude2Runtime instance.
export function extractSkillReloadFromStdoutLine(parsed: Record<string, unknown> | null): boolean {
  if (!parsed) return false;
  const texts: string[] = [];
  const message = parsed.message as { content?: unknown } | undefined;
  if (message) {
    const contents = Array.isArray(message.content) ? message.content : [message.content];
    for (const block of contents) {
      const text = typeof block === "string" ? block : (block as { text?: string } | null)?.text;
      if (typeof text === "string") texts.push(text);
    }
  }
  if (typeof parsed.content === "string") texts.push(parsed.content);
  return texts.some((t) => /Reloaded skills:\s+\d+\s+skills/i.test(t));
}

type Claude2Process = {
  proc: BunSubprocess;
  generation: number;
  projectPath: string;
  sessionId: string;
  claudeSessionId?: string;
  model?: string;
  permissionMode?: string;
  effort?: EffortLevel;
};

// 纯函数：构造 spawn env——继承父进程 + 注入 effort + provider 凭证 + model alias 解析 env。
// 对齐 CLI 原生 alias 机制：把激活预设 modelMapping 的 opus/sonnet/haiku 具体 ID 注入
// ANTHROPIC_DEFAULT_*_MODEL，让 CLI 自行解析 alias（含 opusplan：普通模式=SONNET env、
// Plan Mode=OPUS env，见官方 model-config §环境变量）。enable1mContext 时 opus/sonnet
// 带 [1m]（haiku 不带——CLI MODEL_ALIASES 无 haiku[1m]）。无 view（无激活预设）→ 不注入，
// CLI 回落自身默认。apiKey 只在此处从 provider 读出写进 env，不进任何日志/状态。导出供测试。
export function buildSpawnEnv(
  effort: EffortLevel | undefined,
  provider: { apiKey: string; baseUrl?: string } | undefined,
  parentEnv: Record<string, string | undefined> = process.env,
  view?: ModelMappingView,
): Record<string, string | undefined> {
  const env: Record<string, string | undefined> = { ...parentEnv };
  if (effort) env.CLAUDE_CODE_EFFORT_LEVEL = effort;
  if (provider?.apiKey) env.ANTHROPIC_API_KEY = provider.apiKey;
  if (provider?.baseUrl) env.ANTHROPIC_BASE_URL = provider.baseUrl;
  if (view) {
    const { resolved } = buildAvailableAliases(view);
    if (resolved.opus) env.ANTHROPIC_DEFAULT_OPUS_MODEL = resolved.opus;
    if (resolved.sonnet) env.ANTHROPIC_DEFAULT_SONNET_MODEL = resolved.sonnet;
    if (resolved.haiku) env.ANTHROPIC_DEFAULT_HAIKU_MODEL = resolved.haiku;
  }
  return env;
}

// 纯函数：从 settings 解析 claude runtime 激活预设的凭证。activePresetId 命中 → 返回
// {apiKey, baseUrl}；未激活/未命中/无 presets → undefined（spawn 回退继承父进程 env）。
// v2 起预设恒 anthropic（claude 端点），无需 protocol 守卫。导出供测试。
export function resolveActivePresetCreds(
  rt: { activePresetId: string } | undefined,
  presets: ClaudePreset[] | undefined,
): { apiKey: string; baseUrl?: string } | undefined {
  if (!rt?.activePresetId || !presets) return undefined;
  const preset = presets.find((p) => p.id === rt.activePresetId);
  if (!preset) return undefined;
  return { apiKey: preset.apiKey, baseUrl: preset.baseUrl };
}

export class Claude2Runtime implements RuntimeResources {
  private readonly processes = new Map<string, Claude2Process>();
  private readonly relays = new Map<string, Claude2SessionRelay>();
  private readonly runDir: string;
  private readonly settingsStore?: SettingsStore;
  private nextGeneration = 1;
  private onSystemInit:
    | ((sessionId: string, runtimeKey: string, claudeSessionId: string, model: string) => void)
    | null = null;
  private onModelChange: ((sessionId: string, model: string) => void) | null = null;
  private onPermissionModeChange: ((sessionId: string, permissionMode: string) => void) | null =
    null;
  private onSkillReload: ((sessionName: string) => void) | null = null;

  constructor(runDir: string, settingsStore?: SettingsStore) {
    this.runDir = runDir;
    this.settingsStore = settingsStore;
  }

  setOnSystemInit(
    cb: (sessionId: string, runtimeKey: string, claudeSessionId: string, model: string) => void,
  ) {
    this.onSystemInit = cb;
  }

  setOnModelChange(cb: (sessionId: string, model: string) => void) {
    this.onModelChange = cb;
  }

  setOnPermissionModeChange(cb: (sessionId: string, permissionMode: string) => void) {
    this.onPermissionModeChange = cb;
  }

  setOnSkillReload(cb: (sessionName: string) => void) {
    this.onSkillReload = cb;
  }

  getSessionState(sessionName: string) {
    const state = this.processes.get(sessionName);
    if (!state) return null;
    return { model: state.model, permissionMode: state.permissionMode };
  }

  // Resolve a model id for a runtime control_request{set_model}. Passthrough:
  // the client sends an alias (opus/sonnet/haiku/opusplan) and the CLI resolves
  // it via ANTHROPIC_DEFAULT_*_MODEL env (injected at spawn by buildSpawnEnv).
  // concrete IDs (legacy clients) also pass through verbatim. No settings read
  // needed — alias→concrete resolution is the CLI's job, not ours.
  async resolveControlModel(model: string | undefined): Promise<string | undefined> {
    return model;
  }

  setClaudeSessionId(sessionName: string, claudeSessionId: string, model?: string): void {
    const state = this.processes.get(sessionName);
    if (state) {
      if (!state.claudeSessionId) state.claudeSessionId = claudeSessionId;
      if (model && !state.model) state.model = model;
      const relay = this.relays.get(sessionName);
      if (relay) relay.setClaudeSessionId(state.projectPath, claudeSessionId);
    }
  }

  async exists(sessionName: string): Promise<boolean> {
    const proc = this.processes.get(sessionName);
    if (!proc) return false;
    return proc.proc.exitCode === null;
  }

  /**
   * 进程内存活集合：遍历 this.processes（exitCode===null），与 exists 同源，零 spawn。
   * sessionName 即 metadata.runtimeKey（spawnAndStart 入参）。供 SessionRegistry 批量探活。
   */
  async listAliveRuntimeKeys(): Promise<Set<string>> {
    const alive = new Set<string>();
    for (const [sessionName, state] of this.processes) {
      if (state.proc.exitCode === null) alive.add(sessionName);
    }
    return alive;
  }

  async close(sessionName: string): Promise<void> {
    const proc = this.processes.get(sessionName);
    if (proc) {
      proc.proc.kill();
      this.processes.delete(sessionName);
    }

    const relay = this.relays.get(sessionName);
    if (relay) {
      relay.destroy();
      this.relays.delete(sessionName);
    }
  }

  async startAgent(metadata: SessionMetadata): Promise<void> {
    await this.spawnAndStart(
      metadata.runtimeKey,
      metadata.projectPath,
      metadata.id,
      metadata.claudeSessionId,
      metadata.model,
      metadata.permissionMode,
      metadata.effort,
    );
  }

  async ensureRunning(
    sessionName: string,
    projectPath: string,
    sessionId: string,
    claudeSessionId?: string,
    model?: string,
    permissionMode?: string,
    effort?: EffortLevel,
  ): Promise<void> {
    const existing = this.processes.get(sessionName);
    if (existing) {
      if (existing.proc.exitCode === null) {
        if (!existing.claudeSessionId && claudeSessionId)
          existing.claudeSessionId = claudeSessionId;
        if (!existing.model && model) existing.model = model;
        if (!existing.permissionMode && permissionMode) existing.permissionMode = permissionMode;
        if (!existing.effort && effort) existing.effort = effort;
        const relay = this.relays.get(sessionName);
        if (relay && claudeSessionId) relay.setClaudeSessionId(projectPath, claudeSessionId);
        return;
      }

      this.processes.delete(sessionName);
      const relay = this.relays.get(sessionName);
      if (relay) {
        relay.destroy();
        this.relays.delete(sessionName);
      }
    }

    await this.spawnAndStart(
      sessionName,
      projectPath,
      sessionId,
      claudeSessionId,
      model,
      permissionMode,
      effort,
    );
  }

  async write(sessionName: string, data: string): Promise<void> {
    const proc = this.processes.get(sessionName);
    if (!proc || proc.proc.exitCode !== null) {
      throw new Error(`Claude2 process not running for session "${sessionName}"`);
    }
    const stdin = proc.proc.stdin;
    if (typeof stdin === "number" || !stdin) {
      throw new Error(`stdin not available for session "${sessionName}"`);
    }
    stdin.write(data);
  }

  // Buffer a line into the relay's live cache + broadcast, so a user-message
  // echo reaches current AND future subscribers (replayed on reconnect). No-op
  // if the session/relay isn't registered (e.g. race with close) — the echo is
  // best-effort; the CLI turn still proceeds via write().
  injectLiveLine(sessionName: string, line: string): void {
    const relay = this.relays.get(sessionName);
    if (relay && !relay.isDestroyed) {
      relay.injectLiveLine(line);
    }
  }

  // Broadcast a server-synthesized line to CURRENT subscribers only (no buffering
  // into liveLines/history). Used for transient notifications like
  // skill_catalog_changed that must not replay on reconnect — reconnects re-fetch
  // the catalog via REST instead. No-op if the session/relay isn't registered.
  injectServerLine(sessionName: string, line: string): void {
    const relay = this.relays.get(sessionName);
    if (relay && !relay.isDestroyed) {
      relay.injectLine(line);
    }
  }

  async stream(
    sessionName: string,
    onData: (data: string) => void,
    onError: (error: Error) => void,
  ): Promise<RuntimeStream> {
    const proc = this.processes.get(sessionName);
    if (!proc) throw new Error(`Session "${sessionName}" not registered`);

    let relay = this.relays.get(sessionName);
    if (!relay) {
      relay = new Claude2SessionRelay();
      this.relays.set(sessionName, relay);
      await relay.activate(proc.projectPath, proc.claudeSessionId).catch(() => {
        this.relays.delete(sessionName);
      });
    }

    // Scalar seed init: system.init is stdout-only (absent from JSONL/tail), so on
    // reconnect the client's scalar fold has no seed. Inject a synthetic init with
    // the CURRENT model/permissionMode before history.
    const seedInitLine = buildSeedInitLine(proc.model, proc.permissionMode);

    return relay.addSubscriber(onData, onError, seedInitLine);
  }

  async capture(): Promise<string> {
    return "";
  }

  async resize(): Promise<void> {
    // no-op
  }

  async startTerminal(): Promise<void> {
    throw new Error("Claude2Runtime does not support terminal sessions");
  }

  // ── private ──

  private async spawnAndStart(
    sessionName: string,
    projectPath: string,
    sessionId: string,
    claudeSessionId?: string,
    model?: string,
    permissionMode?: string,
    effort?: EffortLevel,
  ): Promise<void> {
    const { resolvedModel, resolvedEffort, providerCreds, view } = await this.resolveSpawnInputs(
      model,
      effort,
    );

    const proc = this.spawnClaudeDirect(
      sessionName,
      projectPath,
      claudeSessionId,
      resolvedModel,
      permissionMode,
      resolvedEffort,
      providerCreds,
      view,
    );

    const generation = this.nextGeneration++;
    this.processes.set(sessionName, {
      proc,
      generation,
      projectPath,
      sessionId,
      claudeSessionId,
      model,
      permissionMode,
      effort: resolvedEffort,
    });

    // Create relay immediately (before stdout starts) so messages aren't lost
    let relay = this.relays.get(sessionName);
    if (relay) {
      relay.destroy();
    }
    relay = new Claude2SessionRelay();
    this.relays.set(sessionName, relay);
    await relay.activate(projectPath, claudeSessionId);

    // Start reading stdout into relay
    const stdout = proc.stdout;
    if (stdout && typeof stdout !== "number") {
      this.readStdout(sessionName, generation, stdout);
    }

    // Pipe stderr to log file
    const stderr = proc.stderr;
    if (stderr && typeof stderr !== "number") {
      const stderrLogPath = join(this.runDir, "claude2-stderr", `${sessionName}.log`);
      void pipeStderrToFile(stderr, stderrLogPath);
    }

    // Monitor process exit
    void proc.exited.then((code) => {
      console.log(`[claude2] process exited with code ${code}: ${sessionName}`);
      if (this.isCurrentGeneration(sessionName, generation)) {
        this.processes.delete(sessionName);
      }
    });
  }

  private spawnClaudeDirect(
    sessionName: string,
    projectPath: string,
    claudeSessionId?: string,
    model?: string,
    permissionMode?: string,
    effort?: EffortLevel,
    provider?: { apiKey: string; baseUrl?: string },
    view?: ModelMappingView,
  ): BunSubprocess {
    const args = [
      "claude",
      "--output-format",
      "stream-json",
      "--input-format",
      "stream-json",
      "--verbose",
      "--permission-prompt-tool",
      "stdio",
      ...(permissionMode ? ["--permission-mode", permissionMode] : []),
      ...(model ? ["--model", model] : []),
      ...(claudeSessionId ? ["--resume", claudeSessionId] : []),
    ];

    const proc = Bun.spawn({
      cmd: args,
      stdin: "pipe",
      stdout: "pipe",
      stderr: "pipe",
      cwd: projectPath,
      env: buildSpawnEnv(effort, provider, process.env, view),
    });

    console.log(
      `[claude2] spawned pid=${proc.pid} session=${sessionName} effort=${effort ?? "inherit"} provider=${provider?.apiKey ? "injected" : "inherit"}`,
    );
    return proc;
  }

  // 读 settingsStore 算 spawn 输入：model（alias 透传，CLI 经 env 解析）、effort
  //（metadata 优先 ?? 全局默认）、激活预设凭证（apiKey 只在此处读出注入 env，不存 process
  // state、不进日志）、view（交给 buildSpawnEnv 注入 ANTHROPIC_DEFAULT_*_MODEL）。
  // settingsStore 缺失或读失败 → 回退 metadata 原值 + 继承父进程 env（现状不坏）。
  private async resolveSpawnInputs(
    model: string | undefined,
    effort: EffortLevel | undefined,
  ): Promise<{
    resolvedModel: string | undefined;
    resolvedEffort: EffortLevel | undefined;
    providerCreds: { apiKey: string; baseUrl?: string } | undefined;
    view: ModelMappingView | undefined;
  }> {
    const settings = this.settingsStore
      ? await this.settingsStore.read().catch((err) => {
          console.warn("[claude2] settings read failed, falling back to inherited env:", err);
          return undefined;
        })
      : undefined;
    const claude = settings?.runtimes.claude;
    const view = claude ? activePresetView(claude, claude.presets) : undefined;
    return {
      resolvedModel: model,
      resolvedEffort: effort ?? claude?.effort,
      providerCreds: resolveActivePresetCreds(claude, claude?.presets),
      view,
    };
  }

  private async readStdout(
    sessionName: string,
    generation: number,
    stdout: ReadableStream,
  ): Promise<void> {
    const decoder = new TextDecoder();
    let leftover = "";
    const reader = stdout.getReader();

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        if (!this.isCurrentGeneration(sessionName, generation)) return;

        const chunk = value as Uint8Array;
        const text = decoder.decode(chunk, { stream: true });
        const lines = (leftover + text).split("\n");
        leftover = lines.pop() ?? "";

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed) continue;
          if (!this.isCurrentGeneration(sessionName, generation)) return;

          await this.processStdoutLine(sessionName, generation, trimmed);
        }
      }

      const trimmed = leftover.trim();
      if (trimmed && this.isCurrentGeneration(sessionName, generation)) {
        await this.processStdoutLine(sessionName, generation, trimmed);
      }
    } catch (error) {
      if (this.isCurrentGeneration(sessionName, generation)) {
        const relay = this.relays.get(sessionName);
        if (relay && !relay.isDestroyed) {
          relay.reportError(error instanceof Error ? error : new Error(String(error)));
        }
      }
    } finally {
      reader.releaseLock();
    }
  }

  private isCurrentGeneration(sessionName: string, generation: number): boolean {
    return this.processes.get(sessionName)?.generation === generation;
  }

  // Parse each stdout line ONCE and feed the parsed object to all three consumers
  // (system-init capture, permissionMode capture, relay). Previously each line was
  // JSON.parsed three times — once per consumer. Callers have already verified the
  // generation is current before invoking.
  private async processStdoutLine(
    sessionName: string,
    generation: number,
    trimmed: string,
  ): Promise<void> {
    let parsed: Record<string, unknown> | null;
    try {
      parsed = JSON.parse(trimmed) as Record<string, unknown>;
    } catch {
      parsed = null;
    }
    this.captureSystemInitFromLine(sessionName, parsed);
    this.capturePermissionModeFromLine(sessionName, parsed);
    this.captureModelFromLine(sessionName, parsed);
    this.captureSkillReloadFromLine(sessionName, parsed);
    console.log(`[claude2-stdout] ${trimmed}`);
    const relay = this.relays.get(sessionName);
    if (relay && !relay.isDestroyed && this.isCurrentGeneration(sessionName, generation)) {
      await relay.handleStdoutLine(trimmed, parsed);
    }
  }

  private captureSystemInitFromLine(
    sessionName: string,
    parsed: Record<string, unknown> | null,
  ): void {
    if (
      parsed &&
      parsed.type === "system" &&
      parsed.subtype === "init" &&
      typeof parsed.session_id === "string"
    ) {
      const state = this.processes.get(sessionName);
      if (state) {
        if (!state.claudeSessionId) state.claudeSessionId = parsed.session_id;
        if (typeof parsed.model === "string") state.model = parsed.model;
        if (typeof parsed.permissionMode === "string") state.permissionMode = parsed.permissionMode;
      }
      this.onSystemInit?.(
        state?.sessionId ?? "",
        sessionName,
        parsed.session_id,
        typeof parsed.model === "string" ? parsed.model : "unknown",
      );
    }
  }

  // Fold current permissionMode from live stdout so the replay seed init carries
  // the CURRENT mode (system.init is spawn-time; permission-mode/system.status
  // messages update it mid-session). See docs/design/message-replay.md. The same
  // signal also persists the switch to metadata.permissionMode via
  // onPermissionModeChange, so an API restart (--resume) spawns the CLI with
  // the switched mode. Symmetric to captureModelFromLine.
  private capturePermissionModeFromLine(
    sessionName: string,
    parsed: Record<string, unknown> | null,
  ): void {
    if (!parsed) return;
    let next: string | undefined;
    if (parsed.type === "permission-mode" && typeof parsed.permissionMode === "string") {
      next = parsed.permissionMode;
    } else if (
      parsed.type === "system" &&
      parsed.subtype === "status" &&
      typeof parsed.permissionMode === "string"
    ) {
      next = parsed.permissionMode;
    }
    if (!next) return;
    const state = this.processes.get(sessionName);
    if (!state) return;
    state.permissionMode = next;
    this.onPermissionModeChange?.(state.sessionId, next);
  }

  // Fold current model from live stdout so the replay seed init carries the
  // CURRENT model. In-process model switches (control_request{set_model}) emit
  // a <local-command-stdout>Set model to … (id)</local-command-stdout> echo but
  // never re-send system.init; without this fold state.model stays at the
  // spawn-time value and reconnect seeds a stale model. Symmetric to
  // capturePermissionModeFromLine above. The same signal also persists the
  // switch to metadata.model via onModelChange, so API restart / session
  // reopen spawn the CLI with the switched model.
  private captureModelFromLine(sessionName: string, parsed: Record<string, unknown> | null): void {
    const next = extractModelFromStdoutLine(parsed);
    if (!next) return;
    const state = this.processes.get(sessionName);
    if (!state) return;
    state.model = next;
    this.onModelChange?.(state.sessionId, next);
  }

  // Fold a successful /reload-skills echo into a catalog-refresh notification.
  // Unlike model/permissionMode the catalog is not a process scalar (it's
  // filesystem-scanned), so this stores nothing on state — it only fires
  // onSkillReload so index.ts re-scans + broadcasts skill_catalog_changed.
  // Symmetric to captureModelFromLine above. historyLines (JSONL replay) never
  // reaches processStdoutLine, so this fires only on live stdout — reconnects
  // refresh via REST instead.
  private captureSkillReloadFromLine(
    sessionName: string,
    parsed: Record<string, unknown> | null,
  ): void {
    if (!extractSkillReloadFromStdoutLine(parsed)) return;
    const state = this.processes.get(sessionName);
    if (!state) return;
    this.onSkillReload?.(sessionName);
  }
}

async function pipeStderrToFile(stderr: ReadableStream, logPath: string): Promise<void> {
  try {
    await mkdir(dirname(logPath), { recursive: true });
  } catch {
    // dir might already exist
  }

  const decoder = new TextDecoder();
  const reader = stderr.getReader();
  let buffer = "";

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      const chunk = value as Uint8Array;
      buffer += decoder.decode(chunk, { stream: true });
      if (buffer.length > 8192) {
        await appendFile(logPath, buffer).catch(() => {});
        buffer = "";
      }
    }
    if (buffer) await appendFile(logPath, buffer).catch(() => {});
  } finally {
    reader.releaseLock();
  }
}
