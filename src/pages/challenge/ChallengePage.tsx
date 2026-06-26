// Challenge landing page (/c/:id) — the screen someone lands on after tapping a
// shared challenge link. Resolves the target result (puzzle + solver + X/N +
// time) and frames it as "Beat <name> · X/N · time", then drops them into the
// same puzzle. Mirrors the clip's end-card look for visual continuity.
//
// Phase 2 slice 1: :id is the solution UUID for now; short /c/<code> links are a
// later URL-prettiness slice. Carrying the target into play + the verdict screen
// come next.

import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '../../lib/supabase';

type Target = {
  puzzle_id: string;
  solver_name: string | null;
  placements_by_you: number | null;
  total_pieces: number | null;
  duration_ms: number | null;
  puzzle_name: string | null;
};

type LoadState = 'loading' | 'ready' | 'notfound';

function formatDuration(ms: number | null): string | null {
  if (ms == null) return null;
  const s = Math.round(ms / 1000);
  return `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, '0')}`;
}

export const ChallengePage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [target, setTarget] = useState<Target | null>(null);
  const [state, setState] = useState<LoadState>('loading');

  useEffect(() => {
    if (!id) {
      setState('notfound');
      return;
    }
    let cancelled = false;

    (async () => {
      const { data, error } = await supabase
        .from('solutions')
        .select(
          'puzzle_id, solver_name, placements_by_you, total_pieces, duration_ms'
        )
        .eq('id', id)
        .single();

      if (cancelled) return;
      if (error || !data) {
        setState('notfound');
        return;
      }

      const { data: pz } = await supabase
        .from('puzzles')
        .select('name')
        .eq('id', data.puzzle_id)
        .single();

      if (cancelled) return;
      setTarget({ ...data, puzzle_name: pz?.name ?? null });
      setState('ready');
    })();

    return () => {
      cancelled = true;
    };
  }, [id]);

  const start = () => {
    if (target) navigate(`/game/${target.puzzle_id}?mode=solo&challenge=${id}`);
  };

  const name = target?.solver_name?.split('@')[0] || 'a solver';
  const score =
    target && target.placements_by_you != null && target.total_pieces != null
      ? `${target.placements_by_you}/${target.total_pieces}`
      : null;
  const time = formatDuration(target?.duration_ms ?? null);

  return (
    <div
      style={{
        minHeight: '100vh',
        width: '100%',
        background: '#0b0b1e',
        color: '#fff',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 'clamp(1rem, 5vw, 2rem)',
        boxSizing: 'border-box',
      }}
    >
      <div style={{ width: '100%', maxWidth: 380, textAlign: 'center' }}>
        {state === 'loading' && (
          <div style={{ fontSize: 16, opacity: 0.85 }}>Loading challenge…</div>
        )}

        {state === 'notfound' && (
          <>
            <div style={{ fontSize: 40, marginBottom: 12 }}>🧩</div>
            <div style={{ fontSize: 20, fontWeight: 700, marginBottom: 8 }}>
              Challenge not found
            </div>
            <div style={{ fontSize: 14, opacity: 0.8, marginBottom: 24 }}>
              This challenge link is invalid or has expired.
            </div>
            <button onClick={() => navigate('/gallery')} style={primaryBtn}>
              Browse puzzles
            </button>
          </>
        )}

        {state === 'ready' && target && (
          <>
            <div style={{ fontSize: 13, letterSpacing: 1, color: '#9fb4ff', textTransform: 'uppercase' }}>
              Challenge
            </div>
            <div style={{ fontSize: 'clamp(1.6rem, 7vw, 2.2rem)', fontWeight: 800, lineHeight: 1.1, margin: '6px 0 4px' }}>
              Beat {name}
            </div>
            {target.puzzle_name && (
              <div style={{ fontSize: 14, opacity: 0.7, marginBottom: 18 }}>
                {target.puzzle_name}
              </div>
            )}

            <div
              style={{
                display: 'flex',
                justifyContent: 'center',
                alignItems: 'baseline',
                gap: 14,
                margin: '8px 0 28px',
              }}
            >
              {score && (
                <span style={{ fontSize: 'clamp(2.4rem, 12vw, 3.4rem)', fontWeight: 800, color: '#10b981' }}>
                  {score}
                </span>
              )}
              {time && (
                <span style={{ fontSize: 'clamp(1.4rem, 7vw, 2rem)', fontWeight: 700, color: '#ffd24d' }}>
                  ⏱ {time}
                </span>
              )}
            </div>

            <button onClick={start} style={primaryBtn}>
              {score ? `Start — beat ${score}` : 'Start'}
            </button>

            <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.55)', marginTop: 16 }}>
              You place every piece yourself · fewer hints wins · ties go to time
            </div>
            <div style={{ fontSize: 13, color: '#ffd24d', marginTop: 18 }}>
              koospuzzle.com
            </div>
          </>
        )}
      </div>
    </div>
  );
};

const primaryBtn: React.CSSProperties = {
  width: '100%',
  background: '#10b981',
  color: '#fff',
  border: 'none',
  borderRadius: 12,
  padding: '16px 20px',
  fontSize: 18,
  fontWeight: 700,
  cursor: 'pointer',
  boxShadow: '0 6px 20px rgba(16,185,129,0.4)',
};

export default ChallengePage;
