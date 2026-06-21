export type ToolExecState = "pending" | "completed" | "error" | "interrupted";

export function deriveToolState(opts: {
  result: unknown;
  isRunning: boolean;
  isError: boolean;
  isInterrupted: boolean;
}): ToolExecState {
  if (opts.isInterrupted) return "interrupted";
  if (opts.isError) return "error";
  if (opts.result != null && !opts.isRunning) return "completed";
  return "pending";
}
