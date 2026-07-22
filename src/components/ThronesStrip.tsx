// ThronesStrip — compact horizontal strip of boards the signed-in user
// currently leads ("👑 Your thrones"), each linking to that board's
// leaderboard. Renders nothing for guests or when there are no thrones.

import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../context/AuthContext';
import { getUserThrones, type BoardStanding } from '../services/boardAnalysisService';
import { paletteLabel } from '../utils/piecePalette';
import { track } from '../lib/observability';

export const ThronesStrip: React.FC = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [thrones, setThrones] = useState<BoardStanding[]>([]);

  useEffect(() => {
    if (!user?.id) return;
    let cancelled = false;
    getUserThrones(user.id).then((boards) => {
      if (!cancelled && boards.length) {
        setThrones(boards);
        track('thrones_strip_shown', { count: boards.length });
      }
    });
    return () => {
      cancelled = true;
    };
  }, [user?.id]);

  if (!user?.id || thrones.length === 0) return null;

  return (
    <div style={{ width: '100%', maxWidth: '500px', marginTop: '14px' }}>
      <div
        style={{
          fontWeight: 800,
          color: '#feca57',
          fontSize: '0.85rem',
          marginBottom: 6,
          textAlign: 'left',
        }}
      >
        👑 {t('thrones.title')}
      </div>
      <div
        style={{
          display: 'flex',
          gap: '8px',
          overflowX: 'auto',
          paddingBottom: '4px',
        }}
      >
        {thrones.map((b) => (
          <button
            key={`${b.puzzleId}:${b.palette}`}
            onClick={() => {
              track('throne_chip_clicked');
              navigate(`/leaderboards/${b.puzzleId}?palette=${encodeURIComponent(b.palette)}`);
            }}
            style={{
              flexShrink: 0,
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              padding: '7px 14px',
              borderRadius: '999px',
              border: '1px solid rgba(254,202,87,0.45)',
              background: 'rgba(254,202,87,0.14)',
              color: '#fff',
              fontWeight: 600,
              fontSize: '0.82rem',
              cursor: 'pointer',
              whiteSpace: 'nowrap',
            }}
          >
            <span>{b.puzzleName}</span>
            <span style={{ opacity: 0.7 }}>· {paletteLabel(b.palette, t)}</span>
          </button>
        ))}
      </div>
    </div>
  );
};

export default ThronesStrip;
