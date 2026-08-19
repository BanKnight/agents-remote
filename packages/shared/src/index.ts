export type Project = {
  name: string;
  path: string;
  agentSessionCount: number;
  terminalSessionCount: number;
  gitBranch?: string;
};

export type ProjectFileEntryType = "directory" | "file";

export type ProjectFileEntry = {
  name: string;
  path: string;
  type: ProjectFileEntryType;
  hidden: boolean;
  size: number | null;
};

export type ProjectFileListResponse = {
  projectName: string;
  path: string;
  parentPath: string | null;
  entries: ProjectFileEntry[];
};

export type ProjectFilePreviewMediaType =
  | "image/png"
  | "image/jpeg"
  | "image/gif"
  | "image/webp"
  | "image/svg+xml";

export type ProjectUnsupportedFilePreviewReason = "unsupported_type" | "binary_text";

export type ProjectTextFilePreview = {
  type: "text";
  projectName: string;
  path: string;
  name: string;
  size: number;
  content: string;
};

export type ProjectImageFilePreview = {
  type: "image";
  projectName: string;
  path: string;
  name: string;
  size: number;
  mediaType: ProjectFilePreviewMediaType;
  dataUrl: string;
};

export type ProjectUnsupportedFilePreview = {
  type: "unsupported";
  projectName: string;
  path: string;
  name: string;
  size: number;
  reason: ProjectUnsupportedFilePreviewReason;
};

export type ProjectTooLargeFilePreview = {
  type: "too_large";
  projectName: string;
  path: string;
  name: string;
  size: number;
  limitBytes: number;
};

export type ProjectFilePreviewResponse =
  | ProjectTextFilePreview
  | ProjectImageFilePreview
  | ProjectUnsupportedFilePreview
  | ProjectTooLargeFilePreview;

// ── Pages 静态托管（per-project `.agents-remote/pages.json`）──────────
// 类 nginx 简化：用户配置若干「URL 路径 → 项目内目录」静态根映射，内容（由用户/Agent
// 自行产出，我们不管来源）直接通过 URL 访问。默认 public，per-根可选 token 鉴权。
// producer = 用户交互的 Agent（经我们提供的工具维护内容），consumer = 我们渲染/serve。
export type PagesRootAuth = "public" | "token";

export type PagesRoot = {
  /** URL 路径前缀，规范化的绝对路径，如 "/" "/docs"。空串非法。规范化见后端 normalizeUrlPath。 */
  urlPath: string;
  /** 项目内相对目录，如 "site" "site/dist"。空串非法（防整盘暴露）；含 ".." 段非法。 */
  fsDir: string;
  auth: PagesRootAuth;
};

/** 写盘结构。缺文件 → `{ schemaVersion: 1, roots: [] }`。 */
export type PagesConfig = {
  schemaVersion: 1;
  roots: PagesRoot[];
};

export type PagesConfigResponse = { config: PagesConfig };

/** PUT 整体覆盖写（简单语义）。 */
export type UpdatePagesConfigRequest = { roots: PagesRoot[] };
export type UpdatePagesConfigResponse = { config: PagesConfig };

export type GitDiffScope = "worktree" | "staged";

export type GitDiffFileStatus = "modified" | "added" | "deleted" | "renamed";

export type GitDiffFileSummary = {
  path: string;
  previousPath?: string;
  status: GitDiffFileStatus;
  scope: GitDiffScope;
  /** R1 numstat：新增/删除行数。null = binary 文件或 untracked（无 numstat）。 */
  addedLines: number | null;
  removedLines: number | null;
};

/** R2 当前分支 + 相对 upstream 的 ahead/behind 态势。 */
export type GitBranchStatus = {
  name: string;
  upstream?: string;
  ahead?: number;
  behind?: number;
};

export type GitDiffListResponse =
  | {
      repository: true;
      projectName: string;
      files: GitDiffFileSummary[];
      /** R2 当前分支态势（detached/无 upstream 时仍返回 { name } 降级）。 */
      branch?: GitBranchStatus;
    }
  | {
      repository: false;
      projectName: string;
      reason: "not_git_repository";
    };

export type GitFileDiffResponse = {
  repository: true;
  projectName: string;
  path: string;
  previousPath?: string;
  scope: GitDiffScope;
  status: GitDiffFileStatus;
  diff: string;
};

/** R3 分支列表项。name = refname:short（main / origin/main）。 */
export type GitBranch = {
  name: string;
  type: "local" | "remote";
  isCurrent?: boolean;
  upstream?: string;
  ahead?: number;
  behind?: number;
  lastCommitShort?: string;
};

/** R3 分支列表响应。current = 当前分支名（detached = "HEAD"）。 */
export type GitBranchListResponse = {
  current: string;
  branches: GitBranch[];
};

/** R4/R6 共享 commit 项（git log %h/%an/%ar/%s）。 */
export type GitCommitLogItem = {
  hash: string;
  message: string;
  author: string;
  relativeTime: string;
};

/** R6 commit 历史（branch = "" 表示 HEAD/默认）。 */
export type GitCommitLogResponse = {
  branch: string;
  commits: GitCommitLogItem[];
};

/** R4 当前分支相对 upstream 的领先/落后 commit 差异。 */
export type GitAheadBehindResponse = {
  branch: string;
  upstream?: string;
  ahead: number;
  behind: number;
  aheadCommits: GitCommitLogItem[];
  behindCommits: GitCommitLogItem[];
};

/** R5 分支间 diff 文件项（`base..compare`，无 scope 概念——两 ref 间差异不属 worktree/staged）。 */
export type GitCompareFileSummary = {
  path: string;
  previousPath?: string;
  status: GitDiffFileStatus;
  /** numstat 行数；null = binary（无 numstat）。 */
  addedLines: number | null;
  removedLines: number | null;
};

/** R5 分支间 diff 文件列表（`git diff base..compare`）。 */
export type GitCompareDiffResponse =
  | {
      repository: true;
      projectName: string;
      base: string;
      compare: string;
      files: GitCompareFileSummary[];
    }
  | {
      repository: false;
      projectName: string;
      reason: "not_git_repository";
    };

/** R5 分支间单文件 diff（`git diff base..compare -- path`）。 */
export type GitCompareFileDiffResponse = {
  repository: true;
  projectName: string;
  base: string;
  compare: string;
  path: string;
  previousPath?: string;
  status: GitDiffFileStatus;
  diff: string;
};

export type ProjectListResponse = {
  projects: Project[];
};

export type CreateProjectRequest = {
  path?: string;
};

export type CreateProjectResponse = {
  project: Project;
};

export type ProjectDetailResponse = {
  project: Project;
};

export type DeleteProjectResponse = {
  deleted: true;
  projectName: string;
};

/**
 * 全局总览候选：聚合所有 project 的活跃实例（agent/terminal），供 global overview 单请求铺开。
 * 替代前端 1+2N 瀑布（listProjects → 每项目 listAgent/listTerminal）。type/provider/status 统一
 * session 语义；subtitle = terminal lastCommand / agent lastAssistantMessage（经第二阶段
 * /api/overview/subtitles 慢填充，与项目总览同款 JSONL 读取机制）。
 */
export type OverviewCandidate = {
  type: "agent" | "terminal";
  projectName: string;
  sessionId: string;
  displayName: string;
  status: AgentSessionStatus | TerminalSessionStatus;
  provider?: AgentProvider;
  updatedAt?: string;
  createdAt?: string;
  /** 卡片第二行（terminal=lastCommand / agent=lastAssistantMessage）；缺失则卡片不显第二行。 */
  subtitle?: string;
};

/** GET /api/overview 响应：全 project 名（含无实例 project，grouped 视图空状态用）+ 全候选。 */
export type OverviewResponse = {
  projectNames: string[];
  candidates: OverviewCandidate[];
};

