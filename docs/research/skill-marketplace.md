# Skill 市场 / 包管理功能调研

> 调研日期 2026-07-17。目标：为 agents-remote 新增「skill 市场 / 包管理」功能——在网页上查看 / 预览 / 安装 / 卸载 / 更新 Claude Code skills，默认源 skills.sh，可加额外开源仓库源，先 Claude 后 Codex（多 runtime 架构）。产品对标 cc-switch 的 skill 功能。
>
> 证据强度标记：**强** = 本地源码 / 官方 repo / 实测 curl；**弱** = 社区 / blog；**未决** = 无直接证据。

## 1. 关键身份澄清（三个对象别混淆）

| 对象 | 身份 | 本地 clone |
|---|---|---|
| **skills.sh** | 配套的 skill **发现 / 托管**服务（网站 + 公开 search API） | — |
| **vercel-labs/skills** | `npx skills` 这个 **CLI 包管理器本体**（npm 包 `skills@1.5.19`，MIT，maintainer rauchg）—— 内置 source 解析 / 安装引擎 / lock file / 更新检测 / 多 agent 目录映射 / 安全校验 | ❌ 未 clone |
| **mattpocock/skills** | **一个 skill 源集合仓库**（skills.sh 的典型「被托管方」，badge `skills.sh/b/mattpocock/skills`），**不是工具** | ✅ `~/repos/skills` |

用户说「首版依托 vercel-labs/skills」≈ 可以 wrap `npx skills` CLI 的执行能力，或复刻其安装逻辑。skills.sh 只负责「发现」。

## 2. skills.sh 公开 API —— 实测结论（强证据）

实测 `curl https://skills.sh/...`：

### 2.1 搜索（唯一公开、免认证、可机读的入口）
`GET https://skills.sh/api/search?q=<query>&limit=<N>[&owner=<owner>]` → `200 application/json`：
```json
{"query":"tdd","searchType":"fuzzy",
 "skills":[{"id":"mattpocock/skills/tdd","skillId":"tdd","name":"tdd","installs":460398,"source":"mattpocock/skills"}, ...],
 "count":3,"duration_ms":308}
```
- **字段只有 5 个**：`id` / `skillId` / `name` / `installs` / `source`。**没有 description、没有 README、没有版本**。
- `id` = `owner/repo/skillId`；`source` = `owner/repo`；`skillId` = skill 在 repo 内的名字。
- 约束：`q` 必须 ≥2 字符（空/1 字符返回 400 `{"error":"Query must be at least 2 characters"}`）。
- 免认证、按 `installs` 降序。

### 2.2 没有 skill 详情 / 内容预览端点（强证据，实测）
- `/api/skill/<id>` → **HTTP 401**（需认证，非公开）
- `/api/skills/<id>`、`/api/skill/<id>/content` → 404
- `/api/leaderboard` → 500（不存在）

### 2.3 结论：description 和 SKILL.md 正文必须自己去 source repo fetch
skills.sh 只给「名字 + 安装量 + 来源 repo」。要展示 description 或预览 SKILL.md 全文，必须解析 `source`（`owner/repo`）+ 去 GitHub fetch（raw.githubusercontent.com 取 frontmatter / codeload zipball 取整包）。cc-switch 和 vercel-labs/skills CLI 都是这么做的。

## 3. vercel-labs/skills CLI（`npx skills`）能力边界

### 3.1 非 TTY 可驱动（集成前提成立，强）
stdin 非 TTY 或检测到 agent 环境时自动 `options.yes = true`，跳过所有交互 prompt。每个 prompt 都有对应 flag：`--global/-g`（scope）、`--copy`（mode）、`--agent <names>`（`'*'`=全部）、`--skill <names>`（`'*'`=全部）、`--yes/-y`（确认）。

