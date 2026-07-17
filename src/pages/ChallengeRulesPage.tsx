// ChallengeRulesPage — /challenge-rules, the Discovery Challenge official
// rules. English-only (like /privacy): these are the contest's legal terms,
// and one authoritative wording avoids translation-drift disputes.
// Values (prize, winners, dates, target, partner) come from constants/contest.ts.

import React from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { tokens } from '../styles/tokens';
import { CONTEST, contestActive, contestPrizeLabel } from '../constants/contest';

const S: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => (
  <section style={{ marginBottom: '28px' }}>
    <h2 style={{ fontSize: '1.15rem', margin: '0 0 8px' }}>{title}</h2>
    <div style={{ opacity: 0.9, lineHeight: 1.65, fontSize: '0.95rem' }}>{children}</div>
  </section>
);

export const ChallengeRulesPage: React.FC = () => {
  const navigate = useNavigate();
  const live = contestActive();
  const startDate = CONTEST.startIso
    ? new Date(CONTEST.startIso).toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        timeZone: 'UTC',
      })
    : null;

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
          {live && startDate
            ? `Live since ${startDate}.`
            : 'The challenge has not started yet — these rules take effect when it goes live.'}
        </p>
        {CONTEST.partner && (
          <p style={{ opacity: 0.85, fontSize: '0.9rem', margin: '0 0 24px' }}>
            Brought to you by{' '}
            <a
              href={CONTEST.partner.url}
              target="_blank"
              rel="noopener noreferrer"
              style={{ color: '#feca57' }}
            >
              {CONTEST.partner.name}
            </a>
          </p>
        )}

        <S title="The challenge">
          In the 1980s, mathematician Koos Verhoeff put a reward of 1,000 guilders on one of
          his puzzles. That tradition returns: the first {CONTEST.winners} people to discover
          a <strong>new</strong> solution to the challenge puzzle win{' '}
          <strong>{contestPrizeLabel()}</strong> each.
        </S>

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
              Discoveries count in the order they are saved. The first {CONTEST.winners}{' '}
              eligible discoveries each win {contestPrizeLabel()}.
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
              <strong>Solved after the start date.</strong> Solutions saved before the
              challenge started do not count as entries — including your own earlier solves.
              Solutions solved with hints or with the auto-solver never count, no matter
              when they were made.
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
          their account email and paid by PayPal within 14 days of verification. Any taxes
          on a prize are the winner&apos;s responsibility.
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
            navigate(live && CONTEST.puzzleId ? `/puzzles/${CONTEST.puzzleId}/view` : '/gallery')
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