/**
 * GET /api/overview/subtitles 响应：sessionId → 卡片第二行（terminal lastCommand / agent lastAssistantMessage）。
 * overview 第二阶段异步补全通道——核心列表（OverviewResponse）毫秒级返回后，前端再拉此 map 把
 * subtitle 补进对应卡片。缺失的 sessionId 表示无 subtitle（capture 失败/无 JSONL 消息），卡片不显第二行。
 */
export type OverviewSubtitlesResponse = {
  subtitles: Record<string, string>;
};

export type UploadFileResponse = {
  entry: ProjectFileEntry;
};

export type CreateFolderRequest = {
  name: string;
};

export type CreateFolderResponse = {
  entry: ProjectFileEntry;
};

export type RenameFileRequest = {
  path: string;
  name: string;
};

export type RenameFileResponse = {
  entry: ProjectFileEntry;
};

export type DeleteFileRequest = {
  path: string;
};

export type DeleteFileResponse = {
  deleted: true;
  projectName: string;
  path: string;
};

export type SaveFileRequest = {
  path: string;
  content: string;
};

export type SaveFileResponse = {
  entry: ProjectFileEntry;
};

export type AgentProvider = "claude" | "codex";

// ── Settings: claude presets + runtime defaults ──────────────────────
//
// ClaudePreset = 一套端点凭证（apiKey + baseUrl）+ 该端点的模型映射（modelMapping），
// 凭证与映射绑定一体；claude runtime 通过 activePresetId 单选激活其中一个（空=不启用，
// 回退父进程 env）。ClaudeRuntimeConfig = activePresetId + enable1mContext + effort，
// 是所有新 claude session spawn 的全局默认初始值（effort/1m 与端点无关，留运行时级）。
// 预设结构 per-runtime-type：claude 是第一个实例，未来 codex 预设同理念不同格式。

export type EffortLevel = "low" | "medium" | "high" | "xhigh" | "max";
export const EFFORT_LEVELS: readonly EffortLevel[] = ["low", "medium", "high", "xhigh", "max"];

export type ClaudeModelTier = "default" | "opus" | "sonnet" | "haiku";
export const CLAUDE_MODEL_TIERS: readonly ClaudeModelTier[] = [
  "default",
  "opus",
  "sonnet",
  "haiku",
];

// Provider 协议：决定「发现模型」(/v1/models) 的请求构造（端点 + header）。
// anthropic → x-api-key + anthropic-version；openai-compatible → Authorization: Bearer。
// 不影响 spawn（CLI 只认 ANTHROPIC_* env）。仅供 settings-models 构造请求用；
// ClaudePreset 不存 protocol（claude 预设恒 anthropic），listProviderModels 兜底 "anthropic"。
export type ProviderProtocol = "anthropic" | "openai-compatible";
export const PROVIDER_PROTOCOLS: readonly ProviderProtocol[] = ["anthropic", "openai-compatible"];

export type ClaudeModelMapping = {
  default: string;
  opus: string;
  sonnet: string;
  haiku: string;
};

export type ClaudePreset = {
  id: string;
  label: string;
  apiKey: string;
  baseUrl?: string;
  // 该端点的 tier → 具体 model ID 映射（spawn 时传给 CLI 的 --model 值）。与端点绑定，
  // 随预设切换整体切换；从 v1 的全局 runtime.modelMapping 下沉到预设，与凭证一体。
  modelMapping: ClaudeModelMapping;
};

export type ClaudePresetMasked = Omit<ClaudePreset, "apiKey"> & {
  apiKeyMasked: string;
  hasApiKey: boolean;
};

export type ClaudeRuntimeConfig = {
  // 单选激活的预设 id；空 = 不启用，spawn 回退父进程 env（ANTHROPIC_*）。
  activePresetId: string;
  enable1mContext: boolean;
  effort: EffortLevel;
};

// ── pi runtime（chat 模式全局会话运行时）────────────────────────────
// pi 走 SDK 库嵌入（非 spawn）。v5 起为多 preset 体系（仿 claude presets）：
// presets[] + activePresetId。启用语义 = presets 非空 且 activePresetId 命中一个
// provider/model 齐备的 preset（apiKey 可选，空 = 走 SDK 凭证链 auth.json/env）；
// 空 = 未启用（chat 会话 stream 出 SESSION_NOT_CONFIGURED）。provider 是 pi 内置
// provider id（anthropic/openai/deepseek/groq/openrouter...）或自定义 id；自定义 id
// （或内置 id + baseUrl）= OpenAI/Anthropic 兼容端点（Ollama/vLLM/LM Studio/网关），
// 运行时经 modelRuntime.registerProvider 程序化注册（不写 models.json）。

/** 自定义兼容端点的线协议枚举（pi SDK Api 的子集）。UI 默认 openai-completions。 */
export type PiProviderApi =
  | "openai-completions"
  | "openai-responses"
  | "anthropic-messages"
  | "google-generative-ai";
export const PI_PROVIDER_APIS: readonly PiProviderApi[] = [
  "openai-completions",
  "openai-responses",
  "anthropic-messages",
  "google-generative-ai",
];

export type PiPreset = {
  id: string;
  label: string;
  /** pi 内置 provider id 或自定义 id（自定义须配 baseUrl）。 */
  provider: string;
  /** 可选：空 = 走 SDK 凭证链（隔离 auth.json → env）。OAuth 订阅 provider 与 keyless 本地端点合法留空。 */
  apiKey?: string;
  /** 手填 model id（不做发现/测试连接）。 */
  model: string;
  /** 非空 = 自定义兼容端点，运行时 registerProvider 注册进 catalog。 */
  baseUrl?: string;
  /** 线协议；仅 baseUrl 非空时有效。缺省运行时按 openai-completions 处理。 */
  api?: PiProviderApi;
};

export type PiPresetMasked = Omit<PiPreset, "apiKey"> & {
  apiKeyMasked: string;
  hasApiKey: boolean;
};

/** v5：presets + activePresetId。未启用 = presets 空 或 activePresetId 空/未命中。 */
export type PiRuntimeConfig = {
  presets: PiPreset[];
  activePresetId: string;
};

// ── Skills marketplace ──────────────────────────────────────
// Skill 包管理：wrap `npx skills` CLI（vercel-labs/skills）做执行，skills.sh /api/search 做发现。
// 先 Claude，架构支持多 runtime（Codex 后续）——所有 wrap 命令透传 --agent，目录映射交给 CLI。
export type SkillAgent = "claude-code" | "codex";
export const SKILL_AGENTS: readonly SkillAgent[] = ["claude-code", "codex"];

// 用户自定义 skill 源。type 判别来源形态：github=owner/name、git=仓库 URL、local=本地目录。
// 对应 skills CLI 的 source 语法（owner/repo[@skill] | git URL | 本地路径）。旧数据无 type →
// settings-store normalizeSkillSources 补 "github"（向后兼容）。
export type SkillSourceType = "github" | "local" | "git";
export type SkillSource = {
  id: string;
  type: SkillSourceType;
  /** github / git：owner/name 或 git URL。local 源无此字段。 */
  repo?: string;
  /** local：绝对路径。github/git 源无此字段。 */
  path?: string;
  branch?: string;
  label?: string;
};

// skills.sh /api/search 结果项（实测：只有 name/installs/source，无 description、无详情端点）。
export type SkillMarketEntry = {
  id: string; // "owner/repo/skillId"
  skillId: string;
  name: string;
  installs: number;
  source: string; // "owner/repo"
};
export type SkillMarketSearchResponse = {
  query: string;
  skills: SkillMarketEntry[];
  count: number;
};

