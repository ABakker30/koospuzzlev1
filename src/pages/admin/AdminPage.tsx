// AdminPage — /admin, visible to is_admin users only. Key app stats pulled in
// one call from the admin_dashboard_stats() RPC (SECURITY DEFINER, gated
// server-side too — the UI gate here is convenience, not the security).

import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { supabase } from '../../lib/supabase';
import { tokens } from '../../styles/tokens';
import { NotFoundPage } from '../NotFoundPage';
import { CONTEST, contestActive, contestPrizeLabel } from '../../constants/contest';
import { fetchContestClaims, type ContestClaim } from '../../services/discoveryService';

type Stats = {
  users: { total: number; new_7d: number; active_1d: number; active_7d: number };
  puzzles: { total: number; new_7d: number };
  solutions: { total: number; new_7d: number; likes: number };
  games: {
    total: number;
    new_7d: number;
    active_now: number;
    completed: number;
    abandoned: number;
    vs_ai: number;
  };
  recent_users: { username: string; registered_at: string; last_active_at: string }[];
  recent_solutions: {
    solver_name: string | null;
    puzzle_name: string | null;
    created_at: string;
    placements_by_you: number | null;
    total_pieces: number | null;
    duration_ms: number | null;
  }[];
  top_puzzles: { name: string; solutions: number }[];
};

const card: React.CSSProperties = {
  background: 'rgba(255,255,255,0.10)',
  borderRadius: tokens.radius.lg,
  padding: '16px 18px',
};

const StatCard: React.FC<{ label: string; value: React.ReactNode; sub?: string }> = ({
  label,
  value,
  sub,
}) => (
  <div style={card}>
    <div style={{ fontSize: '0.78rem', textTransform: 'uppercase', letterSpacing: 1, opacity: 0.7 }}>
      {label}
    </div>
    <div style={{ fontSize: '2rem', fontWeight: 800, margin: '4px 0 2px' }}>{value}</div>
    {sub && <div style={{ fontSize: '0.8rem', opacity: 0.75 }}>{sub}</div>}
  </div>
);

const timeAgo = (iso: string | null): string => {
  if (!iso) return '—';
  const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
};

