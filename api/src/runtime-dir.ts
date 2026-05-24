import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { StartupError } from "./settings";

export type RuntimePaths = {
  runDir: string;
};

type ResolveRuntimePathsOptions = {
  env?: Record<string, string | undefined>;
};

const defaultRunDir = "/run/agents-remote";

export const resolveRuntimePaths = (options: ResolveRuntimePathsOptions = {}): RuntimePaths => {
  const env = options.env ?? process.env;
  return {
    runDir: resolve(env.AGENTS_REMOTE_RUN_DIR ?? defaultRunDir),
  };
};

export const ensureRuntimeDir = async ({ runDir }: RuntimePaths): Promise<RuntimePaths> => {
  try {
    await mkdir(runDir, { recursive: true, mode: 0o700 });
    return { runDir };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new StartupError(
      "RUNTIME_DIR_UNAVAILABLE",
      `Runtime directory is unavailable: ${runDir}. ${message}`,
    );
  }
};
