// BeatenBanner — the comeback trigger. Shows on Home when someone outranked
// your best solve since you last looked; one tap races their exact solve.

import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../context/AuthContext';
import { fetchBeatenEvents, markBeatenSeen, type BeatenEvent } from '../services/beatenService';
import { track } from '../lib/observability';

export const BeatenBanner: React.FC = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [events, setEvents] = useState<BeatenEvent[]>([]);

  useEffect(() => {
    if (!user?.id) return;
    let cancelled = false;
    fetchBeatenEvents(user.id).then((e) => {
      if (!cancelled && e.length) {
        setEvents(e);
        track('beaten_banner_shown', { count: e.length });
      }
    });
    return () => {
      cancelled = true;
    };
  }, [user?.id]);

  if (!user?.id || events.length === 0) return null;

  const dismiss = () => {
    markBeatenSeen(user.id);
    setEvents([]);
  };

  return (
    <div
      style={{
        width: '100%',
        maxWidth: '500px',
        boxSizing: 'border-box',
        background: 'linear-gradient(135deg, rgba(248,113,113,0.18) 0%, rgba(254,202,87,0.14) 100%)',
        border: '1px solid rgba(248,113,113,0.45)',
        borderRadius: '14px',
        padding: '14px 16px',
        marginTop: '16px',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', marginBottom: 8 }}>
        <span style={{ fontWeight: 800, color: '#f87171', fontSize: '0.85rem' }}>
          🏁 {t('beaten.title')}
        </span>
        <button
          onClick={dismiss}
          style={{
            margin: '-8px -8px -8px auto',
            padding: '8px',
            background: 'none',
            border: 'none',
            color: 'rgba(255,255,255,0.55)',
            cursor: 'pointer',
            fontSize: '1rem',
          }}
        >
          ✕
        </button>
      </div>
      {events.map((e) => (
        <div
          key={e.puzzleId}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            padding: '5px 0',
            fontSize: '0.88rem',
            color: 'rgba(255,255,255,0.9)',
          }}
        >
          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {t('beaten.row', { name: e.byName, puzzle: e.puzzleName })}
          </span>
          <button
            onClick={() => {
              markBeatenSeen(user.id);
              track('beaten_race_clicked');
              navigate(`/c/${e.solutionId}`);
            }}
            style={{
              marginLeft: 'auto',
              background: 'linear-gradient(135deg, #f87171 0%, #ef4444 100%)',
              border: 'none',
              borderRadius: '999px',
              color: '#fff',
              fontWeight: 700,
              fontSize: '0.8rem',
              padding: '5px 14px',
              cursor: 'pointer',
              whiteSpace: 'nowrap',
            }}
          >
            🏁 {t('beaten.reclaim')}
          </button>
        </div>
      ))}
    </div>
  );
};

export default BeatenBanner;
