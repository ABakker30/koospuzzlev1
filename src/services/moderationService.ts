// moderationService — client layer over migration 20260805_moderation.sql
// (the contract): public.moderation_blocklist, contains_disallowed_text(),
// content/rate-limit triggers, and public.reports.
//
// Enforcement is DB-side (triggers) — everything here is UX polish: instant
// inline feedback before a write, friendly mapping of trigger rejections, and
// the report flow. Anton runs migrations by hand, so every read degrades
// gracefully pre-migration: public reads return [] (checks pass through,
// features friendly-fail), admin reads surface `missingTable` so the cards
// can show a "run the migration" note. Nothing here throws at callers.

import { supabase } from '../lib/supabase';

// ---------------------------------------------------------------------------
// Blocklist (public read, cached)
// ---------------------------------------------------------------------------

const BLOCKLIST_TTL_MS = 10 * 60_000;
const BLOCKLIST_SS_KEY = 'moderation.blocklist.v1';

let blocklistCache: string[] | null = null;
let blocklistFetchedAt = 0;

/** Lowercased blocklist words for client pre-checks. Cached in-module and in
 *  sessionStorage (10 min TTL). [] on any error (pre-migration → all client
 *  checks pass through; the trigger stays the enforcement). */
export async function fetchBlocklist(): Promise<string[]> {
  const now = Date.now();
  if (blocklistCache && now - blocklistFetchedAt < BLOCKLIST_TTL_MS) return blocklistCache;
  // sessionStorage survives module reloads within the tab.
  try {
    const raw = sessionStorage.getItem(BLOCKLIST_SS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed?.words) && now - Number(parsed.at ?? 0) < BLOCKLIST_TTL_MS) {
        const words: string[] = parsed.words.map((w: unknown) => String(w));
        blocklistCache = words;
        blocklistFetchedAt = Number(parsed.at);
        return words;
      }
    }
  } catch {
    /* sessionStorage unavailable — module cache still works */
  }
  try {
    const { data, error } = await supabase
      .from('moderation_blocklist')
      .select('word')
      .limit(2000);
    if (error || !data) return blocklistCache ?? [];
    const words: string[] = (data as any[])
      .map((r) => String(r.word ?? '').toLowerCase().trim())
      .filter(Boolean);
    blocklistCache = words;
    blocklistFetchedAt = now;
    try {
      sessionStorage.setItem(BLOCKLIST_SS_KEY, JSON.stringify({ words, at: now }));
    } catch {
      /* ignore */
    }
    return words;
  } catch {
    return blocklistCache ?? [];
  }
}

/** Admin writes change the list — drop caches so pre-checks pick it up. */
export function invalidateBlocklistCache(): void {
  blocklistCache = null;
  blocklistFetchedAt = 0;
  try {
    sessionStorage.removeItem(BLOCKLIST_SS_KEY);
  } catch {
    /* ignore */
  }
}

// ---------------------------------------------------------------------------
// Client mirror of public.contains_disallowed_text()
// ---------------------------------------------------------------------------

// De-leet map (mirrors the SQL translate): 0→o 1→i 3→e 4→a 5→s 7→t @→a $→s !→i
const LEET: Record<string, string> = {
  '0': 'o', '1': 'i', '3': 'e', '4': 'a', '5': 's', '7': 't',
  '@': 'a', '$': 's', '!': 'i',
};

const normalizeText = (t: string): string =>
  t.toLowerCase().replace(/[013457@$!]/g, (c) => LEET[c]);

const escapeRegex = (w: string): string => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** CLIENT mirror of the SQL check — pure function of (text, blocklist).
 *  Two passes like the trigger: word-boundary regex on the normalized text,
 *  plus substring match on the text with everything non-[a-z] stripped
 *  (catches f.u.c.k spacing tricks). Instant inline feedback only — the DB
 *  trigger is the enforcement. */
export function containsDisallowedText(text: string | null | undefined, blocklist: string[]): boolean {
  if (!text || blocklist.length === 0) return false;
  const normalized = normalizeText(text);
  const squeezed = normalized.replace(/[^a-z]/g, '');
  return blocklist.some((word) => {
    if (!word) return false;
    try {
      if (new RegExp(`\\b${escapeRegex(word)}\\b`).test(normalized)) return true;
    } catch {
      /* malformed word — fall through to substring */
    }
    return squeezed.includes(word);
  });
}

/** Soft chat filter: mask tokens containing a blocked word with same-length
 *  asterisks instead of blocking the message. Pure function of (text, list). */
export function maskDisallowedText(text: string, blocklist: string[]): string {
  if (!text || blocklist.length === 0) return text;
  return text
    .split(/(\s+)/)
    .map((token) => {
      if (!token.trim()) return token;
      return containsDisallowedText(token, blocklist) ? '*'.repeat(token.length) : token;
    })
    .join('');
}

// ---------------------------------------------------------------------------
// DB trigger rejection mapping
// ---------------------------------------------------------------------------

export type ModerationErrorCode = 'disallowed_content' | 'rate_limited' | 'account_required';

/** Detects the recognizable messages raised by the 20260805 triggers inside a
 *  Supabase/Postgres error (or plain string). Null = not a moderation error. */
export function mapDbModerationError(err: unknown): ModerationErrorCode | null {
  const message =
    typeof err === 'string'
      ? err
      : String((err as any)?.message ?? (err as any)?.error_description ?? '');
  if (!message) return null;
  if (message.includes('disallowed_content')) return 'disallowed_content';
  if (message.includes('rate_limited')) return 'rate_limited';
  if (message.includes('account_required')) return 'account_required';
  return null;
}

