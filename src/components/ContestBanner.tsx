// ContestBanner — Discovery Challenge strip shown on the target puzzle's
// viewer page while the contest is live. Config comes from contest_settings
// (managed in /admin). Renders nothing when the contest is off, ended, or
// this isn't the contest puzzle.

import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { getContest, isContestLive, prizeLabel, type ContestConfig } from '../services/contestService';
import { fetchContestClaimedCount } from '../services/discoveryService';

export const ContestBanner: React.FC<{ puzzleId: string | undefined }> = ({ puzzleId }) => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [contest, setContest] = useState<ContestConfig | null>(null);
  const [claimed, setClaimed] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    getContest().then((c) => {
      if (cancelled) return;
      setContest(c);
      if (isContestLive(c) && puzzleId && puzzleId === c.puzzleId) {
        fetchContestClaimedCount().then((n) => {
          if (!cancelled) setClaimed(n);
        });
      }
    });
    return () => {
      cancelled = true;
    };
  }, [puzzleId]);

  if (!contest || !isContestLive(contest) || !puzzleId || puzzleId !== contest.puzzleId) {
    return null;
  }

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
        🏆 {t('contest.title')} — {t('contest.prizeLine', { n: contest.winners, prize: prizeLabel(contest) })}
      </div>
      <div style={{ fontSize: '0.8rem', fontWeight: 600, opacity: 0.85, marginTop: 2 }}>
        {claimed != null && t('contest.progress', { claimed, total: contest.winners })}
        {' · '}
        <span style={{ textDecoration: 'underline' }}>{t('contest.rulesLink')}</span>
        {contest.partnerName && (
          <> {' · '}{t('contest.broughtBy')} {contest.partnerName}</>
        )}
      </div>
    </div>
  );
};

export default ContestBanner;
