// ChallengeRulesPage — /challenge-rules, the Discovery Challenge official
// rules. English-only (like /privacy): these are the contest's legal terms,
// and one authoritative wording avoids translation-drift disputes.
// Values (prize, winners, dates, target, partner, message) come from the
// contest_settings table via contestService (managed in /admin).

import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { tokens } from '../styles/tokens';
import {
  getContest,
  isContestLive,
  prizeLabel,
  type ContestConfig,
} from '../services/contestService';
import { fetchContestStandings, type ContestStanding } from '../services/discoveryService';
import { getUsernames } from '../services/usernameService';

const S: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => (
  <section style={{ marginBottom: '28px' }}>
    <h2 style={{ fontSize: '1.15rem', margin: '0 0 8px' }}>{title}</h2>
    <div style={{ opacity: 0.9, lineHeight: 1.65, fontSize: '0.95rem' }}>{children}</div>
  </section>
);

const fmtDate = (iso: string): string =>
  new Date(iso).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    timeZone: 'UTC',
  });

export const ChallengeRulesPage: React.FC = () => {
  const navigate = useNavigate();
  const [contest, setContest] = useState<ContestConfig | null>(null);
  const [standings, setStandings] = useState<ContestStanding[]>([]);
  const [names, setNames] = useState<Map<string, string>>(new Map());

  useEffect(() => {
    let cancelled = false;
    getContest().then(async (c) => {
      if (cancelled) return;
      setContest(c);
      if (c.puzzleId) {
        const s = await fetchContestStandings(c);
        const nameMap = await getUsernames(s.map((e) => e.createdBy));
        if (!cancelled) {
          setStandings(s);
          setNames(nameMap);
        }
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const c = contest;
  const live = c ? isContestLive(c) : false;
  const winners = c?.winners ?? 10;
  const prize = c ? prizeLabel(c) : '$100';

  return (
    <div
      style={{
        // Own scroll container — the app sets overflow:hidden on <body>.
        height: '100dvh',
        overflowY: 'auto',
        background: tokens.gradient.brandTri,
        color: '#fff',
        padding: 'clamp(1rem, 4vw, 3rem)',
        boxSizing: 'border-box',
      }}
    >
      <div style={{ maxWidth: 720, margin: '0 auto' }}>
        <Link to="/" style={{ color: 'rgba(255,255,255,0.8)', textDecoration: 'none', fontSize: '0.9rem' }}>
          ← Koos Puzzle
        </Link>
        <h1 style={{ fontSize: '1.8rem', margin: '16px 0 4px' }}>
          🏆 The Discovery Challenge — Official Rules
        </h1>
        <p style={{ opacity: 0.7, fontSize: '0.85rem', margin: '0 0 8px' }}>
          {live && c?.startIso
            ? `Live since ${fmtDate(c.startIso)}${c?.endIso ? ` — runs until ${fmtDate(c.endIso)}` : ''}.`
            : 'The challenge has not started yet — these rules take effect when it goes live.'}
        </p>
        {c?.partnerName && (
          <p style={{ opacity: 0.85, fontSize: '0.9rem', margin: '0 0 12px' }}>
            Brought to you by{' '}
            {c.partnerUrl ? (
              <a href={c.partnerUrl} target="_blank" rel="noopener noreferrer" style={{ color: '#feca57' }}>
                {c.partnerName}
              </a>
            ) : (
              <span style={{ color: '#feca57' }}>{c.partnerName}</span>
            )}
          </p>
        )}
        {c?.message && (
          <p
            style={{
              background: 'rgba(254,202,87,0.12)',
              border: '1px solid rgba(254,202,87,0.4)',
              borderRadius: 12,
              padding: '12px 16px',
              fontSize: '0.95rem',
              margin: '0 0 24px',
            }}
          >
            {c.message}
          </p>
        )}

        <S title="The challenge">
          In the 1980s, mathematician Koos Verhoeff put a reward of 1,000 guilders on one of
          his puzzles. That tradition returns: the first {winners} people to discover a{' '}
          <strong>new</strong> solution to the challenge puzzle win <strong>{prize}</strong>{' '}
          each.
        </S>

        {/* Standings ladder — best solve per solver, pieces placed yourself;
            ties go to the earliest solve. */}
        {standings.length > 0 && (
          <section style={{ marginBottom: '28px' }}>
            <h2 style={{ fontSize: '1.15rem', margin: '0 0 8px' }}>Standings</h2>
            <div
              style={{
                background: 'rgba(0,0,0,0.25)',
                borderRadius: 12,
                padding: '10px 14px',
              }}
            >
              {standings.map((s, i) => (
                <div
                  key={s.solutionId}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 10,
                    padding: '6px 0',
                    borderBottom:
                      i < standings.length - 1 ? '1px solid rgba(255,255,255,0.08)' : 'none',
                    fontSize: '0.92rem',
                  }}
                >
                  <span style={{ width: 28, textAlign: 'center' }}>
                    {i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i + 1}.`}
                  </span>
                  <span
                    style={{
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                      fontWeight: i === 0 ? 700 : 500,
                    }}
                  >
                    {(s.createdBy && names.get(s.createdBy)) || s.solver}
                  </span>
                  <span style={{ marginLeft: 'auto', fontWeight: 700, color: '#feca57' }}>
                    {s.placements}/{s.totalPieces}
                  </span>
                  {s.isNewSolution && (
                    <span
                      style={{
                        background: 'rgba(52,211,153,0.2)',
                        border: '1px solid rgba(52,211,153,0.5)',
                        color: '#34d399',
                        borderRadius: 999,
                        padding: '1px 8px',
                        fontSize: '0.72rem',
                        fontWeight: 700,
                      }}
                    >
                      NEW
                    </span>
                  )}
                </div>
              ))}
            </div>
            <p style={{ opacity: 0.7, fontSize: '0.82rem', margin: '8px 0 0' }}>
              Ranked by pieces placed yourself; ties go to whoever got there first. NEW marks a
              solution never recorded before.
            </p>
          </section>
        )}

        <S title="How it works">
          <ol style={{ margin: 0, paddingLeft: '20px' }}>
            <li>
              Open the challenge puzzle in Play mode and solve it yourself — tap groups of
              four connected spheres to place pieces until the shape is complete.
            </li>
            <li>
              When you solve it, the app records exactly which piece types sit on which
              positions. That placement pattern is the solution&apos;s identity.
            </li>
            <li>
              Your solution is a <strong>discovery</strong> if that pattern has never been
              recorded in the app before — by anyone, ever, including solutions found by
              computer search. Mirrored or rotated placements count as different solutions,
              so there are many discoveries waiting to be made.
            </li>
            <li>
              Discoveries count in the order they are saved. The first {winners} eligible
              discoveries each win {prize}. If two solves tie in any ranking (same solution,
              or the same piece count on the standings ladder), the earliest-saved solve
              wins.
            </li>
          </ol>
        </S>

        <S title="What counts">
          <ul style={{ margin: 0, paddingLeft: '20px' }}>
            <li>
              <strong>Solved by hand.</strong> Only manual Play-mode solves are eligible;
              you must place every piece yourself.
            </li>
            <li>
              <strong>Classic mode only.</strong> The challenge is played with one of each
              piece — the real Koos puzzle. Free Pieces and One Piece solves are great
              practice but don&apos;t count as entries.
            </li>
            <li>
              <strong>Hint-free.</strong> Using even one hint makes that solve ineligible —
              you can always try again with a fresh solve.
            </li>
            <li>
              <strong>New.</strong> The solution must not match any solution already in the
              app, whether that earlier solution was found by hand, with hints, or by the
              auto-solver. Re-entering a solution you can see in the app is not a discovery.
            </li>
            <li>
              <strong>Saved while signed in</strong>, so we can attach the win to you and
              get in touch.
            </li>
            <li>
              <strong>Solved within the challenge window.</strong> Solutions saved before
              the challenge started{c?.endIso ? ' or after it ends' : ''} do not count as
              entries — including your own earlier solves. Solutions solved with hints or
              with the auto-solver never count, no matter when they were made.
            </li>
            <li>
              <strong>Have a PayPal account.</strong> Prizes are paid by PayPal; you&apos;ll
              need a PayPal account linked to your email to receive one.
            </li>
            <li>
              <strong>One prize per person.</strong>
            </li>
          </ul>
        </S>

        <S title="Verification and payment">
          Every candidate discovery is reviewed by hand before a prize is confirmed. We
          replay the solve move by move; solves showing machine-like entry patterns are
          disqualified. The reviewer&apos;s decision is final. Winners are contacted through
          their account email and paid to their PayPal account within 14 days of
          verification. Any taxes on a prize are the winner&apos;s responsibility.
        </S>

        <S title="The fine print">
          Free to enter; no purchase necessary. Open worldwide to individuals aged 18+ (or
          with a parent or guardian&apos;s permission), except where such contests are
          prohibited by law — void where prohibited. This is a contest of skill; there is no
          element of chance. The sponsor is Anton Bakker, who may end or extend the
          challenge at any time; discoveries verified before any change is announced are
          honored.
        </S>

        <button
          onClick={() =>
            navigate(live && c?.puzzleId ? `/puzzles/${c.puzzleId}/view` : '/gallery')
          }
          style={{
            background: 'linear-gradient(135deg, #feca57 0%, #f59e0b 100%)',
            border: 'none',
            borderRadius: 12,
            color: '#1a1a1a',
            fontWeight: 800,
            fontSize: '1rem',
            padding: '14px 28px',
            cursor: 'pointer',
            marginBottom: '48px',
          }}
        >
          {live ? 'Take on the challenge →' : 'Browse puzzles →'}
        </button>
      </div>
    </div>
  );
};

export default ChallengeRulesPage;
