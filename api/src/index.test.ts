import { afterEach, beforeEach, expect, test } from "bun:test";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { AuthService } from "./auth";
import { createFetchHandler } from "./index";
import { ProjectService } from "./projects";
let root: string;

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "agents-remote-api-projects-"));
});

afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

const createTestHandler = () => {
  const auth = new AuthService({
    appPassword: "secret",
    tokenSecret: "test-secret",
    now: () => new Date("2026-05-24T00:00:00.000Z"),
  });

  return {
    auth,
    handler: createFetchHandler(auth, { projectService: new ProjectService(root) }),
  };
};

const authHeader = (auth: AuthService) => ({
  authorization: `Bearer ${auth.login("secret").token}`,
});

test("api smoke paths stay under /api", () => {
  expect("/api/health".startsWith("/api")).toBe(true);
  expect("/api/ws/echo".startsWith("/api")).toBe(true);
});

test("createFetchHandler keeps health public", async () => {
  const handler = createFetchHandler(
    new AuthService({ appPassword: "secret", tokenSecret: "test-secret" }),
  );
  const response = await handler(new Request("http://localhost/api/health"), {
    upgrade: () => false,
  });
  const body = await response.json();

  expect(response.status).toBe(200);
  expect(body.service).toBe("api");
});

test("createFetchHandler protects unknown api routes", async () => {
  const handler = createFetchHandler(
    new AuthService({ appPassword: "secret", tokenSecret: "test-secret" }),
  );
  const response = await handler(new Request("http://localhost/api/projects"), {
    upgrade: () => false,
  });
  const body = await response.json();

  expect(response.status).toBe(401);
  expect(body.error.code).toBe("UNAUTHENTICATED");
});

test("createFetchHandler supports login then authenticated unknown api requests", async () => {
  const auth = new AuthService({
    appPassword: "secret",
    tokenSecret: "test-secret",
    now: () => new Date("2026-05-24T00:00:00.000Z"),
  });
  const handler = createFetchHandler(auth);
  const loginResponse = await handler(
    new Request("http://localhost/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ password: "secret" }),
    }),
    { upgrade: () => false },
  );
  const loginBody = await loginResponse.json();
  const response = await handler(
    new Request("http://localhost/api/projects", {
      headers: { authorization: `Bearer ${loginBody.token}` },
    }),
    { upgrade: () => false },
  );

  expect(response.status).toBe(404);
});

test("createFetchHandler protects websocket upgrade", async () => {
  const auth = new AuthService({
    appPassword: "secret",
    tokenSecret: "test-secret",
    now: () => new Date("2026-05-24T00:00:00.000Z"),
  });
  const handler = createFetchHandler(auth);
  const blocked = await handler(new Request("http://localhost/api/ws/echo"), {
    upgrade: () => true,
  });
  const issue = auth.login("secret");
  const upgraded = await handler(new Request(`http://localhost/api/ws/echo?token=${issue.token}`), {
    upgrade: () => true,
  });

  expect(blocked?.status).toBe(401);
  expect(upgraded).toBeUndefined();
});

test("createFetchHandler lists projects for authenticated requests", async () => {
  await mkdir(join(root, "demo"));
  const { auth, handler } = createTestHandler();
  const response = await handler(
    new Request("http://localhost/api/projects", {
      headers: authHeader(auth),
    }),
    { upgrade: () => false },
  );
  const body = await response.json();

  expect(response.status).toBe(200);
  expect(body.projects).toEqual([
    {
      name: "demo",
      path: join(root, "demo"),
      agentSessionCount: 0,
      terminalSessionCount: 0,
    },
  ]);
});

test("createFetchHandler creates projects and returns details", async () => {
  const { auth, handler } = createTestHandler();
  const createResponse = await handler(
    new Request("http://localhost/api/projects", {
      method: "POST",
      headers: authHeader(auth),
      body: JSON.stringify({ path: "hello world 中文" }),
    }),
    { upgrade: () => false },
  );
  const createBody = await createResponse.json();
  const detailResponse = await handler(
    new Request("http://localhost/api/projects/hello%20world%20%E4%B8%AD%E6%96%87", {
      headers: authHeader(auth),
    }),
    { upgrade: () => false },
  );
  const detailBody = await detailResponse.json();

  expect(createResponse.status).toBe(200);
  expect(createBody.project.name).toBe("hello world 中文");
  expect(detailResponse.status).toBe(200);
  expect(detailBody.project.path).toBe(join(root, "hello world 中文"));
});

test("createFetchHandler maps project errors", async () => {
  await writeFile(join(root, "file"), "content");
  const { auth, handler } = createTestHandler();
  const missingPath = await handler(
    new Request("http://localhost/api/projects", {
      method: "POST",
      headers: authHeader(auth),
      body: JSON.stringify({}),
    }),
    { upgrade: () => false },
  );
  const fileTarget = await handler(
    new Request("http://localhost/api/projects", {
      method: "POST",
      headers: authHeader(auth),
      body: JSON.stringify({ path: "file" }),
    }),
    { upgrade: () => false },
  );
  const outsideTarget = await handler(
    new Request("http://localhost/api/projects", {
      method: "POST",
      headers: authHeader(auth),
      body: JSON.stringify({ path: join(root, "demo", "nested") }),
    }),
    { upgrade: () => false },
  );
  const missingDetail = await handler(
    new Request("http://localhost/api/projects/missing", {
      headers: authHeader(auth),
    }),
    { upgrade: () => false },
  );

  expect(missingPath.status).toBe(400);
  expect((await missingPath.json()).error.code).toBe("PROJECT_TARGET_INVALID");
  expect(fileTarget.status).toBe(400);
  expect((await fileTarget.json()).error.code).toBe("PROJECT_TARGET_INVALID");
  expect(outsideTarget.status).toBe(400);
  expect((await outsideTarget.json()).error.code).toBe("PROJECT_TARGET_INVALID");
  expect(missingDetail.status).toBe(404);
  expect((await missingDetail.json()).error.code).toBe("PROJECT_NOT_FOUND");
});
