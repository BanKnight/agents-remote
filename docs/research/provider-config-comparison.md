# Provider 配置体系对比：Continue / hapi / Claude Code 如何拆「运行时 · provider · 协议 · 模型」

> 调研动机：agents-remote 的 Claude 运行时 preset 把「运行时（哪个 agent 用、spawn 什么命令）+ provider（端点/凭证）+ 协议（anthropic vs openai-compatible）+ 模型映射（4-tier → model ID）」**全耦合在一个 preset** 里，只有 claude 一种。用户困惑「其他 agent 项目怎么拆这几层」，故对比 Continue / hapi / Claude Code 三家的 provider 配置设计，为「每个 provider 手动添加模型」「Codex 运行时支持」等未来方向提供参考。
>
> 状态：**决策未做**。仅调研沉淀，供后续设计参考。证据分级见文末。

## TL;DR（结论先行）

- **绝大多数项目不把「运行时 / provider / 协议」当三个独立概念**，而是**以模型为中心**：配置里是一份扁平 model 列表，每条 model 带 provider 属性（类型 + 默认端点 + 凭证），协议是 provider 类型在代码里的隐式选择（`anthropic` → Anthropic SDK，`openai` → OpenAI 兼容类），不是配置里的独立字段。
- **协议层的真相**：Continue 约 25 个 provider 只是 `OpenAI` 子类 + 一个默认 `baseUrl` 的数据条目（`core/llm/llms/index.ts` `LLMClasses`）。「加一个 provider」= 加一条注册表数据，而非新协议代码。
- **运行时层最分离的是 hapi**：`AgentRegistry.register(agentType, factory)` 按 agent 类型注册 backend，`create(agentType)` 按名实例化；agent flavor（claude/codex/gemini/opencode/kimi/cursor）是注册表条目、可扩展。
- **对 agents-remote「加 provider / 手动加模型」最值钱的模式**：Continue 的 **AUTODETECT 魔法值**——`model: AUTODETECT` 时 loader 调 `listModels()` 展开为每条模型一条配置。「贴 key → 刷新 → 从实时列表挑」正是「每个 provider 手动添加模型」的最佳 UX 参考。
- **不建议抄的**：Continue 的 `uses/with/override` block 注册表 + FQSN secret-store 模板解析（hub 生态机器，对 web 控制面过重）——直接 per-model 存 key 即可（咱们 preset 现在的做法）。

## 对比总表

| 维度 | Continue | hapi | Claude Code（CLI 原生） | agents-remote（现状） |
|------|----------|------|------------------------|----------------------|
| **配置载体** | config.yaml 扁平 model 列表 | CLI env + web hub 管 session，无复杂 provider UI | settings.json env 注入 + model alias | settings.yaml `runtimes.claude.presets[]` |
| **协议** | provider 类型内隐（类） | env 注入（ANTHROPIC_*） | env 注入（ANTHROPIC_BASE_URL/API_KEY） | 隐含（preset 恒 anthropic） |
| **provider** | model 属性（类型 + 默认 baseUrl + key），per-model 可覆盖 | flavor 注册表 + env | 无「provider」概念 | preset（baseUrl+key+modelMapping 耦合） |
| **运行时** | role 落桶分离（chat/autocomplete/embed/...） | AgentRegistry 注册表，flavor 可扩展 | 单 agent | 只有 claude 一个（`runtimes.claude`） |
| **模型管理** | model 列表 + AUTODETECT 自动发现 + per-role 选择 | model 随 session 元数据 | modelMapping（alias→ID） | 4-tier modelMapping，绑定 claude alias 语义 |
| **凭证** | 每条 model 带 key（env 引用或字面量） | CLI 进程 env | env | preset.apiKey（masked 出 api 进程） |

## Continue：provider = model 属性，协议 = 代码里的类

### 配置结构：扁平 model 列表

