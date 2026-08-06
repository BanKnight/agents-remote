import { AuthService } from "./auth";
import { extractAuthTokens } from "./http-auth";

export const canUpgradeWebSocket = (request: Request, auth: AuthService) =>
  extractAuthTokens(request).some((token) => auth.verify(token));
