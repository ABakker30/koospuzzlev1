// ReportsCard — admin review queue for public.reports (migration
// 20260805_moderation.sql). Open reports newest-first with a badge count;
// per-report: jump to the target (puzzle view / solution's puzzle + replay /
// username), Resolve with an optional note, and a "Delete puzzle" danger
// shortcut for puzzle targets (admin RLS already allows it — reuses
// api/puzzles.deletePuzzle). Resolved reports from the last 30 days sit in a
// collapsed, dimmed section. Admin-only English (like the rest of /admin);
// degrades to a "run the migration" note while the table doesn't exist.

import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import { deletePuzzle } from '../../api/puzzles';
import { getUsernames } from '../../services/usernameService';
import {
  listReports,
  resolveReport,
  type ReportRecord,
} from '../../services/moderationService';

const card: React.CSSProperties = {
  background: 'rgba(255,255,255,0.10)',
  borderRadius: 16,
  padding: '16px 18px',
};
const smallBtn = (danger = false): React.CSSProperties => ({
  background: danger ? 'rgba(239,68,68,0.25)' : 'rgba(255,255,255,0.12)',
  color: '#fff',
  border: danger ? '1px solid rgba(239,68,68,0.5)' : '1px solid rgba(255,255,255,0.2)',
  borderRadius: 8,
  padding: '4px 12px',
  cursor: 'pointer',
  fontSize: '0.8rem',
  fontWeight: 700,
});

const timeAgo = (iso: string): string => {
  const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
};

const TYPE_ICON: Record<string, string> = { puzzle: '🧩', solution: '🏆', user: '👤' };
const REASON_LABEL: Record<string, string> = {
  inappropriate: 'inappropriate',
  spam: 'spam',
  offensive_name: 'offensive name',
  other: 'other',
};

interface TargetMeta {
  /** solution reports: the puzzle the solution belongs to. */
  puzzleIdOfSolution?: string;
  /** puzzle reports (and solutions' puzzles): display name. */
  puzzleName?: string;
  /** user reports: current username. */
  username?: string;
}

