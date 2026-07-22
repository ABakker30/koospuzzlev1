// OpenThrones — unclaimed palette boards for this puzzle: curated candidate
// palettes with zero solves that are PROVEN playable (chosenSetSolvability
// witness), each one tap away from founding a new board. Verification runs
// lazily after render and verdicts are cached per session, so repeat visits
// are free. Renders nothing until at least one candidate verifies.

import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { getPuzzleById } from '../../api/puzzles';
import { paletteLabel, palettePieces } from '../../utils/piecePalette';
import { track } from '../../lib/observability';

// Curated candidates: a handful of friendly single pieces plus a few pairs.
// Order matters — verification stops once MAX_SHOWN have said 'yes'.
const CANDIDATE_PALETTES = [
  'only:E',
  'only:L',
  'only:T',
  'only:D+Y',
  'only:E+L',
  'only:L+T',
];
const MAX_SHOWN = 4;

const verdictKey = (puzzleId: string, sig: string) => `openThrone:${puzzleId}:${sig}`;

interface OpenThronesProps {
  puzzleId: string;
  /** Palettes that already have solves — null while boards are loading. */
  takenPalettes: string[] | null;
}

export const OpenThrones: React.FC<OpenThronesProps> = ({ puzzleId, takenPalettes }) => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [open, setOpen] = useState<string[]>([]);

  useEffect(() => {
    if (!takenPalettes) return;
    let cancelled = false;
    const taken = new Set(takenPalettes);
    setOpen([]);

    (async () => {
      const verified: string[] = [];
      let geometry: Array<{ i: number; j: number; k: number }> | null = null;
      for (const sig of CANDIDATE_PALETTES) {
        if (cancelled || verified.length >= MAX_SHOWN) return;
        if (taken.has(sig)) continue;

        let verdict: string | null = null;
        try {
          verdict = sessionStorage.getItem(verdictKey(puzzleId, sig));
        } catch {
          /* storage unavailable — verify every time */
        }
        if (!verdict) {
          if (!geometry) {
            const puzzle = await getPuzzleById(puzzleId);
            geometry = puzzle?.geometry ?? null;
            if (!geometry || geometry.length === 0) return; // no cells, no checks
          }
          try {
            const { checkChosenSetSolvable } = await import(
              '../../game/engine/chosenSetSolvability'
            );
            const result = await checkChosenSetSolvable(geometry, palettePieces(sig), {
              witnessMs: 1500,
              dlxMs: 0,
            });
            verdict = result.verdict;
            console.log(`👑 [OpenThrones] ${sig}: ${result.verdict} (${result.decidedBy})`);
          } catch {
            verdict = 'unknown';
          }
          try {
            sessionStorage.setItem(verdictKey(puzzleId, sig), verdict);
          } catch {
            /* storage unavailable */
          }
        }
        if (cancelled) return;
        if (verdict === 'yes') {
          verified.push(sig);
          setOpen([...verified]);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [puzzleId, takenPalettes]);

  if (open.length === 0) return null;

  return (
    <div style={{ margin: '1.25rem 0 0.5rem' }}>
      <div style={{ fontWeight: 800, color: '#feca57', fontSize: '0.9rem', marginBottom: 4 }}>
        👑 {t('thrones.open')}
      </div>
      <p style={{ color: 'rgba(255,255,255,0.55)', fontSize: '0.8rem', margin: '0 0 0.6rem' }}>
        {t('thrones.openHint')}
      </p>
      <div style={{ display: 'flex', gap: '8px', overflowX: 'auto', paddingBottom: '4px' }}>
        {open.map((sig) => (
          <button
            key={sig}
            onClick={() => {
              track('open_throne_clicked', { palette: sig });
              navigate(`/game/${puzzleId}?palette=${encodeURIComponent(sig)}`);
            }}
            style={{
              flexShrink: 0,
              padding: '7px 14px',
              borderRadius: '999px',
              border: '1px solid rgba(254,202,87,0.45)',
              background: 'rgba(254,202,87,0.12)',
              color: '#fff',
              fontWeight: 600,
              fontSize: '0.85rem',
              cursor: 'pointer',
              whiteSpace: 'nowrap',
            }}
          >
            👑 {t('thrones.unclaimed', { label: paletteLabel(sig, t) })}
          </button>
        ))}
      </div>
    </div>
  );
};

export default OpenThrones;
