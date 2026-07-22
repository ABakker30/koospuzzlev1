// EngineContestsCard — admin manager for the contest engine (migration
// 20260803_contest_engine.sql): many concurrent typed contests with a
// draft → live → ended → settled lifecycle, client-computed standings, and a
// contest_awards paid/unpaid ledger. Sibling of the legacy Discovery
// Challenge card; admin-only English (like the rest of /admin). Degrades to
// a "run the migration" note while the tables don't exist yet.

import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { CONTEST_CAPS } from '../../constants/contest';
import { getPuzzleById } from '../../api/puzzles';
import { getUsernames } from '../../services/usernameService';
import {
  createContest,
  deleteContest,
  listAwards,
  listContests,
  setAwardPaid,
  settleContest,
  standingsNewPuzzlePopularity,
  standingsSolutionRush,
  standingsSpeedTrial,
  updateContest,
  validateEngineContest,
  isWithinWindow,
  type EngineAward,
  type EngineContest,
  type EngineContestInput,
  type EngineContestType,
  type PopularityEntry,
  type RushEntry,
  type SpeedEntry,
  type SettleWinner,
} from '../../services/contestEngineService';
import { uploadSponsorLogo } from './sponsorLogoUpload';
import { AgeChip, fetchAgeMap, type AgeMap } from './ageChips';

const card: React.CSSProperties = {
  background: 'rgba(255,255,255,0.10)',
  borderRadius: 16,
  padding: '16px 18px',
};
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
const labelStyle: React.CSSProperties = {
  fontSize: '0.78rem',
  opacity: 0.75,
  display: 'block',
  marginBottom: 3,
};
const smallBtn = (accent = false): React.CSSProperties => ({
  background: accent ? 'linear-gradient(135deg, #feca57 0%, #f59e0b 100%)' : 'rgba(255,255,255,0.12)',
  color: accent ? '#1a1a1a' : '#fff',
  border: accent ? 'none' : '1px solid rgba(255,255,255,0.2)',
  borderRadius: 8,
  padding: '4px 12px',
  cursor: 'pointer',
  fontSize: '0.8rem',
  fontWeight: 700,
});

const toLocalInput = (iso: string | null): string => {
  if (!iso) return '';
  const d = new Date(iso);
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
};
const fromLocalInput = (v: string): string | null => (v ? new Date(v).toISOString() : null);
const fmtDate = (iso: string | null): string =>
  iso ? new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' }) : '—';
const fmtDuration = (ms: number): string => {
  const s = ms / 1000;
  if (s < 60) return `${s.toFixed(1)}s`;
  return `${Math.floor(s / 60)}m ${Math.round(s % 60)}s`;
};

// The 3 buildable Phase-1 types. 'discovery' is reserved for porting the
// legacy challenge later and is deliberately NOT creatable here.
const CREATABLE_TYPES: { value: EngineContestType; label: string }[] = [
  { value: 'new_puzzle_popularity', label: 'New-puzzle popularity' },
  { value: 'solution_rush', label: 'Solution rush' },
  { value: 'speed_trial', label: 'Speed trial' },
];
const typeLabel = (t: EngineContestType): string =>
  CREATABLE_TYPES.find((x) => x.value === t)?.label ?? 'Discovery (reserved)';

interface FormState {
  id: string | null; // null = creating
  type: EngineContestType;
  title: string;
  message: string;
  startsAt: string | null;
  endsAt: string | null;
  prizeUsd: number;
  winnersCount: number;
  puzzleId: string;
  palette: string;
  minSolvers: number;
  partnerName: string;
  partnerUrl: string;
  partnerLogoUrl: string | null;
}

const emptyForm = (): FormState => ({
  id: null,
  type: 'solution_rush',
  title: '',
  message: '',
  startsAt: null,
  endsAt: null,
  prizeUsd: 100,
  winnersCount: 1,
  puzzleId: '',
  palette: 'classic',
  minSolvers: 0,
  partnerName: '',
  partnerUrl: '',
  partnerLogoUrl: null,
});

