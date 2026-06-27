// Resolve user ids -> current display name (users.username), live, via the
// public_profiles view. This is the single source of truth for display names
// across leaderboards / challenges / owners — replacing the denormalized,
// go-stale copies (solver_name / creator_name), which now serve only as a
// fallback for legacy/anon rows (and until the public_profiles migration lands).

import { supabase } from '../lib/supabase';

const cache = new Map<string, string>();

/**
 * Batch-resolve user ids to usernames. Cached per session. Ids that resolve to
 * nothing (anon rows, or before the migration is applied) are simply absent
 * from the returned map — callers should fall back to a stored name.
 */
export async function getUsernames(
  ids: Array<string | null | undefined>
): Promise<Map<string, string>> {
  const wanted = [...new Set(ids.filter((x): x is string => !!x))];
  const missing = wanted.filter((id) => !cache.has(id));

  if (missing.length) {
    try {
      const { data } = await supabase
        .from('public_profiles')
        .select('id, username')
        .in('id', missing);
      (data || []).forEach((r: { id: string; username: string | null }) => {
        if (r.username) cache.set(r.id, r.username);
      });
    } catch {
      // public_profiles not available yet — callers fall back to stored names.
    }
  }

  const out = new Map<string, string>();
  wanted.forEach((id) => {
    const name = cache.get(id);
    if (name) out.set(id, name);
  });
  return out;
}

/** Resolve a single user id to a username (or null). */
export async function getUsername(id: string | null | undefined): Promise<string | null> {
  if (!id) return null;
  const map = await getUsernames([id]);
  return map.get(id) ?? null;
}