const ReportsCard: React.FC = () => {
  const [reports, setReports] = useState<ReportRecord[]>([]);
  const [missingTable, setMissingTable] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [meta, setMeta] = useState<Map<string, TargetMeta>>(new Map());
  const [reporterNames, setReporterNames] = useState<Map<string, string>>(new Map());
  const [busy, setBusy] = useState<string | null>(null);
  const [notes, setNotes] = useState<Record<string, string>>({}); // reportId -> resolution draft
  const [showResolved, setShowResolved] = useState(false);
  const [deleted, setDeleted] = useState<Set<string>>(new Set()); // puzzle ids removed here

  const load = async () => {
    const res = await listReports();
    setReports(res.reports);
    setMissingTable(res.missingTable);
    setError(res.missingTable ? null : res.error);
    setLoaded(true);
    if (res.reports.length === 0) return;

    // Resolve display context in bounded batches: reporter names, user-target
    // names, solution→puzzle mapping, puzzle names. All best-effort — a
    // failed lookup just leaves the raw id visible.
    const reporterIds = res.reports.map((r) => r.reporterId).filter(Boolean) as string[];
    const userTargetIds = res.reports
      .filter((r) => r.targetType === 'user')
      .map((r) => r.targetId);
    const solutionIds = [
      ...new Set(res.reports.filter((r) => r.targetType === 'solution').map((r) => r.targetId)),
    ];
    const directPuzzleIds = res.reports
      .filter((r) => r.targetType === 'puzzle')
      .map((r) => r.targetId);

    const nextMeta = new Map<string, TargetMeta>();
    try {
      const names = await getUsernames([...reporterIds, ...userTargetIds]);
      setReporterNames(names);
      for (const id of userTargetIds) {
        nextMeta.set(`user:${id}`, { username: names.get(id) ?? undefined });
      }
    } catch { /* ignore */ }

    const puzzleIds = new Set<string>(directPuzzleIds);
    if (solutionIds.length > 0) {
      try {
        const { data } = await supabase
          .from('solutions')
          .select('id, puzzle_id')
          .in('id', solutionIds.slice(0, 200));
        for (const row of (data ?? []) as any[]) {
          nextMeta.set(`solution:${row.id}`, { puzzleIdOfSolution: row.puzzle_id });
          if (row.puzzle_id) puzzleIds.add(row.puzzle_id);
        }
      } catch { /* ignore */ }
    }
    if (puzzleIds.size > 0) {
      try {
        const { data } = await supabase
          .from('puzzles')
          .select('id, name')
          .in('id', [...puzzleIds].slice(0, 200));
        const nameById = new Map((data ?? []).map((p: any) => [p.id, p.name ?? 'Untitled']));
        for (const r of res.reports) {
          if (r.targetType === 'puzzle') {
            const cur = nextMeta.get(`puzzle:${r.targetId}`) ?? {};
            nextMeta.set(`puzzle:${r.targetId}`, { ...cur, puzzleName: nameById.get(r.targetId) });
          } else if (r.targetType === 'solution') {
            const cur = nextMeta.get(`solution:${r.targetId}`);
            if (cur?.puzzleIdOfSolution) {
              nextMeta.set(`solution:${r.targetId}`, {
                ...cur,
                puzzleName: nameById.get(cur.puzzleIdOfSolution),
              });
            }
          }
        }
      } catch { /* ignore */ }
    }
    setMeta(nextMeta);
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleResolve = async (r: ReportRecord) => {
    setBusy(r.id);
    const err = await resolveReport(r.id, notes[r.id]);
    setBusy(null);
    if (err) {
      setError(err);
      return;
    }
    setReports((prev) =>
      prev.map((x) =>
        x.id === r.id
          ? { ...x, resolvedAt: new Date().toISOString(), resolution: notes[r.id]?.trim() || null }
          : x
      )
    );
  };

  const handleDeletePuzzle = async (r: ReportRecord) => {
    const name = meta.get(`puzzle:${r.targetId}`)?.puzzleName ?? r.targetId.slice(0, 8);
    if (!window.confirm(`Delete puzzle “${name}”? This removes it (and cascades per DB rules) for everyone.`)) return;
    setBusy(r.id);
    try {
      await deletePuzzle(r.targetId);
      setDeleted((prev) => new Set(prev).add(r.targetId));
    } catch (e: any) {
      setError(e?.message ?? String(e));
    } finally {
      setBusy(null);
    }
  };

  const open = reports.filter((r) => !r.resolvedAt);
  const resolved = reports.filter(
    (r) => r.resolvedAt && Date.now() - new Date(r.resolvedAt).getTime() < 30 * 86_400_000
  );

  const targetCell = (r: ReportRecord): React.ReactNode => {
    if (r.targetType === 'puzzle') {
      const m = meta.get(`puzzle:${r.targetId}`);
      if (deleted.has(r.targetId)) return <span style={{ opacity: 0.6 }}>puzzle deleted</span>;
      return (
        <Link to={`/puzzles/${r.targetId}/view`} style={{ color: '#dbe4ff' }}>
          {m?.puzzleName ?? `puzzle ${r.targetId.slice(0, 8)}…`}
        </Link>
      );
    }
    if (r.targetType === 'solution') {
      const m = meta.get(`solution:${r.targetId}`);
      return (
        <span>
          {m?.puzzleIdOfSolution ? (
            <Link to={`/puzzles/${m.puzzleIdOfSolution}/view`} style={{ color: '#dbe4ff' }}>
              {m.puzzleName ?? `puzzle ${m.puzzleIdOfSolution.slice(0, 8)}…`}
            </Link>
          ) : (
            <span style={{ opacity: 0.6 }}>solution {r.targetId.slice(0, 8)}…</span>
          )}{' '}
          <Link to={`/c/${r.targetId}`} style={{ color: '#dbe4ff', opacity: 0.8 }}>
            (replay)
          </Link>
        </span>
      );
    }
    const m = meta.get(`user:${r.targetId}`);
    return <span>{m?.username ?? `user ${r.targetId.slice(0, 8)}…`}</span>;
  };

  const reportRow = (r: ReportRecord, dimmed: boolean) => (
    <div
      key={r.id}
      style={{
        padding: '8px 0',
        borderBottom: '1px solid rgba(255,255,255,0.08)',
        fontSize: '0.88rem',
        opacity: dimmed ? 0.55 : 1,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <span>{TYPE_ICON[r.targetType] ?? '❓'}</span>
        <span style={{ fontWeight: 700 }}>{targetCell(r)}</span>
        <span
          style={{
            background: 'rgba(255,255,255,0.12)',
            borderRadius: 999,
            padding: '1px 8px',
            fontSize: '0.72rem',
            fontWeight: 700,
          }}
        >
          {REASON_LABEL[r.reason] ?? r.reason}
        </span>
        <span style={{ opacity: 0.65, fontSize: '0.78rem', marginLeft: 'auto', whiteSpace: 'nowrap' }}>
          by {(r.reporterId && reporterNames.get(r.reporterId)) ?? 'unknown'} · {timeAgo(r.createdAt)}
        </span>
      </div>
      {r.note && (
        <div style={{ opacity: 0.8, fontSize: '0.82rem', margin: '4px 0 0 26px', whiteSpace: 'pre-wrap' }}>
          “{r.note}”
        </div>
      )}
      {dimmed ? (
        r.resolution && (
          <div style={{ fontSize: '0.78rem', opacity: 0.8, margin: '4px 0 0 26px' }}>
            ✓ {r.resolution}
          </div>
        )
      ) : (
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', margin: '6px 0 0 26px', flexWrap: 'wrap' }}>
          <input
            value={notes[r.id] ?? ''}
            onChange={(e) => setNotes((n) => ({ ...n, [r.id]: e.target.value }))}
            placeholder="resolution note (optional)"
            style={{
              flex: '1 1 160px',
              minWidth: 120,
              background: 'rgba(0,0,0,0.3)',
              border: '1px solid rgba(255,255,255,0.2)',
              borderRadius: 8,
              color: '#fff',
              padding: '4px 8px',
              fontSize: '0.8rem',
            }}
          />
          <button onClick={() => handleResolve(r)} disabled={busy === r.id} style={smallBtn()}>
            ✓ Resolve
          </button>
          {r.targetType === 'puzzle' && !deleted.has(r.targetId) && (
            <button onClick={() => handleDeletePuzzle(r)} disabled={busy === r.id} style={smallBtn(true)}>
              🗑 Delete puzzle
            </button>
          )}
        </div>
      )}
    </div>
  );

  return (
    <div style={{ ...card, marginTop: 20 }}>
      <div style={{ fontWeight: 700, marginBottom: 2, display: 'flex', alignItems: 'center', gap: 8 }}>
        🚩 Reports
        {open.length > 0 && (
          <span
            style={{
              background: 'rgba(239,68,68,0.85)',
              borderRadius: 999,
              padding: '1px 9px',
              fontSize: '0.75rem',
              fontWeight: 800,
            }}
          >
            {open.length}
          </span>
        )}
      </div>
      <div style={{ fontSize: '0.8rem', opacity: 0.65, marginBottom: 10 }}>
        Player flags on puzzles, solutions and usernames (10/hr per reporter, DB-enforced).
      </div>

      {missingTable && (
        <div style={{ opacity: 0.75, fontSize: '0.88rem' }}>
          Reports table missing — run 20260805_moderation.sql in Supabase to enable moderation.
        </div>
      )}
      {error && !missingTable && (
        <div style={{ background: 'rgba(239,68,68,0.25)', borderRadius: 8, padding: '8px 10px', fontSize: '0.85rem', marginBottom: 8 }}>
          {error}
        </div>
      )}
      {!missingTable && loaded && open.length === 0 && (
        <div style={{ opacity: 0.7, fontSize: '0.88rem' }}>No open reports 🎉</div>
      )}
      {!missingTable && !loaded && <div style={{ opacity: 0.7, fontSize: '0.88rem' }}>Loading…</div>}

      {open.map((r) => reportRow(r, false))}

      {resolved.length > 0 && (
        <div style={{ marginTop: 12 }}>
          <button
            onClick={() => setShowResolved((s) => !s)}
            style={{
              background: 'transparent',
              border: 'none',
              color: 'rgba(255,255,255,0.65)',
              cursor: 'pointer',
              fontSize: '0.82rem',
              padding: 0,
              fontWeight: 600,
            }}
          >
            {showResolved ? '▾' : '▸'} Resolved (last 30 days) · {resolved.length}
          </button>
          {showResolved && resolved.map((r) => reportRow(r, true))}
        </div>
      )}
    </div>
  );
};

export default ReportsCard;
