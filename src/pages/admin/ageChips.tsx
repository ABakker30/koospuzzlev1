// ageChips — shared 18+ attestation lookup + chip for the admin contest cards
// (legacy Discovery Challenge claims + contest engine standings/awards). The
// chip is SELF-DECLARED (users.age_confirmed_at) — payment-time verification
// stays manual, the reminder line next to each list says so.

import React from 'react';
import { supabase } from '../../lib/supabase';

/** userId -> age_confirmed_at (null = not confirmed). The WHOLE map is null
 *  when the column/policy is missing (pre-20260802 migration) → "unknown". */
export type AgeMap = Record<string, string | null> | null;

/** Batch-fetch age attestations for a set of user ids. Degrades to null
 *  ("unknown" chips) when the age_confirmed_at column or the admin read
 *  policy is missing. */
export async function fetchAgeMap(userIds: Array<string | null | undefined>): Promise<AgeMap> {
  const ids = [...new Set(userIds.filter((x): x is string => !!x))];
  if (ids.length === 0) return {};
  try {
    const { data, error } = await supabase
      .from('users')
      .select('id, age_confirmed_at')
      .in('id', ids);
    if (error) return null; // pre-migration (column missing) → unknown
    const map: Record<string, string | null> = {};
    for (const row of data ?? []) map[row.id] = row.age_confirmed_at ?? null;
    return map;
  } catch {
    return null;
  }
}

/** Self-attested 18+ chip: green ✓ / amber "not confirmed" / grey "unknown"
 *  pre-migration. */
export const AgeChip: React.FC<{ ages: AgeMap; userId: string | null | undefined }> = ({
  ages,
  userId,
}) => {
  const age = ages && userId ? ages[userId] : undefined;
  const state = ages === null || age === undefined ? 'unknown' : age ? 'yes' : 'no';
  const chip = {
    yes: { label: '18+ ✓', color: '#34d399', bg: 'rgba(52,211,153,0.2)' },
    no: { label: '18+ not confirmed', color: '#feca57', bg: 'rgba(254,202,87,0.15)' },
    unknown: { label: '18+ unknown', color: 'rgba(255,255,255,0.6)', bg: 'rgba(255,255,255,0.08)' },
  }[state];
  return (
    <span
      style={{
        background: chip.bg,
        color: chip.color,
        border: `1px solid ${chip.color}`,
        borderRadius: 999,
        padding: '1px 8px',
        fontSize: '0.72rem',
        fontWeight: 700,
        whiteSpace: 'nowrap',
      }}
    >
      {chip.label}
    </span>
  );
};
