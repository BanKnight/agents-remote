import { expect, test } from "bun:test";
import { AuthService } from "./auth";
import { extractBearerToken, handleAuthMe, handleLogin, requireHttpAuth } from "./http-auth";

const makeAuth = () =>
  new AuthService({
    appPassword: "secret",
    tokenSecret: "test-secret",
    now: () => new Date("2026-05-24T00:00:00.000Z"),
  });

test("handleLogin returns token for correct password", async () => {
  const response = await handleLogin(
    new Request("http://localhost/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ password: "secret" }),
    }),
    makeAuth(),
  );
  const body = await response.json();

  expect(response.status).toBe(200);
  expect(body.ok).toBe(true);
  expect(typeof body.token).toBe("string");
  expect(response.headers.get("set-cookie")).toContain("agents_remote_token=");
});

test("handleLogin rejects wrong password", async () => {
  const response = await handleLogin(
    new Request("http://localhost/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ password: "wrong" }),
    }),
    makeAuth(),
  );
  const body = await response.json();

  expect(response.status).toBe(401);
  expect(body.error.code).toBe("INVALID_PASSWORD");
});

test("requireHttpAuth accepts bearer token and rejects missing token", () => {
  const auth = makeAuth();
  const issue = auth.login("secret");
  const ok = requireHttpAuth(
    new Request("http://localhost/api/projects", {
      headers: { authorization: `Bearer ${issue.token}` },
    }),
    auth,
  );
  const failure = requireHttpAuth(new Request("http://localhost/api/projects"), auth);

  expect(ok.status).toBe("authenticated");
  expect(failure.status).toBe("unauthenticated");
  expect(failure.response.status).toBe(401);
});

test("extractBearerToken supports auth header, cookie, and query", () => {
  expect(
    extractBearerToken(
      new Request("http://localhost/api", { headers: { authorization: "Bearer header" } }),
    ),
  ).toBe("header");
  expect(
    extractBearerToken(
      new Request("http://localhost/api", {
        headers: { cookie: "foo=bar; agents_remote_token=cookie" },
      }),
    ),
  ).toBe("cookie");
  expect(extractBearerToken(new Request("http://localhost/api?token=query"))).toBe("query");
});

test("handleAuthMe returns authenticated response", async () => {
  const auth = makeAuth();
  const issue = auth.login("secret");
  const response = handleAuthMe(
    new Request("http://localhost/api/auth/me", {
      headers: { authorization: `Bearer ${issue.token}` },
    }),
    auth,
  );
  const body = await response.json();

  expect(response.status).toBe(200);
  expect(body.authenticated).toBe(true);
});
