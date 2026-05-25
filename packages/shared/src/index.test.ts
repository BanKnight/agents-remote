import { expect, test } from "bun:test";
import type {
  AgentSession,
  ApiErrorResponse,
  CloseAgentSessionResponse,
  CloseTerminalSessionResponse,
  CreateAgentSessionRequest,
  CreateAgentSessionResponse,
  CreateProjectRequest,
  CreateProjectResponse,
  CreateTerminalSessionRequest,
  CreateTerminalSessionResponse,
  HealthResponse,
  ListAgentSessionsResponse,
  ListTerminalSessionsResponse,
  ProjectDetailResponse,
  ProjectFileListResponse,
  ProjectFilePreviewResponse,
  ProjectListResponse,
  SessionStreamClientMessage,
  SessionStreamServerMessage,
  TerminalSession,
  TerminalSessionDetailResponse,
} from "./index";

test("HealthResponse marks the api service", () => {
  const response: HealthResponse = { ok: true, service: "api" };

  expect(response.service).toBe("api");
});

test("Project API DTOs describe project requests and responses", () => {
  const request: CreateProjectRequest = { path: "demo" };
  const project = {
    name: "demo",
    path: "/projects/demo",
    agentSessionCount: 0,
    terminalSessionCount: 0,
  };
  const list: ProjectListResponse = { projects: [project] };
  const created: CreateProjectResponse = { project };
  const detail: ProjectDetailResponse = { project };
  const error: ApiErrorResponse = {
    error: {
      code: "PROJECT_PATH_OUTSIDE_ROOT",
      message: "Project path must stay inside PROJECTS_ROOT",
    },
  };

  expect(request.path).toBe("demo");
  expect(list.projects[0].name).toBe("demo");
  expect(created.project.path).toBe("/projects/demo");
  expect(detail.project.agentSessionCount).toBe(0);
  expect(error.error.code).toBe("PROJECT_PATH_OUTSIDE_ROOT");
});

test("Project Files DTOs describe directory listings and preview states", () => {
  const list: ProjectFileListResponse = {
    projectName: "demo",
    path: "src",
    parentPath: "",
    entries: [
      { name: ".config", path: "src/.config", type: "directory", hidden: true, size: null },
      { name: "index.ts", path: "src/index.ts", type: "file", hidden: false, size: 120 },
    ],
  };
  const text: ProjectFilePreviewResponse = {
    type: "text",
    projectName: "demo",
    path: "README.md",
    name: "README.md",
    size: 42,
    content: "hello",
  };
  const image: ProjectFilePreviewResponse = {
    type: "image",
    projectName: "demo",
    path: "logo.png",
    name: "logo.png",
    size: 12,
    mediaType: "image/png",
    dataUrl: "data:image/png;base64,abc",
  };
  const unsupported: ProjectFilePreviewResponse = {
    type: "unsupported",
    projectName: "demo",
    path: "archive.zip",
    name: "archive.zip",
    size: 100,
    reason: "unsupported_type",
  };
  const tooLarge: ProjectFilePreviewResponse = {
    type: "too_large",
    projectName: "demo",
    path: "large.txt",
    name: "large.txt",
    size: 300_000,
    limitBytes: 262_144,
  };
  const error: ApiErrorResponse = {
    error: {
      code: "PROJECT_FILE_NOT_DIRECTORY",
      message: "Project file path must be a directory",
    },
  };

  expect(list.entries[0].hidden).toBe(true);
  expect(text.type).toBe("text");
  expect(image.mediaType).toBe("image/png");
  expect(unsupported.reason).toBe("unsupported_type");
  expect(tooLarge.limitBytes).toBe(262_144);
  expect(error.error.code).toBe("PROJECT_FILE_NOT_DIRECTORY");
});

test("Session API DTOs keep Agent and Terminal semantics separate", () => {
  const agent: AgentSession = {
    id: "agt_123",
    projectName: "demo",
    provider: "claude",
    displayName: "Claude agent 123",
    status: "idle",
  };
  const terminal: TerminalSession = {
    id: "term_123",
    projectName: "demo",
    displayName: "Terminal 123",
    status: "running",
  };
  const createAgent: CreateAgentSessionRequest = { provider: "codex" };
  const createTerminal: CreateTerminalSessionRequest = {};
  const agentList: ListAgentSessionsResponse = { sessions: [agent] };
  const terminalList: ListTerminalSessionsResponse = { sessions: [terminal] };
  const createdAgent: CreateAgentSessionResponse = { session: agent };
  const createdTerminal: CreateTerminalSessionResponse = { session: terminal };
  const closedAgent: CloseAgentSessionResponse = {
    session: { ...agent, status: "closed" },
  };
  const terminalDetail: TerminalSessionDetailResponse = { session: terminal };
  const closedTerminal: CloseTerminalSessionResponse = {
    session: { ...terminal, status: "closed" },
  };

  expect(createAgent.provider).toBe("codex");
  expect(createTerminal.displayName).toBeUndefined();
  expect(agentList.sessions[0].provider).toBe("claude");
  expect(terminalList.sessions[0].displayName).toBe("Terminal 123");
  expect(createdAgent.session.status).toBe("idle");
  expect(createdTerminal.session.status).toBe("running");
  expect(closedAgent.session.status).toBe("closed");
  expect(terminalDetail.session.projectName).toBe("demo");
  expect(closedTerminal.session.status).toBe("closed");
});

test("Session stream envelopes describe transport messages", () => {
  const input: SessionStreamClientMessage = { type: "input", data: "pwd\n" };
  const resize: SessionStreamClientMessage = { type: "resize", cols: 100, rows: 30 };
  const connected: SessionStreamServerMessage = {
    type: "connected",
    sessionId: "term_123",
    sessionType: "terminal",
    status: "running",
  };
  const snapshot: SessionStreamServerMessage = { type: "snapshot", data: "$ pwd" };
  const disconnected: SessionStreamServerMessage = { type: "status", status: "disconnected" };
  const error: SessionStreamServerMessage = {
    type: "error",
    code: "SESSION_RUNTIME_MISSING",
    message: "Session ended",
  };

  expect(input.data).toBe("pwd\n");
  expect(resize.cols).toBe(100);
  expect(connected.sessionType).toBe("terminal");
  expect(snapshot.data).toContain("pwd");
  expect(disconnected.status).toBe("disconnected");
  expect(error.code).toBe("SESSION_RUNTIME_MISSING");
});