### 3.2 输出可机读性（最关键约束，强）
| 命令 | 机读 | 输出 schema | agents-remote 用法 |
|---|---|---|---|
| `list --json` | ✅ 唯一 `--json` | `Array<{name,path,scope:'project'\|'global',agents:AgentType[]}>` | ✅ wrap：已装清单 |
| `add`/`remove`/`update` | ❌ TUI 文本+ANSI | 人类可读 | ✅ wrap（**只信 exit code，不解析 stdout**；事后 `list --json` 验证） |
| `find`/`search` | ❌ TUI（fzf 式 raw ANSI） | — | ❌ 不 wrap；直接 `fetch skills.sh/api/search` |
| `check` | ❌ TUI 文本 | 「outdated」+「skipped」分组 | 🟡 输出难解析；建议自读锁文件 + GitHub Trees API 比 hash |
| `use` | ❌ 接管 stdio | 临时物化 + spawn agent | ❌ 不适合 server wrap |
| `init`/`experimental_install`/`experimental_sync` | ❌ TUI | — | 🟡 可选 |

退出码统一 `0` 成功 / `1` 失败。

### 3.3 多 runtime 在 CLI 里如何表达（强，纠正直觉）
Agent Registry（`src/agents.ts`，70+ agent）每个 agent 定义 `skillsDir`（project）+ `globalSkillsDir`（user）+ `detectInstalled()`：

| Agent | project dir | global dir | 类型 |
|---|---|---|---|
| `claude-code` | `.claude/skills` | `~/.claude/skills`（`$CLAUDE_CONFIG_DIR/skills`） | non-universal（canonical 符号链接过来） |
| `codex` | `.agents/skills` | `$CODEX_HOME/skills`（默认 `~/.codex/skills`） | universal（直接读 canonical） |

- 透传 `--agent claude-code` / `--agent codex` / `--agent '*'` 即可，**CLI 已内置目录映射、env 覆盖、检测逻辑**，agents-remote 不需要自己实现。
- env 覆盖：`CLAUDE_CONFIG_DIR`、`CODEX_HOME`（agents-remote 若想隔离可用）。

### 3.4 源类型（强，5 种）
`parseSource` 支持：`local`（`./path`、绝对路径）、`github`（`owner/repo`、URL、`tree/ref/path`、`owner/repo@skill` 过滤、`owner/repo#branch`）、`gitlab`、`well-known`（RFC 8615）、`git`（SSH/generic 兜底）。**添加额外源不需要 skills.sh 账号**，CLI 直接接受任意 GitHub/git URL。

### 3.5 scope + install mode（强）
- 2 scope：project（默认，`./.agents/skills/`）vs global（`-g`，`~/.agents/skills/`）。
- 2 mode：symlink（默认，canonical 单份 + agent 目录符号链接，失败回退 copy）vs copy（`--copy`）。

### 3.6 锁文件 + 版本/更新（强）
- 全局锁 `~/.agents/.skill-lock.json`（v3，`skillFolderHash`=GitHub tree SHA）。
- 项目锁 `./skills-lock.json`（设计上提交进 VCS，`computedHash`=本地 SHA-256，无时间戳减冲突）。
- `update` 内部对每个过期 skill spawn `add` 重装。`remove` **不靠锁文件**，主动扫描文件系统按 name 匹配，canonical 在「无其他 agent 还在用」时才删。

### 3.7 安装底层（强）
- **Blob Fast-Path**（优先，仅 GitHub + 受信 owner：`vercel`/`vercel-labs`/`heygen-com` + 白名单 repo）：不 clone，GitHub Trees API 列文件 + raw.githubusercontent 取 frontmatter + skills.sh/api/download 取快照。
- **git clone fallback**：simple-git `--depth 1` 到 tmpdir，带 `GIT_LFS_SKIP_SMUDGE=1`、gh CLI 认证 fallback、5 分钟超时。
- blob 路径会调 `gh auth token`——服务器若无 `gh`，退化为 unauthenticated（60 req/h 限速）；可注入 `GITHUB_TOKEN`/`GH_TOKEN` env 缓解。

### 3.8 安全校验（强，与 agents-remote PROJECTS_ROOT 哲学一致）
`sanitizeName()`（lowercase + `[^a-z0-9._]`→`-` + 限 255）、`isPathSafe()`（normalize+resolve 后 prefix 检查，任何 `..` 段 throw）、`stripTerminalEscapes()`/`sanitizeMetadata()`（防终端转义注入 CWE-150）、frontmatter 类型校验。

