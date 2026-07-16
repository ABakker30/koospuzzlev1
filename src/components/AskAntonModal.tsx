// AskAntonModal — full-screen overlay embedding the public "Ask Anton" Q&A
// (https://ask.gestura.art): an AI chat about Anton Bakker and the
// lattice-path sculpture the Koos puzzle descends from (Koos Verhoeff was
// Anton's mentor and the puzzle's namesake).
//
// Pure embed, ported from gestura-v2's AskAntonOverlay: questions go straight
// from the visitor's browser to the Ask Anton service — this app relays and
// stores nothing. The service has its own rate limiting and telemetry; the
// `campaign` param attributes traffic from this app there. Requires
// `frame-src https://ask.gestura.art` in the CSP (index.html).

import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { tokens } from '../styles/tokens';
import { track } from '../lib/observability';

const ASK_ANTON_URL = 'https://ask.gestura.art/?campaign=koospuzzle';

interface AskAntonModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const AskAntonModal: React.FC<AskAntonModalProps> = ({ isOpen, onClose }) => {
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    setLoaded(false);
    track('ask_anton_opened');
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Ask Anton"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: tokens.z.modal,
        background: '#0e0f12',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '12px 8px 12px 20px',
          borderBottom: '1px solid rgba(255,255,255,0.12)',
        }}
      >
        <div style={{ color: 'rgba(255,255,255,0.9)', fontSize: '14px', letterSpacing: '4px', fontWeight: 600 }}>
          ASK ANTON
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
          {/* Escape hatch if the embedded service is unreachable or cramped. */}
          <a
            href={ASK_ANTON_URL}
            target="_blank"
            rel="noopener noreferrer"
            style={{ color: 'rgba(255,255,255,0.55)', fontSize: '13px', textDecoration: 'none', padding: '8px' }}
          >
            Open in tab ↗
          </a>
          <button
            onClick={onClose}
            aria-label="Close"
            style={{
              width: '44px',
              height: '44px',
              background: 'transparent',
              border: 'none',
              cursor: 'pointer',
              fontSize: '22px',
              color: 'rgba(255,255,255,0.7)',
              touchAction: 'manipulation',
              WebkitTapHighlightColor: 'transparent',
            }}
          >
            ✕
          </button>
        </div>
      </div>
      <div style={{ flex: 1, position: 'relative' }}>
        {!loaded && (
          <div
            style={{
              position: 'absolute',
              inset: 0,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'rgba(255,255,255,0.5)',
              fontSize: '14px',
            }}
          >
            Loading…
          </div>
        )}
        <iframe
          src={ASK_ANTON_URL}
          title="Ask Anton"
          onLoad={() => setLoaded(true)}
          style={{
            position: 'relative',
            border: 'none',
            width: '100%',
            height: '100%',
            background: '#0e0f12',
          }}
        />
      </div>
    </div>,
    document.body
  );
};
