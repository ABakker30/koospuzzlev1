// Per-puzzle leaderboard — the "ghost pool". Every row is a playable dare:
// tapping a leader races their recorded solve via the /c/ challenge flow.
// Data is deduped best-per-solver and manual-only (leaderboardService), so
// this board always agrees with the "#2/7" rank slice shown post-solve.

import React, { useEffect, useMemo, useState } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  getFastestSolutionsForPuzzle,
  listPuzzlePalettes,
  LeaderboardEntry,
  PaletteBoard,
} from '../../services/leaderboardService';
import { paletteLabel } from '../../utils/piecePalette';
import { supabase } from '../../lib/supabase';
import { getUsernames } from '../../services/usernameService';
import { ThreeDotMenu } from '../../components/ThreeDotMenu';
import { OpenThrones } from './OpenThrones';
import { useAuth } from '../../context/AuthContext';
import { tokens } from '../../styles/tokens';
import ReportModal from '../../components/ReportModal';

type PuzzleMeta = { id: string; name: string };

function formatDuration(durationMs: number | null): string {
  if (durationMs == null) return '–';
  const totalSeconds = Math.round(durationMs / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

function formatScore(placements: number | null, total: number | null): string {
  if (placements == null || total == null) return '–';
  return `${placements}/${total}`;
}

const RANK_COLORS = ['#ffd700', '#c0c0c0', '#cd7f32'];

export const PuzzleLeaderboardPage: React.FC = () => {
  const { puzzleId } = useParams<{ puzzleId: string }>();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { t } = useTranslation();
  const { user } = useAuth();
  const [entries, setEntries] = useState<LeaderboardEntry[]>([]);
  const [names, setNames] = useState<Map<string, string>>(new Map());
  const [loading, setLoading] = useState(true);
  const [puzzleMeta, setPuzzleMeta] = useState<PuzzleMeta | null>(null);
  // Palette boards: Classic (canonical) + Free + every piece-set with solves.
  // ?palette= deep-links a specific board (thrones strip, share links).
  const [palette, setPalette] = useState<string>(() => {
    const p = searchParams.get('palette');
    return p && (p === 'classic' || p === 'free' || p.startsWith('only:')) ? p : 'classic';
  });
  const [boards, setBoards] = useState<PaletteBoard[]>([
    { palette: 'classic', solves: 0 },
    { palette: 'free', solves: 0 },
  ]);
  const [boardsLoaded, setBoardsLoaded] = useState(false);
  // Report-player flow (offensive names) — subtle flag on each row.
  const [reportUser, setReportUser] = useState<{ id: string; name: string } | null>(null);
  // Stable identity — OpenThrones re-verifies only when the boards change.
  const takenPalettes = useMemo(
    () => (boardsLoaded ? boards.filter((b) => b.solves > 0).map((b) => b.palette) : null),
    [boards, boardsLoaded]
  );

  const displayName = (e: LeaderboardEntry) =>
    (e.created_by && names.get(e.created_by)) ||
    e.solver_name?.split('@')[0] ||
    '—';

  useEffect(() => {
    if (!puzzleId) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    (async () => {
      setLoading(true);
      const data = await getFastestSolutionsForPuzzle(puzzleId, palette);
      const nameMap = await getUsernames(data.map((d) => d.created_by));
      if (!cancelled) {
        setEntries(data);
        setNames(nameMap);
        setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [puzzleId, palette]);

  // Which palette boards exist for this puzzle.
  useEffect(() => {
    if (!puzzleId) return;
    let cancelled = false;
    listPuzzlePalettes(puzzleId).then((b) => {
      if (!cancelled) {
        if (b.length > 0) setBoards(b);
        setBoardsLoaded(true);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [puzzleId]);

  useEffect(() => {
    if (!puzzleId) return;
    let cancelled = false;
    (async () => {
      const { data, error } = await supabase
        .from('puzzles')
        .select('id, name')
        .eq('id', puzzleId)
        .single();
      if (!cancelled && !error && data) setPuzzleMeta(data);
    })();
    return () => {
      cancelled = true;
    };
  }, [puzzleId]);

  if (!puzzleId) {
    return (
      <div style={{ padding: '2rem', color: '#fff', background: '#0b0b1e', height: '100dvh' }}>
        <p>{t('leaderboard.noPuzzle')}</p>
      </div>
    );
  }

  const panel: React.CSSProperties = {
    background: 'rgba(255,255,255,0.07)',
    borderRadius: '16px',
    padding: '3rem',
    textAlign: 'center',
    color: 'rgba(255,255,255,0.9)',
    fontSize: '1.1rem',
  };

  return (
    <div
      style={{
        height: '100dvh',
        overflowY: 'auto',
        background: '#0b0b1e',
        padding: 'clamp(1rem, 5vw, 2rem)',
        boxSizing: 'border-box',
      }}
    >
      <div style={{ maxWidth: '760px', margin: '0 auto' }}>
        {/* Header */}
        <div
          style={{
            marginBottom: '1.5rem',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            gap: '1rem',
          }}
        >
          <div style={{ flex: '1 1 auto', minWidth: 0 }}>
            <h1
              style={{
                fontSize: 'clamp(1.4rem, 5vw, 2.1rem)',
                fontWeight: 800,
                color: '#fff',
                margin: '0 0 0.25rem',
              }}
            >
              {t('leaderboard.title')}
            </h1>
            <p
              style={{
                fontSize: 'clamp(0.9rem, 3vw, 1.05rem)',
                color: 'rgba(255,255,255,0.65)',
                margin: 0,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              {puzzleMeta?.name ?? ''}
            </p>
          </div>
          <ThreeDotMenu
            items={[{ icon: '←', label: t('leaderboard.back'), onClick: () => navigate(-1) }]}
          />
        </div>

        {/* Palette selector — every board is its own competition. */}
        <div
          style={{
            display: 'flex',
            gap: '8px',
            overflowX: 'auto',
            paddingBottom: '4px',
            marginBottom: '1rem',
          }}
        >
          {boards.map((b) => {
            const active = b.palette === palette;
            return (
              <button
                key={b.palette}
                onClick={() => setPalette(b.palette)}
                style={{
                  flexShrink: 0,
                  padding: '7px 14px',
                  borderRadius: '999px',
                  border: `1px solid ${active ? tokens.color.accent : 'rgba(255,255,255,0.2)'}`,
                  background: active ? 'rgba(102,126,234,0.25)' : 'rgba(255,255,255,0.06)',
                  color: '#fff',
                  fontWeight: active ? 700 : 500,
                  fontSize: '0.85rem',
                  cursor: 'pointer',
                  whiteSpace: 'nowrap',
                }}
              >
                {paletteLabel(b.palette, t)}
                <span style={{ opacity: 0.55, marginLeft: 6 }}>{b.solves}</span>
              </button>
            );
          })}
        </div>
        {palette === 'free' && (
          <p style={{ color: 'rgba(255,255,255,0.55)', fontSize: '0.8rem', margin: '0 0 0.75rem' }}>
            {t('leaderboard.freeRanking')}
          </p>
        )}

        {/* Open thrones — verified-playable palettes nobody has claimed yet. */}
        <OpenThrones puzzleId={puzzleId} takenPalettes={takenPalettes} />

        {loading ? (
          <div style={panel}>{t('leaderboard.loading')}</div>
        ) : entries.length === 0 ? (
          <div style={panel}>
            {t('leaderboard.empty')}
            <br />
            <span style={{ fontSize: '0.9rem', opacity: 0.7 }}>{t('leaderboard.beFirst')}</span>
          </div>
        ) : (
          <div
            style={{
              background: 'rgba(255,255,255,0.05)',
              borderRadius: '16px',
              overflow: 'hidden',
              border: '1px solid rgba(255,255,255,0.08)',
            }}
          >
            {entries.map((e, index) => {
              const isMine = !!user && e.created_by === user.id;
              const rankColor = RANK_COLORS[index] ?? 'rgba(255,255,255,0.5)';
              return (
                <div
                  key={e.id}
                  onClick={() => navigate(`/c/${e.id}`)}
                  role="link"
                  title={t('challenge.race', { name: displayName(e) })}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 'clamp(0.5rem, 2.5vw, 1rem)',
                    padding: 'clamp(0.7rem, 2.5vw, 1rem) clamp(0.75rem, 3vw, 1.25rem)',
                    borderBottom: '1px solid rgba(255,255,255,0.06)',
                    background: isMine ? 'rgba(102,126,234,0.18)' : 'transparent',
                    borderLeft: isMine ? `3px solid ${tokens.color.accent}` : '3px solid transparent',
                    cursor: 'pointer',
                    transition: 'background 0.15s',
                  }}
                  onMouseOver={(ev) => {
                    ev.currentTarget.style.background = 'rgba(255,255,255,0.08)';
                  }}
                  onMouseOut={(ev) => {
                    ev.currentTarget.style.background = isMine ? 'rgba(102,126,234,0.18)' : 'transparent';
                  }}
                >
                  <div
                    style={{
                      width: '2.2rem',
                      textAlign: 'center',
                      fontWeight: 800,
                      color: rankColor,
                      fontSize: index < 3 ? '1.1rem' : '0.95rem',
                      flexShrink: 0,
                    }}
                  >
                    #{index + 1}
                  </div>
                  <div
                    style={{
                      flex: 1,
                      minWidth: 0,
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                      color: '#fff',
                      fontWeight: index < 3 ? 700 : 500,
                    }}
                  >
                    {displayName(e)}
                    {isMine && (
                      <span
                        style={{
                          marginLeft: 8,
                          fontSize: '0.7rem',
                          fontWeight: 700,
                          color: '#fff',
                          background: tokens.color.accent,
                          borderRadius: '999px',
                          padding: '2px 8px',
                          verticalAlign: 'middle',
                        }}
                      >
                        {t('leaderboard.you')}
                      </span>
                    )}
                  </div>
                  <div style={{ fontWeight: 700, color: tokens.color.success, flexShrink: 0 }}>
                    {formatScore(e.placements_by_you, e.total_pieces)}
                    {palette === 'free' && e.duplicate_count != null && (
                      <span style={{ marginLeft: 6, fontSize: '0.75rem', color: 'rgba(255,255,255,0.6)', fontWeight: 600 }}>
                        {t('leaderboard.dupes', { count: e.duplicate_count })}
                      </span>
                    )}
                  </div>
                  <div style={{ color: '#ffd24d', fontWeight: 600, flexShrink: 0, minWidth: '3.2rem', textAlign: 'right' }}>
                    {formatDuration(e.duration_ms)}
                  </div>
                  {!isMine && (
                    <div
                      style={{
                        flexShrink: 0,
                        background: tokens.gradient.success,
                        color: '#fff',
                        borderRadius: '999px',
                        padding: '5px 12px',
                        fontSize: '0.8rem',
                        fontWeight: 700,
                        whiteSpace: 'nowrap',
                      }}
                    >
                      🏁 {t('leaderboard.race')}
                    </div>
                  )}
                  {/* Subtle report flag — offensive display names */}
                  {!isMine && e.created_by && (
                    <button
                      onClick={(ev) => {
                        ev.stopPropagation();
                        setReportUser({ id: e.created_by!, name: displayName(e) });
                      }}
                      title={t('report.user')}
                      aria-label={t('report.user')}
                      style={{
                        flexShrink: 0,
                        background: 'transparent',
                        border: 'none',
                        cursor: 'pointer',
                        fontSize: '0.85rem',
                        opacity: 0.3,
                        padding: '4px',
                        lineHeight: 1,
                        transition: 'opacity 0.15s',
                      }}
                      onMouseEnter={(ev) => { ev.currentTarget.style.opacity = '0.85'; }}
                      onMouseLeave={(ev) => { ev.currentTarget.style.opacity = '0.3'; }}
                    >
                      🚩
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {reportUser && (
          <ReportModal
            isOpen
            onClose={() => setReportUser(null)}
            targetType="user"
            targetId={reportUser.id}
            targetLabel={reportUser.name}
            defaultReason="offensive_name"
          />
        )}
      </div>
    </div>
  );
};

export default PuzzleLeaderboardPage;
