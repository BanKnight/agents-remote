import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { AgentProvider } from "@agents-remote/shared";
import { MCP_ADMIN_MANAGE_TOOLS } from "@agents-remote/shared";
import { getAgentProviderProfile } from "./agent-provider-profiles";
import type { McpAdminApprovalService } from "./mcp-admin-approval";
import type { ProjectService } from "./projects";
import type { SessionMetadata, SessionRegistry } from "./session-registry";
import { ADMIN_SESSION_READ_DEFAULT_LIMIT, readSessionTailMessages } from "./session-reader";

// ── admin capability 工具面（ar-hub）─────────────────────────────────────────
//
// 跨项目观察/管理工具。观察类免审批直达数据源；管理类每个操作先经
// McpAdminApprovalService 登记审批中心（web 卡片/PWA push/快照全自动复用），
// 用户允许后才执行，拒绝/超时返回 isError。
// 发起者身份经 hub URL `?origin=<sessionId>` 注入（无 origin = 旧客户端，管理面拒绝）。

/** 观察三工具名（web isHotTool 与测试用名单）。 */
export const MCP_ADMIN_READ_TOOLS = ["project_list", "session_list", "session_read"];

/** 管理 5 工具名单单源在 shared（web isHotTool 与 api 注册面共用）；此处 re-export 供 api 内消费。 */
export { MCP_ADMIN_MANAGE_TOOLS };

/** admin 工具面的依赖注入（index.ts 组装；测试 stub）。 */
export type McpAdminDeps = {
  projectService: ProjectService;
  sessionRegistry: SessionRegistry;
  /** terminal 会话的 capture 快照源（生产 = runtime.capture；缺省则 terminal 会话读不到）。 */
  captureRuntime?: (runtimeKey: string) => Promise<string>;
  /** 管理面的审批挂起服务（缺省 = 管理工具不可用，isError 提示未装配）。 */
  approvalService?: McpAdminApprovalService;
  /** 向活 agent 会话投递文本（index.ts 装配，跨 provider 分发；错误带 code）。 */
  sendToAgent?: (metadata: SessionMetadata, text: string) => Promise<void>;
};

/** 每请求工具上下文：发起会话身份（hub URL `?origin=` + path 的 project 段）。 */
export type McpAdminToolContext = {
  originProject?: string;
  originSessionId?: string;
};

/** 工具结果：JSON 文本。 */
const jsonResult = (payload: unknown) => ({
  content: [{ type: "text" as const, text: JSON.stringify(payload) }],
});

/**
 * 统一错误面：ProjectServiceError / SessionRegistryError 都带 ApiErrorCode code，
 * 映射 `[CODE] message` 文本（canvasErrorResponse 风格），非已知错误原样抛崩连接。
 */
const adminErrorResponse = (error: unknown) => {
  const code = (error as { code?: string })?.code;
  if (typeof code === "string" && error instanceof Error) {
    return {
      isError: true as const,
      content: [{ type: "text" as const, text: `[${code}] ${error.message}` }],
    };
  }
  throw error;
};

/**
 * 审批闸 helper：发起会话身份齐全 + 审批服务在场 + 挂起等批。任一前置不满足即返回
 * isError response（不抛）；"allow" 返回 null 进入执行段。
 */
const requestManageApproval = async (
  deps: McpAdminDeps,
  ctx: McpAdminToolContext,
  toolName: string,
  input: Record<string, unknown>,
) => {
  const { originProject, originSessionId } = ctx;
  if (!originProject || !originSessionId) {
    return {
      isError: true as const,
      content: [
        {
          type: "text" as const,
          text: `[ADMIN_ORIGIN_MISSING] Admin manage tools require the caller session identity (?origin=<sessionId>)`,
        },
      ],
    };
  }
  if (!deps.approvalService) {
    return {
      isError: true as const,
      content: [
        {
          type: "text" as const,
          text: `[ADMIN_APPROVAL_UNAVAILABLE] Admin approval service is not wired`,
        },
      ],
    };
  }
  const origin = await deps.sessionRegistry.peekMetadata(originProject, originSessionId);
  if (!origin) {
    return {
      isError: true as const,
      content: [
        {
          type: "text" as const,
          text: `[SESSION_NOT_FOUND] Origin session not found: ${originSessionId}`,
        },
      ],
    };
  }
  const decision = await deps.approvalService.requestApproval({
    origin: {
      projectName: origin.projectName,
      sessionId: origin.id,
      runtimeKey: origin.runtimeKey,
    },
    toolName,
    input,
  });
  if (decision === "allow") return null;
  return {
    isError: true as const,
    content: [
      {
        type: "text" as const,
        text:
          decision === "deny"
            ? "[ADMIN_APPROVAL_DENIED] Request denied by user"
            : "[ADMIN_APPROVAL_TIMEOUT] Request timed out waiting for approval",
      },
    ],
  };
};

