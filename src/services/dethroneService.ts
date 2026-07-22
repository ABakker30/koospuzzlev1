// dethroneService — "someone took your #1" detection, the reclaim hook.
// Data-derived only (no schema, no push infra): a board counts as a
// dethronement when the user is not currently #1 there, but WAS #1 among
// all solves up to their own best's timestamp — i.e. a later solve overtook
// them. Board standings come from boardAnalysisService (shared with the
// Home thrones strip, one computation per session).

import { analyzeUserBoards } from './boardAnalysisService';
import { getUsernames } from './usernameService';

export interface Dethronement {
  puzzleId: string;
  puzzleName: string;
  /** Palette signature of the board ('classic' | 'free' | 'only:D+Y'). */
  palette: string;
  /** Live display name of the current leader. */
  leaderName: string;
  /** The leader's #1 solve — dismissal key, and a new one re-triggers. */
  leaderSolutionId: string;
  myRank: number;
  totalSolvers: number;
}

/** Most recent dethronements for this user, capped at 3. [] on any error. */
export async function getDethronements(userId: string): Promise<Dethronement[]> {
  try {
    const standings = await analyzeUserBoards(userId);
    const dethroned = standings
      .filter((s) => s.wasDethroned)
      .sort(
        (a, b) =>
          new Date(b.leaderSolvedAt).getTime() - new Date(a.leaderSolvedAt).getTime()
      )
      .slice(0, 3);
    if (dethroned.length === 0) return [];

    const names = await getUsernames(dethroned.map((d) => d.leaderUserId));
    return dethroned.map((d) => ({
      puzzleId: d.puzzleId,
      puzzleName: d.puzzleName,
      palette: d.palette,
      leaderName:
        (d.leaderUserId && names.get(d.leaderUserId)) ||
        d.leaderStoredName?.split('@')[0] ||
        'someone',
      leaderSolutionId: d.leaderSolutionId,
      myRank: d.myRank,
      totalSolvers: d.totalSolvers,
    }));
  } catch {
    return [];
  }
}