### 3.9 可作 library import？（🟡 半官方，不建议）
`package.json` 无 `exports`，`main` 指向 CLI 入口。内部函数虽 export 但无 public 契约，跨版本易碎。**建议 wrap CLI（subprocess）或直接调 skills.sh API，不 import 内部。**

## 4. cc-switch 产品对标（UX 标尺，强）

- Repo：`farion1231/cc-switch`（v3.17.0，Tauri 2 + Rust + React 18，桌面应用，MIT，maintainer Jason Young）。形态是桌面本地工具，**UX 范式可直接照搬**，但实现（直接操作本地 FS）与 agents-remote（远程服务器 Bun 服务端）不同。
- **关键**：cc-switch **自己实现安装**（GitHub codeload zipball → 解压到 SSOT `~/.cc-switch/skills/` → symlink/copy 到各 app 目录），**不调 `npx skills`**；只用 skills.sh `/api/search` 做**发现**。
- **UX 三件套**（对标标尺）：
  1. **发现页** `SkillsPage`：顶部源 tab（Repos ↔ skills.sh）+ 搜索栏 + 仓库/安装状态过滤 + `SkillCard` 网格（name/description/repo/Installed 徽标/Install·View·Uninstall）。
  2. **管理面板** `UnifiedSkillsPanel`：已装 skill 列表 + per-app `AppToggleGroup`（这是 Claude↔Codex 切换发生处）。
  3. **源管理** `RepoManagerPanel`：增删 GitHub 源（owner/name + branch + 可选 skillsPath，支持粘 URL 自动解析）。
- **预览**：View 按钮外链浏览器打开 `readmeUrl`——**没有应用内富文本 SKILL.md 预览**（🟡 较新版本可能加了，未确认）。
- **默认源**：出厂 4 个 GitHub repo（`anthropics/skills`、`ComposioHQ/awesome-claude-skills`、`cexll/myclaude`、`JimLiu/baoyu-skills`）+ skills.sh 搜索。
- **数据模型**：`InstalledSkill { id, name, description?, directory, repoOwner?, repoName?, repoBranch?, readmeUrl?, apps: SkillApps, installedAt, contentHash?, updatedAt }`；发现态 `DiscoverableSkill { key, name, description, directory, readme_url, repo_owner, repo_name, repo_branch }`。
- **更新检测**：SHA-256 `contentHash` 比对远端分支最新 commit（无需 git 依赖）。
- **存储**：`CcSwitch`（`~/.cc-switch/skills` SSOT + symlink）或 `Unified`（`~/.agents/skills` 开放标准）；同步方式 Auto（symlink→copy 回退）/ Symlink / Copy。
- **卸载安全**：自动备份到 `~/.cc-switch/skill-backups/`，留最近 20 个。
- **额外能力**：ZIP 文件安装、本地 unmanaged skill 扫描导入、Deep Link（`ccswitch://`）导入、Project Profile 快照（v3.17.0）。

## 5. 安装语义（强，双源一致：hapi 源码 + vercel-labs/skills CLI）

### 5.1 目录映射
| runtime | user (global) | project | env 覆盖 |
|---|---|---|---|
| Claude Code | `~/.claude/skills/<name>/SKILL.md` | `<proj>/.claude/skills/<name>/` | `$CLAUDE_CONFIG_DIR` |
| Codex | `~/.codex/skills/<name>/SKILL.md` | `<proj>/.codex/skills/<name>/` | `$CODEX_HOME` |
| Universal canonical | `~/.agents/skills/<name>/` | `<proj>/.agents/skills/<name>/` | — |

来源：`~/repos/hapi/cli/src/modules/common/skills.ts:43,53-77`、vercel-labs/skills deepwiki 5.4、agents-remote `api/src/claude2-slash-commands.ts:184-186`。

