import type {
  ApiErrorCode,
  ApiErrorResponse,
  AuthMeResponse,
  LoginRequest,
  LoginResponse,
} from "@agents-remote/shared";
import { AuthError, AuthService } from "./auth";

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

export const requireHttpAuth = (request: Request, auth: AuthService) => {
  try {
    auth.requireToken(extractBearerToken(request));
    return undefined;
  } catch (error) {
    if (error instanceof AuthError && error.code === "UNAUTHENTICATED") {
      return jsonError("UNAUTHENTICATED", "Authentication required", 401);
    }

    throw error;
  }
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

    return Response.json(response, {
      headers: {
        "Set-Cookie": `agents_remote_token=${encodeURIComponent(issue.token)}; HttpOnly; SameSite=Strict; Path=/api; Expires=${new Date(issue.expiresAt).toUTCString()}`,
      },
    });
  } catch (error) {
    if (error instanceof AuthError && error.code === "INVALID_PASSWORD") {
      return jsonError("INVALID_PASSWORD", "密码错误", 401);
    }

    throw error;
  }
};

export const handleAuthMe = (request: Request, auth: AuthService) => {
  const authFailure = requireHttpAuth(request, auth);

  if (authFailure) {
    return authFailure;
  }

  return Response.json({ authenticated: true } satisfies AuthMeResponse);
};