export const AdminPage: React.FC = () => {
  const { user, isLoading } = useAuth();
  const [stats, setStats] = useState<Stats | null>(null);
  const [error, setError] = useState<string | null>(null);

  const isAdmin = !!user?.is_admin;

  useEffect(() => {
    if (!isAdmin) return;
    let cancelled = false;
    supabase
      .rpc('admin_dashboard_stats')
      .then(({ data, error: err }) => {
        if (cancelled) return;
        if (err) setError(err.message);
        else setStats(data as Stats);
      });
    return () => {
      cancelled = true;
    };
  }, [isAdmin]);

  if (isLoading) return null;
  // Non-admins get the plain 404 — the page doesn't advertise its existence.
  if (!isAdmin) return <NotFoundPage />;

  return (
    <div
      style={{
        minHeight: '100vh',
        background: tokens.gradient.brandTri,
        color: '#fff',
        padding: 'clamp(1rem, 4vw, 2.5rem)',
        boxSizing: 'border-box',
      }}
    >
      <div style={{ maxWidth: 900, margin: '0 auto' }}>
        <Link to="/" style={{ color: 'rgba(255,255,255,0.8)', textDecoration: 'none', fontSize: '0.9rem' }}>
          ← Koos Puzzle
        </Link>
        <h1 style={{ fontSize: '1.6rem', margin: '12px 0 20px' }}>📊 Admin — app stats</h1>

        {error && (
          <div style={{ ...card, background: 'rgba(239,68,68,0.25)', marginBottom: 16 }}>
            {error.includes('admin only') || error.includes('function')
              ? 'The stats function is missing or denied — has 20260717_admin_dashboard_stats.sql been run in Supabase?'
              : error}
          </div>
        )}

        {!stats && !error && <div style={{ opacity: 0.8 }}>Loading…</div>}

        {stats && (
          <>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
                gap: 12,
                marginBottom: 24,
              }}
            >
              <StatCard
                label="Users"
                value={stats.users.total}
                sub={`+${stats.users.new_7d} this week · ${stats.users.active_1d} active today`}
              />
              <StatCard
                label="Active (7d)"
                value={stats.users.active_7d}
                sub="signed-in users seen this week"
              />
              <StatCard
                label="Puzzles"
                value={stats.puzzles.total}
                sub={`+${stats.puzzles.new_7d} this week`}
              />
              <StatCard
                label="Solutions"
                value={stats.solutions.total}
                sub={`+${stats.solutions.new_7d} this week · ${stats.solutions.likes} likes`}
              />
              <StatCard
                label="Games"
                value={stats.games.total}
                sub={`+${stats.games.new_7d} this week · ${stats.games.active_now} live now`}
              />
              <StatCard
                label="Game outcomes"
                value={`${stats.games.completed}✓`}
                sub={`${stats.games.abandoned} abandoned · ${stats.games.vs_ai} vs AI`}
              />
            </div>

            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
                gap: 12,
              }}
            >
              <div style={card}>
                <div style={{ fontWeight: 700, marginBottom: 10 }}>New users</div>
                {stats.recent_users.length === 0 && <div style={{ opacity: 0.7 }}>None yet</div>}
                {stats.recent_users.map((u, i) => (
                  <div
                    key={i}
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      gap: 8,
                      fontSize: '0.88rem',
                      padding: '5px 0',
                      borderBottom: '1px solid rgba(255,255,255,0.08)',
                    }}
                  >
                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {u.username}
                    </span>
                    <span style={{ opacity: 0.7, whiteSpace: 'nowrap' }}>
                      {timeAgo(u.registered_at)} · seen {timeAgo(u.last_active_at)}
                    </span>
                  </div>
                ))}
              </div>

              <div style={card}>
                <div style={{ fontWeight: 700, marginBottom: 10 }}>Recent solves</div>
                {stats.recent_solutions.length === 0 && <div style={{ opacity: 0.7 }}>None yet</div>}
                {stats.recent_solutions.map((s, i) => (
                  <div
                    key={i}
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      gap: 8,
                      fontSize: '0.88rem',
                      padding: '5px 0',
                      borderBottom: '1px solid rgba(255,255,255,0.08)',
                    }}
                  >
                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {(s.solver_name || 'anon').split('@')[0]} · {s.puzzle_name || '?'}
                    </span>
                    <span style={{ opacity: 0.7, whiteSpace: 'nowrap' }}>
                      {s.placements_by_you != null && s.total_pieces != null
                        ? `${s.placements_by_you}/${s.total_pieces} · `
                        : ''}
                      {timeAgo(s.created_at)}
                    </span>
                  </div>
                ))}
              </div>

              <div style={card}>
                <div style={{ fontWeight: 700, marginBottom: 10 }}>Top puzzles</div>
                {stats.top_puzzles.length === 0 && <div style={{ opacity: 0.7 }}>None yet</div>}
                {stats.top_puzzles.map((p, i) => (
                  <div
                    key={i}
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      gap: 8,
                      fontSize: '0.88rem',
                      padding: '5px 0',
                      borderBottom: '1px solid rgba(255,255,255,0.08)',
                    }}
                  >
                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {i + 1}. {p.name}
                    </span>
                    <span style={{ opacity: 0.7, whiteSpace: 'nowrap' }}>{p.solutions} solves</span>
                  </div>
                ))}
              </div>
            </div>

            <ContestClaimsCard />

            <div style={{ marginTop: 20, fontSize: '0.85rem', opacity: 0.7 }}>
              Behavioral analytics (pageviews, shares, installs) live in PostHog →{' '}
              <a href="https://us.posthog.com" target="_blank" rel="noopener noreferrer" style={{ color: '#dbe4ff' }}>
                us.posthog.com
              </a>
            </div>
          </>
        )}
      </div>
    </div>
  );
};

