#!/usr/bin/env bash
# ar-dev web: serve the production build (vite preview) and rebuild on save.
#
# Why prod build for web even in local dev: the service worker's precache and
# navigateFallback only exist against the built dist, so dev-mode HMR diverges
# from production PWA behavior (splash/caching/reload issues only surface in
# prod). Serving preview makes local behave like prod. The api process still
# runs in dev (HMR/restart) for DX — see docs/runbooks/dev-services.md.
#
# Run inside the ar-dev tmux session. Binds the configured preview port
# (default 43012) and proxies /api + WS to the api dev process.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT/web"

# 1. Initial build (blocking) so preview has a dist to serve immediately.
bun run build

# 2. Rebuild on save in the background. preview reads dist per request, so
#    once the watch rebuild finishes a browser refresh picks up the new bundle
#    (the SW then autoUpdate-reloads on the new precache revision).
bun run build --watch &
BUILD_PID=$!
cleanup() { kill "$BUILD_PID" 2>/dev/null || true; }
trap cleanup EXIT INT TERM

# 3. Serve the prod build (port/host/proxy come from vite.config preview block).
exec bun run preview