/** Pre-migration detector: relation missing / schema-cache miss (same style
 *  as contestEngineService). */
const isMissingTable = (message: string | undefined): boolean =>
  !!message && /does not exist|schema cache|not found/i.test(message);

// ---------------------------------------------------------------------------
// Reports
// ---------------------------------------------------------------------------

export type ReportTargetType = 'puzzle' | 'solution' | 'user';
export type ReportReason = 'inappropriate' | 'spam' | 'offensive_name' | 'other';

export const REPORT_REASONS: ReportReason[] = [
  'inappropriate',
  'spam',
  'offensive_name',
  'other',
];

export type SubmitReportResult =
  | { ok: true }
  | { ok: false; code: 'rate_limited' | 'not_signed_in' | 'unavailable' | 'error' };

/** File a report as the signed-in user. Maps the report rate-limit trigger;
 *  'unavailable' = reports table missing (pre-migration). */
export async function submitReport(input: {
  targetType: ReportTargetType;
  targetId: string;
  reason: ReportReason;
  note?: string | null;
}): Promise<SubmitReportResult> {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    const reporterId = session?.user?.id;
    if (!reporterId) return { ok: false, code: 'not_signed_in' };
    const note = input.note?.trim().slice(0, 500) || null;
    const { error } = await supabase.from('reports').insert([
      {
        reporter_id: reporterId,
        target_type: input.targetType,
        target_id: input.targetId,
        reason: input.reason,
        note,
      },
    ]);
    if (error) {
      if (mapDbModerationError(error) === 'rate_limited') return { ok: false, code: 'rate_limited' };
      if (isMissingTable(error.message)) return { ok: false, code: 'unavailable' };
      return { ok: false, code: 'error' };
    }
    return { ok: true };
  } catch (e: any) {
    return { ok: false, code: isMissingTable(e?.message) ? 'unavailable' : 'error' };
  }
}

// ---------------------------------------------------------------------------
// Admin reads/writes (RLS: is_admin() only)
// ---------------------------------------------------------------------------

export interface ReportRecord {
  id: string;
  reporterId: string | null;
  targetType: ReportTargetType;
  targetId: string;
  reason: ReportReason;
  note: string | null;
  createdAt: string;
  resolvedAt: string | null;
  resolution: string | null;
}

export interface ListReportsResult {
  reports: ReportRecord[];
  /** True when the reports table doesn't exist yet (run the migration). */
  missingTable: boolean;
  error: string | null;
}

/** Admin: all reports, newest first. Surfaces the pre-migration state. */
export async function listReports(): Promise<ListReportsResult> {
  try {
    const { data, error } = await supabase
      .from('reports')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(300);
    if (error) {
      return { reports: [], missingTable: isMissingTable(error.message), error: error.message };
    }
    return {
      reports: (data as any[]).map((r) => ({
        id: r.id,
        reporterId: r.reporter_id ?? null,
        targetType: r.target_type,
        targetId: r.target_id,
        reason: r.reason,
        note: r.note ?? null,
        createdAt: r.created_at,
        resolvedAt: r.resolved_at ?? null,
        resolution: r.resolution ?? null,
      })),
      missingTable: false,
      error: null,
    };
  } catch (e: any) {
    return { reports: [], missingTable: isMissingTable(e?.message), error: e?.message ?? String(e) };
  }
}

/** Admin: mark a report resolved (optional resolution note). Error or null. */
export async function resolveReport(id: string, resolution?: string | null): Promise<string | null> {
  try {
    const { error } = await supabase
      .from('reports')
      .update({
        resolved_at: new Date().toISOString(),
        resolution: resolution?.trim().slice(0, 500) || null,
      })
      .eq('id', id);
    return error ? error.message : null;
  } catch (e: any) {
    return e?.message ?? String(e);
  }
}

export interface BlocklistAdminResult {
  words: string[];
  missingTable: boolean;
  error: string | null;
}

/** Admin: full blocklist (alphabetical) with pre-migration detection. */
export async function listBlocklistAdmin(): Promise<BlocklistAdminResult> {
  try {
    const { data, error } = await supabase
      .from('moderation_blocklist')
      .select('word')
      .order('word', { ascending: true })
      .limit(2000);
    if (error) {
      return { words: [], missingTable: isMissingTable(error.message), error: error.message };
    }
    return {
      words: (data as any[]).map((r) => String(r.word)),
      missingTable: false,
      error: null,
    };
  } catch (e: any) {
    return { words: [], missingTable: isMissingTable(e?.message), error: e?.message ?? String(e) };
  }
}

/** Admin: add a word (must already be lowercased/validated by the caller).
 *  Error string or null. */
export async function addBlocklistWord(word: string): Promise<string | null> {
  try {
    const { error } = await supabase.from('moderation_blocklist').insert([{ word }]);
    if (error) {
      // Duplicate insert = already present — treat as success.
      if (error.code === '23505') {
        invalidateBlocklistCache();
        return null;
      }
      return error.message;
    }
    invalidateBlocklistCache();
    return null;
  } catch (e: any) {
    return e?.message ?? String(e);
  }
}

/** Admin: remove a word. Error string or null. */
export async function removeBlocklistWord(word: string): Promise<string | null> {
  try {
    const { error } = await supabase.from('moderation_blocklist').delete().eq('word', word);
    if (error) return error.message;
    invalidateBlocklistCache();
    return null;
  } catch (e: any) {
    return e?.message ?? String(e);
  }
}