// `npx skills list --json` 结果项（已实测 schema：name/path/scope/agents）。
export type InstalledSkill = {
  name: string;
  path: string;
  scope: "project" | "global";
  agents: string[];
  /**
   * 是否纳入版本管理（项目 scope：有 <project>/skills-lock.json 记录=有源可更新）。
   * 仅项目 scope 填 true/false；全局 scope 不填（undefined，manageable 走独立的
   * checkSkillUpdates → SkillUpdateStatus）。手写 skill（项目锁无记录）→ false。
   */
  manageable?: boolean;
};
export type InstalledSkillsResponse = { skills: InstalledSkill[] };

// 已装 skill 的 SKILL.md 预览（读本地 path/SKILL.md，零网络）。
export type SkillPreviewResponse = {
  name: string;
  description?: string;
  content: string;
  source: string;
};

export type InstallSkillRequest = { source: string; skillId: string; agent: SkillAgent };
// POST /api/skills/install 立即返 202（异步任务，git clone 在后台跑）；完成态走 SSE SkillTaskFrame。
export type InstallSkillResponse = { taskId: string; status: "running" };
export type UninstallSkillRequest = { name: string; agent: SkillAgent };
export type UninstallSkillResponse = { ok: true };
export type AddSkillSourceRequest = {
  type?: SkillSourceType; // 缺省 "github"
  repo?: string; // github / git
  path?: string; // local
  branch?: string;
  label?: string;
};

// 源管理响应（/api/skills/sources CRUD）。源在 settings 与 skill 路由两处共用。
export type SkillSourcesResponse = { sources: SkillSource[] };

// ── skill 更新检测（第三方技能版本比对）──────────────────────────
// 机制：读 ~/.agents/.skill-lock.json 的 skillFolderHash（40 位 git tree SHA）+ sourceUrl →
// GitHub Trees API 取远端最新 tree SHA 比对。手写 skill（无锁记录）/ local 源 → manageable=false。
// 用户手动触发（不自动批量，避 GitHub API 限速），详见 docs/research/plugin-extension-system.md。
export type SkillUpdateStatus = {
  name: string;
  /** 是否有新版本（仅 manageable=true 时有意义）。 */
  hasUpdate: boolean;
  /** 是否纳入版本管理（有锁记录 + 可比对的 git 源）。无锁记录的手写 skill → false。 */
  manageable: boolean;
  sourceType?: string;
  sourceUrl?: string;
};
export type CheckSkillUpdatesResponse = { updates: SkillUpdateStatus[] };
export type UpdateSkillRequest = { name: string; agent: SkillAgent };
// POST /api/skills/update 立即返 202（异步任务，git clone 在后台跑）；完成态走 SSE SkillTaskFrame。
export type UpdateSkillResponse = { taskId: string; status: "running" };

// skill install/update 异步任务的 SSE 进度帧（GET /api/skills/task/:id/events，EventSource 订阅）。
// 两态 UI 只消费 status 转换（running→done/failed），不展示阶段进度；done/failed 后服务端关闭流。
// taskId 失效（API 重启丢内存任务）→ failed + error.code="SKILL_TASK_NOT_FOUND"，前端干净 reject 不重连。
export type SkillTaskFrame = {
  taskId: string;
  status: "running" | "done" | "failed";
  // 信息性字段：前端 waitForSkillTask 只看 status/error，kind 由调用方上下文已知。
  // 未知 taskId（失效/API 重启丢）的 failed 帧省略 kind。
  kind?: "install" | "update";
  skill?: InstalledSkill; // done (install)：回读的已装条目
  name?: string; // done (update)：skill 名
  error?: { code: string; message: string }; // failed
};

// ── MCP hub ───────────────────────────────────────────────
// MCP hub = 给 agent 装 tool/能力 的统一层（与 skill-market 装「知识/行为」互补）。
// 基座阶段:无状态 Streamable HTTP server + spawn 时 --mcp-config 注入,不暴露业务工具(空壳)。
// wiki/browser 是后续能力域。定位见 docs/research/inbox/mcp-hub-positioning.md。

// 能力域标识。首期 wiki 能力域;后续加 browser 等再扩 union。
export type McpCapability = "wiki";

// per-project MCP 配置(PROJECTS_ROOT/{project}/.agents-remote/mcp.json)。
// 只管能力域开关,不描述 server(hub 是单数,server 描述由基座代码 own)。
// 不存在该文件 → 默认(基座阶段注册集为空,任意默认都不影响;wiki 阶段定全关 opt-in)。
export type McpProjectConfig = {
  // capability → enabled。缺失的 capability 视为未开。
  capabilities?: Partial<Record<McpCapability, boolean>>;
};

// ── MCP 管理（外部 server，wrap claude mcp）──────────────────────────
// 外部 MCP server = 用户配的第三方工具（stdio/sse/http），与内部 ar-hub（上面的能力开关）并存：
// ar-hub 走 spawn 时 --mcp-config 注入；外部 server 由 claude mcp 原生读写 ~/.claude.json
// （user scope）/ 项目 .mcp.json（project scope），agent 实例由 CLI 原生合并生效。
// agents-remote 只管「配置」（增删改 + 直读结构化文件），不解析 claude mcp list 文本。
// 详见 docs/research/plugin-extension-system.md。
export type McpServerType = "stdio" | "sse" | "http";
export type McpScope = "user" | "project";

/** 单个外部 MCP server（对应 ~/.claude.json / .mcp.json 的 mcpServers 条目）。 */
export type McpServerEntry = {
  name: string;
  type: McpServerType;
  /** stdio：可执行命令。sse/http 无。 */
  command?: string;
  /** stdio：命令参数。 */
  args?: string[];
  /** stdio：环境变量。 */
  env?: Record<string, string>;
  /** sse/http：server URL。 */
  url?: string;
  /** http：自定义请求头（读保真；首版 add 表单不设，直接 CLI 配的 server 仍能完整列出）。 */
  headers?: Record<string, string>;
};

export type ListMcpServersResponse = { servers: McpServerEntry[] };
export type AddMcpServerRequest = {
  name: string;
  type: McpServerType;
  command?: string;
  args?: string[];
  env?: Record<string, string>;
  url?: string;
};
export type AddMcpServerResponse = { ok: true; server: McpServerEntry };
export type RemoveMcpServerResponse = { ok: true; name: string };
/** MCP server 改配置：name 不变，换 type/command/args/env/url。`claude mcp` 无 update 子命令，
 * 实现是 remove + add 同名（后端 mcp-management.ts）。请求体复用 AddMcpServerRequest 字段。 */
export type UpdateMcpServerRequest = AddMcpServerRequest;
export type UpdateMcpServerResponse = { ok: true; server: McpServerEntry };

// ── Wiki 能力域（per-project `wiki/` markdown 目录）──────────────────
// wiki = agent 用 wiki_* MCP 工具逐页写的、结构化可浏览的 per-project 知识库（产物）。
// producer = agent 经 MCP hub 的 wiki_* 工具写；consumer = web 渲染列表 + 页面正文。
// 起步态：flat wiki/*.md + YAML frontmatter（title/tags/created/updated）。定位见
// docs/research/inbox/llm-wiki-okf.md。
// 后续打磨：edit/append/search/lint 工具、raw/SCHEMA/按类型子目录、[[wiki-link]] 图谱。

/** 单页 YAML frontmatter（后端解析/序列化，前端只消费结构化字段）。 */
export type WikiPageFrontmatter = {
  title: string;
  tags: string[];
  created: string; // YYYY-MM-DD
  updated: string; // YYYY-MM-DD
};

/** 列表项摘要（listPages / index 端点）。 */
export type WikiPageSummary = {
  slug: string;
  title: string;
  tags: string[];
  updated: string;
};

