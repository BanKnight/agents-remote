type JsonObject = { [key: string]: JsonValue };
type JsonValue = null | boolean | number | string | JsonValue[] | JsonObject;

type HookCommand = {
  type: string;
  command?: string;
  [key: string]: JsonValue | undefined;
};

type HookMatcher = {
  matcher?: string;
  hooks: HookCommand[];
  [key: string]: JsonValue | undefined;
};

type Options = {
  target?: string;
  template?: string;
  mode: "missing-only";
  dryRun: boolean;
  write: boolean;
  help: boolean;
};

type MergeStats = {
  eventsAdded: number;
  matchersAdded: number;
  hooksAdded: number;
};

const options = parseArgs(Bun.argv.slice(2));

if (options.help) {
  printUsage();
  process.exit(0);
}

try {
  validateOptions(options);

  const targetPath = options.target!;
  const templatePath = options.template!;
  const template = await readRequiredJsonObject(templatePath, "template");
  const target = await readTargetJsonObject(targetPath);
  const templateHooks = getHooksObject(template, "template");
  const original = JSON.stringify(target);
  const stats = mergeHooks(target, templateHooks);
  const changed = JSON.stringify(target) !== original;

  printSummary(changed, stats, options.dryRun);

  if (options.write && changed) {
    await Bun.write(targetPath, `${JSON.stringify(target, null, 2)}\n`);
  }

  if (options.dryRun && changed) {
    process.exit(1);
  }
} catch (error) {
  console.error(`[merge-hook-settings] ${(error as Error).message}`);
  process.exit(1);
}

function parseArgs(args: string[]): Options {
  const options: Options = {
    mode: "missing-only",
    dryRun: false,
    write: false,
    help: false,
  };

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];

    if (arg === "--help" || arg === "-h") {
      options.help = true;
    } else if (arg === "--target") {
      options.target = readOptionValue(args, ++index, arg);
    } else if (arg === "--template") {
      options.template = readOptionValue(args, ++index, arg);
    } else if (arg === "--mode") {
      const mode = readOptionValue(args, ++index, arg);
      if (mode !== "missing-only") {
        throw new Error(`Unsupported --mode "${mode}". Supported mode: missing-only.`);
      }
      options.mode = mode;
    } else if (arg === "--dry-run") {
      options.dryRun = true;
    } else if (arg === "--write") {
      options.write = true;
    } else {
      throw new Error(`Unknown option: ${arg}`);
    }
  }

  return options;
}

function readOptionValue(args: string[], index: number, option: string): string {
  const value = args[index];
  if (!value || value.startsWith("--")) {
    throw new Error(`Missing value for ${option}.`);
  }
  return value;
}

function validateOptions(options: Options): void {
  if (!options.target) {
    throw new Error("Missing required --target <path>.");
  }

  if (!options.template) {
    throw new Error("Missing required --template <path>.");
  }

  if (options.write === options.dryRun) {
    throw new Error("Pass exactly one of --write or --dry-run.");
  }

  if (options.target.endsWith("settings.local.json")) {
    throw new Error("Refusing to read or write .claude/settings.local.json. Use project .claude/settings.json instead.");
  }
}

async function readRequiredJsonObject(path: string, label: string): Promise<JsonObject> {
  let text: string;

  try {
    text = await Bun.file(path).text();
  } catch (error) {
    throw new Error(`Could not read ${label} JSON at ${path}: ${(error as Error).message}`);
  }

  return parseJsonObject(text, path, label);
}

async function readTargetJsonObject(path: string): Promise<JsonObject> {
  const file = Bun.file(path);

  if (!(await file.exists())) {
    return {};
  }

  const text = await file.text();
  return parseJsonObject(text, path, "target");
}

function parseJsonObject(text: string, path: string, label: string): JsonObject {
  let parsed: JsonValue;

  try {
    parsed = JSON.parse(text) as JsonValue;
  } catch (error) {
    throw new Error(`Invalid ${label} JSON at ${path}: ${(error as Error).message}`);
  }

  if (!isObject(parsed)) {
    throw new Error(`${label} JSON at ${path} must be an object.`);
  }

  return parsed;
}

function getHooksObject(settings: JsonObject, label: string): JsonObject {
  const hooks = settings.hooks;

  if (hooks === undefined && label === "target") {
    const created: JsonObject = {};
    settings.hooks = created;
    return created;
  }

  if (!isObject(hooks)) {
    throw new Error(`${label}.hooks must be an object.`);
  }

  return hooks;
}

