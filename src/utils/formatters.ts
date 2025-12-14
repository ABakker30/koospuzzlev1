// src/utils/formatters.ts

/**
 * Format milliseconds in human-friendly, compact form
 */
export function formatMs(ms?: number): string {
  if (ms == null || !isFinite(ms)) return "—";
  if (ms < 1000) return `${ms.toFixed(0)} ms`;

  const s = ms / 1000;
  if (s < 60) return `${s.toFixed(1)} s`;

  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}m ${r.toFixed(0)}s`;
}

/**
 * Format large integers with locale separators
 */
export function formatInt(n?: number): string {
  if (n == null || !isFinite(n)) return "—";
  return n.toLocaleString();
}

/**
 * Format rate (nodes/sec) with intuitive magnitude
 */
export function formatRate(nPerSec?: number): string {
  if (nPerSec == null || !isFinite(nPerSec)) return "—";
  if (nPerSec >= 1e6) return `${(nPerSec / 1e6).toFixed(2)} M/s`;
  if (nPerSec >= 1e3) return `${(nPerSec / 1e3).toFixed(1)} K/s`;
  return `${nPerSec.toFixed(0)} /s`;
}

/**
 * Format progress as "placed / total"
 */
export function formatProgress(placed?: number, total?: number): string {
  if (placed == null || total == null) return "—";
  return `${placed} / ${total}`;
}

/**
 * Format boolean as Yes/No
 */
export function formatYesNo(v?: boolean): string {
  if (v == null) return "—";
  return v ? "Yes" : "No";
}