/** 单页完整内容（readPage / 单页端点）。body 是去 frontmatter 后的 markdown 正文。 */
export type WikiPage = {
  slug: string;
  frontmatter: WikiPageFrontmatter;
  body: string;
};

export type WikiIndexResponse = { pages: WikiPageSummary[] };
export type WikiPageResponse = { page: WikiPage };
export type AddSkillSourceResponse = { source: SkillSource };
export type RemoveSkillSourceResponse = { deleted: true; id: string };

export type SettingsState = {
  runtimes: {
    // per-runtime-type：claude 是第一个实例；未来 codex 预设同理念不同格式（本次不实现）。
    claude: {
      presets: ClaudePreset[];
      activePresetId: string;
      enable1mContext: boolean;
      effort: EffortLevel;
    };
    // v5：pi 恒存在（非 optional）。空 presets + activePresetId:"" = 未启用。
    pi: PiRuntimeConfig;
  };
  // 自定义 skill 源列表（optional；settings-store normalizeSettings 补默认 { sources: [] }）。
  skills?: {
    sources: SkillSource[];
  };
};

// ── 业务状态柱（state.yaml，state-store.ts）─────────────────────────
// AppModules = 业务状态模块注册表，是「往 state 新增顶层域」的唯一扩展点：
// 新模块在此声明 + state-store.ts 加 normalize 分支，两处都是可见、类型检查的改动，
// 而非在路由里悄悄塞字段。StateStore 只暴露 readModule/updateModule，物理上无法往顶层塞字段。
export type AppModules = {
  overview: { pinnedSessions: string[] };
  // 未来新增模块在此声明（sessions/files/workbench...），需 review，是可见的类型改动
};

// schemaVersion 由 state-store 写入/校验；顶层就是模块注册表本身。
export type AppState = { schemaVersion: 1 } & AppModules;

export type GetSettingsResponse = {
  settings: {
    runtimes: {
      claude: {
        presets: ClaudePresetMasked[];
        activePresetId: string;
        enable1mContext: boolean;
        effort: EffortLevel;
      };
      // v5 起 pi 键恒存在；presets 空 = 未启用。
      pi: { presets: PiPresetMasked[]; activePresetId: string };
    };
    // 源是公开 GitHub repo，不 mask。
    skills: {
      sources: SkillSource[];
    };
  };
};

export type CreateClaudePresetRequest = {
  label: string;
  apiKey: string;
  baseUrl?: string;
  modelMapping: ClaudeModelMapping;
};

export type UpdateClaudePresetRequest = {
  label?: string;
  apiKey?: string;
  baseUrl?: string;
  modelMapping?: Partial<ClaudeModelMapping>;
};

export type ClaudePresetResponse = {
  preset: ClaudePresetMasked;
};

export type DeleteClaudePresetResponse = {
  deleted: true;
  id: string;
};

export type UpdateClaudeRuntimeRequest = {
  activePresetId?: string;
  enable1mContext?: boolean;
  effort?: EffortLevel;
};

export type UpdateClaudeRuntimeResponse = {
  runtime: ClaudeRuntimeConfig;
};

// ── pi preset / runtime 请求响应（v5）──────────────────────────────
// apiKey 可选：空 = 走 SDK 凭证链（auth.json/env），OAuth/keyless 端点合法。
export type CreatePiPresetRequest = {
  label: string;
  provider: string;
  apiKey?: string;
  model: string;
  baseUrl?: string;
  api?: PiProviderApi;
};

// apiKey 空/缺省 = 不改（编辑态留空保留原 key，与 claude preset PUT 一致）。
// baseUrl 显式空串 = 删除（联动删 api）。api 须配有效 baseUrl。
export type UpdatePiPresetRequest = {
  label?: string;
  provider?: string;
  model?: string;
  apiKey?: string;
  baseUrl?: string;
  api?: PiProviderApi;
};

export type PiPresetResponse = {
  preset: PiPresetMasked;
};

export type DeletePiPresetResponse = {
  deleted: true;
  id: string;
};

/** PUT /api/settings/runtimes/pi 语义 = activate：只更新 activePresetId（空串 = 停用 pi）。 */
export type UpdatePiRuntimeRequest = {
  activePresetId?: string;
};

export type UpdatePiRuntimeResponse = {
  runtime: { activePresetId: string };
};

// GET /api/settings/runtimes/pi/providers 响应：pi SDK 内置 provider 运行时枚举（id + 显示名 + 认证形态）。
// 无网络、无凭证、只读 SDK 目录；SDK 升级时列表自动跟随，前端不做硬编码。
// authType 由 SDK Provider.auth 静态字段推导（oauth 存在 / apiKey.login 存在），unknown = 自定义 id 不在枚举内。
export type PiProviderAuthType = "api_key" | "oauth" | "both" | "unknown";

export type PiProviderInfo = {
  id: string;
  name: string;
  authType: PiProviderAuthType;
};

export type ListPiProvidersResponse = {
  providers: PiProviderInfo[];
};

// ── 全局总览置顶会话（pin）──────────────────────────────────
// 跨设备共享的置顶 sessionId 列表（迁自前端 localStorage，存 state.yaml overview 模块，
// 经 StateStore.updateModule("overview") 读写）。
// GET/POST/DELETE /api/state/overview/pinned-sessions 统一返回最新列表。
export type PinnedSessionsResponse = {
  sessions: string[];
};

// POST /api/settings/runtimes/claude/presets/:id/models 响应：用该预设凭证请求 /v1/models。
// ok=false 时 models 为空、error 给可读原因（凭证无效/端点不存在/网络错误）。
// 上游失败不映射成 API 错误码——这是「业务成功调用发现接口，上游凭证有问题」，
// 前端展示测试结果而非报错 toast。仅 preset 不存在走 PRESET_NOT_FOUND 404。
// POST /api/settings/runtimes/claude/presets/test-models 复用此响应（见 TestClaudePresetRequest）。
export type ListProviderModelsResponse = {
  ok: boolean;
  models: string[];
  error?: string;
};

// POST /api/settings/runtimes/claude/presets/test-models 请求：用表单内联凭证测试连接（不落盘）。
// 用于 PresetDialog 新建态（无 id）+ 编辑态（有 id，apiKey 留空回退已保存原 key）。
// 后端解析：apiKey / baseUrl 取内联值，缺失则回退 id 命中的已保存 preset 对应字段
// （原 apiKey 永不出 api 进程，前端只持 masked → 编辑态留空 = "不改"语义）。
// preset 恒 anthropic，无需 protocol 字段。复用 ListProviderModelsResponse 响应。
export type TestClaudePresetRequest = {
  /** 编辑态传已保存 preset id，用于回退内联缺失字段（apiKey/baseUrl）。新建态省略。 */
  id?: string;
  /** 仅展示用，测试连接不依赖。 */
  label?: string;
  /** 内联 apiKey；留空且 id 命中已保存 preset 时回退其原 key。两者皆空 → 后端返回 ok:false。 */
  apiKey?: string;
  baseUrl?: string;
};

export type AgentSessionStatus = "running" | "idle" | "closed" | "error";

export type TerminalSessionStatus = "running" | "closed" | "error";

export type SessionType = "agent" | "terminal";

export type TransportStatus = "connected" | "disconnected" | "ended" | "error";

export type AgentSession = {
  id: string;
  projectName: string;
  provider: AgentProvider;
  displayName: string;
  status: AgentSessionStatus;
  createdAt: string;
  model?: string;
  modelAlias?: string;
  permissionMode?: string;
  effort?: EffortLevel;
  claudeSessionId?: string;
  lastAssistantMessage?: string;
  updatedAt?: string;
};

