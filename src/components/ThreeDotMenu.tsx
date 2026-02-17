import React, { useState, useCallback } from 'react';

export interface ThreeDotMenuItem {
  icon: string;
  label: string;
  onClick: () => void;
  hidden?: boolean;
}

interface ThreeDotMenuProps {
  items: ThreeDotMenuItem[];
  /** Size of the trigger button in px (default 44) */
  size?: number;
  /** Size of the SVG dots in px (default 28) */
  iconSize?: number;
  /** 'dark' pages get white dots, 'light' pages get black dots (default 'dark') */
  mode?: 'dark' | 'light';
  /** Background color hex — if provided, mode is auto-detected from brightness */
  backgroundColor?: string;
}

/** Returns true if a hex color is considered "light" (brightness > 50%) */
function isLightColor(hex: string): boolean {
  const c = hex.replace('#', '');
  const r = parseInt(c.substring(0, 2), 16);
  const g = parseInt(c.substring(2, 4), 16);
  const b = parseInt(c.substring(4, 6), 16);
  // Perceived brightness formula
  return (r * 299 + g * 587 + b * 114) / 1000 > 128;
}

/**
 * Consistent 3-dot kebab menu used across all pages.
 * Renders a vertical dots button that opens a dropdown with menu items.
 */
export const ThreeDotMenu: React.FC<ThreeDotMenuProps> = ({
  items,
  size = 44,
  iconSize = 28,
  mode = 'dark',
  backgroundColor,
}) => {
  const effectiveMode = backgroundColor ? (isLightColor(backgroundColor) ? 'light' : 'dark') : mode;
  const dotColor = effectiveMode === 'dark' ? 'white' : '#222';
  const [open, setOpen] = useState(false);

  const toggle = useCallback(() => setOpen(prev => !prev), []);
  const close = useCallback(() => setOpen(false), []);

  const visibleItems = items.filter(i => !i.hidden);
  if (visibleItems.length === 0) return null;

  return (
    <div style={{ position: 'relative' }}>
      {/* Trigger button */}
      <button
        onClick={toggle}
        style={{
          padding: 0,
          background: 'transparent',
          border: 'none',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: `${size}px`,
          height: `${size}px`,
          transition: 'opacity 0.2s, transform 0.2s',
        }}
        onMouseEnter={e => {
          e.currentTarget.style.transform = 'scale(1.05)';
          e.currentTarget.style.opacity = '0.8';
        }}
        onMouseLeave={e => {
          e.currentTarget.style.transform = 'scale(1)';
          e.currentTarget.style.opacity = '1';
        }}
        title="Menu"
      >
        <svg width={iconSize} height={iconSize} viewBox="0 0 24 24" fill={dotColor}>
          <circle cx="12" cy="5" r="2" />
          <circle cx="12" cy="12" r="2" />
          <circle cx="12" cy="19" r="2" />
        </svg>
      </button>

      {/* Dropdown */}
      {open && (
        <>
          {/* Backdrop */}
          <div
            style={{ position: 'fixed', inset: 0, zIndex: 9998 }}
            onClick={close}
          />
          {/* Menu */}
          <div
            style={{
              position: 'absolute',
              top: 'calc(100% + 8px)',
              right: 0,
              background: 'linear-gradient(135deg, #667eea 0%, #764ba2 50%, #f093fb 100%)',
              backdropFilter: 'blur(20px)',
              border: '2px solid rgba(255, 255, 255, 0.5)',
              borderRadius: '16px',
              padding: '8px',
              minWidth: '200px',
              boxShadow: '0 8px 32px rgba(102, 126, 234, 0.4), 0 0 0 1px rgba(255,255,255,0.1)',
              zIndex: 9999,
            }}
          >
            {visibleItems.map((item, idx) => (
              <button
                key={idx}
                onClick={() => {
                  close();
                  item.onClick();
                }}
                style={{
                  width: '100%',
                  padding: '12px 16px',
                  background: 'rgba(255,255,255,0.15)',
                  border: 'none',
                  color: '#fff',
                  textAlign: 'left',
                  cursor: 'pointer',
                  borderRadius: '8px',
                  fontSize: '0.95rem',
                  fontWeight: 600,
                  transition: 'all 0.2s',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '12px',
                  marginBottom: idx < visibleItems.length - 1 ? '4px' : '0',
                }}
                onMouseEnter={e => {
                  e.currentTarget.style.background = 'rgba(255,255,255,0.3)';
                  e.currentTarget.style.transform = 'translateX(4px)';
                }}
                onMouseLeave={e => {
                  e.currentTarget.style.background = 'rgba(255,255,255,0.15)';
                  e.currentTarget.style.transform = 'translateX(0)';
                }}
              >
                <span>{item.icon}</span>
                <span>{item.label}</span>
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
};
