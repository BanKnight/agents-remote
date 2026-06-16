export type ToolExecState = "pending" | "completed" | "error" | "orphaned";

export function deriveToolState(opts: {
  result: unknown;
  isRunning: boolean;
  isError: boolean;
  isOrphaned: boolean;
}): ToolExecState {
  if (opts.isOrphaned) return "orphaned";
  if (opts.isError) return "error";
  if (opts.result != null && !opts.isRunning) return "completed";
  return "pending";
}