export type TerminalSession = {
  id: string;
  projectName: string;
  displayName: string;
  status: TerminalSessionStatus;
  updatedAt?: string;
  /** 最近 pane 活动行（tmux capture 最后一行非空，含 prompt+命令，忠实显示，不去 ANSI 后的纯文本）。 */
  lastCommand?: string;
};

export type ListAgentSessionsResponse = {
  sessions: AgentSession[];
};

export type CreateAgentSessionRequest = {
  provider?: AgentProvider;
  displayName?: string;
  model?: string;
  permissionMode?: string;
  /** Resume an existing Claude CLI session */
  claudeSessionId?: string;
};

export type CreateAgentSessionResponse = {
  session: AgentSession;
};

export type AgentSessionDetailResponse = {
  session: AgentSession;
  // claude：model alias 列表（opus/sonnet/haiku + opusplan），switchModel 发 alias，
  // 具体 ID 由 CLI 经 ANTHROPIC_DEFAULT_*_MODEL env 解析（对齐 CLI 原生 alias 机制）。
  availableModels?: string[];
  // alias → resolved 具体 ID（含 [1m]，由 modelMapping + enable1mContext 派生），
  // 仅供菜单展示「alias + 对应具体 ID」配对；opusplan 不进映射（CLI 自选，不展示）。
  availableModelResolved?: Record<string, string>;
  availablePermissionModes?: string[];
};

export type CloseAgentSessionResponse = {
  session: AgentSession;
};

// -- Agent History --

/**
 * 历史时间范围过滤器。默认 `week`（7 天）——大项目（数百 session）默认只列近期，避免全量
 * 扫描慢；`biweekly`=15 天；`all`=全量。服务端按 JSONL 文件 mtime 过滤。
 */
export type AgentHistoryRange = "week" | "biweekly" | "all";

export type AgentHistoryEntry = {
  /** Claude CLI session UUID (JSONL filename without extension) */
  claudeSessionId: string;
  /** AI-generated title (last ai-title entry), or null */
  title: string | null;
  /** First user message text, truncated */
  firstMessage: string | null;
  /** ISO timestamp of the first user message */
  startedAt: string | null;
  /** ISO timestamp from file mtime */
  lastActivityAt: string | null;
  /** JSONL session file size in bytes */
  fileSize: number;
  /** Whether an active agent instance is linked to this Claude session */
  hasActiveSession: boolean;
  /** Agent session ID when hasActiveSession is true */
  activeSessionId?: string;
};

export type ListAgentHistoryResponse = {
  entries: AgentHistoryEntry[];
  /** 回显当前 range（防御 query param 被中间层裁剪） */
  range: AgentHistoryRange;
};

export type ListTerminalSessionsResponse = {
  sessions: TerminalSession[];
};

export type CreateTerminalSessionRequest = {
  displayName?: string;
};

export type CreateTerminalSessionResponse = {
  session: TerminalSession;
};

export type TerminalSessionDetailResponse = {
  session: TerminalSession;
};

export type CloseTerminalSessionResponse = {
  session: TerminalSession;
};

// -- Session Rename (agent + terminal 共用请求体；displayName 持久化到 SessionMetadata) --

export type RenameSessionRequest = {
  displayName: string;
};

export type RenameAgentSessionResponse = {
  session: AgentSession;
};

export type RenameTerminalSessionResponse = {
  session: TerminalSession;
};

// -- Chat Sessions（全局会话，不绑项目，pi SDK 嵌入运行时）--
// 设计见 docs/design/workbench-views.md §3.1。chat 全局、无 projectName，独立 ChatSessionRegistry
//（不进现有 SessionRegistry，其按 projectName 分片）。Phase 1 仅元数据 CRUD，Phase 3 接 pi 运行时。

export type ChatSessionStatus = "idle" | "running" | "closed" | "error";

export type ChatSession = {
  id: string;
  displayName: string;
  status: ChatSessionStatus;
  createdAt: string;
  updatedAt: string;
  /** pi SessionManager 的 session id（Phase 3 接入后回填，用于定位 pi JSONL 历史）。 */
  piSessionId?: string;
};

export type ListChatSessionsResponse = {
  sessions: ChatSession[];
};

export type CreateChatSessionRequest = {
  displayName?: string;
};

export type CreateChatSessionResponse = {
  session: ChatSession;
};

export type ChatSessionDetailResponse = {
  session: ChatSession;
};

export type RenameChatSessionRequest = {
  displayName: string;
};

export type RenameChatSessionResponse = {
  session: ChatSession;
};

export type CloseChatSessionResponse = {
  session: ChatSession;
};

// -- Pi Stream Messages（/api/chat-sessions/:id/stream，pi SDK 嵌入运行时）--
// 设计见 docs/design/workbench-views.md §3.1 与 docs/research/pi-access-options.md §9.1。
// 传输层与 claude-stream 字节级一致（复用 session_init/history_*/live_*/ended 批处理 markers）；
// 区别在 payload：pi 发 pi 原生事件（一行一 JSON，message_update 已剥离 partial 快照）。
// pi 原生事件的具体形状只在 api 端存在（pi SDK 类型，见 api/src/pi-events.ts），shared 只
// 声明外层帧协议；web 端消费 pi_event 时按需声明局部类型解码（Phase 4 detail adapter）。

export type PiNativeEventShape = {
  type: string;
} & Record<string, unknown>;

export type PiEventFrame = {
  type: "pi_event";
  event: PiNativeEventShape;
};

export type PiUserEchoFrame = {
  type: "pi_user_echo";
  /** 用户发送且被 pi 接受的 prompt 原文。pi 事件流不回显用户输入，reconnect 需看到。 */
  text: string;
  /** 客户端生成、原样带回的本地 uuid，用于把 echo 对齐到已发送消息。 */
  uuid: string;
};

export type PiChatTitleFrame = {
  type: "chat_title";
  /** LLM 生成的会话标题（首条 user 消息后一次性生成）。走 relay live buffer，reconnect 可见；持久化在 registry 元数据 displayName。 */
  title: string;
};

export type PiStreamServerMessage =
  | PiEventFrame
  | PiUserEchoFrame
  | PiChatTitleFrame
  | {
      type: "error";
      code: ApiErrorCode;
      message: string;
    }
  | {
      type: "session_init";
      resume: boolean;
    }
  | {
      type: "history_start";
      count: number;
    }
  | {
      type: "history_end";
    }
  | {
      type: "live_start";
      count: number;
    }
  | {
      type: "live_end";
    }
  | {
      type: "ended";
    }
  | {
      // 心跳 ack：服务端收到 {type:"ping"} 回此帧（与 claude-stream 同语义）。
      type: "pong";
    };

export type PiStreamClientMessage =
  | {
      type: "user";
      text: string;
      /** 客户端生成的本地 uuid（crypto.randomUUID()）：server 原样注入 pi_user_echo，用于把 echo 对齐到已发送消息。 */
      uuid?: string;
      /** 图片附件（base64 data 不含 data: 前缀），透传 pi prompt images。 */
      images?: { data: string; mimeType: string }[];
    }
  | {
      type: "interrupt";
    }
  | {
      type: "ping";
    };

// -- Claude Stream Messages (Claude CLI --output-format stream-json protocol) --

export type ClaudeSystemInit = {
  type: "system";
  subtype: "init";
  session_id: string;
  model: string;
  permissionMode: string;
  cwd: string;
  tools: string[];
  slash_commands: string[];
  mcp_servers?: Record<string, unknown>[];
  agents?: string[];
  skills?: string[];
  plugins?: string[];
  apiKeySource?: string;
  claude_code_version?: string;
  output_style?: string;
};

