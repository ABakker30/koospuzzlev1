// Catch-all for unmatched routes — a friendly fallback instead of a white
// screen (e.g. a mistyped/dead /c/ challenge code, or a stale-cache deep link).

import React from 'react';
import { useNavigate } from 'react-router-dom';

export const NotFoundPage: React.FC = () => {
  const navigate = useNavigate();
  return (
    <div
      style={{
        minHeight: '100vh',
        width: '100%',
        background: '#0b0b1e',
        color: '#fff',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 14,
        padding: 'clamp(1rem, 5vw, 2rem)',
        boxSizing: 'border-box',
        textAlign: 'center',
      }}
    >
      <div style={{ fontSize: 48 }}>🧩</div>
      <div style={{ fontSize: 22, fontWeight: 700 }}>Page not found</div>
      <div style={{ fontSize: 14, opacity: 0.8, maxWidth: 320 }}>
        This link is invalid or out of date.
      </div>
      <button
        onClick={() => navigate('/gallery')}
        style={{
          marginTop: 8,
          background: '#10b981',
          color: '#fff',
          border: 'none',
          borderRadius: 12,
          padding: '14px 24px',
          fontSize: 16,
          fontWeight: 700,
          cursor: 'pointer',
          boxShadow: '0 6px 20px rgba(16,185,129,0.4)',
        }}
      >
        Browse puzzles
      </button>
    </div>
  );
};

export default NotFoundPage;
