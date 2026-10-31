import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { ProjectService } from "./projects";
import type { SessionRegistry } from "./session-registry";
import { ADMIN_SESSION_READ_DEFAULT_LIMIT, readSessionTailMessages } from "./session-reader";

// ── admin capability 工具面（ar-hub）─────────────────────────────────────────
//
// 跨项目观察/管理工具。观察类免审批直达数据源；管理类（批次 2）每个操作先登记
// 审批中心（McpAdminApprovalService 挂起等用户在 web 批准），批准后才执行。
// 批次 1 只注册观察三工具；registerAdminTools 签名与 deps 类型按批次 2 全形预留。

/** 观察三工具名（web isHotTool 与测试用名单）。 */
export const MCP_ADMIN_READ_TOOLS = ["project_list", "session_list", "session_read"];

/** admin 工具面的依赖注入（index.ts 组装；测试 stub）。 */
export type McpAdminDeps = {
  projectService: ProjectService;
  sessionRegistry: SessionRegistry;
  /** terminal 会话的 capture 快照源（生产 = runtime.capture；缺省则 terminal 会话读不到）。 */
  captureRuntime?: (runtimeKey: string) => Promise<string>;
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
 * 注册 admin 工具面。观察类免审批直达数据源；管理类（批次 2）在此追加，
 * 每个管理 handler 第一步 = requestApproval 挂起等用户批准。
 */
export const registerAdminTools = (server: McpServer, deps: McpAdminDeps): void => {
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
};