```yaml
models:
  - title: Sonnet 4.8
    provider: anthropic
    model: claude-sonnet-4-8
    apiKey: ${ANTHROPIC_KEY}
    apiBase: https://api.anthropic.com
  - title: GPT-4o（走代理）
    provider: openai
    model: gpt-4o
    apiBase: https://my-proxy.example.com   # 同 provider 可覆盖端点
```

- **协议不显式声明**：`provider: anthropic` → 走 Anthropic SDK，`provider: openai` → 走 OpenAI 兼容类。协议是 provider 类型映射到的类（`core/llm/llms/index.ts` `LLMClasses` + `llmFromProviderAndOptions`），不是用户可选的独立字段。
- **provider 级默认值 + model 级覆盖**：baseUrl/apiKey 在 model 级可配；provider 类只提供默认端点。心智模型 =「provider 是模板，model 是实例」。
- **运行时按 role 落桶**：`modelRolesSchema = ["chat","autocomplete","embed","rerank","edit","apply","summarize","subagent"]`（`packages/config-yaml/src/schemas/models.ts:23-33`）。模型按 role 分桶（`modelsByRole[role]`），每个 role 独立选模型（`core/config/selectedModels.ts:10-80`）。**「谁在用这个模型」与「这个模型连哪个端点」完全分离**。

### AUTODETECT：加 provider 的最佳 UX

```yaml
models:
  - provider: openrouter
    model: AUTODETECT     # 魔法值
```

`core/config/yaml/models.ts:10,148-222`：`model === "AUTODETECT"` 时 loader 调 `llm.listModels()`，把实时模型列表展开为每条 model 一条配置（共享 provider/apiBase/apiKey）。效果 = **贴 key → 刷新 → 从实时列表挑**，把「添加 provider」降维成「添加一条 model + 自动发现」。

### 统一发现端点

`core/llm/fetchModels.ts:241-258`：`fetchModels(provider, apiKey, apiBase)`——ollama/openrouter/anthropic/gemini 各有专有抓取，default 走 `llmFromProviderAndOptions(...).listModels()` 泛化兜底；暴露为单个 `models/fetch` RPC，GUI refresh 按钮用用户填的 key/base 重抓。**与咱们 `api/src/settings-models.ts` 的 `listProviderModels` 同构**（上游失败 → `{ok:false, error}`、超时、401/404 人性化），但 per-provider 特判 + 泛化兜底的结构更可扩展。

### 不建议抄的部分

- `uses/with/override` block 注册表 + FQSN secret-store 模板解析——是为 hub 生态（共享配置模板）设计的，对个人 web 控制面过重。
- 咱们直接 per-model 存 key（preset 现状）即可，不需要 secret-store 抽象。

## hapi：运行时 = flavor 注册表，provider 薄

hapi 是「CLI 本地跑 agent + web hub 管理 session」两段式，provider 配置基本不进 web 配置层：

- **运行时层**：`AgentFlavor`（claude/codex/gemini/opencode/kimi/cursor）+ `AgentRegistry.register(agentType, factory)`（`cli/src/agent/AgentRegistry.ts`）——**agent 类型是注册的、可扩展的**。`runAgentSession` 里 `AgentRegistry.create(opts.agentType)` 按名建 backend。
- **会话层**：`bootstrapSession({ flavor, ... })` 按 flavor 建 session（`cli/src/agent/sessionFactory.ts`），model / modelReasoningEffort 随 session 元数据（`hub/src/store/types.ts` `StoredSession.model`）。
- **凭证/端点**：CLI 进程 env（ANTHROPIC_API_KEY 等），web hub 只存 session 状态，不做复杂 provider 配置。

hapi 的三层拆法：**运行时 = flavor 注册表**（可扩展、注册式），**provider/协议 = env + CLI 预设**（不进配置 UI）。

## Claude Code：最扁平

`settings.json` 的 `env` 注入（`ANTHROPIC_BASE_URL` / `ANTHROPIC_API_KEY`）+ model alias 映射。**无「provider」概念**，协议/凭证全在 env，模型在 modelMapping。是三者中最简单的，但只服务单 provider 场景。

