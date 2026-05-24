import { AuthService } from "./auth";
import { extractBearerToken } from "./http-auth";

export const canUpgradeWebSocket = (request: Request, auth: AuthService) =>
  auth.verify(extractBearerToken(request));
