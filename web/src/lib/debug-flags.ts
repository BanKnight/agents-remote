import { printReport } from "./perf-trace";

// Runtime debug affordances for the Claude2 session client.
//
// Three localStorage-backed switches, cached in module-level booleans so the hot
// path (every inbound/outbound socket message) is a plain boolean read — no
// localStorage access per message. All default OFF for a clean production UI:
// socket-traffic logging is perf-heavy, the (i) raw-message tooltips are a
// debugging affordance, and perf tracing is a measurement tool, not part of the
// default experience.
// See docs/runbooks/claude2-client-debugging.md for the full operations guide.
//
//   • socket logging  — OFF. Logging every ws send/recv serializes large
//                       message objects and dominates CPU on active sessions.
//   • debug button    — OFF. The (i) raw-message tooltip is a debugging affordance
//                       for inspecting protocol fields; turned on when needed.
//   • perf trace      — OFF. Times the replay pipeline (normalize/render/
//                       messageSignature/buildTurns/processBatch + E2E) to locate
//                       the long-session load bottleneck. See
//                       docs/research/claude2-replay-performance.md.
//
// Flip either at runtime from the browser console (no rebuild, no reload for
// the socket flag — it's re-read on every message):
//
//   __arDebug.socketLog(true)      // start logging ws send/recv
//   __arDebug.debugButton(true)    // show the (i) tooltips (reload to apply)
//   __arDebug.perfTrace(true)      // start timing the replay pipeline
//   __arDebug.perfReport()         // print the aggregated perf table
//
// Or persist via localStorage directly (applies on next load):
//
//   localStorage.setItem("ar-debug:socket-log", "1")
//   localStorage.setItem("ar-debug:debug-button", "1")
//   localStorage.setItem("ar-debug:perf-trace", "1")

const SOCKET_LOG_KEY = "ar-debug:socket-log";
const DEBUG_BUTTON_KEY = "ar-debug:debug-button";
const PERF_TRACE_KEY = "ar-debug:perf-trace";

function readBool(key: string, fallback: boolean): boolean {
  try {
    const v = localStorage.getItem(key);
    if (v == null) return fallback;
    return v === "1" || v.toLowerCase() === "true";
  } catch {
    return fallback;
  }
}

function writeBool(key: string, value: boolean): void {
  try {
    localStorage.setItem(key, value ? "1" : "0");
  } catch {
    // private mode / storage disabled — the in-memory cache still flips
  }
}

let socketLogEnabled = readBool(SOCKET_LOG_KEY, false);
let debugButtonEnabled = readBool(DEBUG_BUTTON_KEY, false);
let perfTraceEnabled = readBool(PERF_TRACE_KEY, false);

export function isSocketLoggingEnabled(): boolean {
  return socketLogEnabled;
}

export function setSocketLoggingEnabled(value: boolean): void {
  socketLogEnabled = value;
  writeBool(SOCKET_LOG_KEY, value);
}

export function isDebugButtonEnabled(): boolean {
  return debugButtonEnabled;
}

export function setDebugButtonEnabled(value: boolean): void {
  debugButtonEnabled = value;
  writeBool(DEBUG_BUTTON_KEY, value);
}

export function isPerfTraceEnabled(): boolean {
  return perfTraceEnabled;
}

export function setPerfTraceEnabled(value: boolean): void {
  perfTraceEnabled = value;
  writeBool(PERF_TRACE_KEY, value);
}

// Console entry point for live toggling.
declare global {
  interface Window {
    __arDebug?: {
      socketLog: typeof setSocketLoggingEnabled;
      socketLogEnabled: typeof isSocketLoggingEnabled;
      debugButton: typeof setDebugButtonEnabled;
      debugButtonEnabled: typeof isDebugButtonEnabled;
      perfTrace: typeof setPerfTraceEnabled;
      perfTraceEnabled: typeof isPerfTraceEnabled;
      perfReport: typeof printReport;
    };
  }
}

if (typeof window !== "undefined") {
  window.__arDebug = {
    socketLog: setSocketLoggingEnabled,
    socketLogEnabled: isSocketLoggingEnabled,
    debugButton: setDebugButtonEnabled,
    debugButtonEnabled: isDebugButtonEnabled,
    perfTrace: setPerfTraceEnabled,
    perfTraceEnabled: isPerfTraceEnabled,
    perfReport: printReport,
  };
}
