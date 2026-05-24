import { expect, test } from "bun:test";
import { AuthService } from "./auth";
import { createFetchHandler } from "./index";

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

test("createFetchHandler supports login then authenticated api requests", async () => {
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
