// PrivacyPage — standalone /privacy policy. A real URL (not a modal) so it can
// be linked from legal notices, analytics disclosures, and app listings.

import React from 'react';
import { Link } from 'react-router-dom';
import { tokens } from '../styles/tokens';

const S: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => (
  <section style={{ marginBottom: '28px' }}>
    <h2 style={{ fontSize: '1.15rem', margin: '0 0 8px' }}>{title}</h2>
    <div style={{ opacity: 0.9, lineHeight: 1.65, fontSize: '0.95rem' }}>{children}</div>
  </section>
);

export const PrivacyPage: React.FC = () => (
  <div
    style={{
      minHeight: '100vh',
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
      <h1 style={{ fontSize: '1.8rem', margin: '16px 0 4px' }}>Privacy Policy</h1>
      <p style={{ opacity: 0.7, fontSize: '0.85rem', margin: '0 0 32px' }}>Last updated: July 16, 2026</p>

      <S title="Who we are">
        Koos Puzzle (koospuzzle.com) is a free 3D puzzle app operated by Anton Bakker.
        Questions or requests about your data: <strong>antonbakker30@gmail.com</strong>.
      </S>

      <S title="What we collect">
        <ul style={{ margin: 0, paddingLeft: '20px' }}>
          <li>
            <strong>Account data</strong> (only if you sign up): email address, username, and
            sign-in records. You can play without an account.
          </li>
          <li>
            <strong>Gameplay content</strong>: puzzles you create, solutions you save, game
            results, and related timestamps. Content you publish (puzzles, solutions,
            usernames on leaderboards) is visible to other users.
          </li>
          <li>
            <strong>Usage analytics</strong>: pages visited, feature usage, and interaction
            events, collected via PostHog. We do not record your sessions and we configure
            analytics not to collect personal information beyond your account identity.
          </li>
          <li>
            <strong>Error reports</strong>: if the app crashes, technical details (browser,
            error trace) may be sent to Sentry so we can fix it. We disable the collection
            of personal information in these reports.
          </li>
        </ul>
      </S>

      <S title="What we don't do">
        We do not sell your data, show ads, or share your information with third parties for
        their own purposes. Analytics and error data are used solely to improve the app.
      </S>

      <S title="Where your data lives">
        Account and gameplay data are stored with Supabase (our database provider). Analytics
        are processed by PostHog and error reports by Sentry, both acting as processors on our
        behalf. These providers may process data in the United States.
      </S>

      <S title="Cookies and local storage">
        We use browser local storage for app preferences (language, settings) and sign-in
        session tokens, and analytics cookies/storage to distinguish visitors. We do not use
        advertising cookies.
      </S>

      <S title="Your rights">
        You can request a copy of your data or ask us to delete your account and associated
        personal data at any time by emailing <strong>antonbakker30@gmail.com</strong>. If you
        are in the EU/EEA or UK, you additionally have rights of access, rectification,
        erasure, restriction, portability, and objection under the GDPR.
      </S>

      <S title="Children">
        Koos Puzzle is suitable for general audiences and does not knowingly collect personal
        data from children under 13. Playing does not require an account.
      </S>

      <S title="Changes">
        We may update this policy as the app evolves; the date above reflects the latest
        revision. Material changes will be noted on this page.
      </S>
    </div>
  </div>
);

export default PrivacyPage;
