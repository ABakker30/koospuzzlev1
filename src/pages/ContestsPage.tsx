// ContestsPage — /contests, the public hub for the contest engine. Lists LIVE
// contests as cards (type description, window + days left, prize structure,
// target puzzle, labeled sponsor block, 18+ eligibility affordance) plus a
// dimmed "Recently ended" section for the last 30 days (with winners for
// settled contests, where RLS lets the viewer read the awards). Everything
// degrades to an empty state pre-migration — the engine service swallows
// missing-table errors.

import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { tokens } from '../styles/tokens';
import {
  fetchLiveContests,
  fetchRecentlyEndedContests,
  listAwards,
  type EngineAward,
  type EngineContest,
} from '../services/contestEngineService';
import { getPuzzleById } from '../api/puzzles';
import { getUsernames } from '../services/usernameService';
import { useAuth } from '../context/AuthContext';
import { AgeGateModal } from '../components/AgeGateModal';

const typeKey = (t: EngineContest['type']): string =>
  t === 'speed_trial' ? 'typeSpeed' : t === 'new_puzzle_popularity' ? 'typePopularity' : 'typeRush';

export const ContestsPage: React.FC = () => {
  const { t, i18n } = useTranslation();
  const { user } = useAuth();
  const [live, setLive] = useState<EngineContest[] | null>(null);
  const [ended, setEnded] = useState<EngineContest[]>([]);
  const [puzzleNames, setPuzzleNames] = useState<Map<string, string>>(new Map());
  const [winners, setWinners] = useState<Map<string, { award: EngineAward; name: string }[]>>(
    new Map()
  );
  const [showAgeGate, setShowAgeGate] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [liveList, endedList] = await Promise.all([
        fetchLiveContests(),
        fetchRecentlyEndedContests(30),
      ]);
      if (cancelled) return;
      setLive(liveList);
      setEnded(endedList);

      // Resolve target-puzzle names (one lookup per unique id).
      const ids = [
        ...new Set(
          [...liveList, ...endedList].map((c) => c.puzzleId).filter((x): x is string => !!x)
        ),
      ];
      const pairs = await Promise.all(
        ids.map(async (id) => [id, (await getPuzzleById(id))?.name ?? null] as const)
      );
      if (cancelled) return;
      const nameMap = new Map<string, string>();
      for (const [id, name] of pairs) if (name) nameMap.set(id, name);
      setPuzzleNames(nameMap);

      // Winners for settled contests — RLS may hide rows from this viewer
      // (users read only their own awards); we show whatever comes back.
      const settled = endedList.filter((c) => c.status === 'settled');
      const awardLists = await Promise.all(settled.map((c) => listAwards(c.id)));
      const allUserIds = awardLists.flat().map((a) => a.userId);
      const names = await getUsernames(allUserIds);
      if (cancelled) return;
      const winMap = new Map<string, { award: EngineAward; name: string }[]>();
      settled.forEach((c, i) => {
        const rows = awardLists[i];
        if (rows.length > 0) {
          winMap.set(
            c.id,
            rows.map((a) => ({
              award: a,
              name: (a.userId && names.get(a.userId)) || 'Anonymous',
            }))
          );
        }
      });
      setWinners(winMap);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const fmtDate = (iso: string): string =>
    new Date(iso).toLocaleDateString(i18n.language, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });

  const windowLine = (c: EngineContest): string => {
    const parts: string[] = [];
    if (c.startsAt && new Date(c.startsAt).getTime() > Date.now()) {
      parts.push(t('contestsHub.startsOn', { date: fmtDate(c.startsAt) }));
    }
    if (c.endsAt) {
      const msLeft = new Date(c.endsAt).getTime() - Date.now();
      parts.push(t('contestsHub.endsOn', { date: fmtDate(c.endsAt) }));
      if (msLeft > 0) {
        const days = Math.floor(msLeft / 86_400_000);
        parts.push(
          days === 0
            ? t('contestsHub.endsToday')
            : days === 1
              ? t('contestsHub.daysLeftOne')
              : t('contestsHub.daysLeftMany', { count: days })
        );
      }
    } else {
      parts.push(t('contestsHub.noEnd'));
    }
    return parts.join(' · ');
  };

  const description = (c: EngineContest): string => {
    if (c.type === 'speed_trial') {
      const palette = String((c.params as any)?.palette ?? 'classic');
      return palette !== 'classic'
        ? t('contestsHub.descSpeedPalette', { palette })
        : t('contestsHub.descSpeed');
    }
    if (c.type === 'new_puzzle_popularity') {
      const min = Number((c.params as any)?.minSolvers ?? 0) || 0;
      return (
        t('contestsHub.descPopularity') +
        (min > 0 ? ' ' + t('contestsHub.minSolversNote', { n: min }) : '')
      );
    }
    return t('contestsHub.descRush');
  };

  const prizeLine = (c: EngineContest): string =>
    c.prizeUsd === 0
      ? t('contestsHub.promoLine')
      :
    c.winnersCount > 1
      ? t('contestsHub.prizeMulti', { n: c.winnersCount, prize: `$${c.prizeUsd}` })
      : t('contestsHub.prizeSingle', { prize: `$${c.prizeUsd}` });

  // Three states via AuthContext: string = attested, null = not yet,
  // undefined = age_confirmed_at column missing (pre-migration) → hidden.
  const ageState = user ? user.age_confirmed_at : undefined;

  const ContestCard: React.FC<{ c: EngineContest; dimmed?: boolean }> = ({ c, dimmed }) => (
    <div
      style={{
        background: 'rgba(255,255,255,0.10)',
        borderRadius: 16,
        padding: '16px 18px',
        marginBottom: 12,
        opacity: dimmed ? 0.6 : 1,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <span style={{ fontWeight: 800, fontSize: '1.05rem' }}>
          {c.type === 'speed_trial' ? '⏱️' : c.type === 'new_puzzle_popularity' ? '✨' : '🏁'}{' '}
          {c.title || t(`contestsHub.${typeKey(c.type)}`)}
        </span>
        <span
          style={{
            fontSize: '0.72rem',
            fontWeight: 700,
            border: '1px solid rgba(255,255,255,0.35)',
            borderRadius: 999,
            padding: '1px 8px',
            opacity: 0.85,
          }}
        >
          {t(`contestsHub.${typeKey(c.type)}`)}
        </span>
        {dimmed && (
          <span style={{ fontSize: '0.72rem', fontWeight: 700, color: '#feca57' }}>
            {c.status === 'settled' ? t('contestsHub.statusSettled') : t('contestsHub.statusEnded')}
          </span>
        )}
      </div>
      <div style={{ fontSize: '0.9rem', opacity: 0.9, margin: '6px 0' }}>{description(c)}</div>
      {c.message && (
        <div
          style={{
            background: 'rgba(254,202,87,0.12)',
            border: '1px solid rgba(254,202,87,0.4)',
            borderRadius: 10,
            padding: '8px 12px',
            fontSize: '0.88rem',
            margin: '6px 0',
          }}
        >
          {c.message}
        </div>
      )}
      <div style={{ fontSize: '0.85rem', opacity: 0.8, marginBottom: 4 }}>{windowLine(c)}</div>
      <div style={{ fontSize: '0.95rem', fontWeight: 700, color: '#feca57', marginBottom: 6 }}>
        {prizeLine(c)}
      </div>
      {c.puzzleId && (
        <div style={{ fontSize: '0.88rem', marginBottom: 6 }}>
          {t('contestsHub.targetPuzzle')}:{' '}
          <Link to={`/puzzles/${c.puzzleId}/view`} style={{ color: '#dbe4ff' }}>
            {puzzleNames.get(c.puzzleId) ?? '…'}
          </Link>
        </div>
      )}
      {/* Labeled sponsor block */}
      {c.partnerName && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            fontSize: '0.82rem',
            opacity: 0.9,
            marginBottom: 6,
          }}
        >
          {c.partnerLogoUrl && (
            <img
              src={c.partnerLogoUrl}
              alt={c.partnerName}
              style={{ height: 28, maxWidth: 110, objectFit: 'contain', borderRadius: 4 }}
            />
          )}
          <span>
            {t('contest.sponsoredBy')}{' '}
            {c.partnerUrl ? (
              <a
                href={c.partnerUrl}
                target="_blank"
                rel="sponsored noopener noreferrer"
                style={{ color: '#feca57' }}
              >
                {c.partnerName}
              </a>
            ) : (
              <span style={{ color: '#feca57' }}>{c.partnerName}</span>
            )}
          </span>
        </div>
      )}
      {/* Winners (settled contests, where the viewer can read awards) */}
      {winners.has(c.id) && (
        <div style={{ marginTop: 6 }}>
          <div style={{ fontWeight: 700, fontSize: '0.85rem', marginBottom: 2 }}>
            {t('contestsHub.winners')}
          </div>
          {winners.get(c.id)!.map(({ award, name }) => (
            <div key={award.id} style={{ fontSize: '0.85rem', opacity: 0.9, padding: '2px 0' }}>
              {award.rank === 1 ? '🥇' : award.rank === 2 ? '🥈' : award.rank === 3 ? '🥉' : `${award.rank}.`}{' '}
              {name}{award.amountUsd > 0 ? ` — $${award.amountUsd}` : ''}
            </div>
          ))}
        </div>
      )}
      {/* 18+ eligibility affordance — prized contests only (the gate exists
          for PRIZE eligibility; no-prize promos need none) */}
      {!dimmed && c.prizeUsd > 0 && ageState !== undefined && (
        <div style={{ marginTop: 8, fontSize: '0.8rem', fontWeight: 700 }}>
          {ageState ? (
            <span style={{ color: '#34d399' }}>✓ {t('contest.eligible')}</span>
          ) : (
            <button
              onClick={() => setShowAgeGate(true)}
              style={{
                background: 'rgba(254,202,87,0.15)',
                border: '1px solid rgba(254,202,87,0.5)',
                borderRadius: 999,
                color: '#feca57',
                fontSize: '0.8rem',
                fontWeight: 700,
                padding: '4px 12px',
                cursor: 'pointer',
              }}
            >
              {t('contest.confirmAge')}
            </button>
          )}
        </div>
      )}
    </div>
  );

  return (
    <div
      style={{
        // Own scroll container — the app sets overflow:hidden on <body>.
        height: '100dvh',
        overflowY: 'auto',
        WebkitOverflowScrolling: 'touch',
        touchAction: 'pan-y',
        overscrollBehavior: 'contain',
        background: tokens.gradient.brandTri,
        color: '#fff',
        padding: 'clamp(1rem, 4vw, 3rem)',
        boxSizing: 'border-box',
      }}
    >
      <div style={{ maxWidth: 720, margin: '0 auto' }}>
        <Link
          to="/"
          style={{ color: 'rgba(255,255,255,0.8)', textDecoration: 'none', fontSize: '0.9rem' }}
        >
          ← Koos Puzzle
        </Link>
        <h1 style={{ fontSize: '1.8rem', margin: '16px 0 16px' }}>
          🏆 {t('contestsHub.pageTitle')}
        </h1>

        {live === null && <div style={{ opacity: 0.8 }}>⏳</div>}
        {live !== null && live.length === 0 && (
          <div style={{ opacity: 0.8, fontSize: '0.95rem', marginBottom: 20 }}>
            {t('contestsHub.noneLive')}
          </div>
        )}
        {live?.map((c) => <ContestCard key={c.id} c={c} />)}

        {ended.length > 0 && (
          <>
            <h2 style={{ fontSize: '1.1rem', margin: '28px 0 10px', opacity: 0.8 }}>
              {t('contestsHub.recentlyEnded')}
            </h2>
            {ended.map((c) => (
              <ContestCard key={c.id} c={c} dimmed />
            ))}
          </>
        )}
        <div style={{ height: 40 }} />
      </div>
      <AgeGateModal isOpen={showAgeGate} onClose={() => setShowAgeGate(false)} />
    </div>
  );
};

export default ContestsPage;