const contestToForm = (c: EngineContest): FormState => ({
  id: c.id,
  type: c.type,
  title: c.title,
  message: c.message ?? '',
  startsAt: c.startsAt,
  endsAt: c.endsAt,
  prizeUsd: c.prizeUsd,
  winnersCount: c.winnersCount,
  puzzleId: c.puzzleId ?? '',
  palette: String((c.params as any)?.palette ?? 'classic'),
  minSolvers: Number((c.params as any)?.minSolvers ?? 0) || 0,
  partnerName: c.partnerName ?? '',
  partnerUrl: c.partnerUrl ?? '',
  partnerLogoUrl: c.partnerLogoUrl,
});

const formToInput = (f: FormState): EngineContestInput => ({
  type: f.type,
  title: f.title.trim(),
  message: f.message.trim() || null,
  puzzleId: f.type === 'new_puzzle_popularity' ? null : f.puzzleId.trim() || null,
  startsAt: f.startsAt,
  endsAt: f.endsAt,
  prizeUsd: f.prizeUsd,
  winnersCount: f.winnersCount,
  partnerName: f.partnerName.trim() || null,
  partnerUrl: f.partnerUrl.trim() || null,
  partnerLogoUrl: f.partnerLogoUrl,
  params:
    f.type === 'speed_trial'
      ? { palette: f.palette.trim() || 'classic' }
      : f.type === 'new_puzzle_popularity'
        ? { minSolvers: f.minSolvers }
        : {},
});

type AnyEntry = PopularityEntry | RushEntry | SpeedEntry;
interface StandingsView {
  contestId: string;
  type: EngineContestType;
  entries: AnyEntry[];
  computedAt: string;
}