### 5.2 装完后如何被识别（agents-remote 已有完整闭环，强）
- Claude Code CLI **不自动 watch 目录**，装后必须发 `/reload-skills`（或重启 session）。
- agents-remote 已实现 `/reload-skills` 检测闭环：`claude2-runtime.ts:67-103` `extractSkillReloadFromStdoutLine`（正则 `/Reloaded skills:\s+\d+\s+skills/i`）→ `captureSkillReloadFromLine` → `onSkillReload` → **index.ts 重新扫盘 + 广播 `skill_catalog_changed`**。
- 这条管道已就绪，**无需新代码**。

### 5.3 现状已扫 `~/.claude/skills`（对接路径已验证，强）
`claude2-slash-commands.ts` `scanSkillDir()`（`:89-114`）读 `<dir>/<name>/SKILL.md` frontmatter；`resolveSkillSlashCatalog()`（`:203-259`）扫 4 源：project `.claude/skills` + user `~/.claude/skills` + plugins + builtin。**skill 一旦装进 `~/.claude/skills/<name>/`，立即被现有 slash 菜单 catalog 看到**（下次刷新）。插件 namespacing（`plugin:entry`）也已处理。

> **关键复用点**：安装不需要新写扫描逻辑，只需 (a) 写文件到 `~/.claude/skills/<name>/`，(b) 触发 `/reload-skills`。

## 6. agents-remote 现有可复用点（强）

| 能力 | 现有位置 | 复用方式 |
|---|---|---|
| 已装 skill catalog | `api/src/claude2-slash-commands.ts` `scanSkillDir`/`resolveSkillSlashCatalog` | 直接读 `~/.claude/skills`，装进去即被 slash 菜单看到 |
| reload 闭环 | `api/src/claude2-runtime.ts` + `index.ts` `skill_catalog_changed` | 装后发 `/reload-skills` 自动刷新 |
| SKILL.md frontmatter 解析 | `claude2-slash-commands.ts:7-25` `parseFrontmatter` | 提取 name/description |
| Markdown 渲染组件 | `web/src/components/markdown/MarkdownText.tsx` 等 | 预览 SKILL.md 正文（纯展示，喂 content 字符串） |
| Files preview 面板 | `web/src/components/files/file-preview-panel.tsx` | 参考，但它是 project-scoped（走 `resolveProjectRelativePath`），**不能直接用于 `~/.claude/skills`**，需新建 skill-scope 读端点 |
| PROJECTS_ROOT 安全模型 | `api/src/project-paths.ts` | 借鉴 `isInsideOrSelf`/`realpath` 模式，但**不复用**（写 `~/.claude` 在项目外） |

## 7. 安全边界（含两个层面）

### 7.1 路径穿越（技术面，有现成范式）
装 skill 写 `~/.claude/skills`（PROJECTS_ROOT **之外**），打破现有「所有写都在项目内」模型。建议（🟡 设计）：
- 新增**独立 permission domain**「全局 skill 目录写权限」，与 project-scoped 写分离，**不塞进 `resolveProjectRelativePath`**。
- 复刻 `isPathSafe`（`normalize(resolve(...))` + prefix 检查，任何 `..` throw）+ `sanitizeName`（skill 名只允许 `[a-z0-9._-]`）+ `realpath`（防 `~/.claude/skills` 被 symlink 成 `/etc`）。
- **白名单根目录**：硬编码 `[~/.claude/skills, ~/.codex/skills, ~/.agents/skills]`，不接受任意 dest 参数。

### 7.2 执行信任（产品面，比路径穿越更大的安全面，未决）
Skill 是 markdown + 资源，但 **Claude Code 会执行 skill 指令**——装第三方 skill = 信任其作者，skill 可影响 agent 行为（类比 `npm install` 第三方包）。agents-remote 当前无对应模型。UI 应有明确「安装将允许该 skill 影响你的 agent 行为」确认。**这是产品/权限决策，非纯技术**。

## 8. 两条技术路线对比（最关键的设计决策）

