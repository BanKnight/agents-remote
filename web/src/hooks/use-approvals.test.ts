// 批次 2 单源化纯函数单测：isHotTool / useApprovalCenter 的 hot 判定与批量应答语义。
// useApprovals 主体（WS 订阅/REST）属集成层，探针覆盖，此处只测纯逻辑。
import { describe, expect, test } from "bun:test";
import type { ApprovalSummary } from "@agents-remote/shared";

import { isHotTool } from "./use-approvals";

const makeSummary = (overrides: Partial<ApprovalSummary> = {}): ApprovalSummary => ({
  controlRequestId: "cr-1",
  createdAt: "2026-09-25T00:00:00Z",
  inputSummary: "ls -la",
  projectName: "demo",
  runtimeAlive: true,
  runtimeKey: "demo/s-1",
  sessionId: "s-1",
  sessionName: "demo session",
  toolName: "Bash",
  ...overrides,
});

describe("isHotTool", () => {
  test("写文件族工具恒 hot", () => {
    for (const toolName of ["Write", "Edit", "MultiEdit", "NotebookEdit"] as const) {
      expect(isHotTool(makeSummary({ toolName }))).toBe(true);
    }
  });
  test("Bash 内容启发：rm / git push hot，其余命令不 hot", () => {
    expect(isHotTool(makeSummary({ inputSummary: "rm -rf build" }))).toBe(true);
    expect(isHotTool(makeSummary({ inputSummary: "git push origin main" }))).toBe(true);
    expect(isHotTool(makeSummary({ inputSummary: "git status" }))).toBe(false);
    expect(isHotTool(makeSummary({ inputSummary: "echo hi" }))).toBe(false);
  });
  test("其他工具不 hot", () => {
    expect(isHotTool(makeSummary({ toolName: "WebFetch" }))).toBe(false);
  });
});
