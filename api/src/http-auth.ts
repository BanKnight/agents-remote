import type {
  ApiErrorCode,
  ApiErrorResponse,
  AuthMeResponse,
  LoginRequest,
  LoginResponse,
} from "@agents-remote/shared";
import { AuthError, AuthService, type TokenIssue } from "./auth";

export const jsonError = (code: ApiErrorCode, message: string, status: number) =>
  Response.json(
    {
      error: {
        code,
        message,
      },
    } satisfies ApiErrorResponse,
    { status },
  );

export const extractBearerToken = (request: Request) => {
  const authorization = request.headers.get("authorization");

  if (authorization?.startsWith("Bearer ")) {
    return authorization.slice("Bearer ".length);
  }

  const cookie = request.headers.get("cookie");
  const tokenCookie = cookie
    ?.split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith("agents_remote_token="));

  if (tokenCookie) {
    return decodeURIComponent(tokenCookie.slice("agents_remote_token=".length));
  }

  const url = new URL(request.url);
  return url.searchParams.get("token") ?? undefined;
};

const setTokenCookie = (headers: Headers, issue: TokenIssue) => {
  headers.set(
    "Set-Cookie",
    `agents_remote_token=${encodeURIComponent(issue.token)}; HttpOnly; SameSite=Strict; Path=/api; Expires=${new Date(issue.expiresAt).toUTCString()}`,
  );
};

export type HttpAuthResult =
  | { status: "authenticated"; refreshToken?: TokenIssue }
  | { status: "unauthenticated"; response: Response };

export const requireHttpAuth = (request: Request, auth: AuthService): HttpAuthResult => {
  const token = extractBearerToken(request);
  const result = auth.verifyWithRefresh(token);

  if (!result.valid) {
    return {
      status: "unauthenticated",
      response: jsonError("UNAUTHENTICATED", "Authentication required", 401),
    };
  }

  return { status: "authenticated", refreshToken: result.refreshedToken };
};

export const applyAuthRefresh = (response: Response, refreshToken?: TokenIssue) => {
  if (!refreshToken || response.status < 200 || response.status >= 300) {
    return response;
  }

  const headers = new Headers(response.headers);
  setTokenCookie(headers, refreshToken);

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
};

export const handleLogin = async (request: Request, auth: AuthService) => {
  let body: LoginRequest;

  try {
    body = (await request.json()) as LoginRequest;
  } catch {
    body = {};
  }

  try {
    const issue = auth.login(body.password);
    const response: LoginResponse = {
      ok: true,
      token: issue.token,
      expiresAt: issue.expiresAt,
    };

    const headers = new Headers();
    setTokenCookie(headers, issue);

    return new Response(JSON.stringify(response), {
      status: 200,
      headers,
    });
  } catch (error) {
    if (error instanceof AuthError && error.code === "INVALID_PASSWORD") {
      return jsonError("INVALID_PASSWORD", "密码错误", 401);
    }

    throw error;
  }
};

export const handleAuthMe = (request: Request, auth: AuthService) => {
  const authResult = requireHttpAuth(request, auth);

  if (authResult.status === "unauthenticated") {
    return authResult.response;
  }

  const body = JSON.stringify({ authenticated: true } satisfies AuthMeResponse);
  const headers = new Headers({ "Content-Type": "application/json" });

  if (authResult.refreshToken) {
    setTokenCookie(headers, authResult.refreshToken);
  }

  return new Response(body, { status: 200, headers });
};
