// TermsPage — standalone /terms, modeled on /privacy. The BODY is English-only
// on purpose (like /challenge-rules): machine-translated legal terms are a
// liability, so one authoritative wording governs. Only the page title goes
// through i18n. Content is a plain-language draft — flagged as pending legal
// review at the top so it never masquerades as lawyer-approved.

import React from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { tokens } from '../styles/tokens';

const S: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => (
  <section style={{ marginBottom: '28px' }}>
    <h2 style={{ fontSize: '1.15rem', margin: '0 0 8px' }}>{title}</h2>
    <div style={{ opacity: 0.9, lineHeight: 1.65, fontSize: '0.95rem' }}>{children}</div>
  </section>
);

export const TermsPage: React.FC = () => {
  const { t } = useTranslation();
  return (
    <div
      style={{
        // The app sets overflow:hidden on <body> (canvas pages own their
        // scrolling), so this page must be its own scroll container.
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
        <h1 style={{ fontSize: '1.8rem', margin: '16px 0 4px' }}>{t('terms.title')}</h1>
        <p style={{ opacity: 0.7, fontSize: '0.85rem', margin: '0 0 4px' }}>
          Last updated: July 22, 2026
        </p>
        <p style={{ opacity: 0.6, fontSize: '0.82rem', fontStyle: 'italic', margin: '0 0 8px' }}>
          Draft — pending legal review.
        </p>
        <p style={{ opacity: 0.7, fontSize: '0.85rem', margin: '0 0 32px' }}>
          This English version is the governing text.
        </p>

        <S title="1. Acceptance of these terms">
          Koos Puzzle (koospuzzle.com) is a free 3D puzzle app operated by Anton Bakker. By
          using the app you agree to these Terms &amp; Conditions and to our{' '}
          <Link to="/privacy" style={{ color: '#dbe4ff' }}>
            Privacy Policy
          </Link>
          . If you do not agree, please do not use the app.
        </S>

        <S title="2. Accounts and conduct">
          You can play without an account; some features (saving solutions, contests,
          leaderboards) require one. When you create an account you agree to provide accurate
          information and to keep your sign-in method secure. Don&apos;t abuse the service:
          no attempts to break, overload, or reverse the app&apos;s security; no automated
          play presented as your own; no harassment of other users; no impersonation.
          We may suspend or remove accounts that violate these terms.
        </S>

        <S title="3. Your content">
          You keep ownership of the content you submit — puzzles you create, solutions you
          save, and the names and messages you attach to them. By submitting content you give
          us a non-exclusive, worldwide, royalty-free license to store, display, and
          distribute it within the app and in shared links and clips that you generate.
          You&apos;re responsible for what you submit: no unlawful content and nothing that
          infringes someone else&apos;s rights. We may remove content that violates these
          terms.
        </S>

        <S title="4. Contests and prizes">
          From time to time we run the Discovery Challenge — a <strong>skill-based</strong>{' '}
          discovery contest with no element of chance. For any contest:
          <ul style={{ margin: '8px 0 0', paddingLeft: '20px' }}>
            <li>
              Winners are determined per the published{' '}
              <Link to="/challenge-rules" style={{ color: '#dbe4ff' }}>
                contest rules
              </Link>
              , which are part of these terms.
            </li>
            <li>
              Prizes are open only to individuals aged <strong>18 or over</strong> — or the
              age of majority in their jurisdiction, whichever is higher. Void where
              prohibited. Everyone can still play; age affects prize eligibility only.
            </li>
            <li>One prize per person.</li>
            <li>
              Identity and age verification may be required <strong>before</strong> payout,
              and prizes may be withheld if verification fails or the entry breaks the
              contest rules.
            </li>
            <li>Any taxes on a prize are the winner&apos;s responsibility.</li>
            <li>
              Sponsors may provide prizes. Sponsor logos and links are labeled as sponsored
              content; we don&apos;t endorse sponsors beyond their role in the contest.
            </li>
          </ul>
        </S>

        <S title="5. Sponsored content and external links">
          The app may show clearly-labeled sponsor logos and links, and other links to
          external sites. We don&apos;t control external sites and aren&apos;t responsible
          for their content, policies, or practices — visiting them is at your own
          discretion.
        </S>

        <S title="6. Disclaimers and limitation of liability">
          The app is provided <strong>&quot;as is&quot;</strong>, without warranties of any
          kind, express or implied. We don&apos;t guarantee the service will be
          uninterrupted, error-free, or that saved content will never be lost. To the
          maximum extent permitted by law, we are not liable for indirect, incidental, or
          consequential damages arising from your use of the app.
        </S>

        <S title="7. Changes to these terms">
          We may update these terms as the app evolves; the date above reflects the latest
          revision. Material changes will be noted on this page. Continued use after changes
          take effect constitutes acceptance.
        </S>

        <S title="8. Contact">
          Questions about these terms: use the{' '}
          <a
            href="https://ask.gestura.art/?campaign=koospuzzle"
            target="_blank"
            rel="noopener noreferrer"
            style={{ color: '#dbe4ff' }}
          >
            Inquire option on Ask Anton
          </a>
          .
        </S>

        <S title="9. Governing law">
          [Jurisdiction — to be confirmed]
        </S>
      </div>
    </div>
  );
};

export default TermsPage;
