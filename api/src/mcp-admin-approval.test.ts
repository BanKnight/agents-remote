import { describe, expect, it, mock } from "bun:test";
import { MCP_ADMIN_PROVIDER } from "@agents-remote/shared";
import type { ApprovalCenter, ApprovalTransportHooks } from "./approval-center";
import { MCP_ADMIN_REQUEST_PREFIX, McpAdminApprovalService } from "./mcp-admin-approval";
import type { ApprovalRecord } from "./approval-registry";

// McpAdminApprovalService 单测：stub ApprovalCenter（registry/registerFromTransport/
// registerTransport 三 mock），真 timer 走小值 timeoutMs。五分支：allow/deny/timeout/
// settle 幂等/dispose。

/** 组一个 stub ApprovalCenter：抓 transport hooks 与登记 record，registry.unregister mock。 */
const stubCenter = () => {
  const hooks: { current: ApprovalTransportHooks | null } = { current: null };
  const records: ApprovalRecord[] = [];
  const unregisterMock = mock((_runtimeKey: string, _requestId: string) => true);
  const center = {
    registry: { unregister: unregisterMock, hasRuntime: () => false },
    registerFromTransport: mock((record: ApprovalRecord) => {
      records.push(record);
    }),
    registerTransport: mock((_provider: string, h: ApprovalTransportHooks) => {
      hooks.current = h;
    }),
  } as unknown as ApprovalCenter;
  return { center, hooks, records, unregisterMock };
};

/** 标准 requestApproval 入参。 */
const request = () => ({
  origin: { projectName: "p1", sessionId: "s1", runtimeKey: "rk1" },
  toolName: "project_delete",
  input: { project: "target" },
});

describe("McpAdminApprovalService", () => {
  it("attach registers transport under the mcp-admin provider key", () => {
    const { center, hooks, unregisterMock } = stubCenter();
    const service = new McpAdminApprovalService(center);
    const listAlive = async () => new Set<string>();
    service.attach(listAlive);
    const registerTransport = (
      center as unknown as {
        registerTransport: { mock: { calls: [string, ApprovalTransportHooks][] } };
      }
    ).registerTransport;
    expect(registerTransport.mock.calls[0]?.[0]).toBe(MCP_ADMIN_PROVIDER);
    expect(hooks.current?.listAliveRuntimeKeys).toBe(listAlive);
    expect(unregisterMock).not.toHaveBeenCalled();
  });

  it("requestApproval registers a card with provider/prefix/origin fields", async () => {
    const { center, records } = stubCenter();
    const service = new McpAdminApprovalService(center);
    const pending = service.requestApproval(request());
    service.dispose();
    await pending;
    expect(records).toHaveLength(1);
    const record = records[0]!;
    expect(record.provider).toBe(MCP_ADMIN_PROVIDER);
    expect(record.controlRequestId.startsWith(MCP_ADMIN_REQUEST_PREFIX)).toBe(true);
    expect(record.runtimeKey).toBe("rk1");
    expect(record.projectName).toBe("p1");
    expect(record.sessionId).toBe("s1");
    expect(record.toolName).toBe("project_delete");
  });

  it("resolve allow via transport deliverResponse hook", async () => {
    const { center, hooks, records } = stubCenter();
    const service = new McpAdminApprovalService(center);
    service.attach(async () => new Set<string>());
    const pending = service.requestApproval(request());
    const decision = await hooks.current!.deliverResponse(records[0]!, "allow").then(() => pending);
    expect(decision).toBe("allow");
    // settle 后 pending 已清：dispose 不再二次 resolve（幂等路径走空）。
    expect(() => service.dispose()).not.toThrow();
  });

  it("resolve deny via transport deliverResponse hook", async () => {
    const { center, hooks, records } = stubCenter();
    const service = new McpAdminApprovalService(center);
    service.attach(async () => new Set<string>());
    const pending = service.requestApproval(request());
    const decision = await hooks.current!.deliverResponse(records[0]!, "deny").then(() => pending);
    expect(decision).toBe("deny");
  });

  it("times out: resolves timeout and unregisters the card from the registry", async () => {
    const { center, records, unregisterMock } = stubCenter();
    // 注入 30ms 真 timer（禁魔数：短等待窗口常量）。
    const TIMEOUT_MS = 30;
    const service = new McpAdminApprovalService(center, TIMEOUT_MS);
    const decision = await service.requestApproval(request());
    expect(decision).toBe("timeout");
    const record = records[0]!;
    expect(unregisterMock).toHaveBeenCalledWith(record.runtimeKey, record.controlRequestId);
  });

  it("settle is idempotent: late deliverResponse after timeout resolves nothing and does not throw", async () => {
    const { center, hooks, records } = stubCenter();
    const service = new McpAdminApprovalService(center);
    service.attach(async () => new Set<string>());
    const pending = service.requestApproval(request());
    // 先 dispose 结清（pending 空），再模拟迟到应答——无 pending 命中，不炸、不改变结果。
    service.dispose();
    await pending;
    await expect(hooks.current!.deliverResponse(records[0]!, "allow")).resolves.toBeUndefined();
  });

  it("dispose settles every pending as timeout", async () => {
    const { center } = stubCenter();
    const service = new McpAdminApprovalService(center);
    const first = service.requestApproval(request());
    const second = service.requestApproval(request());
    service.dispose();
    expect(await first).toBe("timeout");
    expect(await second).toBe("timeout");
  });
});
