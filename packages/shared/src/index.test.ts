import { expect, test } from "bun:test";
import type {
  ApiErrorResponse,
  CreateProjectRequest,
  CreateProjectResponse,
  HealthResponse,
  ProjectDetailResponse,
  ProjectListResponse,
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
