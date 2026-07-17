// PrototypePage (/prototype) — the physical puzzle's home in the app:
// project gallery, build updates, and the interest register that decides
// whether it gets manufactured. Signed-in users register with one tap;
// guests type an email. Rows are write-only (see 20260718_prototype_interest
// migration); the count surfaces in the admin dashboard.

import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import { tokens } from '../styles/tokens';
import { track } from '../lib/observability';
import { PROTOTYPE_PHOTOS, PROTOTYPE_UPDATES } from '../constants/prototypeGallery';

export const PrototypePage: React.FC = () => {
  const { t, i18n } = useTranslation();
  const { user } = useAuth();
  const [email, setEmail] = useState('');
  const [status, setStatus] = useState<'idle' | 'saving' | 'done' | 'error'>('idle');

  const register = async (emailToUse: string) => {
    const trimmed = emailToUse.trim().toLowerCase();
    if (!/.+@.+\..+/.test(trimmed)) {
      setStatus('error');
      return;
    }
    setStatus('saving');
    const { error } = await supabase
      .from('prototype_interest')
      .insert([{ email: trimmed, user_id: user?.id ?? null }]);
    // 23505 = already registered — that's a success from the user's view.
    if (!error || error.code === '23505') {
      setStatus('done');
      track('prototype_interest_registered', { signed_in: !!user });
    } else {
      setStatus('error');
    }
  };

  return (
    <div
      style={{
        height: '100dvh',
        overflowY: 'auto',
        background: tokens.gradient.brandTri,
        color: '#fff',
        padding: 'clamp(1rem, 4vw, 3rem)',
        boxSizing: 'border-box',
      }}
    >
      <div style={{ maxWidth: 860, margin: '0 auto' }}>
        <Link to="/" style={{ color: 'rgba(255,255,255,0.8)', textDecoration: 'none', fontSize: '0.9rem' }}>
          ← Koos Puzzle
        </Link>
        <h1 style={{ fontSize: 'clamp(1.6rem, 5vw, 2.2rem)', margin: '14px 0 6px', fontWeight: 900 }}>
          {t('prototype.title')}
        </h1>
        <p style={{ fontSize: '1rem', lineHeight: 1.6, opacity: 0.92, maxWidth: 640, margin: '0 0 18px' }}>
          {t('prototype.intro')}
        </p>

        {/* Interest card */}
        <div
          style={{
            background: 'rgba(0,0,0,0.28)',
            borderRadius: 16,
            padding: '20px 22px',
            marginBottom: 28,
            maxWidth: 560,
          }}
        >
          <div style={{ fontWeight: 800, fontSize: '1.05rem', marginBottom: 6 }}>
            {t('prototype.ctaTitle')}
          </div>
          <div style={{ fontSize: '0.9rem', opacity: 0.85, marginBottom: 14, lineHeight: 1.5 }}>
            {t('prototype.ctaBody')}
          </div>
          {status === 'done' ? (
            <div style={{ color: '#7ef0c3', fontWeight: 700 }}>{t('prototype.thanks')}</div>
          ) : user ? (
            <button
              onClick={() => register(user.email)}
              disabled={status === 'saving'}
              style={{
                background: tokens.gradient.success,
                border: 'none',
                borderRadius: 10,
                color: '#fff',
                fontWeight: 800,
                fontSize: '1rem',
                padding: '12px 24px',
                cursor: 'pointer',
              }}
            >
              {t('prototype.cta')}
            </button>
          ) : (
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder={t('prototype.emailPlaceholder')}
                style={{
                  flex: '1 1 200px',
                  padding: '11px 12px',
                  borderRadius: 10,
                  border: '1px solid rgba(255,255,255,0.35)',
                  background: 'rgba(255,255,255,0.12)',
                  color: '#fff',
                  fontSize: '0.95rem',
                  outline: 'none',
                }}
              />
              <button
                onClick={() => register(email)}
                disabled={status === 'saving'}
                style={{
                  background: tokens.gradient.success,
                  border: 'none',
                  borderRadius: 10,
                  color: '#fff',
                  fontWeight: 800,
                  fontSize: '0.95rem',
                  padding: '11px 20px',
                  cursor: 'pointer',
                }}
              >
                {t('prototype.cta')}
              </button>
            </div>
          )}
          {status === 'error' && (
            <div style={{ color: '#ffb4b4', fontSize: '0.85rem', marginTop: 8 }}>
              {t('prototype.invalidEmail')}
            </div>
          )}
        </div>

        {/* Gallery */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))',
            gap: 14,
            marginBottom: 32,
          }}
        >
          {PROTOTYPE_PHOTOS.map((p) => (
            <figure key={p.url} style={{ margin: 0 }}>
              <img
                src={p.url}
                alt={p.caption}
                loading="lazy"
                style={{ width: '100%', borderRadius: 12, display: 'block' }}
              />
              <figcaption style={{ fontSize: '0.78rem', opacity: 0.7, marginTop: 6, lineHeight: 1.4 }}>
                {p.caption}
              </figcaption>
            </figure>
          ))}
        </div>

        {/* Build updates */}
        <h2 style={{ fontSize: '1.2rem', margin: '0 0 12px' }}>{t('prototype.updatesTitle')}</h2>
        {PROTOTYPE_UPDATES.map((u) => (
          <div
            key={u.date + u.title}
            style={{
              background: 'rgba(255,255,255,0.08)',
              borderRadius: 14,
              padding: '16px 18px',
              marginBottom: 14,
              maxWidth: 640,
            }}
          >
            <div style={{ fontSize: '0.75rem', opacity: 0.6 }}>
              {new Date(u.date).toLocaleDateString(i18n.language)}
            </div>
            <div style={{ fontWeight: 800, margin: '4px 0 6px' }}>{u.title}</div>
            <div style={{ fontSize: '0.9rem', lineHeight: 1.55, opacity: 0.9 }}>{u.body}</div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default PrototypePage;
