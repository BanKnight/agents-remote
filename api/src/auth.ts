import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

export type AuthErrorCode = "INVALID_PASSWORD" | "UNAUTHENTICATED";

export class AuthError extends Error {
  constructor(
    readonly code: AuthErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "AuthError";
  }
}

export type TokenIssue = {
  token: string;
  expiresAt: string;
};

export type TokenVerifyResult = {
  valid: boolean;
  refreshedToken?: TokenIssue;
};

type AuthServiceOptions = {
  appPassword: string;
  tokenSecret?: string;
  now?: () => Date;
  tokenTtlMs?: number;
};

const REFRESH_THRESHOLD_RATIO = 0.5;
const defaultTokenTtlMs = 30 * 24 * 60 * 60 * 1000;

export class AuthService {
  private readonly tokenSecret: string;
  private readonly now: () => Date;
  readonly tokenTtlMs: number;

  constructor(private readonly options: AuthServiceOptions) {
    this.tokenSecret = options.tokenSecret ?? randomBytes(32).toString("base64url");
    this.now = options.now ?? (() => new Date());
    this.tokenTtlMs = options.tokenTtlMs ?? defaultTokenTtlMs;
  }

  login(password: string | undefined): TokenIssue {
    if (!password || !safeEqual(password, this.options.appPassword)) {
      throw new AuthError("INVALID_PASSWORD", "密码错误");
    }

    return this.issueToken();
  }

  verify(token: string | undefined): boolean {
    if (!token) {
      return false;
    }

    const parts = token.split(".");

    if (parts.length !== 3) {
      return false;
    }

    const [expiresAtText, nonce, signature] = parts;
    const expiresAtMs = Number(expiresAtText);

    if (!Number.isInteger(expiresAtMs) || !nonce || expiresAtMs <= this.now().getTime()) {
      return false;
    }

    const expectedSignature = this.sign(`${expiresAtText}.${nonce}`);
    return safeEqual(signature, expectedSignature);
  }

  requireToken(token: string | undefined) {
    if (!this.verify(token)) {
      throw new AuthError("UNAUTHENTICATED", "Authentication required");
    }
  }

  verifyWithRefresh(token: string | undefined): TokenVerifyResult {
    if (!this.verify(token)) {
      return { valid: false };
    }

    const token_ = token as string;
    const expiresAtMs = Number(token_.split(".")[0]);
    const issuedAtMs = expiresAtMs - this.tokenTtlMs;
    const tokenAge = this.now().getTime() - issuedAtMs;

    if (tokenAge > this.tokenTtlMs * REFRESH_THRESHOLD_RATIO) {
      return { valid: true, refreshedToken: this.issueToken() };
    }

    return { valid: true };
  }

  private issueToken(): TokenIssue {
    const expiresAtMs = this.now().getTime() + this.tokenTtlMs;
    const nonce = randomBytes(16).toString("base64url");
    const payload = `${expiresAtMs}.${nonce}`;
    const signature = this.sign(payload);

    return {
      token: `${payload}.${signature}`,
      expiresAt: new Date(expiresAtMs).toISOString(),
    };
  }

  private sign(payload: string) {
    return createHmac("sha256", this.tokenSecret).update(payload).digest("base64url");
  }
}

const safeEqual = (actual: string, expected: string) => {
  const actualBuffer = Buffer.from(actual);
  const expectedBuffer = Buffer.from(expected);

  if (actualBuffer.length !== expectedBuffer.length) {
    return false;
  }

  return timingSafeEqual(actualBuffer, expectedBuffer);
};