## 对 agents-remote 的启示

### 现状的耦合点

咱们 preset 把四层全耦合：

1. **协议没显式化**：`ProviderProtocol = "anthropic" | "openai-compatible"` 类型存在（`packages/shared/src/index.ts:348`），但 preset 不存 protocol（settings 注释明说「claude 预设恒 anthropic」）。将来接 openai-compatible provider 得改 preset 结构。
2. **运行时/provider 绑定死**：preset 挂在 `runtimes.claude` 下，codex 要复用同一 provider 得复制一份。
3. **模型是 4-tier 映射，不是模型列表**：`modelMapping: { default, opus, sonnet, haiku }` 天然绑定 claude 的 alias 语义；codex 的模型是扁平 ID 列表，塞不进 tier。

### 可借鉴的方向（决策未做，仅列出）

- **如果做「每个 provider 手动添加模型」**：Continue 的 AUTODETECT 是最佳参考——加 provider 时贴 key → 测连接 → 拉模型列表 → 手动挑/手填，落成一个可复用的 provider + 模型清单，而不是锁死在 claude 的 4-tier。
- **如果要拆协议**：Continue 的「provider 类型内隐协议」比「preset 显式存 protocol 字段」更简洁——协议是 provider 类决定的，不是用户可选的字段。但咱们 preset 没有类层级，若走这条路需引入 provider 注册表（数据驱动）。
- **如果要支持多运行时**：hapi 的 `AgentRegistry`（flavor 注册表）是可借鉴的运行时层扩展点，与 provider 层解耦。
- **协议字段去留**：之前清理掉的 `settings.protocol` 系列死 key（「决定 /v1/models 的 header、不影响 spawn」）若走「provider 类型内隐协议」路线，确实不需要用户显式选协议——印证了清理合理性。

## 证据定位

| 证据 | 位置 |
|------|------|
| roles 枚举（8 种 role） | `continue/packages/config-yaml/src/schemas/models.ts:23-33` |
| modelSchema / 默认值覆盖 | `continue/packages/config-yaml/src/schemas/models.ts:178-214` |
| AUTODETECT 魔法值 + 展开逻辑 | `continue/core/config/yaml/models.ts:10,148-222` |
| fetchModels 统一发现端点 | `continue/core/llm/fetchModels.ts:241-258` |
| role 落桶 + 按 role 选择 | `continue/core/config/selectedModels.ts:10-80` |
| LLMClasses 注册表（provider→类） | `continue/core/llm/llms/index.ts` |
| per-model apiBase 覆盖 | `continue/packages/openai-adapters/src/index.ts:37` |
| hapi AgentRegistry | `hapi/cli/src/agent/AgentRegistry.ts` |
| hapi flavor→backend 分发 | `hapi/cli/src/agent/runners/runAgentSession.ts` |
| hapi flavor→session | `hapi/cli/src/agent/sessionFactory.ts` |
| hapi StoredSession.model | `hapi/hub/src/store/types.ts:1-24` |

## 证据分级与开放问题

- 证据分级：Continue 侧为源码实证（上述文件行号）；hapi 侧为源码实证（registry/flavor/session 结构）；Claude Code 侧为已知事实（settings.json env 机制，未在本轮深挖源码）。
- 开放问题：
  1. agents-remote 是否要演进到「扁平 model 列表 + provider 属性」模型？还是保持「preset 自包含」的现状，仅扩展 tier 手填（本次已做）？
  2. 若演进，`ProviderProtocol` 是否从两档（anthropic / openai-compatible）扩展为「一组 openai-compatible + 默认 baseUrl 的数据条目」（Continue 式）？
  3. 若支持多运行时，是否引入 hapi 式 AgentRegistry（flavor 注册表），与 provider 层解耦？
- 承接：本文补充 [agent-access-options.md](./agent-access-options.md)（Agent 接入路线调研）与 [claude-cli-runtime-config.md](./claude-cli-runtime-config.md)（运行态三维度对接）的 provider 配置视角。
