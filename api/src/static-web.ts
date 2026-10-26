// 静态 web 产物 serve（2026-10-27 部署形态批）：WEB_DIST_DIR 指向 web/dist 时，api
// 直接承载 SPA 壳 + 静态资源，单进程单端口成为完整站点入口——docker/systemd 部署
// 只需管一个进程，vite preview（开发工具，官方明示非生产用）从生产链路退役。
// 未设 WEB_DIST_DIR 时完全关闭：dev 形态（ar-dev tmux + vite preview/HMR）零影响。
//
// 语义对齐 vite preview 时代的两条链路：
// - 静态壳公开（页面壳不含数据；数据全部在鉴权后的 /api/* 后面），因此静态面不接
//   requireHttpAuth——与 vite preview 行为一致；
// - /p/{project}{path} 短路径 rewrite 在 fetch handler 顶部完成（index.ts），本模块
//   只兜真正的静态面。
//
// 缓存策略：/assets/*（文件名含内容 hash）→ immutable 长缓存；index.html / sw.js /
// manifest 等入口 → no-cache（PWA service worker autoUpdate 依赖每次校验，见
// web/src/main.tsx registerSW）。不做 ETag/304：no-cache 下的全量重拉对 KB 级入口
// 文件足够，assets 走 immutable 不需要 revalidate。

import { realpath, stat } from "node:fs/promises";
import { resolve } from "node:path";

/** 静态资源根目录的解析结果：undefined = 关闭（未配置/目录不存在）。 */
export const resolveWebDistDir = async (
  env: Record<string, string | undefined> = process.env,
): Promise<string | undefined> => {
  const dir = env.WEB_DIST_DIR?.trim();
  if (!dir) return undefined;
  try {
    if ((await stat(dir)).isDirectory()) return dir;
  } catch {
    // fall through：目录不存在/不可达，仅降级不 crash（静态是增强能力）。
  }
  console.warn(
    `[static-web] WEB_DIST_DIR is not an accessible directory, static serving disabled: ${dir}`,
  );
  return undefined;
};

export type StaticWebHandler = (
  pathname: string,
  request: Request,
) => Promise<Response | undefined>;

const notFound = () => new Response(null, { status: 404 });

/** URL 路径末段含扩展名（坏 asset 链接显式 404，不被 SPA fallback 吞掉）。 */
const hasFileExtension = (pathname: string): boolean => {
  const last = pathname.split("/").pop() ?? "";
  return last.includes(".");
};

/** immutable 长缓存面：/assets/ 下 vite 产物（文件名带内容 hash）。 */
const isHashedAsset = (pathname: string): boolean => pathname.startsWith("/assets/");

const CACHE_IMMUTABLE = "public, max-age=31536000, immutable";
const CACHE_NO_CACHE = "no-cache";

/**
 * 生产静态 serve。pathname 是 URL 原始形态（保留 %XX 编码，与 new URL().pathname
 * 一致）；decode 在本模块内做——文件系统路径需要解码后的形态。返回 undefined =
 * 未命中（method 非 GET/HEAD，交回调用方走原管道）。
 */
export const createStaticWebHandler = (distDir: string): StaticWebHandler => {
  // root 与 realRoot 在工厂创建时各算一次：realRoot 是 realpath 语义的边界真值
  //（distDir 本身可能经 symlink 到达），后续所有命中校验都以它为界。
  const root = resolve(distDir);
  // 拒绝兜底 undefined：运行期 dist 被删时不让工厂期的 promise 变 unhandled
  // rejection、也不让后续请求 500——realRoot 为 undefined 走 fail-closed 404。
  const realRootPromise = realpath(root).catch(() => undefined);

  const serveFile = (fsPath: string, pathname: string, request: Request): Response | undefined => {
    // fsPath 的存在性与 realpath 边界由调用侧保证；Bun.file 按扩展名自动带 Content-Type。
    const file = Bun.file(fsPath);
    const headers: Record<string, string> = {
      "Cache-Control": isHashedAsset(pathname) ? CACHE_IMMUTABLE : CACHE_NO_CACHE,
    };
    // HEAD 与 GET 头对称（缓存代理语义）：body 置 null，但保留 Content-Type/Length。
    if (request.method === "HEAD") {
      return new Response(null, {
        status: 200,
        headers: { ...headers, "Content-Type": file.type, "Content-Length": String(file.size) },
      });
    }
    return new Response(file, { status: 200, headers });
  };

  return async (pathname, request) => {
    if (request.method !== "GET" && request.method !== "HEAD") return undefined;
    if (pathname.startsWith("/api/")) return undefined; // 防御：/api 面绝不进静态兜底

    let decoded: string;
    try {
      decoded = decodeURIComponent(pathname);
    } catch {
      return notFound();
    }
    if (decoded.includes("\0")) return notFound();
    const segments = decoded.split("/");
    if (segments.some((segment) => segment === ".." || segment === ".")) return notFound();

    const realRoot = await realRootPromise;

    // serveIfInside：realpath 后校验仍在 dist 内（拦截指向 dist 外的 symlink——stat/
    // resolve 都是词法操作，拦不住真实指向；对齐 project-pages resolveServePath 的
    // isInsideOrSelf realpath 双校验思路）。
    const serveIfInside = async (fsPath: string): Promise<Response | undefined> => {
      let real: string;
      try {
        real = await realpath(fsPath);
      } catch {
        return undefined;
      }
      if (!realRoot || (real !== realRoot && !real.startsWith(`${realRoot}/`))) return notFound();
      return serveFile(fsPath, pathname, request);
    };

    const requestPath = resolve(root, `.${decoded === "/" ? "" : decoded}`);
    // target 解析三态：命中文件 / 目录的 index.html / SPA fallback 的 index.html。
    let target: string;
    try {
      const s = await stat(requestPath);
      // 文件命中直接复用 stat 结果（热路径少一次 syscall）；仅目录→index.html
      // 分支（target 变了）才需要补 stat 验 index 存在。
      target = s.isDirectory() ? resolve(requestPath, "index.html") : requestPath;
    } catch {
      // 未命中：无扩展名 → SPA fallback；有扩展名 → 404（不吞坏 asset 链接）。
      if (hasFileExtension(pathname)) return notFound();
      target = resolve(root, "index.html");
    }
    // 统一收口：目录缺 index.html / dist 缺 fallback index.html → 404（目录列表关）。
    // 文件命中分支 target === requestPath，已由上方 stat 确认存在，不重复 stat。
    if (target !== requestPath) {
      try {
        await stat(target);
      } catch {
        return notFound();
      }
    }
    return (await serveIfInside(target)) ?? notFound();
  };
};
