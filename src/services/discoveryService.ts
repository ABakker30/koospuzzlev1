// discoveryService — "is this solution NEW?" queries on top of
// solutions.signature (see src/utils/solutionSignature.ts).
//
// Novelty rule (docs/discovery-challenge-rules.md): a solution is a discovery
// iff no EARLIER-saved solution of the same puzzle has the same signature —
// counting ALL prior solutions (manual, hinted, auto). Only clean manual
// solves can *win*, but any prior solve blocks novelty, which closes the
// copy-from-Explore loophole.

import { supabase } from '../lib/supabase';
import { CONTEST, contestActive } from '../constants/contest';

export interface DiscoveryStatus {
  /** True if this solution's signature was never seen before on this puzzle. */
  isNew: boolean;
  /** Distinct known solutions for the puzzle (including this one). */
  distinctSolutions: number;
}

/**
 * Discovery status for a just-saved solution. Returns null on any error or
 * when the solution has no signature (legacy rows) — callers treat null as
 * "no discovery moment", never as an error state.
 */
export async function getDiscoveryStatus(
  solutionId: string,
  puzzleId: string,
  signature: string
): Promise<DiscoveryStatus | null> {
  try {
    // Earliest save of this signature decides who discovered it.
    const { data: first, error: firstErr } = await supabase
      .from('solutions')
      .select('id')
      .eq('puzzle_id', puzzleId)
      .eq('signature', signature)
      .order('created_at', { ascending: true })
      .limit(1)
      .maybeSingle();
    if (firstErr || !first) return null;

    const { data: stats, error: statsErr } = await supabase.rpc(
      'solution_discovery_stats',
      { target_puzzle_id: puzzleId }
    );
    if (statsErr) return null;

    return {
      isNew: first.id === solutionId,
      distinctSolutions: Number(stats?.distinct_solutions ?? 0),
    };
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Contest claims (admin review + public progress counter)
// ---------------------------------------------------------------------------

export interface ContestClaim {
  solutionId: string;
  solverName: string;
  createdBy: string | null;
  createdAt: string;
  signature: string;
  /** Claim order among eligible discoveries (1-based). */
  claimNumber: number;
}

interface SolutionRow {
  id: string;
  signature: string | null;
  solver_name: string | null;
  created_by: string | null;
  created_at: string;
  solution_type: string | null;
  hints_used: number | null;
  placements_by_you: number | null;
  total_pieces: number | null;
}

const isEligible = (s: SolutionRow): boolean =>
  s.solution_type === 'manual' &&
  (s.hints_used ?? 0) === 0 &&
  s.placements_by_you != null &&
  s.total_pieces != null &&
  s.placements_by_you === s.total_pieces &&
  !!s.created_by &&
  !!CONTEST.startIso &&
  s.created_at >= CONTEST.startIso;

/**
 * Walk the contest puzzle's solutions in save order and return the first-N
 * eligible discoveries. A signature seen earlier — by ANY solve, eligible or
 * not — blocks later claims on it. One claim per person.
 */
export async function fetchContestClaims(): Promise<ContestClaim[]> {
  if (!CONTEST.puzzleId) return [];
  const { data, error } = await supabase
    .from('solutions')
    .select(
      'id, signature, solver_name, created_by, created_at, solution_type, hints_used, placements_by_you, total_pieces'
    )
    .eq('puzzle_id', CONTEST.puzzleId)
    .not('signature', 'is', null)
    .order('created_at', { ascending: true })
    .limit(2000);
  if (error || !data) return [];

  const seenSignatures = new Set<string>();
  const winners = new Set<string>();
  const claims: ContestClaim[] = [];
  for (const s of data as SolutionRow[]) {
    const sig = s.signature as string;
    const isFirst = !seenSignatures.has(sig);
    seenSignatures.add(sig);
    if (!isFirst || !isEligible(s) || claims.length >= CONTEST.winners) continue;
    if (winners.has(s.created_by as string)) continue; // one prize per person
    winners.add(s.created_by as string);
    claims.push({
      solutionId: s.id,
      solverName: s.solver_name || 'Anonymous',
      createdBy: s.created_by,
      createdAt: s.created_at,
      signature: sig,
      claimNumber: claims.length + 1,
    });
  }
  return claims;
}

/** Claimed-prize count for the public banner. 0 when contest inactive. */
export async function fetchContestClaimedCount(): Promise<number> {
  if (!contestActive()) return 0;
  return (await fetchContestClaims()).length;
}
