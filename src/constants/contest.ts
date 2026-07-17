// Discovery Challenge configuration — the single place the contest is defined.
// The contest ships DISABLED: set `puzzleId` + `startIso` and flip `enabled`
// when Anton picks the target puzzle and start date (see
// docs/discovery-challenge-rules.md). Everything (banner, solve moment,
// admin claim review, rules page) reads from here.

export interface ContestPartner {
  name: string;
  url: string;
}

export const CONTEST = {
  enabled: false,
  /** Target puzzle UUID — the shape the bounty is on. */
  puzzleId: '',
  /** Prize per discovery, whole USD. */
  prizeUsd: 100,
  /** Number of prizes (first N new solutions). */
  winners: 10,
  /** Solves saved before this instant never count. ISO string, UTC. */
  startIso: '',
  /**
   * Promotional partner ("Brought to you by …"), shown on banner, rules and
   * the promo video end card. Legal Sponsor of the contest remains Anton —
   * only set this with the partner's written OK.
   */
  partner: null as ContestPartner | null,
};

export const contestActive = (): boolean =>
  CONTEST.enabled && !!CONTEST.puzzleId && !!CONTEST.startIso;

export const contestPrizeLabel = (): string => `$${CONTEST.prizeUsd}`;
