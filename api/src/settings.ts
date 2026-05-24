import { dirname, isAbsolute, join } from "node:path";
import { homedir } from "node:os";
import { chmod, mkdir, readFile, rename, stat, writeFile } from "node:fs/promises";

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

export type AppConfig = {
  appPassword?: string;
  projectsRoot?: string;
  apiPort?: number;
  webPort?: number;
  webApiBaseUrl?: string;
};

export type ResolvedSettings = {
  appPassword: string;
  projectsRoot: string;
  apiPort: number;
  webPort: number;
  webApiBaseUrl: string;
  configPath: string;
};

type LoadSettingsOptions = {
  configPath?: string;
  env?: Record<string, string | undefined>;
};

const defaultConfigPath = () => join(homedir(), ".agents-remote", "config.toml");

const template = `# agents-remote personal deployment config
# Fill app_password and projects_root, then restart the api service.

app_password = ""
projects_root = ""
api_port = 3001
web_port = 3000
web_api_base_url = "/api"
`;

export const getDefaultConfigPath = defaultConfigPath;

export const loadSettings = async (
  options: LoadSettingsOptions = {},
): Promise<ResolvedSettings> => {
  const configPath = options.configPath ?? defaultConfigPath();
  const env = options.env ?? process.env;
  const source = await readConfig(configPath);
  const config = applyEnvOverrides(source, env);

  return validateConfig(config, configPath);
};

const readConfig = async (configPath: string): Promise<AppConfig> => {
  try {
    const configStat = await stat(configPath);

    if ((configStat.mode & 0o077) !== 0) {
      try {
        await chmod(configPath, 0o600);
      } catch (error) {
        throw new StartupError(
          "CONFIG_PERMISSION_UNSAFE",
          `Config file permissions are unsafe and could not be fixed: ${configPath}. ${errorMessage(error)}`,
        );
      }
    }

    return parseConfigToml(await readFile(configPath, "utf8"), configPath);
  } catch (error) {
    if (error instanceof StartupError) {
      throw error;
    }

    if (isNotFoundError(error)) {
      await createTemplate(configPath);
      throw new StartupError(
        "CONFIG_REQUIRED",
        `Created config template at ${configPath}. Fill required values and restart the api service.`,
      );
    }

    throw new StartupError(
      "CONFIG_INVALID",
      `Failed to read config file ${configPath}. ${errorMessage(error)}`,
    );
  }
};

const createTemplate = async (configPath: string) => {
  await mkdir(dirname(configPath), { recursive: true, mode: 0o700 });
  const tempPath = `${configPath}.${process.pid}.tmp`;
  await writeFile(tempPath, template, { mode: 0o600 });
  await chmod(tempPath, 0o600);
  await rename(tempPath, configPath);
};

const applyEnvOverrides = (
  config: AppConfig,
  env: Record<string, string | undefined>,
): AppConfig => ({
  appPassword: env.APP_PASSWORD ?? config.appPassword,
  projectsRoot: env.PROJECTS_ROOT ?? config.projectsRoot,
  apiPort: env.API_PORT ? parsePort(env.API_PORT, "API_PORT") : config.apiPort,
  webPort: env.WEB_PORT ? parsePort(env.WEB_PORT, "WEB_PORT") : config.webPort,
  webApiBaseUrl: env.WEB_API_BASE_URL ?? config.webApiBaseUrl,
});

const validateConfig = (config: AppConfig, configPath: string): ResolvedSettings => {
  const missing: string[] = [];

  if (!config.appPassword) {
    missing.push("app_password");
  }

  if (!config.projectsRoot) {
    missing.push("projects_root");
  }

  if (config.apiPort === undefined) {
    missing.push("api_port");
  }

  if (config.webPort === undefined) {
    missing.push("web_port");
  }

  if (!config.webApiBaseUrl) {
    missing.push("web_api_base_url");
  }

  if (missing.length > 0) {
    throw new StartupError(
      "CONFIG_REQUIRED",
      `Missing required config values in ${configPath}: ${missing.join(", ")}.`,
    );
  }

  const { appPassword, projectsRoot, apiPort, webPort, webApiBaseUrl } = config;

  if (!projectsRoot || !isAbsolute(projectsRoot)) {
    throw new StartupError(
      "CONFIG_INVALID",
      `projects_root must be an absolute path in ${configPath}: ${projectsRoot ?? ""}`,
    );
  }

  if (!appPassword || apiPort === undefined || webPort === undefined || !webApiBaseUrl) {
    throw new StartupError("CONFIG_INVALID", `Resolved config is incomplete in ${configPath}.`);
  }

  return {
    appPassword,
    projectsRoot,
    apiPort,
    webPort,
    webApiBaseUrl,
    configPath,
  };
};

const parseConfigToml = (content: string, configPath: string): AppConfig => {
  const values: Record<string, string | number> = {};

  for (const [index, rawLine] of content.split(/\r?\n/).entries()) {
    const line = rawLine.trim();

    if (!line || line.startsWith("#")) {
      continue;
    }

    const match = line.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.+)$/);

    if (!match) {
      throw new StartupError("CONFIG_INVALID", `Invalid TOML line ${index + 1} in ${configPath}.`);
    }

    values[match[1]] = parseTomlValue(match[2], configPath, index + 1);
  }

  return {
    appPassword: optionalString(values.app_password, "app_password", configPath),
    projectsRoot: optionalString(values.projects_root, "projects_root", configPath),
    apiPort: optionalPort(values.api_port, "api_port", configPath),
    webPort: optionalPort(values.web_port, "web_port", configPath),
    webApiBaseUrl: optionalString(values.web_api_base_url, "web_api_base_url", configPath),
  };
};

const parseTomlValue = (value: string, configPath: string, lineNumber: number): string | number => {
  if (value.startsWith('"') && value.endsWith('"')) {
    return value.slice(1, -1).replace(/\\"/g, '"').replace(/\\n/g, "\n");
  }

  if (/^\d+$/.test(value)) {
    return Number(value);
  }

  throw new StartupError(
    "CONFIG_INVALID",
    `Unsupported TOML value at ${configPath}:${lineNumber}.`,
  );
};

const optionalString = (value: string | number | undefined, field: string, configPath: string) => {
  if (value === undefined) {
    return undefined;
  }

  if (typeof value !== "string") {
    throw new StartupError("CONFIG_INVALID", `${field} must be a string in ${configPath}.`);
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
};

const optionalPort = (value: string | number | undefined, field: string, configPath: string) => {
  if (value === undefined) {
    return undefined;
  }

  if (typeof value !== "number") {
    throw new StartupError("CONFIG_INVALID", `${field} must be a number in ${configPath}.`);
  }

  return validatePort(value, field);
};

const parsePort = (value: string, field: string) => {
  if (!/^\d+$/.test(value)) {
    throw new StartupError("CONFIG_INVALID", `${field} must be a valid port number.`);
  }

  return validatePort(Number(value), field);
};

const validatePort = (value: number, field: string) => {
  if (!Number.isInteger(value) || value < 1 || value > 65535) {
    throw new StartupError("CONFIG_INVALID", `${field} must be between 1 and 65535.`);
  }

  return value;
};

const isNotFoundError = (error: unknown) =>
  typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT";

const errorMessage = (error: unknown) => (error instanceof Error ? error.message : String(error));
