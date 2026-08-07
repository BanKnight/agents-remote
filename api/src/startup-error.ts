export type StartupErrorCode =
  | "CONFIG_REQUIRED"
  | "CONFIG_INVALID"
  | "CONFIG_PERMISSION_UNSAFE"
  | "RUNTIME_DIR_UNAVAILABLE";

export class StartupError extends Error {
  constructor(
    readonly code: StartupErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "StartupError";
  }
}
