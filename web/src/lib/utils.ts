import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// Token counts render in compact K/M units (12.3K, 1.2M) — tokens routinely run
// thousands-to-millions and the compact form is far more scannable than comma
// grouping. en-US forces K/M (not 万/亿) regardless of the app locale.
const tokenCountFormatter = new Intl.NumberFormat("en-US", {
  notation: "compact",
  maximumFractionDigits: 1,
});

export function formatTokenCount(n: number): string {
  return tokenCountFormatter.format(n);
}

// Compact wall-clock duration: 340ms · 4.2s · 5m 47s · 1h 12m.
export function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
  const totalSec = Math.floor(ms / 1000);
  if (ms < 3_600_000) {
    const m = Math.floor(totalSec / 60);
    const s = totalSec % 60;
    return `${m}m ${s}s`;
  }
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  return `${h}h ${m}m`;
}