// Scalar seed init — server-synthesized on replay so the client's scalar fold has
// model/permissionMode even though real system.init is stdout-only (absent from
// JSONL/tail). Distinct subtype "seed_init" (not "init") so server-side init capture
// and client render both treat it as a non-init system message: it folds scalars via
// a dedicated seed_init branch and is never rendered (model / permissionMode surface
// in the session header).
export type ClaudeSeedInit = {
  type: "system";
  subtype: "seed_init";
  model?: string;
  permissionMode?: string;
};

// Server-synthesized notification that the skill/slash catalog changed (e.g. after
// /reload-skills succeeded). Broadcast-only — never buffered into liveLines/history
// (reconnects re-fetch via REST), so it reaches only currently-connected clients.
// No payload by design: the client invalidates its REST catalog query on receipt
// rather than trusting an embedded snapshot. See docs/design/message-replay.md
// 「命令后置处理框架」.
export type ClaudeSkillCatalogChanged = {
  type: "system";
  subtype: "skill_catalog_changed";
};

export type SlashCommandInfo = {
  name: string;
  description: string;
  kind: "command" | "skill";
};

export type SlashCommandDescriptionsResponse = {
  commands: SlashCommandInfo[];
};

export type ClaudeCompactBoundary = {
  type: "system";
  subtype: "compact_boundary" | "microcompact_boundary";
  compactMetadata?: {
    trigger?: string;
    preTokens?: number;
  };
  microcompactMetadata?: {
    trigger?: string;
    preTokens?: number;
    tokensSaved?: number;
  };
};

// Compact-boundary subtypes — the single source of truth for "a compact starts a
// new block". Server (relay buffer trim, history tail-scan) and client (render
// windowing) both consume this so the two sides never disagree on what counts as
// a boundary.
export const COMPACT_BOUNDARY_SUBTYPES = ["compact_boundary", "microcompact_boundary"] as const;

export function isCompactBoundarySubtype(
  subtype: string | undefined | null,
): subtype is (typeof COMPACT_BOUNDARY_SUBTYPES)[number] {
  return subtype === "compact_boundary" || subtype === "microcompact_boundary";
}

export type ClaudeStatusMessage = {
  type: "system";
  subtype: "status";
  status?: string | null;
  compact_result?: string;
  session_id: string;
  uuid: string;
};

export type ClaudeThinkingTokens = {
  type: "system";
  subtype: "thinking_tokens";
  estimated_tokens: number;
  estimated_tokens_delta: number;
  session_id: string;
  uuid: string;
};

export type ClaudeAssistantContent =
  | { type: "text"; text: string }
  | { type: "tool_use"; id: string; name: string; input: Record<string, unknown> }
  | { type: "thinking"; thinking: string; signature: string };

export type ClaudeAssistantMessage = {
  type: "assistant";
  message: {
    id: string;
    role: "assistant";
    content: ClaudeAssistantContent[];
    model?: string;
    usage?: { input_tokens: number; output_tokens: number };
  };
  session_id: string;
  // JSONL envelope fields (optional — may be absent from stdout stream)
  uuid?: string;
  parentUuid?: string;
  logicalParentUuid?: string;
  userType?: string;
  isApiErrorMessage?: boolean;
  isSidechain?: boolean;
  error?: string;
  timestamp?: string;
  sessionId?: string;
};

export type ClaudeApiRetry = {
  type: "system";
  subtype: "api_retry";
  attempt: number;
  max_retries: number;
  retry_delay_ms: number;
  error_status?: number;
  error?: string;
  session_id: string;
};

export type ClaudeMode = {
  type: "mode";
  mode: string;
  session_id?: string;
};

// attachment 外层信封（所有子类型共享）
export type ClaudeAttachmentEnvelope = {
  type: "attachment";
  uuid: string;
  parentUuid: string | null;
  isSidechain: boolean;
  timestamp: string;
  sessionId: string;
  userType?: string;
  entrypoint?: string;
  cwd?: string;
  version?: string;
  gitBranch?: string;
  slug?: string;
};

// attachment 子类型（23 种，按 domain 分组）

export type AttachmentMcpInstructionsDelta = {
  attachment: {
    type: "mcp_instructions_delta";
    addedNames: string[];
    addedBlocks: string[];
  };
};

export type AttachmentSkillListing = {
  attachment: {
    type: "skill_listing";
    content: string;
  };
};

export type AttachmentCommandPermissions = {
  attachment: {
    type: "command_permissions";
    allowedTools: string[];
  };
};

export type AttachmentInvokedSkills = {
  attachment: {
    type: "invoked_skills";
    skills: Array<{ name: string; path: string; content: string }>;
  };
};

export type AttachmentAutoMode = {
  attachment: {
    type: "auto_mode";
    reminderType?: "full";
  };
};

export type AttachmentAutoModeExit = {
  attachment: {
    type: "auto_mode_exit";
  };
};

export type AttachmentPlanMode = {
  attachment: {
    type: "plan_mode";
    reminderType?: "full";
    isSubAgent: boolean;
    planFilePath: string;
    planExists: boolean;
  };
};

export type AttachmentPlanModeExit = {
  attachment: {
    type: "plan_mode_exit";
    planFilePath: string;
    planExists: boolean;
  };
};

export type AttachmentPlanModeReentry = {
  attachment: {
    type: "plan_mode_reentry";
    planFilePath: string;
  };
};

export type AttachmentTaskReminder = {
  attachment: {
    type: "task_reminder";
    content: Array<{
      id?: string;
      subject?: string;
      status?: string;
      [key: string]: unknown;
    }>;
    itemCount: number;
  };
};

export type AttachmentTaskStatus = {
  attachment: {
    type: "task_status";
    taskId: string;
    taskType: string;
    description: string;
    status: string;
    deltaSummary: string | null;
    outputFilePath: string;
  };
};

export type AttachmentQueuedCommand = {
  attachment: {
    type: "queued_command";
    prompt: string;
    commandMode: string;
  };
};

export type AttachmentFile = {
  attachment: {
    type: "file";
    filename: string;
    displayPath: string;
    content: {
      type: "text";
      file: {
        filePath: string;
        content: string;
        numLines: number;
        startLine: number;
        totalLines: number;
      };
    };
  };
};

export type AttachmentEditedTextFile = {
  attachment: {
    type: "edited_text_file";
    filename: string;
    snippet: string;
  };
};

export type AttachmentCompactFileReference = {
  attachment: {
    type: "compact_file_reference";
    filename: string;
    displayPath: string;
  };
};

export type AttachmentPlanFileReference = {
  attachment: {
    type: "plan_file_reference";
    planFilePath: string;
    planContent: string;
  };
};

export type AttachmentHookSuccess = {
  attachment: {
    type: "hook_success";
    hookName: string;
    hookEvent: string;
    toolUseID: string;
    command: string;
    stdout: string;
    stderr: string;
    exitCode: number;
    durationMs: number;
    content?: string;
  };
};

export type AttachmentHookNonBlockingError = {
  attachment: {
    type: "hook_non_blocking_error";
    hookName: string;
    hookEvent: string;
    toolUseID: string;
    command: string;
    stdout: string;
    stderr: string;
    exitCode: number;
    durationMs: number;
  };
};

export type AttachmentHookAdditionalContext = {
  attachment: {
    type: "hook_additional_context";
    content: string[];
    hookName: string;
    hookEvent: string;
    toolUseID: string;
  };
};

export type AttachmentDateChange = {
  attachment: {
    type: "date_change";
    newDate: string;
  };
};

export type AttachmentOpenedFileInIde = {
  attachment: {
    type: "opened_file_in_ide";
    filename: string;
  };
};

export type AttachmentSelectedLinesInIde = {
  attachment: {
    type: "selected_lines_in_ide";
    ideName: string;
    filename: string;
    displayPath: string;
    lineStart: number;
    lineEnd: number;
    content: string;
  };
};

