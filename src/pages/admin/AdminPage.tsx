// AdminPage — /admin, visible to is_admin users only. Key app stats pulled in
// one call from the admin_dashboard_stats() RPC (SECURITY DEFINER, gated
// server-side too — the UI gate here is convenience, not the security).

import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { supabase } from '../../lib/supabase';
import { tokens } from '../../styles/tokens';
import { NotFoundPage } from '../NotFoundPage';
import { CONTEST_CAPS } from '../../constants/contest';
import {
  getContest,
  updateContest,
  validateContest,
  isContestLive,
  prizeLabel,
  type ContestConfig,
} from '../../services/contestService';
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

  // While auth resolves, show the branded backdrop — a bare `null` here
  // painted a black screen on mobile PWA cold starts.
  if (isLoading) {
    return (
      <div
        style={{
          height: '100dvh',
          background: tokens.gradient.brandTri,
          color: 'rgba(255,255,255,0.8)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        ⏳
      </div>
    );
  }
  // Non-admins get the plain 404 — the page doesn't advertise its existence.
  if (!isAdmin) return <NotFoundPage />;

  return (
    <div
      style={{
        // Own scroll container — the app sets overflow:hidden on <body>, so
        // without this the dashboard can't scroll on mobile.
        height: '100dvh',
        overflowY: 'auto',
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

            <ContestManagerCard />

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

// Discovery Challenge manager — every aspect of the contest is editable here
// (target puzzle, prizes, dates, message, partner), capped at 10 winners /
// $1000 per prize / $2000 total (also DB-enforced). Below the form: the
// computed announcement (link + copyable text + video entry point) and the
// claim review list with the paid/unpaid ledger (contest_payouts). Payment
// itself stays OUTSIDE the app (PayPal, by hand) on purpose.

const toLocalInput = (iso: string | null): string => {
  if (!iso) return '';
  const d = new Date(iso);
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
};
const fromLocalInput = (v: string): string | null => (v ? new Date(v).toISOString() : null);

const fieldStyle: React.CSSProperties = {
  width: '100%',
  boxSizing: 'border-box',
  background: 'rgba(0,0,0,0.3)',
  border: '1px solid rgba(255,255,255,0.25)',
  borderRadius: 8,
  color: '#fff',
  padding: '8px 10px',
  fontSize: '0.88rem',
};
const labelStyle: React.CSSProperties = { fontSize: '0.78rem', opacity: 0.75, display: 'block', marginBottom: 3 };

const ContestManagerCard: React.FC = () => {
  const [cfg, setCfg] = useState<ContestConfig | null>(null);
  const [puzzles, setPuzzles] = useState<{ id: string; name: string; sphere_count: number | null }[]>([]);
  const [saveMsg, setSaveMsg] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [copied, setCopied] = useState(false);
  const [claims, setClaims] = useState<ContestClaim[]>([]);
  const [paid, setPaid] = useState<Record<string, string>>({}); // solutionId -> paid_at
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [c, pz] = await Promise.all([
        getContest(true),
        supabase.from('puzzles').select('id, name, sphere_count').order('name').limit(300),
      ]);
      if (cancelled) return;
      setCfg(c);
      setPuzzles((pz.data as any[]) ?? []);
      if (c.puzzleId) {
        const [cl, payoutsRes] = await Promise.all([
          fetchContestClaims(c),
          supabase.from('contest_payouts').select('solution_id, paid_at'),
        ]);
        if (cancelled) return;
        setClaims(cl);
        const map: Record<string, string> = {};
        for (const row of payoutsRes.data ?? []) map[row.solution_id] = row.paid_at;
        setPaid(map);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const set = (patch: Partial<ContestConfig>) => setCfg((c) => (c ? { ...c, ...patch } : c));

  const handleSave = async () => {
    if (!cfg) return;
    setSaving(true);
    setSaveMsg(null);
    const err = await updateContest(cfg);
    setSaving(false);
    setSaveMsg(err ?? 'Saved ✓');
    if (!err && cfg.puzzleId) setClaims(await fetchContestClaims(cfg));
  };

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

  if (!cfg) {
    return (
      <div style={{ ...card, marginTop: 20 }}>
        <div style={{ fontWeight: 700, marginBottom: 4 }}>🏆 Discovery Challenge</div>
        <div style={{ opacity: 0.7, fontSize: '0.88rem' }}>
          Loading… (if this never loads, has 20260720_contest_settings.sql been run?)
        </div>
      </div>
    );
  }

  const invalid = validateContest(cfg);
  const total = cfg.prizeUsd * cfg.winners;
  const live = isContestLive(cfg);
  const targetName = puzzles.find((p) => p.id === cfg.puzzleId)?.name;
  const announcement = cfg.puzzleId
    ? [
        `🏆 The Discovery Challenge — first ${cfg.winners} new solutions to “${targetName ?? 'the challenge puzzle'}” win ${prizeLabel(cfg)} each!`,
        cfg.message,
        `Play: https://koospuzzle.com/puzzles/${cfg.puzzleId}/view`,
        `Rules: https://koospuzzle.com/challenge-rules`,
        cfg.partnerName ? `Brought to you by ${cfg.partnerName}` : null,
      ]
        .filter(Boolean)
        .join('\n')
    : null;

  return (
    <div style={{ ...card, marginTop: 20 }}>
      <div style={{ fontWeight: 700, marginBottom: 2 }}>
        🏆 Discovery Challenge{' '}
        <span style={{ fontSize: '0.8rem', fontWeight: 600, color: live ? '#34d399' : '#feca57' }}>
          {live ? '● live' : cfg.enabled ? '● enabled, outside window' : '○ off'}
        </span>
      </div>
      <div style={{ fontSize: '0.8rem', opacity: 0.65, marginBottom: 12 }}>
        Caps: {CONTEST_CAPS.maxWinners} winners max · ${CONTEST_CAPS.maxPrizeUsd}/prize max · $
        {CONTEST_CAPS.maxTotalUsd} total max
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: 10 }}>
        <div style={{ gridColumn: '1 / -1' }}>
          <label style={labelStyle}>Target puzzle</label>
          <select
            value={cfg.puzzleId ?? ''}
            onChange={(e) => set({ puzzleId: e.target.value || null })}
            style={fieldStyle}
          >
            <option value="">— none —</option>
            {puzzles.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}{p.sphere_count ? ` (${p.sphere_count})` : ''}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label style={labelStyle}>Prize per discovery (USD)</label>
          <input
            type="number"
            min={1}
            max={CONTEST_CAPS.maxPrizeUsd}
            value={cfg.prizeUsd}
            onChange={(e) => set({ prizeUsd: Math.round(Number(e.target.value) || 0) })}
            style={fieldStyle}
          />
        </div>
        <div>
          <label style={labelStyle}>Winners (max {CONTEST_CAPS.maxWinners})</label>
          <input
            type="number"
            min={1}
            max={CONTEST_CAPS.maxWinners}
            value={cfg.winners}
            onChange={(e) => set({ winners: Math.round(Number(e.target.value) || 0) })}
            style={fieldStyle}
          />
        </div>
        <div>
          <label style={labelStyle}>Starts</label>
          <input
            type="datetime-local"
            value={toLocalInput(cfg.startIso)}
            onChange={(e) => set({ startIso: fromLocalInput(e.target.value) })}
            style={fieldStyle}
          />
        </div>
        <div>
          <label style={labelStyle}>Ends (optional)</label>
          <input
            type="datetime-local"
            value={toLocalInput(cfg.endIso)}
            onChange={(e) => set({ endIso: fromLocalInput(e.target.value) })}
            style={fieldStyle}
          />
        </div>
        <div style={{ gridColumn: '1 / -1' }}>
          <label style={labelStyle}>Custom message (banner story, rules page, video)</label>
          <textarea
            rows={2}
            value={cfg.message ?? ''}
            onChange={(e) => set({ message: e.target.value || null })}
            style={{ ...fieldStyle, resize: 'vertical' }}
          />
        </div>
        <div>
          <label style={labelStyle}>Partner name (optional)</label>
          <input
            value={cfg.partnerName ?? ''}
            onChange={(e) => set({ partnerName: e.target.value || null })}
            style={fieldStyle}
            placeholder="e.g. MoMath"
          />
        </div>
        <div>
          <label style={labelStyle}>Partner URL</label>
          <input
            value={cfg.partnerUrl ?? ''}
            onChange={(e) => set({ partnerUrl: e.target.value || null })}
            style={fieldStyle}
            placeholder="https://…"
          />
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginTop: 12, flexWrap: 'wrap' }}>
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.9rem', cursor: 'pointer' }}>
          <input
            type="checkbox"
            checked={cfg.enabled}
            onChange={(e) => set({ enabled: e.target.checked })}
          />
          Contest enabled
        </label>
        <span style={{ fontSize: '0.85rem', color: total > CONTEST_CAPS.maxTotalUsd ? '#f87171' : '#34d399' }}>
          Pool: {cfg.winners} × ${cfg.prizeUsd} = ${total}
        </span>
        <button
          onClick={handleSave}
          disabled={saving || !!invalid}
          style={{
            background: invalid ? 'rgba(255,255,255,0.15)' : 'linear-gradient(135deg, #feca57 0%, #f59e0b 100%)',
            color: invalid ? 'rgba(255,255,255,0.5)' : '#1a1a1a',
            border: 'none',
            borderRadius: 8,
            padding: '8px 18px',
            fontWeight: 700,
            cursor: invalid ? 'not-allowed' : 'pointer',
            marginLeft: 'auto',
          }}
        >
          {saving ? 'Saving…' : 'Save contest'}
        </button>
      </div>
      {(invalid || saveMsg) && (
        <div
          style={{
            marginTop: 8,
            fontSize: '0.85rem',
            color: invalid || saveMsg !== 'Saved ✓' ? '#f87171' : '#34d399',
          }}
        >
          {invalid ?? saveMsg}
        </div>
      )}

      {/* Announcement — computed from the setup; record the video from the
          puzzle viewer (menu → 🎬 Promo video, re-record for more styles). */}
      {announcement && (
        <div
          style={{
            marginTop: 16,
            background: 'rgba(0,0,0,0.25)',
            borderRadius: 10,
            padding: '12px 14px',
          }}
        >
          <div style={{ fontWeight: 700, fontSize: '0.9rem', marginBottom: 6 }}>📣 Announcement</div>
          <pre
            style={{
              whiteSpace: 'pre-wrap',
              fontFamily: 'inherit',
              fontSize: '0.85rem',
              opacity: 0.85,
              margin: '0 0 10px',
            }}
          >
            {announcement}
          </pre>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <button
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(announcement);
                  setCopied(true);
                  setTimeout(() => setCopied(false), 2000);
                } catch { /* clipboard unavailable */ }
              }}
              style={{
                background: 'rgba(255,255,255,0.15)',
                border: '1px solid rgba(255,255,255,0.25)',
                borderRadius: 8,
                color: '#fff',
                padding: '6px 14px',
                cursor: 'pointer',
                fontSize: '0.85rem',
              }}
            >
              {copied ? 'Copied ✓' : '📋 Copy text'}
            </button>
            <Link
              to={`/puzzles/${cfg.puzzleId}/view`}
              style={{
                background: 'rgba(255,255,255,0.15)',
                border: '1px solid rgba(255,255,255,0.25)',
                borderRadius: 8,
                color: '#fff',
                padding: '6px 14px',
                fontSize: '0.85rem',
                textDecoration: 'none',
              }}
            >
              🎬 Record video (viewer menu → Promo video)
            </Link>
          </div>
          <div style={{ fontSize: '0.78rem', opacity: 0.6, marginTop: 8 }}>
            Record as many takes as you like — change the environment preset in the viewer for
            different styles; each take is a fresh downloadable clip.
          </div>
        </div>
      )}

      {/* Claim review */}
      <div style={{ fontWeight: 700, margin: '18px 0 4px' }}>
        Claims ({claims.length}/{cfg.winners} · {prizeLabel(cfg)} each)
      </div>
      {cfg.puzzleId && claims.length === 0 && (
        <div style={{ opacity: 0.7, fontSize: '0.88rem' }}>No eligible discoveries yet.</div>
      )}
      {!cfg.puzzleId && (
        <div style={{ opacity: 0.7, fontSize: '0.88rem' }}>Pick a target puzzle first.</div>
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