function mergeHooks(targetSettings: JsonObject, templateHooks: JsonObject): MergeStats {
  const targetHooks = getHooksObject(targetSettings, "target");
  const stats: MergeStats = {
    eventsAdded: 0,
    matchersAdded: 0,
    hooksAdded: 0,
  };

  for (const [eventName, templateEventValue] of Object.entries(templateHooks)) {
    const templateEvent = asHookMatcherArray(templateEventValue, `template.hooks.${eventName}`);
    const targetEventValue = targetHooks[eventName];

    if (targetEventValue === undefined) {
      targetHooks[eventName] = clone(templateEvent);
      stats.eventsAdded += 1;
      continue;
    }

    const targetEvent = asHookMatcherArray(targetEventValue, `target.hooks.${eventName}`);
    mergeEvent(targetEvent, templateEvent, eventName, stats);
  }

  return stats;
}

function mergeEvent(targetEvent: HookMatcher[], templateEvent: HookMatcher[], eventName: string, stats: MergeStats): void {
  for (const templateMatcher of templateEvent) {
    const matcher = templateMatcher.matcher ?? "";
    const targetMatcher = targetEvent.find((candidate) => (candidate.matcher ?? "") === matcher);

    if (!targetMatcher) {
      targetEvent.push(clone(templateMatcher));
      stats.matchersAdded += 1;
      continue;
    }

    const existingHookIdentities = new Set(targetMatcher.hooks.map(hookIdentity));

    for (const templateHook of templateMatcher.hooks) {
      const identity = hookIdentity(templateHook);
      if (!existingHookIdentities.has(identity)) {
        targetMatcher.hooks.push(clone(templateHook));
        existingHookIdentities.add(identity);
        stats.hooksAdded += 1;
      }
    }
  }

  validateHookMatcherArray(targetEvent, `target.hooks.${eventName}`);
}

function asHookMatcherArray(value: JsonValue, path: string): HookMatcher[] {
  if (!Array.isArray(value)) {
    throw new Error(`${path} must be an array.`);
  }

  validateHookMatcherArray(value, path);
  return value;
}

function validateHookMatcherArray(value: JsonValue[], path: string): asserts value is HookMatcher[] {
  for (let index = 0; index < value.length; index += 1) {
    const matcher = value[index];
    const matcherPath = `${path}[${index}]`;

    if (!isObject(matcher)) {
      throw new Error(`${matcherPath} must be an object.`);
    }

    if (matcher.matcher !== undefined && typeof matcher.matcher !== "string") {
      throw new Error(`${matcherPath}.matcher must be a string when present.`);
    }

    if (!Array.isArray(matcher.hooks)) {
      throw new Error(`${matcherPath}.hooks must be an array.`);
    }

    for (let hookIndex = 0; hookIndex < matcher.hooks.length; hookIndex += 1) {
      const hook = matcher.hooks[hookIndex];
      const hookPath = `${matcherPath}.hooks[${hookIndex}]`;

      if (!isObject(hook)) {
        throw new Error(`${hookPath} must be an object.`);
      }

      if (typeof hook.type !== "string") {
        throw new Error(`${hookPath}.type must be a string.`);
      }

      if (hook.command !== undefined && typeof hook.command !== "string") {
        throw new Error(`${hookPath}.command must be a string when present.`);
      }
    }
  }
}

function hookIdentity(hook: HookCommand): string {
  return `${hook.type}|${hook.command ?? ""}`;
}

function isObject(value: JsonValue | undefined): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function clone<T extends JsonValue>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function printSummary(changed: boolean, stats: MergeStats, dryRun: boolean): void {
  const action = dryRun ? (changed ? "would update" : "unchanged") : changed ? "updated" : "unchanged";
  console.log(`[merge-hook-settings] ${action}`);
  console.log(`- events added: ${stats.eventsAdded}`);
  console.log(`- matchers added: ${stats.matchersAdded}`);
  console.log(`- hook commands added: ${stats.hooksAdded}`);
}

function printUsage(): void {
  console.log(`Usage:
  bun .claude/scripts/merge-hook-settings.ts --target .claude/settings.json --template <settings-template.json> --write
  bun .claude/scripts/merge-hook-settings.ts --target .claude/settings.json --template <settings-template.json> --dry-run

Options:
  --target <path>       Target project .claude/settings.json
  --template <path>     Template settings.json containing hooks
  --mode missing-only   Add only missing hook config (default)
  --write               Write merged settings
  --dry-run             Report whether changes would be made without writing
  --help                Show this help
`);
}
