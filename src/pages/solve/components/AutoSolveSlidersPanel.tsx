import React from 'react';

type AutoSolveSlidersPanelProps = {
  revealK: number;
  revealMax: number;
  explosionFactor: number; // 0–1
  onChangeRevealK: (value: number) => void;
  onChangeExplosionFactor: (value: number) => void;
};

export const AutoSolveSlidersPanel: React.FC<AutoSolveSlidersPanelProps> = ({
  revealK,
  revealMax,
  explosionFactor,
  onChangeRevealK,
  onChangeExplosionFactor,
}) => {
  // If nothing to control yet, don't render the panel
  if (revealMax <= 0 && explosionFactor <= 0) {
    return null;
  }

  const explosionPercent = Math.round(explosionFactor * 100);

  return (
    <div
      style={{
        position: 'fixed',
        bottom: 0,
        left: 0,
        right: 0,
        background: 'rgba(0, 0, 0, 0.85)',
        backdropFilter: 'blur(10px)',
        borderTop: '1px solid rgba(255, 255, 255, 0.1)',
        padding: '12px 20px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '20px',
        zIndex: 1000,
        userSelect: 'none',
      }}
    >
      {/* Explosion Slider */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', width: '400px' }}>
        <label
          style={{
            color: '#fff',
            fontSize: '13px',
            fontWeight: 500,
            whiteSpace: 'nowrap',
          }}
        >
          Explosion
        </label>
        <input
          type="range"
          min={0}
          max={100}
          step={1}
          value={explosionPercent}
          onChange={e =>
            onChangeExplosionFactor(
              parseInt(e.target.value, 10) / 100 || 0
            )
          }
          style={{
            flex: 1,
            cursor: 'pointer',
          }}
        />
      </div>

      {/* Reveal Arrows + Toggle */}
      {revealMax > 0 && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <button
            onClick={() => onChangeRevealK(Math.max(1, revealK - 1))}
            disabled={revealK <= 1}
            style={{
              background: revealK <= 1 ? 'rgba(255, 255, 255, 0.1)' : 'rgba(255, 255, 255, 0.2)',
              border: 'none',
              borderRadius: '4px',
              width: '40px',
              height: '40px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: revealK <= 1 ? 'not-allowed' : 'pointer',
              color: revealK <= 1 ? 'rgba(255, 255, 255, 0.3)' : '#fff',
              fontSize: '20px',
              transition: 'all 0.2s',
              touchAction: 'manipulation',
              WebkitTapHighlightColor: 'transparent',
            }}
            title="Reveal previous piece"
          >
            ◀
          </button>
          <button
            onClick={() => onChangeRevealK(Math.min(revealMax, revealK + 1))}
            disabled={revealK >= revealMax}
            style={{
              background: revealK >= revealMax ? 'rgba(255, 255, 255, 0.1)' : 'rgba(255, 255, 255, 0.2)',
              border: 'none',
              borderRadius: '4px',
              width: '40px',
              height: '40px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: revealK >= revealMax ? 'not-allowed' : 'pointer',
              color: revealK >= revealMax ? 'rgba(255, 255, 255, 0.3)' : '#fff',
              fontSize: '20px',
              transition: 'all 0.2s',
              touchAction: 'manipulation',
              WebkitTapHighlightColor: 'transparent',
            }}
            title="Reveal next piece"
          >
            ▶
          </button>
        </div>
      )}
    </div>
  );
};
