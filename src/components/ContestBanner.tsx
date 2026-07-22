// ContestBanner — Discovery Challenge strip shown on the target puzzle's
// viewer page while the contest is live. Config comes from contest_settings
// (managed in /admin). Renders nothing when the contest is off, ended, or
// this isn't the contest puzzle. When a sponsor logo is configured it shows
// a small, explicitly-labeled "Sponsored by" link; signed-in users also get
// the 18+ prize-eligibility affordance (attestation only — never gates play).

import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { getContest, isContestLive, prizeLabel, type ContestConfig } from '../services/contestService';
import { fetchContestClaimedCount } from '../services/discoveryService';
import { useAuth } from '../context/AuthContext';
import { AgeGateModal } from './AgeGateModal';

export const ContestBanner: React.FC<{ puzzleId: string | undefined }> = ({ puzzleId }) => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [contest, setContest] = useState<ContestConfig | null>(null);
  const [claimed, setClaimed] = useState<number | null>(null);
  const [showAgeGate, setShowAgeGate] = useState(false);

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

  // Three states via AuthContext: string = attested, null = not yet,
  // undefined = age_confirmed_at column missing (pre-migration) → hidden.
  const ageState = user ? user.age_confirmed_at : undefined;

  return (
    <>
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
        {contest.partnerName && !contest.partnerLogoUrl && (
          <> {' · '}{t('contest.broughtBy')} {contest.partnerName}</>
        )}
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
              style={{ color: '#1a1a1a' }}
            >
              {t('contest.sponsoredBy')} {contest.partnerName}
            </a>
          ) : (
            <span>{t('contest.sponsoredBy')} {contest.partnerName}</span>
          )}
        </div>
      )}
      {/* 18+ eligibility line — signed-in only; hidden pre-migration */}
      {ageState !== undefined && (
        <div style={{ marginTop: 4, fontSize: '0.76rem', fontWeight: 700 }}>
          {ageState ? (
            <span style={{ color: '#166534' }}>✓ {t('contest.eligible')}</span>
          ) : (
            <button
              onClick={(e) => {
                e.stopPropagation();
                setShowAgeGate(true);
              }}
              style={{
                background: 'rgba(0,0,0,0.15)',
                border: '1px solid rgba(0,0,0,0.25)',
                borderRadius: 999,
                color: '#1a1a1a',
                fontSize: '0.76rem',
                fontWeight: 700,
                padding: '3px 10px',
                cursor: 'pointer',
              }}
            >
              {t('contest.confirmAge')}
            </button>
          )}
        </div>
      )}
    </div>
    <AgeGateModal isOpen={showAgeGate} onClose={() => setShowAgeGate(false)} />
    </>
  );
};

export default ContestBanner;
