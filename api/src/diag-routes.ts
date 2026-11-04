import { mkdir, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { jsonError } from "./http-auth";

// 客户端诊断日志接收（通用诊断基建批，web POST /api/diag 对端）：认证后的
// 环形缓冲整包落盘，供排障读取。挂载在 index.ts 的 requireHttpAuth 已认证段
//（push-routes 同段结构挂载，手写路由分发模式）。

const JSON_HEADERS = { "content-type": "application/json" };

// 大小护栏：客户端缓冲 24 条 × 千字节级行 + 字段开销，64KB 绰绰有余；
// 防认证后缓慢撑盘（push-routes KEY_MAX_LENGTH 同款纵深加固思路）。
const BODY_MAX_LENGTH = 64 * 1024;

// 单条字段上限（环形缓冲行远小于此，超限即拒绝而非截断——截断会伪造证据）。
const TEXT_MAX_LENGTH = 4096;
const SCOPE_MAX_LENGTH = 64;
const MAX_ENTRIES = 64;

// 落盘目录：~/.agents-remote/diag-uploads/（push-subscriptions.json 同款机器本地
// 运行时数据惯例，gitignore 的 .agents-remote/ 已覆盖）；文件名只含时间与随机数，
// 不含客户端数据（密钥不回显原则——诊断行内容只进文件，不进日志）。
const UPLOADS_DIR = join(homedir(), ".agents-remote", "diag-uploads");

type DiagEntryInput = { t: number; scope: string; text: string };

const isEntryShape = (e: unknown): e is DiagEntryInput => {
  if (typeof e !== "object" || e === null) return false;
  const o = e as Record<string, unknown>;
  return (
    typeof o.t === "number" &&
    Number.isFinite(o.t) &&
    typeof o.scope === "string" &&
    o.scope.length > 0 &&
    o.scope.length <= SCOPE_MAX_LENGTH &&
    typeof o.text === "string" &&
    o.text.length <= TEXT_MAX_LENGTH
  );
};

export const handleDiagRoutes = async (
  request: Request,
  url: URL,
  deps: { uploadsDir: string } = { uploadsDir: UPLOADS_DIR },
): Promise<Response | undefined> => {
  if (url.pathname !== "/api/diag") return undefined;
  if (request.method !== "POST") return jsonError("DIAG_METHOD", "method not allowed", 405);

  // 先读文本再按长度拒绝（chunked/gzip 无可靠 Content-Length 前置检查）。
  const raw = await request.text();
  if (raw.length > BODY_MAX_LENGTH) {
    return jsonError("DIAG_TOO_LARGE", "diag payload too large", 413);
  }

  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    return jsonError("DIAG_INVALID", "invalid json", 400);
  }
  const entries = (body as { entries?: unknown } | null)?.entries;
  if (!Array.isArray(entries) || entries.length === 0 || entries.length > MAX_ENTRIES) {
    return jsonError("DIAG_INVALID", "entries must be a non-empty array (≤64)", 400);
  }
  if (!entries.every(isEntryShape)) {
    return jsonError("DIAG_INVALID", "invalid entry shape", 400);
  }

  await mkdir(deps.uploadsDir, { recursive: true });
  const stamp = new Date().toISOString().replaceAll(":", "-");
  const rand = Math.random().toString(36).slice(2, 6);
  const file = join(deps.uploadsDir, `${stamp}-${rand}.json`);
  await writeFile(file, JSON.stringify({ entries }, null, 2), "utf8");

  // 日志只记元信息，不回显 entries 内容（诊断行可能含会话 uuid 等敏感面）。
  console.log(`[diag] uploaded entries=${entries.length} bytes=${raw.length}`);
  return new Response(JSON.stringify({ ok: true }), { headers: JSON_HEADERS });
};
