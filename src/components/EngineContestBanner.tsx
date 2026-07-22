// EngineContestBanner — contest-engine strip on the puzzle viewer page, shown
// when a LIVE engine contest targets THIS puzzle (solution_rush /
// speed_trial). Sits alongside the legacy ContestBanner (offset below it when
// both fire for the same puzzle). Renders nothing pre-migration or when no
// engine contest targets the puzzle — fetch errors are swallowed upstream.
// Click → /contests (the public contest hub).

import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  fetchLiveContestsForPuzzle,
  type EngineContest,
} from '../services/contestEngineService';
import { getContest, isContestLive } from '../services/contestService';

export const EngineContestBanner: React.FC<{ puzzleId: string | undefined }> = ({ puzzleId }) => {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const [contest, setContest] = useState<EngineContest | null>(null);
  const [legacyVisible, setLegacyVisible] = useState(false);

  useEffect(() => {
    if (!puzzleId) return;
    let cancelled = false;
    fetchLiveContestsForPuzzle(puzzleId).then((list) => {
      if (!cancelled) setContest(list[0] ?? null);
    });
    // The legacy Discovery Challenge banner is fixed top-center; when it's
    // showing for this same puzzle, drop this strip below it.
    getContest().then((c) => {
      if (!cancelled) setLegacyVisible(isContestLive(c) && c.puzzleId === puzzleId);
    });
    return () => {
      cancelled = true;
    };
  }, [puzzleId]);

  if (!contest || !puzzleId) return null;

  const prize = `$${contest.prizeUsd}`;
  const promo = contest.prizeUsd === 0;
  const end = contest.endsAt
    ? new Date(contest.endsAt).toLocaleDateString(i18n.language, { month: 'short', day: 'numeric' })
    : null;
  const line =
    contest.type === 'speed_trial'
      ? promo
        ? t('contestsHub.bannerSpeedPromo')
        : t('contestsHub.bannerSpeed', { prize })
      : promo
        ? end
          ? t('contestsHub.bannerRushPromo', { end })
          : t('contestsHub.bannerRushPromoNoEnd')
        : end
          ? t('contestsHub.bannerRush', { prize, end })
          : t('contestsHub.bannerRushNoEnd', { prize });

  return (
    <div
      onClick={() => navigate('/contests')}
      style={{
        position: 'fixed',
        top: legacyVisible
          ? 'calc(max(12px, env(safe-area-inset-top, 12px)) + 96px)'
          : 'max(12px, env(safe-area-inset-top, 12px))',
        left: '50%',
        transform: 'translateX(-50%)',
        zIndex: 899,
        maxWidth: 'min(92vw, 460px)',
        background: 'linear-gradient(135deg, rgba(96,165,250,0.95) 0%, rgba(59,130,246,0.95) 100%)',
        color: '#0b1220',
        borderRadius: 14,
        padding: '8px 16px',
        boxShadow: '0 6px 24px rgba(59,130,246,0.45)',
        cursor: 'pointer',
        textAlign: 'center',
      }}
    >
      <div style={{ fontWeight: 800, fontSize: '0.9rem' }}>
        {contest.type === 'speed_trial' ? '⏱️' : '🏁'} {line}
      </div>
      {/* Sponsor row — logo + explicit "Sponsored by" label linking the partner */}
      {contest.partnerLogoUrl && contest.partnerName && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 6,
            marginTop: 4,
            fontSize: '0.78rem',
            fontWeight: 600,
          }}
        >
          <img
            src={contest.partnerLogoUrl}
            alt={contest.partnerName}
            style={{ height: 28, maxWidth: 120, objectFit: 'contain', borderRadius: 4 }}
          />
          {contest.partnerUrl ? (
            <a
              href={contest.partnerUrl}
              target="_blank"
              rel="sponsored noopener noreferrer"
              onClick={(e) => e.stopPropagation()}
              style={{ color: '#0b1220' }}
            >
              {t('contest.sponsoredBy')} {contest.partnerName}
            </a>
          ) : (
            <span>
              {t('contest.sponsoredBy')} {contest.partnerName}
            </span>
          )}
        </div>
      )}
    </div>
  );
};

export default EngineContestBanner;