export const EngineContestsCard: React.FC = () => {
  const [contests, setContests] = useState<EngineContest[] | null>(null);
  const [missingTable, setMissingTable] = useState(false);
  const [listError, setListError] = useState<string | null>(null);
  const [form, setForm] = useState<FormState | null>(null);
  const [formMsg, setFormMsg] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [verifyMsg, setVerifyMsg] = useState<string | null>(null);
  const [logoBusy, setLogoBusy] = useState(false);
  const [logoMsg, setLogoMsg] = useState<string | null>(null);
  const [standings, setStandings] = useState<StandingsView | null>(null);
  const [standingsBusy, setStandingsBusy] = useState<string | null>(null);
  const [ages, setAges] = useState<AgeMap>({});
  const [awards, setAwards] = useState<{ contestId: string; rows: EngineAward[] } | null>(null);
  const [awardNames, setAwardNames] = useState<Map<string, string>>(new Map());
  const [awardBusy, setAwardBusy] = useState<string | null>(null);
  const [rowBusy, setRowBusy] = useState<string | null>(null);
  const [rowMsg, setRowMsg] = useState<string | null>(null);

  const reload = async () => {
    const res = await listContests();
    setContests(res.contests);
    setMissingTable(res.missingTable);
    setListError(res.missingTable ? null : res.error);
  };

  useEffect(() => {
    reload();
  }, []);

  const set = (patch: Partial<FormState>) => setForm((f) => (f ? { ...f, ...patch } : f));

  const handleVerifyPuzzle = async () => {
    if (!form?.puzzleId.trim()) {
      setVerifyMsg('Enter a puzzle id first.');
      return;
    }
    setVerifyMsg('Looking up…');
    const p = await getPuzzleById(form.puzzleId.trim());
    setVerifyMsg(p ? `✓ “${p.name}”` : '✗ No puzzle with that id.');
  };

  const handleLogoFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setLogoBusy(true);
    setLogoMsg(null);
    const res = await uploadSponsorLogo(file, 'engine');
    setLogoBusy(false);
    if (res.url) {
      set({ partnerLogoUrl: res.url });
      setLogoMsg('Uploaded ✓ — save the contest to apply.');
    } else {
      setLogoMsg(res.error);
    }
  };

  const handleSave = async () => {
    if (!form) return;
    const input = formToInput(form);
    const invalid = validateEngineContest(input);
    if (invalid) {
      setFormMsg(invalid);
      return;
    }
    setSaving(true);
    setFormMsg(null);
    const err = form.id ? await updateContest(form.id, input) : await createContest(input);
    setSaving(false);
    if (err) {
      setFormMsg(err);
      return;
    }
    setForm(null);
    setVerifyMsg(null);
    setLogoMsg(null);
    await reload();
  };

  const handleStatus = async (c: EngineContest, status: EngineContest['status']) => {
    setRowBusy(c.id);
    setRowMsg(null);
    const err = await updateContest(c.id, { status });
    setRowBusy(null);
    if (err) setRowMsg(err);
    else await reload();
  };

  const handleDelete = async (c: EngineContest) => {
    if (!window.confirm(`Delete contest “${c.title || typeLabel(c.type)}”? This can't be undone.`)) return;
    setRowBusy(c.id);
    const err = await deleteContest(c.id);
    setRowBusy(null);
    if (err) setRowMsg(err);
    else await reload();
  };

  const handleStandings = async (c: EngineContest) => {
    setStandingsBusy(c.id);
    setRowMsg(null);
    try {
      const res =
        c.type === 'new_puzzle_popularity'
          ? await standingsNewPuzzlePopularity(c)
          : c.type === 'solution_rush'
            ? await standingsSolutionRush(c)
            : c.type === 'speed_trial'
              ? await standingsSpeedTrial(c)
              : { entries: [] as AnyEntry[], computedAt: new Date().toISOString() };
      setStandings({ contestId: c.id, type: c.type, entries: res.entries as AnyEntry[], computedAt: res.computedAt });
      setAwards(null);
      // Same batch age_confirmed_at lookup pattern as the legacy claim list.
      setAges(await fetchAgeMap(res.entries.map((e: any) => e.creatorUserId ?? e.userId)));
    } finally {
      setStandingsBusy(null);
    }
  };

  const winnersFromStandings = (c: EngineContest, view: StandingsView): SettleWinner[] => {
    const eligible =
      view.type === 'new_puzzle_popularity'
        ? (view.entries as PopularityEntry[]).filter((e) => e.eligible)
        : view.entries;
    return eligible.slice(0, c.winnersCount).map((e: any): SettleWinner => ({
      userId: e.creatorUserId ?? e.userId,
      solutionId: e.lastSolutionId ?? e.solutionId ?? null,
      puzzleId: e.puzzleId ?? c.puzzleId,
    }));
  };

  const handleSettle = async (c: EngineContest) => {
    if (!standings || standings.contestId !== c.id) {
      setRowMsg('Open Standings first — settlement writes the top entries shown there.');
      return;
    }
    const winners = winnersFromStandings(c, standings);
    if (winners.length === 0) {
      setRowMsg('No eligible entries to settle.');
      return;
    }
    if (
      !window.confirm(
        c.prizeUsd > 0
          ? `Settle “${c.title || typeLabel(c.type)}”: award $${c.prizeUsd} to each of ${winners.length} winner(s)? This marks the contest settled.`
          : `Settle “${c.title || typeLabel(c.type)}”: record ${winners.length} winner(s) for recognition (no-prize promo)? This marks the contest settled.`
      )
    )
      return;
    setRowBusy(c.id);
    const err = await settleContest(c, winners);
    setRowBusy(null);
    if (err) {
      setRowMsg(err);
      return;
    }
    await reload();
    await handleAwards({ ...c, status: 'settled' });
  };

  const handleAwards = async (c: EngineContest) => {
    setRowBusy(c.id);
    try {
      const rows = await listAwards(c.id);
      setAwards({ contestId: c.id, rows });
      setStandings(null);
      const [names, ageMap] = await Promise.all([
        getUsernames(rows.map((r) => r.userId)),
        fetchAgeMap(rows.map((r) => r.userId)),
      ]);
      setAwardNames(names);
      setAges(ageMap);
    } finally {
      setRowBusy(null);
    }
  };

  const togglePaid = async (a: EngineAward) => {
    setAwardBusy(a.id);
    try {
      const err = await setAwardPaid(a.id, !a.paidAt);
      if (!err && awards) {
        setAwards({
          contestId: awards.contestId,
          rows: awards.rows.map((r) =>
            r.id === a.id ? { ...r, paidAt: a.paidAt ? null : new Date().toISOString() } : r
          ),
        });
      }
    } finally {
      setAwardBusy(null);
    }
  };

  // -------------------------------------------------------------------------

  if (missingTable) {
    return (
      <div style={{ ...card, marginTop: 20 }}>
        <div style={{ fontWeight: 700, marginBottom: 4 }}>🏁 Contests</div>
        <div style={{ opacity: 0.8, fontSize: '0.88rem' }}>
          The contest engine tables aren't set up yet — run migration{' '}
          <code>20260803_contest_engine.sql</code> in Supabase to enable multi-contest prizes
          (popularity, solution rush, speed trials).
        </div>
      </div>
    );
  }

  const totalPool = form ? form.prizeUsd * form.winnersCount : 0;

  return (
    <div style={{ ...card, marginTop: 20 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 2 }}>
        <div style={{ fontWeight: 700 }}>🏁 Contests</div>
        {!form && (
          <button onClick={() => { setForm(emptyForm()); setFormMsg(null); }} style={{ ...smallBtn(true), marginLeft: 'auto' }}>
            + New contest
          </button>
        )}
      </div>
      <div style={{ fontSize: '0.8rem', opacity: 0.65, marginBottom: 12 }}>
        Multi-contest engine (popularity · rush · speed) — caps {CONTEST_CAPS.maxWinners} winners ·
        ${CONTEST_CAPS.maxPrizeUsd}/prize · ${CONTEST_CAPS.maxTotalUsd} total. Lifecycle: draft →
        live → ended → settled.
      </div>

      {listError && (
        <div style={{ fontSize: '0.85rem', color: '#f87171', marginBottom: 8 }}>{listError}</div>
      )}
      {contests === null && <div style={{ opacity: 0.7, fontSize: '0.88rem' }}>Loading…</div>}
      {contests !== null && contests.length === 0 && !form && (
        <div style={{ opacity: 0.7, fontSize: '0.88rem' }}>No contests yet — create one.</div>
      )}

      {/* Contest list */}
      {contests?.map((c) => {
        const windowClosed = !!c.endsAt && new Date(c.endsAt).getTime() < Date.now();
        const statusColor =
          c.status === 'live' ? '#34d399' : c.status === 'settled' ? '#a78bfa' : c.status === 'ended' ? '#feca57' : 'rgba(255,255,255,0.6)';
        return (
          <div key={c.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.08)', padding: '8px 0' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', fontSize: '0.88rem' }}>
              <span style={{ fontWeight: 700 }}>{c.title || '(untitled)'}</span>
              <span style={{ opacity: 0.7 }}>{typeLabel(c.type)}</span>
              <span style={{ color: statusColor, fontWeight: 700 }}>● {c.status}</span>
              {c.status === 'live' && windowClosed && (
                <span style={{ color: '#feca57', fontSize: '0.78rem' }}>window closed — end &amp; settle</span>
              )}
              {c.status === 'live' && !isWithinWindow(c) && !windowClosed && (
                <span style={{ opacity: 0.6, fontSize: '0.78rem' }}>not started yet</span>
              )}
            </div>
            <div style={{ fontSize: '0.8rem', opacity: 0.7, margin: '2px 0 6px' }}>
              {fmtDate(c.startsAt)} → {fmtDate(c.endsAt)} · {c.winnersCount} × ${c.prizeUsd}
              {c.partnerName ? ` · sponsor: ${c.partnerName}` : ''}
              {c.puzzleId ? (
                <>
                  {' · '}
                  <Link to={`/puzzles/${c.puzzleId}/view`} style={{ color: '#dbe4ff' }}>
                    target puzzle
                  </Link>
                </>
              ) : null}
            </div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {c.status === 'draft' && (
                <button style={smallBtn(true)} disabled={rowBusy === c.id} onClick={() => handleStatus(c, 'live')}>
                  Go live
                </button>
              )}
              {c.status === 'live' && (
                <button style={smallBtn()} disabled={rowBusy === c.id} onClick={() => handleStatus(c, 'ended')}>
                  End now
                </button>
              )}
              {(c.status === 'draft' || c.status === 'live') && (
                <button style={smallBtn()} onClick={() => { setForm(contestToForm(c)); setFormMsg(null); setVerifyMsg(null); }}>
                  Edit
                </button>
              )}
              {c.type !== 'discovery' && (
                <button style={smallBtn()} disabled={standingsBusy === c.id} onClick={() => handleStandings(c)}>
                  {standingsBusy === c.id ? 'Computing…' : 'Standings'}
                </button>
              )}
              {c.status === 'ended' && (
                <button style={smallBtn(true)} disabled={rowBusy === c.id} onClick={() => handleSettle(c)}>
                  Settle
                </button>
              )}
              {(c.status === 'settled' || c.status === 'ended') && (
                <button style={smallBtn()} disabled={rowBusy === c.id} onClick={() => handleAwards(c)}>
                  Awards
                </button>
              )}
              {c.status === 'draft' && (
                <button
                  style={{ ...smallBtn(), background: 'rgba(239,68,68,0.25)', border: '1px solid rgba(239,68,68,0.5)' }}
                  disabled={rowBusy === c.id}
                  onClick={() => handleDelete(c)}
                >
                  Delete
                </button>
              )}
            </div>

            {/* Standings panel */}
            {standings?.contestId === c.id && (
              <div style={{ background: 'rgba(0,0,0,0.25)', borderRadius: 10, padding: '10px 12px', marginTop: 8 }}>
                <div style={{ fontWeight: 700, fontSize: '0.85rem', marginBottom: 2 }}>
                  Top 10 — {typeLabel(c.type)}
                </div>
                <div style={{ fontSize: '0.76rem', opacity: 0.65, marginBottom: 6 }}>
                  Computed {fmtDate(standings.computedAt)} · verify age/identity before paying —
                  the 18+ chip is self-declared, not verified.
                </div>
                {standings.entries.length === 0 && (
                  <div style={{ opacity: 0.7, fontSize: '0.85rem' }}>No qualifying entries yet.</div>
                )}
                {standings.entries.map((e: any, i) => {
                  const userId = e.creatorUserId ?? e.userId;
                  const isWinnerSlot =
                    i < c.winnersCount && (standings.type !== 'new_puzzle_popularity' || e.eligible);
                  return (
                    <div
                      key={userId + i}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 8,
                        padding: '4px 0',
                        fontSize: '0.85rem',
                        borderBottom: '1px solid rgba(255,255,255,0.06)',
                        opacity: standings.type === 'new_puzzle_popularity' && !e.eligible ? 0.55 : 1,
                      }}
                    >
                      <span style={{ width: 22, textAlign: 'right', opacity: 0.7 }}>{i + 1}.</span>
                      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {standings.type === 'new_puzzle_popularity'
                          ? `${e.puzzleName} — by ${e.creatorName}`
                          : e.userName}
                      </span>
                      <span style={{ marginLeft: 'auto', fontWeight: 700, color: '#feca57', whiteSpace: 'nowrap' }}>
                        {standings.type === 'new_puzzle_popularity' && `${e.distinctSolvers} solvers`}
                        {standings.type === 'solution_rush' && `${e.discoveries} discoveries`}
                        {standings.type === 'speed_trial' && fmtDuration(e.durationMs)}
                      </span>
                      {standings.type === 'new_puzzle_popularity' && !e.eligible && (
                        <span style={{ fontSize: '0.72rem', color: '#feca57' }}>below min</span>
                      )}
                      {isWinnerSlot && <span style={{ fontSize: '0.72rem', color: '#34d399' }}>🏆</span>}
                      <AgeChip ages={ages} userId={userId} />
                    </div>
                  );
                })}
              </div>
            )}

            {/* Awards panel */}
            {awards?.contestId === c.id && (
              <div style={{ background: 'rgba(0,0,0,0.25)', borderRadius: 10, padding: '10px 12px', marginTop: 8 }}>
                <div style={{ fontWeight: 700, fontSize: '0.85rem', marginBottom: 2 }}>Awards</div>
                <div style={{ fontSize: '0.76rem', opacity: 0.65, marginBottom: 6 }}>
                  Verify age/identity before paying — the 18+ chip is self-declared, not verified.
                  Payment itself stays outside the app (PayPal, by hand).
                </div>
                {awards.rows.length === 0 && (
                  <div style={{ opacity: 0.7, fontSize: '0.85rem' }}>No awards recorded.</div>
                )}
                {awards.rows.map((a) => (
                  <div
                    key={a.id}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 8,
                      padding: '4px 0',
                      fontSize: '0.85rem',
                      borderBottom: '1px solid rgba(255,255,255,0.06)',
                    }}
                  >
                    <span style={{ width: 22, textAlign: 'right', opacity: 0.7 }}>#{a.rank}</span>
                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {(a.userId && awardNames.get(a.userId)) || 'Anonymous'}
                    </span>
                    <span style={{ fontWeight: 700, color: '#feca57' }}>${a.amountUsd}</span>
                    <AgeChip ages={ages} userId={a.userId} />
                    {a.solutionId && (
                      <Link to={`/c/${a.solutionId}`} style={{ color: '#dbe4ff', fontSize: '0.8rem' }}>
                        replay
                      </Link>
                    )}
                    <button
                      onClick={() => togglePaid(a)}
                      disabled={awardBusy === a.id}
                      style={{
                        ...smallBtn(),
                        marginLeft: 'auto',
                        background: a.paidAt ? 'rgba(52,211,153,0.25)' : 'rgba(255,255,255,0.12)',
                        color: a.paidAt ? '#34d399' : '#fff',
                      }}
                    >
                      {a.paidAt ? '✓ Paid' : 'Mark paid'}
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })}
      {rowMsg && <div style={{ fontSize: '0.85rem', color: '#f87171', marginTop: 8 }}>{rowMsg}</div>}

      {/* Create / edit form */}
      {form && (
        <div style={{ background: 'rgba(0,0,0,0.25)', borderRadius: 10, padding: '12px 14px', marginTop: 14 }}>
          <div style={{ fontWeight: 700, fontSize: '0.9rem', marginBottom: 10 }}>
            {form.id ? 'Edit contest' : 'New contest'}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: 10 }}>
            <div>
              <label style={labelStyle}>Type</label>
              <select
                value={form.type}
                onChange={(e) => set({ type: e.target.value as EngineContestType })}
                disabled={!!form.id}
                style={fieldStyle}
              >
                {CREATABLE_TYPES.map((t) => (
                  <option key={t.value} value={t.value}>
                    {t.label}
                  </option>
                ))}
              </select>
            </div>
            <div style={{ gridColumn: 'span 2' }}>
              <label style={labelStyle}>Title</label>
              <input value={form.title} onChange={(e) => set({ title: e.target.value })} style={fieldStyle} placeholder="e.g. July Speed Trial" />
            </div>
            <div style={{ gridColumn: '1 / -1' }}>
              <label style={labelStyle}>Message (shown on the contests page)</label>
              <textarea
                rows={2}
                value={form.message}
                onChange={(e) => set({ message: e.target.value })}
                style={{ ...fieldStyle, resize: 'vertical' }}
              />
            </div>
            <div>
              <label style={labelStyle}>Starts</label>
              <input
                type="datetime-local"
                value={toLocalInput(form.startsAt)}
                onChange={(e) => set({ startsAt: fromLocalInput(e.target.value) })}
                style={fieldStyle}
              />
            </div>
            <div>
              <label style={labelStyle}>Ends</label>
              <input
                type="datetime-local"
                value={toLocalInput(form.endsAt)}
                onChange={(e) => set({ endsAt: fromLocalInput(e.target.value) })}
                style={fieldStyle}
              />
            </div>
            <div>
              <label style={labelStyle}>Prize per winner (USD, max {CONTEST_CAPS.maxPrizeUsd}; 0 = no-prize promo)</label>
              <input
                type="number"
                min={0}
                max={CONTEST_CAPS.maxPrizeUsd}
                value={form.prizeUsd}
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
                value={form.winnersCount}
                onChange={(e) => set({ winnersCount: Math.round(Number(e.target.value) || 0) })}
                style={fieldStyle}
              />
            </div>
            {form.type !== 'new_puzzle_popularity' && (
              <div style={{ gridColumn: '1 / -1' }}>
                <label style={labelStyle}>Target puzzle id (required)</label>
                <div style={{ display: 'flex', gap: 8 }}>
                  <input
                    value={form.puzzleId}
                    onChange={(e) => { set({ puzzleId: e.target.value }); setVerifyMsg(null); }}
                    style={{ ...fieldStyle, flex: 1 }}
                    placeholder="puzzle UUID"
                  />
                  <button style={smallBtn()} onClick={handleVerifyPuzzle}>
                    Verify
                  </button>
                </div>
                {verifyMsg && (
                  <div style={{ fontSize: '0.8rem', marginTop: 4, color: verifyMsg.startsWith('✓') ? '#34d399' : '#feca57' }}>
                    {verifyMsg}
                  </div>
                )}
              </div>
            )}
            {form.type === 'speed_trial' && (
              <div>
                <label style={labelStyle}>Palette (piece_set, default classic)</label>
                <input value={form.palette} onChange={(e) => set({ palette: e.target.value })} style={fieldStyle} />
              </div>
            )}
            {form.type === 'new_puzzle_popularity' && (
              <div>
                <label style={labelStyle}>Min distinct solvers to qualify (0 = none)</label>
                <input
                  type="number"
                  min={0}
                  value={form.minSolvers}
                  onChange={(e) => set({ minSolvers: Math.max(0, Math.round(Number(e.target.value) || 0)) })}
                  style={fieldStyle}
                />
              </div>
            )}
            <div>
              <label style={labelStyle}>Partner name (optional)</label>
              <input value={form.partnerName} onChange={(e) => set({ partnerName: e.target.value })} style={fieldStyle} placeholder="e.g. MoMath" />
            </div>
            <div>
              <label style={labelStyle}>Partner URL</label>
              <input value={form.partnerUrl} onChange={(e) => set({ partnerUrl: e.target.value })} style={fieldStyle} placeholder="https://…" />
            </div>
            <div style={{ gridColumn: '1 / -1' }}>
              <label style={labelStyle}>Sponsor logo (PNG/JPEG/WebP, ≤2MB — shown labeled “Sponsored”)</label>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                {form.partnerLogoUrl && (
                  <img
                    src={form.partnerLogoUrl}
                    alt="Sponsor logo"
                    style={{ height: 40, maxWidth: 140, objectFit: 'contain', background: 'rgba(255,255,255,0.9)', borderRadius: 6, padding: 2 }}
                  />
                )}
                <input
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  onChange={handleLogoFile}
                  disabled={logoBusy}
                  style={{ fontSize: '0.82rem', color: '#fff' }}
                />
                {form.partnerLogoUrl && (
                  <button style={smallBtn()} onClick={() => { set({ partnerLogoUrl: null }); setLogoMsg('Logo cleared — save to apply.'); }}>
                    Remove
                  </button>
                )}
              </div>
              {(logoBusy || logoMsg) && (
                <div style={{ fontSize: '0.8rem', opacity: 0.85, marginTop: 6 }}>{logoBusy ? 'Uploading…' : logoMsg}</div>
              )}
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginTop: 12, flexWrap: 'wrap' }}>
            <span style={{ fontSize: '0.85rem', color: totalPool > CONTEST_CAPS.maxTotalUsd ? '#f87171' : '#34d399' }}>
              Pool: {form.winnersCount} × ${form.prizeUsd} = ${totalPool}
            </span>
            <button style={{ ...smallBtn(), marginLeft: 'auto' }} onClick={() => { setForm(null); setFormMsg(null); }}>
              Cancel
            </button>
            <button style={smallBtn(true)} disabled={saving} onClick={handleSave}>
              {saving ? 'Saving…' : form.id ? 'Save changes' : 'Create contest'}
            </button>
          </div>
          {formMsg && <div style={{ fontSize: '0.85rem', color: '#f87171', marginTop: 8 }}>{formMsg}</div>}
        </div>
      )}
    </div>
  );
};

export default EngineContestsCard;
