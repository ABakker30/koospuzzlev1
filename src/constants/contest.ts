// Discovery Challenge hard caps. The live contest itself is configured in the
// contest_settings table (managed from /admin — see services/contestService).
// These caps are mirrored by DB check constraints in
// supabase/migrations/20260720_contest_settings.sql; change both or none.

export const CONTEST_CAPS = {
  maxWinners: 10,
  maxPrizeUsd: 1000,
  maxTotalUsd: 2000,
} as const;
