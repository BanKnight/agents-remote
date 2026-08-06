import { expect, test } from "bun:test";
import { AuthService } from "./auth";
import { extractAuthTokens, handleAuthMe, handleLogin, requireHttpAuth } from "./http-auth";

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
  // cookie Path=/ 覆盖全站,让 pages 对外 URL /p/... 也带 cookie(token 根鉴权)
  expect(response.headers.get("set-cookie")).toContain("Path=/");
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

test("extractAuthTokens collects bearer, cookie, and query", () => {
  expect(
    extractAuthTokens(
      new Request("http://localhost/api", { headers: { authorization: "Bearer header" } }),
    ),
  ).toEqual(["header"]);
  expect(
    extractAuthTokens(
      new Request("http://localhost/api", {
        headers: { cookie: "foo=bar; agents_remote_token=cookie" },
      }),
    ),
  ).toEqual(["cookie"]);
  expect(extractAuthTokens(new Request("http://localhost/api?token=query"))).toEqual(["query"]);
});

// 回归守护：同名 cookie 可因不同 Path 并存（RFC 6265）。服务端必须全部收集——
// 否则更长 Path 的旧/失效 cookie 会遮蔽有效 cookie（iOS Edge 重启后登录停留密码页的真根因）。
test("extractAuthTokens collects every same-name cookie", () => {
  const tokens = extractAuthTokens(
    new Request("http://localhost/api", {
      headers: { cookie: "agents_remote_token=A; agents_remote_token=B; other=x" },
    }),
  );
  expect(tokens).toEqual(["A", "B"]);
});

// 回归守护：旧失效 cookie（用旧 secret 签）排在前、有效 cookie 排在后时，
// requireHttpAuth 仍认证通过——逐个验证取首个有效，不被旧 cookie 遮蔽。
test("requireHttpAuth authenticates when a stale cookie shadows a valid one", () => {
  const auth = makeAuth();
  const valid = auth.login("secret").token;
  const stale = new AuthService({ appPassword: "secret", tokenSecret: "other-secret" }).login(
    "secret",
  ).token;

  const result = requireHttpAuth(
    new Request("http://localhost/api/projects", {
      // RFC 6265：更长 Path 的 cookie 先发 → 旧 cookie 排在前。
      headers: { cookie: `agents_remote_token=${stale}; agents_remote_token=${valid}` },
    }),
    auth,
  );

  expect(result.status).toBe("authenticated");
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