export type AttachmentDiagnostics = {
  attachment: {
    type: "diagnostics";
    files: Array<{
      uri: string;
      diagnostics: Array<{
        message: string;
        severity: string;
        range: {
          start: { line: number; character: number };
          end: { line: number; character: number };
        };
        source: string;
        code: string;
      }>;
    }>;
    isNew: boolean;
  };
};

export type AttachmentGoalStatus = {
  attachment: {
    type: "goal_status";
    met: boolean;
    sentinel: boolean;
    condition: string;
  };
};

export type AttachmentContent =
  | AttachmentMcpInstructionsDelta["attachment"]
  | AttachmentSkillListing["attachment"]
  | AttachmentCommandPermissions["attachment"]
  | AttachmentInvokedSkills["attachment"]
  | AttachmentAutoMode["attachment"]
  | AttachmentAutoModeExit["attachment"]
  | AttachmentPlanMode["attachment"]
  | AttachmentPlanModeExit["attachment"]
  | AttachmentPlanModeReentry["attachment"]
  | AttachmentTaskReminder["attachment"]
  | AttachmentTaskStatus["attachment"]
  | AttachmentQueuedCommand["attachment"]
  | AttachmentFile["attachment"]
  | AttachmentEditedTextFile["attachment"]
  | AttachmentCompactFileReference["attachment"]
  | AttachmentPlanFileReference["attachment"]
  | AttachmentHookSuccess["attachment"]
  | AttachmentHookNonBlockingError["attachment"]
  | AttachmentHookAdditionalContext["attachment"]
  | AttachmentDateChange["attachment"]
  | AttachmentOpenedFileInIde["attachment"]
  | AttachmentSelectedLinesInIde["attachment"]
  | AttachmentDiagnostics["attachment"]
  | AttachmentGoalStatus["attachment"];

// 完整 attachment 消息（信封 + 子类型）
export type ClaudeAttachment = ClaudeAttachmentEnvelope & {
  attachment: AttachmentContent;
};

export type ClaudeLastPromptEntry = {
  type: "last-prompt";
  lastPrompt: string;
  leafUuid?: string;
  sessionId?: string;
};

export type ClaudePermissionModeEntry = {
  type: "permission-mode";
  permissionMode: ClaudePermissionMode;
  session_id?: string;
};

export type ClaudeTrackedFileBackup = {
  backupFileName?: string;
  version?: number;
  backupTime?: string;
};

export type ClaudeFileHistorySnapshot = {
  type: "file-history-snapshot";
  messageId?: string;
  isSnapshotUpdate?: boolean;
  snapshot?: {
    messageId?: string;
    timestamp?: string;
    trackedFileBackups?: Record<string, ClaudeTrackedFileBackup>;
  };
};

export type ClaudeAiTitle = {
  type: "ai-title";
  aiTitle: string;
  sessionId?: string;
};

export type ClaudeAgentName = {
  type: "agent-name";
  agentName: string;
  sessionId?: string;
};

export type ClaudeQueueOperation = {
  type: "queue-operation";
  operation: "enqueue" | "dequeue" | "remove" | "popAll";
  timestamp?: string;
  sessionId?: string;
  content?: string;
};

export type ClaudeUserMessage = {
  type: "user";
  message: {
    role: "user";
    content:
      | string
      | Array<
          | { type: "text"; text: string }
          | {
              type: "tool_result";
              tool_use_id: string;
              content: string | Array<{ type: "text"; text: string }>;
              is_error?: boolean;
            }
        >;
  };
  tool_use_result?: unknown;
  toolUseResult?: unknown;
  parent_tool_use_id?: string;
  isMeta?: boolean;
  sourceToolUseID?: string;
  isSynthetic?: boolean;
  // Set by our api service when it injects the client's user-message echo into
  // the live stream (the CLI never echoes user input on stdout). Marks "this is
  // a real user submission" so the client can open running on it without matching
  // CLI-internal user messages (isMeta/isSynthetic skill bodies, compact summaries).
  isUserInput?: boolean;
  // JSONL envelope fields (optional — may be absent from stdout stream)
  uuid?: string;
  parentUuid?: string;
  logicalParentUuid?: string;
  userType?: string;
  isApiErrorMessage?: boolean;
  isSidechain?: boolean;
  error?: string;
  timestamp?: string;
  sessionId?: string;
};

export type ClaudeTaskStarted = {
  type: "system";
  subtype: "task_started";
  task_id: string;
  agentType?: string;
  workflowName?: string;
  prompt?: string;
  subject?: string;
  session_id?: string;
};

export type ClaudeTaskUpdated = {
  type: "system";
  subtype: "task_updated";
  task_id: string;
  isBackgrounded?: boolean;
  error?: string;
  end_time?: number;
  total_paused_ms?: number;
  session_id?: string;
};

export type ClaudeTaskNotification = {
  type: "system";
  subtype: "task_notification";
  task_id: string;
  text?: string;
  summary?: string;
  outputFile?: string;
  skipTranscript?: boolean;
  session_id?: string;
};

export type ClaudeTaskProgress = {
  type: "system";
  subtype: "task_progress";
  task_id: string;
  tool_use_id?: string;
  description: string;
  subagent_type?: string;
  usage: {
    total_tokens: number;
    tool_uses: number;
    duration_ms: number;
  };
  last_tool_name?: string;
  summary?: string;
  uuid: string;
  session_id: string;
  workflow_progress?: Array<Record<string, unknown>>;
};

// Auto-mode classifier or permission system rejected a tool call. Realtime-only
// signal (NOT written to JSONL history). Mounted onto the matching tool-call
// part as permissionDenied { reasonType, reason } and rendered as a violet banner.
export type ClaudePermissionDenied = {
  type: "system";
  subtype: "permission_denied";
  tool_name?: string;
  tool_use_id?: string;
  decision_reason_type?: string;
  decision_reason?: string;
};

export type ClaudeResult = {
  type: "result";
  subtype: "success" | "error_max_turns" | "error" | "interrupted";
  session_id: string;
  num_turns: number;
  total_cost_usd?: number;
  duration_ms?: number;
  result?: string;
  is_error?: boolean;
  api_error_status?: number;
  // Authoritative "why the query loop terminated" (CLI v2.1.160 enum):
  // completed | aborted_streaming | aborted_tools | max_turns | model_error |
  // image_error | prompt_too_long | blocking_limit | rapid_refill_breaker |
  // stop_hook_prevented | hook_stopped | tool_deferred. Unset when the loop
  // was bypassed (local slash command) or interrupted externally.
  terminal_reason?: string;
  usage?: {
    input_tokens?: number;
    output_tokens?: number;
    cache_read_input_tokens?: number;
    cache_creation_input_tokens?: number;
  };
};

// Claude CLI --permission-prompt-tool stdio routes permission prompts
// (Bash, Write, AskUserQuestion, etc.) as control_request on stdout.
// The tool_name and input are nested under "request", not at top level.
//
// Actual format from Claude CLI v2.1.160+:
//   {"type":"control_request","request_id":"uuid",
//    "request":{"subtype":"can_use_tool","tool_name":"AskUserQuestion",
//               "tool_use_id":"toolu_XXXX",
//               "display_name":"AskUserQuestion","input":{"questions":[...]}}}
//
// Answer with control_response on stdin:
//   {"type":"control_response","request_id":"uuid"}
//   {"type":"control_response","request_id":"uuid","answers":{"q":"a"}}
export type ClaudeControlRequest = {
  type: "control_request";
  request_id: string;
  request: {
    subtype: string;
    tool_name: string;
    tool_use_id: string;
    display_name: string;
    input: Record<string, unknown>;
  };
};