| | **路线 A：wrap `npx skills` CLI** | **路线 B：自实现安装（仿 cc-switch）** |
|---|---|---|
| 安装/卸载/更新 | shell-out `npx skills add/remove/update`（exit code 判成败，事后 `list --json`） | 自己写 GitHub codeload zipball 下载 + 解压 + 落盘 + symlink/copy + SHA-256 更新检测 |
| 多 runtime 目录映射 | CLI 内置（`--agent claude-code`/`codex`），零成本 | 自己维护 claude/codex/universal 目录映射表 |
| 源解析 | CLI `parseSource` 内置 5 种源类型 | 自己写（至少 GitHub shorthand + URL + subpath + branch） |
| 安全校验 | CLI 内置 `isPathSafe`/`sanitizeName` | 自己复刻 |
| 运行时依赖 | **npx + node + 网络**（claude2 CLI 是独立二进制，不自带 node） | 仅 Bun + 网络 |
| 可控性 | 受 CLI 行为约束（stdout 不机读、telemetry 上报、版本耦合） | 完全可控、行为可预测 |
| 与 cc-switch 一致 | ❌（cc-switch 自实现） | ✅ |
| 工作量 | 小（省掉安装/更新/安全/源解析全部逻辑） | 大 |
| 风险点 | telemetry 隐私（opt-out 未决）、npx 依赖、blob 路径 60 req/h 限速（需 `GITHUB_TOKEN`） | 自维护安全/正确性 |

**两者不互斥**：可设计抽象的「安装后端」接口，首版选一个默认，另一个作可选。市场发现（skills.sh `/api/search`）与已装清单（`list --json` 或自扫 `~/.claude/skills`）两条路线一致。

- subagent 建议：vercel-labs 调研倾向**混合**（发现走 API、执行 wrap CLI）；cc-switch 调研倾向**默认自实现**（可控、与 cc-switch 一致、无外部 CLI 依赖，CLI 作可选后端）。
- agents-remote 架构特点：已习惯「直拉外部 CLI」（claude2/tmux/git），但服务器是否装 node/npx 需确认；Bun 服务端做 zip 下载解压/symlink 也很自然。

## 9. 未决问题（实现前需确认）

1. **架构路线**（A wrap CLI / B 自实现 / 混合）—— 需用户拍板（见 §8）。
2. **telemetry opt-out**：vercel-labs/skills 每次 add/remove/update 上报 skills.sh，opt-out env 未确认，需读 `src/telemetry.ts`（隐私合规）。
3. **服务器 node/npx 可用性**：路线 A 依赖；需确认部署环境。
4. **Codex 是否真读 `~/.codex/skills`**：hapi 扫它，但 Codex CLI 自身能力边界未确认（首版 Claude 优先可暂搁）。
5. **skills.sh `/api/search` SLA/限速**：未文档化，server 端代理高频请求是否被限速需实测。
6. **`skill_catalog_changed` 广播范围**：session-scoped 还是全局（装后所有 session 是否都刷新）—— 需读 index.ts 确认。
7. **执行信任模型**（§7.2）：产品决策，UI 确认/权限设计。

## 10. 来源

**强**：
- 实测 curl `https://skills.sh/api/search`（2026-07-17，本机）。
- `~/repos/hapi/cli/src/modules/common/skills.ts`（flavor → 目录映射）。
- agents-remote 本地源码：`api/src/claude2-slash-commands.ts`、`api/src/claude2-runtime.ts`、`api/src/project-paths.ts`、`web/src/components/markdown/`、`web/src/components/files/file-preview-panel.tsx`。
- deepwiki `vercel-labs/skills`（CLI 源码索引：`src/agents.ts`、`src/find.ts`、`src/source-parser.ts`、`src/installer.ts`、`src/skill-lock.ts`、`src/blob.ts`、`src/git.ts`）。
- cc-switch 官方 `README` / `package.json` / `CHANGELOG` + deepwiki `farion1231/cc-switch` §7（源码级）。

**弱**：skillsllm.com（cc-switch 星数量级）、Reddit r/ClaudeCode（skill 品类共性痛点：难组织、路径断裂静默失效）。