// Discovery Challenge claim review — first-N eligible discoveries, with a
// manual paid/unpaid toggle backed by contest_payouts (admin-only RLS).
// Payment itself stays OUTSIDE the app (PayPal, by hand) on purpose; this is
// the ledger, review queue, and replay entry point.
const ContestClaimsCard: React.FC = () => {
  const [claims, setClaims] = useState<ContestClaim[]>([]);
  const [paid, setPaid] = useState<Record<string, string>>({}); // solutionId -> paid_at
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    if (!CONTEST.puzzleId) {
      setLoaded(true);
      return;
    }
    let cancelled = false;
    Promise.all([
      fetchContestClaims(),
      supabase.from('contest_payouts').select('solution_id, paid_at'),
    ]).then(([cl, payoutsRes]) => {
      if (cancelled) return;
      setClaims(cl);
      const map: Record<string, string> = {};
      for (const row of payoutsRes.data ?? []) map[row.solution_id] = row.paid_at;
      setPaid(map);
      setLoaded(true);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const togglePaid = async (solutionId: string) => {
    setBusy(solutionId);
    try {
      if (paid[solutionId]) {
        const { error } = await supabase.from('contest_payouts').delete().eq('solution_id', solutionId);
        if (!error) setPaid((p) => { const n = { ...p }; delete n[solutionId]; return n; });
      } else {
        const { data, error } = await supabase
          .from('contest_payouts')
          .insert([{ solution_id: solutionId }])
          .select('paid_at')
          .single();
        if (!error && data) setPaid((p) => ({ ...p, [solutionId]: data.paid_at }));
      }
    } finally {
      setBusy(null);
    }
  };

  return (
    <div style={{ ...card, marginTop: 20 }}>
      <div style={{ fontWeight: 700, marginBottom: 4 }}>
        🏆 Discovery Challenge — claims ({claims.length}/{CONTEST.winners} · {contestPrizeLabel()} each)
      </div>
      {!CONTEST.puzzleId && (
        <div style={{ opacity: 0.7, fontSize: '0.88rem' }}>
          Not configured — set puzzleId, startIso and enabled in src/constants/contest.ts.
        </div>
      )}
      {CONTEST.puzzleId && !contestActive() && (
        <div style={{ opacity: 0.7, fontSize: '0.88rem', marginBottom: 8 }}>
          Contest is configured but not enabled — claims below are a preview.
        </div>
      )}
      {CONTEST.puzzleId && loaded && claims.length === 0 && (
        <div style={{ opacity: 0.7, fontSize: '0.88rem' }}>No eligible discoveries yet.</div>
      )}
      {claims.map((c) => (
        <div
          key={c.solutionId}
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 8,
            fontSize: '0.88rem',
            padding: '6px 0',
            borderBottom: '1px solid rgba(255,255,255,0.08)',
          }}
        >
          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            #{c.claimNumber} {(c.solverName || 'anon').split('@')[0]} · {timeAgo(c.createdAt)}
          </span>
          <span style={{ display: 'flex', gap: 10, alignItems: 'center', whiteSpace: 'nowrap' }}>
            {/* Replay before paying — watch for machine-like cadence */}
            <Link to={`/c/${c.solutionId}`} style={{ color: '#dbe4ff' }}>
              replay
            </Link>
            <button
              onClick={() => togglePaid(c.solutionId)}
              disabled={busy === c.solutionId}
              style={{
                background: paid[c.solutionId] ? 'rgba(52,211,153,0.25)' : 'rgba(255,255,255,0.12)',
                color: paid[c.solutionId] ? '#34d399' : '#fff',
                border: '1px solid rgba(255,255,255,0.2)',
                borderRadius: 8,
                padding: '4px 10px',
                cursor: 'pointer',
                fontSize: '0.8rem',
              }}
            >
              {paid[c.solutionId] ? '✓ Paid' : 'Mark paid'}
            </button>
          </span>
        </div>
      ))}
    </div>
  );
};

export default AdminPage;