// The control_response format matches Claude SDK's CanUseToolControlResponse:
//
//   {"type":"control_response","response":{"subtype":"success","request_id":"uuid",
//     "response":{"behavior":"allow","updatedInput":{"answers":{...}}}}}
//
// Clang requires the nested "response" wrapper — the request_id is NOT at
// top level. See cli/src/claude/sdk/query.ts handleControlRequest() in hapi
// for the canonical implementation.
export type ClaudeControlResponse = {
  type: "control_response";
  response: {
    subtype: "success" | "error";
    request_id: string;
    response?: SDKPermissionResult;
    error?: string;
  };
};

export type SDKPermissionResult =
  | {
      behavior: "allow";
      updatedInput: Record<string, unknown>;
    }
  | {
      behavior: "deny";
      message: string;
    };

export type SessionStreamClientMessage =
  | {
      type: "input";
      data: string;
    }
  | {
      type: "resize";
      cols: number;
      rows: number;
    }
  | {
      type: "ping";
    }
  | ClaudeStreamClientMessage;

export type ClaudePermissionMode =
  | "default"
  | "acceptEdits"
  | "bypassPermissions"
  | "plan"
  | "auto"
  | "dontAsk"
  | "manual";

// Client → server control actions (model switch, permission mode switch, interrupt).
// These become stdin control_request messages to the CLI; the CLI replies with
// control_response on stdout. request_id is used to match response to request.
export type ClaudeStreamControlRequest = {
  type: "control_request";
  request_id: string;
  request:
    | {
        subtype: "set_model";
        model: string;
      }
    | {
        subtype: "set_permission_mode";
        mode: ClaudePermissionMode;
      }
    | {
        subtype: "interrupt";
      };
};

export type ClaudeStreamClientMessage =
  | {
      type: "user";
      message: {
        role: "user";
        content: Array<{ type: "text"; text: string }>;
      };
    }
  | ClaudeControlResponse
  | ClaudeStreamControlRequest
  | {
      // Per-session runtime effort switch. Unlike set_model/set_permission_mode
      // (in-process control_request), effort has no CLI runtime switch on a
      // direct-pull host — the server persists it (setEffort), relaunches the
      // CLI with --resume + new CLAUDE_CODE_EFFORT_LEVEL, and closes the WS so
      // the client reconnects into the respawned stream. See
      // docs/research/claude-cli-runtime-config.md (effort Q3).
      type: "set_runtime_effort";
      effort: EffortLevel;
    }
  | {
      // 应用层心跳(客户端发起,保活)。服务端 claude-stream message handler 早返回,
      // 不进业务处理。详见 web/src/lib/ws-heartbeat.ts。
      type: "ping";
    };

export type SessionStreamServerMessage =
  | {
      type: "output";
      data: string;
    }
  | {
      type: "status";
      status: AgentSessionStatus | TerminalSessionStatus | TransportStatus;
    }
  | {
      type: "ended";
    }
  | {
      type: "error";
      code: ApiErrorCode;
      message: string;
    }
  | ClaudeSystemInit
  | ClaudeSeedInit
  | ClaudeSkillCatalogChanged
  | ClaudeCompactBoundary
  | ClaudeStatusMessage
  | ClaudeApiRetry
  | ClaudeMode
  | ClaudeAttachment
  | ClaudeLastPromptEntry
  | ClaudePermissionModeEntry
  | ClaudeFileHistorySnapshot
  | ClaudeAiTitle
  | ClaudeAgentName
  | ClaudeQueueOperation
  | ClaudeThinkingTokens
  | ClaudeAssistantMessage
  | ClaudeUserMessage
  | ClaudeTaskStarted
  | ClaudeTaskUpdated
  | ClaudeTaskNotification
  | ClaudeTaskProgress
  | ClaudePermissionDenied
  | ClaudeResult
  | ClaudeControlRequest
  | ClaudeControlResponse
  | {
      type: "history_start";
      count: number;
    }
  | {
      type: "session_init";
      resume: boolean;
    }
  | {
      type: "history_end";
    }
  | {
      type: "live_start";
      count: number;
    }
  | {
      type: "live_end";
    }
  | {
      // 心跳 ack：服务端收到 {type:"ping"} 回此帧，客户端据 lastPong 做 half-open
      // 检测（pong 超时即判定连接静默断开、主动重连）。详见 web/src/lib/ws-heartbeat.ts。
      type: "pong";
    };

export type HealthResponse = {
  ok: true;
  service: "api";
};

export type ApiErrorCode =
  | "INVALID_PASSWORD"
  | "UNAUTHENTICATED"
  | "CONFIG_REQUIRED"
  | "CONFIG_INVALID"
  | "RUNTIME_DIR_UNAVAILABLE"
  | "PROJECT_NAME_INVALID"
  | "PROJECT_NOT_FOUND"
  | "PROJECT_TARGET_INVALID"
  | "PROJECT_PATH_OUTSIDE_ROOT"
  | "PROJECT_CONFLICT"
  | "PROJECT_FILE_NOT_FOUND"
  | "PROJECT_FILE_NOT_DIRECTORY"
  | "PROJECT_FILE_NOT_FILE"
  | "PROJECT_FILE_TARGET_EXISTS"
  | "PROJECT_FILE_UPLOAD_FAILED"
  | "PROJECT_FILE_UPLOAD_TOO_LARGE"
  | "PROJECT_FILE_RENAME_FAILED"
  | "PROJECT_FILE_DELETE_FAILED"
  | "PROJECT_FILE_SAVE_FAILED"
  | "PROJECT_GIT_NOT_REPOSITORY"
  | "PROJECT_GIT_SCOPE_INVALID"
  | "PROJECT_GIT_FILE_NOT_CHANGED"
  | "PROJECT_GIT_UNAVAILABLE"
  | "PROJECT_FS_ERROR"
  | "PROJECT_PAGES_CONFIG_INVALID"
  | "PROJECT_PAGES_ROOT_CONFLICT"
  | "PROJECT_DELETE_FAILED"
  | "SESSION_NOT_FOUND"
  | "SESSION_RUNTIME_MISSING"
  | "SESSION_RUNTIME_ERROR"
  | "SESSION_PROVIDER_UNAVAILABLE"
  | "SESSION_TYPE_INVALID"
  | "SESSION_STATE_CONFLICT"
  | "SESSION_METADATA_ERROR"
  | "SESSION_STREAM_MISMATCH"
  | "SETTINGS_INVALID"
  | "PRESET_NOT_FOUND"
  | "PROVIDER_LABEL_CONFLICT"
  | "SKILL_MARKET_FETCH_FAILED"
  | "SKILL_INSTALL_FAILED"
  | "SKILL_UNINSTALL_FAILED"
  | "SKILL_PREVIEW_FAILED"
  | "SKILL_LIST_FAILED"
  | "SKILL_SOURCE_INVALID"
  | "SKILL_UPDATE_CHECK_FAILED"
  | "SKILL_UPDATE_FAILED"
  | "MCP_HUB_START_FAILED"
  | "MCP_INJECT_UNSUPPORTED"
  | "MCP_CONFIG_INVALID"
  | "MCP_LIST_FAILED"
  | "MCP_ADD_FAILED"
  | "MCP_REMOVE_FAILED"
  | "MCP_UPDATE_FAILED"
  | "WIKI_SLUG_INVALID"
  | "SESSION_NOT_CONFIGURED";

export type ApiErrorResponse = {
  error: {
    code: ApiErrorCode;
    message: string;
  };
};

export type LoginRequest = {
  password?: string;
};

export type LoginResponse = {
  ok: true;
  token: string;
  expiresAt: string;
};

export type AuthMeResponse = {
  authenticated: true;
};
