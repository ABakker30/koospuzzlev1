// ThronesStrip — compact horizontal strip of boards the signed-in user
// currently leads ("👑 Your thrones"), each linking to that board's
// leaderboard. Renders nothing for guests or when there are no thrones.
// Overflow affordance is pointer-aware (the native scrollbar is hidden — it
// read as a clunky gray bar on the Home gradient):
//   - fine pointers (mouse/trackpad): round gold arrow buttons on either end,
//     shown only when there is more content in that direction.
//   - coarse pointers (touch): no arrows — swiping is native. Instead the
//     strip content fades out at an overflowing edge via a CSS mask, which
//     works over the Home gradient without needing to match its color.

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../context/AuthContext';
import { getUserThrones, type BoardStanding } from '../services/boardAnalysisService';
import { paletteLabel } from '../utils/piecePalette';
import { track } from '../lib/observability';

const arrowStyle = (side: 'left' | 'right'): React.CSSProperties => ({
  position: 'absolute',
  [side]: '-6px',
  top: '50%',
  transform: 'translateY(-50%)',
  zIndex: 1,
  width: 26,
  height: 26,
  borderRadius: '50%',
  border: '1px solid rgba(254,202,87,0.55)',
  background: 'rgba(76,29,149,0.92)',
  color: '#feca57',
  fontSize: '0.72rem',
  fontWeight: 800,
  lineHeight: 1,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  cursor: 'pointer',
  boxShadow: '0 2px 8px rgba(0,0,0,0.35)',
  padding: 0,
});

export const ThronesStrip: React.FC = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [thrones, setThrones] = useState<BoardStanding[]>([]);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const [canLeft, setCanLeft] = useState(false);
  const [canRight, setCanRight] = useState(false);

  // Arrows are desktop furniture: only show them on fine-pointer devices.
  // On touch (coarse pointer) swiping is native and arrows are clutter.
  const [finePointer, setFinePointer] = useState<boolean>(
    () => typeof window !== 'undefined' && window.matchMedia('(pointer: fine)').matches,
  );
  useEffect(() => {
    const mq = window.matchMedia('(pointer: fine)');
    const onChange = (e: MediaQueryListEvent) => setFinePointer(e.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);

  useEffect(() => {
    if (!user?.id) return;
    let cancelled = false;
    getUserThrones(user.id).then((boards) => {
      if (!cancelled && boards.length) {
        setThrones(boards);
        track('thrones_strip_shown', { count: boards.length });
      }
    });
    return () => {
      cancelled = true;
    };
  }, [user?.id]);

  const updateArrows = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    setCanLeft(el.scrollLeft > 4);
    setCanRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 4);
  }, []);

  // Arrow visibility tracks content size and viewport — measured after the
  // thrones render and kept fresh on resize (scroll updates come from the
  // container's own onScroll).
  useEffect(() => {
    updateArrows();
    window.addEventListener('resize', updateArrows);
    return () => window.removeEventListener('resize', updateArrows);
  }, [thrones, updateArrows]);

  const scrollByPage = useCallback((dir: -1 | 1) => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollBy({ left: dir * Math.round(el.clientWidth * 0.8), behavior: 'smooth' });
  }, []);

  if (!user?.id || thrones.length === 0) return null;

  return (
    <div style={{ width: '100%', maxWidth: '500px', marginTop: '14px' }}>
      <style>{`
        .thrones-strip-scroll {
          scrollbar-width: none;
          -ms-overflow-style: none;
        }
        .thrones-strip-scroll::-webkit-scrollbar {
          display: none;
        }
      `}</style>
      <div
        style={{
          fontWeight: 800,
          color: '#feca57',
          fontSize: '0.85rem',
          marginBottom: 6,
          textAlign: 'left',
        }}
      >
        👑 {t('thrones.title')}
      </div>
      <div style={{ position: 'relative' }}>
        {finePointer && canLeft && (
          <button
            aria-label={t('thrones.scrollLeft')}
            onClick={() => scrollByPage(-1)}
            style={arrowStyle('left')}
          >
            ◀
          </button>
        )}
        {finePointer && canRight && (
          <button
            aria-label={t('thrones.scrollRight')}
            onClick={() => scrollByPage(1)}
            style={arrowStyle('right')}
          >
            ▶
          </button>
        )}
        <div
          ref={scrollRef}
          onScroll={updateArrows}
          className="thrones-strip-scroll"
          style={{
            display: 'flex',
            gap: '8px',
            overflowX: 'auto',
            paddingBottom: '4px',
            // Coarse pointer: soft 24px fade at an edge that has more content
            // (a "keep swiping" affordance). Done as a mask on the scroller
            // itself so it blends into the Home gradient regardless of tone
            // and can never intercept touches.
            ...(!finePointer && (canLeft || canRight)
              ? (() => {
                  const mask = `linear-gradient(to right, ${
                    canLeft ? 'transparent 0, #000 24px' : '#000 0'
                  }, ${canRight ? '#000 calc(100% - 24px), transparent 100%' : '#000 100%'})`;
                  return { WebkitMaskImage: mask, maskImage: mask } as React.CSSProperties;
                })()
              : {}),
          }}
        >
          {thrones.map((b) => (
            <button
              key={`${b.puzzleId}:${b.palette}`}
              onClick={() => {
                track('throne_chip_clicked');
                navigate(`/leaderboards/${b.puzzleId}?palette=${encodeURIComponent(b.palette)}`);
              }}
              style={{
                flexShrink: 0,
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                padding: '7px 14px',
                borderRadius: '999px',
                border: '1px solid rgba(254,202,87,0.45)',
                background: 'rgba(254,202,87,0.14)',
                color: '#fff',
                fontWeight: 600,
                fontSize: '0.82rem',
                cursor: 'pointer',
                whiteSpace: 'nowrap',
              }}
            >
              <span>{b.puzzleName}</span>
              <span style={{ opacity: 0.7 }}>· {paletteLabel(b.palette, t)}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
};

export default ThronesStrip;
