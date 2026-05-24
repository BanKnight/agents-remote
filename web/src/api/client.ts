import type {
  CreateProjectRequest,
  CreateProjectResponse,
  HealthResponse,
  ProjectDetailResponse,
  ProjectListResponse,
} from "@agents-remote/shared";

export async function getApiHealth(): Promise<HealthResponse> {
  const response = await fetch("/api/health");

  if (!response.ok) {
    throw new Error(`Health check failed: ${response.status}`);
  }

  return response.json();
}

export async function listProjects(): Promise<ProjectListResponse> {
  return fetchJson("/api/projects", "Project list failed");
}

export async function createProject(path: string): Promise<CreateProjectResponse> {
  return fetchJson("/api/projects", "Project creation failed", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ path } satisfies CreateProjectRequest),
  });
}

export async function getProject(projectName: string): Promise<ProjectDetailResponse> {
  return fetchJson(`/api/projects/${encodeURIComponent(projectName)}`, "Project detail failed");
}

export function createEchoSocket() {
  const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
  return new WebSocket(`${protocol}//${window.location.host}/api/ws/echo`);
}

const fetchJson = async <T>(
  url: string,
  failureMessage: string,
  init?: RequestInit,
): Promise<T> => {
  const response = await fetch(url, init);

  if (!response.ok) {
    throw new Error(`${failureMessage}: ${response.status}`);
  }

  return response.json();
};
