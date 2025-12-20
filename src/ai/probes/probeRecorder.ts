import type { Probe } from "./koosStoryProbes.v1";

export type ProbeRunItem = {
  probe: Probe;
  started_at_utc: string;
  finished_at_utc: string;
  latency_ms: number;

  // What we sent (sanitized)
  request: {
    model?: string;
    messages_preview: Array<{ role: string; content_preview: string }>;
    system_chars?: number;
  };

  // What we got
  response: {
    text: string;
    error?: string;
  };
};

export type ProbeRun = {
  run_id: string;
  created_at_utc: string;
  app_version?: string;
  items: ProbeRunItem[];
};

const STORAGE_KEY = "koos_probe_runs";

function nowUtcIso() {
  return new Date().toISOString();
}

function makeRunId() {
  return `probe-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function preview(text: string, n = 220) {
  const t = (text || "").replace(/\s+/g, " ").trim();
  return t.length > n ? t.slice(0, n) + "…" : t;
}

export function createProbeRun(app_version?: string): ProbeRun {
  return {
    run_id: makeRunId(),
    created_at_utc: nowUtcIso(),
    app_version,
    items: [],
  };
}

export function addProbeItem(run: ProbeRun, item: ProbeRunItem): ProbeRun {
  run.items.push(item);
  return run;
}

export function saveProbeRun(run: ProbeRun) {
  const raw = localStorage.getItem(STORAGE_KEY);
  const runs: ProbeRun[] = raw ? JSON.parse(raw) : [];
  runs.unshift(run);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(runs));
}

export function loadProbeRuns(): ProbeRun[] {
  const raw = localStorage.getItem(STORAGE_KEY);
  return raw ? JSON.parse(raw) : [];
}

export function exportProbeRunJson(run: ProbeRun) {
  const blob = new Blob([JSON.stringify(run, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `koos-probe-run-${run.created_at_utc.replace(/[:.]/g, "-")}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

// Helpers for request preview construction (used by runner)
export function buildMessagesPreview(messages: Array<{ role: string; content: string }>) {
  return messages.map((m) => ({
    role: m.role,
    content_preview: preview(m.content),
  }));
}
