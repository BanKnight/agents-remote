import type {
  AuthMeResponse,
  CreateProjectRequest,
  CreateProjectResponse,
  HealthResponse,
  LoginRequest,
  LoginResponse,
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

export async function getAuthStatus(): Promise<boolean> {
  const response = await fetch("/api/auth/me");

  if (response.status === 401) {
    return false;
  }

  if (!response.ok) {
    throw new Error(`Auth check failed: ${response.status}`);
  }

  const body = (await response.json()) as AuthMeResponse;
  return body.authenticated;
}

export async function login(password: string): Promise<LoginResponse> {
  return fetchJson("/api/auth/login", "Login failed", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ password } satisfies LoginRequest),
  });
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
