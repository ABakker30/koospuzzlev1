// ContestBanner — Discovery Challenge strip shown on the target puzzle's
// viewer page while the contest is live. Renders nothing when the contest is
// disabled or this isn't the contest puzzle.

import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { CONTEST, contestActive, contestPrizeLabel } from '../constants/contest';
import { fetchContestClaimedCount } from '../services/discoveryService';

export const ContestBanner: React.FC<{ puzzleId: string | undefined }> = ({ puzzleId }) => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [claimed, setClaimed] = useState<number | null>(null);

  const show = contestActive() && !!puzzleId && puzzleId === CONTEST.puzzleId;

  useEffect(() => {
    if (!show) return;
    let cancelled = false;
    fetchContestClaimedCount().then((n) => {
      if (!cancelled) setClaimed(n);
    });
    return () => {
      cancelled = true;
    };
  }, [show]);

  if (!show) return null;

  return (
    <div
      onClick={() => navigate('/challenge-rules')}
      style={{
        position: 'fixed',
        top: 'max(12px, env(safe-area-inset-top, 12px))',
        left: '50%',
        transform: 'translateX(-50%)',
        zIndex: 900,
        maxWidth: 'min(92vw, 460px)',
        background: 'linear-gradient(135deg, rgba(254,202,87,0.95) 0%, rgba(245,158,11,0.95) 100%)',
        color: '#1a1a1a',
        borderRadius: 14,
        padding: '10px 16px',
        boxShadow: '0 6px 24px rgba(245,158,11,0.45)',
        cursor: 'pointer',
        textAlign: 'center',
      }}
    >
      <div style={{ fontWeight: 800, fontSize: '0.95rem' }}>
        🏆 {t('contest.title')} — {t('contest.prizeLine', { n: CONTEST.winners, prize: contestPrizeLabel() })}
      </div>
      <div style={{ fontSize: '0.8rem', fontWeight: 600, opacity: 0.85, marginTop: 2 }}>
        {claimed != null && t('contest.progress', { claimed, total: CONTEST.winners })}
        {' · '}
        <span style={{ textDecoration: 'underline' }}>{t('contest.rulesLink')}</span>
        {CONTEST.partner && (
          <> {' · '}{t('contest.broughtBy')} {CONTEST.partner.name}</>
        )}
      </div>
    </div>
  );
};

export default ContestBanner;