/**
 * 注册 admin 工具面。观察类免审批直达数据源；管理类每 handler 第一步 =
 * requestManageApproval（origin 校验 + 审批挂起），allow 才执行真操作。
 * ctx 由 hub 每请求传入（`?origin=` + path project 段）。
 */
export const registerAdminTools = (
  server: McpServer,
  deps: McpAdminDeps,
  ctx: McpAdminToolContext = {},
): void => {
  server.registerTool(
    "project_list",
    {
      description:
        "List all managed projects with session counts. Returns { projects: [{ name, path, agentSessionCount, terminalSessionCount, gitBranch? }] }.",
    },
    async () => {
      try {
        const projects = await deps.projectService.listProjects();
        return jsonResult({ projects });
      } catch (error) {
        return adminErrorResponse(error);
      }
    },
  );

  server.registerTool(
    "session_list",
    {
      description:
        "List sessions across all projects (agent + terminal). Returns { sessions: [{ type, projectName, sessionId, displayName, status, provider?, mode?, updatedAt?, createdAt? }] }.",
    },
    async () => {
      try {
        const sessions = await deps.sessionRegistry.listAllCandidates();
        return jsonResult({ sessions });
      } catch (error) {
        return adminErrorResponse(error);
      }
    },
  );

  server.registerTool(
    "session_read",
    {
      description:
        "Read the recent conversation window of a session (user + assistant messages). Returns { project, sessionId, provider, messages: [{ role, text, ts? }], note? }.",
      inputSchema: {
        project: z.string().min(1),
        sessionId: z.string().min(1),
        limit: z.number().int().optional(),
      },
    },
    async ({ project, sessionId, limit }) => {
      const metadata = await deps.sessionRegistry.peekMetadata(project, sessionId);
      if (!metadata) {
        return {
          isError: true as const,
          content: [
            { type: "text" as const, text: `[SESSION_NOT_FOUND] No such session: ${sessionId}` },
          ],
        };
      }
      try {
        const result = await readSessionTailMessages(
          { metadata, capture: deps.captureRuntime },
          limit ?? ADMIN_SESSION_READ_DEFAULT_LIMIT,
        );
        return jsonResult({
          project,
          sessionId,
          provider: metadata.provider ?? metadata.type,
          messages: result.messages,
          ...(result.note ? { note: result.note } : {}),
        });
      } catch (error) {
        return adminErrorResponse(error);
      }
    },
  );

  // ── 管理面（全部走审批闸；v1 面 = 5 工具）─────────────────────────────────

  server.registerTool(
    "project_create",
    {
      description:
        "Create (adopt) a new managed project at the given filesystem path. Requires user approval. Returns { project }.",
      inputSchema: { path: z.string().min(1) },
    },
    async ({ path }) => {
      const gate = await requestManageApproval(deps, ctx, "project_create", { path });
      if (gate) return gate;
      try {
        const project = await deps.projectService.createProject(path);
        return jsonResult({ project });
      } catch (error) {
        return adminErrorResponse(error);
      }
    },
  );

  server.registerTool(
    "project_delete",
    {
      description:
        "Delete a managed project (closes all its sessions, removes it from management; deleteFiles=true also removes the directory from disk - destructive). Requires user approval. Returns the delete result.",
      inputSchema: {
        project: z.string().min(1),
        deleteFiles: z.boolean().optional(),
      },
    },
    async ({ project, deleteFiles }) => {
      const gate = await requestManageApproval(deps, ctx, "project_delete", {
        project,
        ...(deleteFiles !== undefined ? { deleteFiles } : {}),
      });
      if (gate) return gate;
      try {
        const result = await deps.projectService.deleteProject(project, {
          deleteFiles: deleteFiles === true,
        });
        return jsonResult({ result });
      } catch (error) {
        return adminErrorResponse(error);
      }
    },
  );

  server.registerTool(
    "session_create",
    {
      description:
        "Create a new agent session in a project. Requires user approval. Returns { session }.",
      inputSchema: {
        project: z.string().min(1),
        provider: z.string().min(1),
        displayName: z.string().optional(),
      },
    },
    async ({ project, provider, displayName }) => {
      // 参数非法（未知 provider）不弹审批卡——审批卡是给「真实操作」的授权闸，
      // 无效参数直接拒绝（与 REST 层白名单同语义）。
      const providerKey = provider as AgentProvider;
      if (!getAgentProviderProfile(providerKey)) {
        return {
          isError: true as const,
          content: [
            {
              type: "text" as const,
              text: `[SESSION_PROVIDER_UNAVAILABLE] Unknown provider: ${provider}`,
            },
          ],
        };
      }
      const gate = await requestManageApproval(deps, ctx, "session_create", {
        project,
        provider,
        ...(displayName !== undefined ? { displayName } : {}),
      });
      if (gate) return gate;
      try {
        const resolved = await deps.projectService.getProject(project);
        const session = await deps.sessionRegistry.createAgentSession({
          project: { name: resolved.name, path: resolved.path },
          provider: providerKey,
          displayName,
          permissionMode: "auto",
        });
        return jsonResult({ session });
      } catch (error) {
        return adminErrorResponse(error);
      }
    },
  );

  server.registerTool(
    "session_close",
    {
      description:
        "Close a session (agent or terminal). Requires user approval. Returns { closed: true, session }.",
      inputSchema: {
        project: z.string().min(1),
        sessionId: z.string().min(1),
      },
    },
    async ({ project, sessionId }) => {
      const gate = await requestManageApproval(deps, ctx, "session_close", { project, sessionId });
      if (gate) return gate;
      try {
        const metadata = await deps.sessionRegistry.peekMetadata(project, sessionId);
        if (!metadata) {
          return {
            isError: true as const,
            content: [
              {
                type: "text" as const,
                text: `[SESSION_NOT_FOUND] No such session: ${sessionId}`,
              },
            ],
          };
        }
        const closed =
          metadata.type === "terminal"
            ? await deps.sessionRegistry.closeTerminalSession(project, sessionId)
            : await deps.sessionRegistry.closeAgentSession(project, sessionId);
        if (!closed) {
          return {
            isError: true as const,
            content: [
              {
                type: "text" as const,
                text: `[SESSION_NOT_FOUND] No such session: ${sessionId}`,
              },
            ],
          };
        }
        return jsonResult({ closed: true, session: closed });
      } catch (error) {
        return adminErrorResponse(error);
      }
    },
  );

  server.registerTool(
    "session_send",
    {
      description:
        "Send a message (text) to a live agent session (claude/codex/omp). Requires user approval. Returns { delivered: true }. Terminal sessions are not sendable.",
      inputSchema: {
        project: z.string().min(1),
        sessionId: z.string().min(1),
        text: z.string().min(1),
      },
    },
    async ({ project, sessionId, text }) => {
      const gate = await requestManageApproval(deps, ctx, "session_send", {
        project,
        sessionId,
        text,
      });
      if (gate) return gate;
      try {
        const metadata = await deps.sessionRegistry.peekMetadata(project, sessionId);
        if (!metadata) {
          return {
            isError: true as const,
            content: [
              {
                type: "text" as const,
                text: `[SESSION_NOT_FOUND] No such session: ${sessionId}`,
              },
            ],
          };
        }
        if (!deps.sendToAgent) {
          return {
            isError: true as const,
            content: [
              {
                type: "text" as const,
                text: `[ADMIN_SEND_UNAVAILABLE] Agent send channel is not wired`,
              },
            ],
          };
        }
        await deps.sendToAgent(metadata, text);
        return jsonResult({ delivered: true });
      } catch (error) {
        return adminErrorResponse(error);
      }
    },
  );
};
