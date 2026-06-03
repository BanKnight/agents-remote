import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { homedir } from "node:os";
import { StartupError } from "./settings";

export type RuntimePaths = {
  runDir: string;
};

type ResolveRuntimePathsOptions = {
  env?: Record<string, string | undefined>;
};

const defaultRunDir = (env: Record<string, string | undefined> = process.env) => {
  const xdg = env.XDG_RUNTIME_DIR;
  if (xdg) return resolve(xdg, "agents-remote");
  return resolve(homedir(), ".local/share/agents-remote/run");
};

export const resolveRuntimePaths = (options: ResolveRuntimePathsOptions = {}): RuntimePaths => {
  const env = options.env ?? process.env;
  return {
    runDir: resolve(env.AGENTS_REMOTE_RUN_DIR ?? defaultRunDir(env)),
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
