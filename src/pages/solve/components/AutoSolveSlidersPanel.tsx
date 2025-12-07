import React, { CSSProperties, RefObject } from 'react';

type AutoSolveSlidersPanelProps = {
  revealK: number;
  revealMax: number;
  explosionFactor: number; // 0–1
  sliderPanelCollapsed: boolean;
  onChangeRevealK: (value: number) => void;
  onChangeExplosionFactor: (value: number) => void;
  onToggleCollapsed: () => void;

  // Draggable wiring from useDraggable hook
  draggableRef: RefObject<HTMLDivElement>;
  draggableStyle: CSSProperties;
  draggableHeaderStyle: CSSProperties;
};

export const AutoSolveSlidersPanel: React.FC<AutoSolveSlidersPanelProps> = ({
  revealK,
  revealMax,
  explosionFactor,
  sliderPanelCollapsed,
  onChangeRevealK,
  onChangeExplosionFactor,
  onToggleCollapsed,
  draggableRef,
  draggableStyle,
  draggableHeaderStyle,
}) => {
  // If nothing to control yet, don't render the panel
  if (revealMax <= 0 && explosionFactor <= 0) {
    return null;
  }

  const explosionPercent = Math.round(explosionFactor * 100);

  return (
    <div
      ref={draggableRef}
      style={{
        position: 'fixed',
        bottom: sliderPanelCollapsed
          ? 'max(8px, env(safe-area-inset-bottom))'
          : '20px',
        right: sliderPanelCollapsed
          ? 'max(8px, env(safe-area-inset-right))'
          : '20px',
        background: 'rgba(0, 0, 0, 0.85)',
        borderRadius: '8px',
        padding: '12px 12px 0',
        minWidth: sliderPanelCollapsed ? '60px' : '240px',
        maxWidth: sliderPanelCollapsed ? '60px' : 'min(240px, 90vw)',
        backdropFilter: 'blur(10px)',
        border: '1px solid rgba(255, 255, 255, 0.1)',
        boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
        zIndex: 1000,
        userSelect: 'none',
        transition:
          'min-width 0.2s ease, max-width 0.2s ease, right 0.3s ease, bottom 0.3s ease',
        touchAction: 'none',
        cursor: sliderPanelCollapsed ? 'pointer' : 'move',
        ...(sliderPanelCollapsed ? {} : draggableStyle),
      }}
    >
      {/* Draggable Handle with Collapse Button */}
      <div
        style={{
          padding: '8px 15px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          userSelect: 'none',
          ...draggableHeaderStyle,
        }}
      >
        <div
          style={{
            width: '40px',
            height: '4px',
            background: 'rgba(255, 255, 255, 0.3)',
            borderRadius: '2px',
            flex: 1,
          }}
        />
        <button
          onClick={e => {
            e.stopPropagation();
            onToggleCollapsed();
          }}
          onTouchEnd={e => {
            e.stopPropagation();
            onToggleCollapsed();
          }}
          style={{
            background: 'rgba(255, 255, 255, 0.15)',
            border: 'none',
            borderRadius: '4px',
            width: '24px',
            height: '24px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
            color: '#fff',
            fontSize: '14px',
            marginLeft: '8px',
            transition: 'all 0.2s',
            touchAction: 'manipulation',
            WebkitTapHighlightColor: 'transparent',
          }}
          title={sliderPanelCollapsed ? 'Expand' : 'Collapse'}
        >
          {sliderPanelCollapsed ? '▲' : '▼'}
        </button>
      </div>

      {/* Sliders Content */}
      {!sliderPanelCollapsed && (
        <div
          style={{ padding: '0 15px 15px' }}
          onMouseDown={e => e.stopPropagation()}
          onTouchStart={e => e.stopPropagation()}
        >
          {/* Reveal Slider */}
          {revealMax > 0 && (
            <div
              style={{ marginBottom: '15px' }}
              onMouseDown={e => e.stopPropagation()}
              onTouchStart={e => e.stopPropagation()}
            >
              <div
                style={{
                  color: '#fff',
                  marginBottom: '8px',
                  fontSize: '13px',
                  fontWeight: 500,
                }}
              >
                Reveal
              </div>
              <input
                type="range"
                min={1}
                max={revealMax}
                step={1}
                value={revealK}
                onChange={e =>
                  onChangeRevealK(parseInt(e.target.value, 10) || 1)
                }
                style={{
                  width: '100%',
                  cursor: 'pointer',
                }}
              />
            </div>
          )}

          {/* Explosion Slider */}
          <div
            onMouseDown={e => e.stopPropagation()}
            onTouchStart={e => e.stopPropagation()}
          >
            <div
              style={{
                color: '#fff',
                marginBottom: '8px',
                fontSize: '13px',
                fontWeight: 500,
              }}
            >
              Explosion ({explosionPercent}%)
            </div>
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
                width: '100%',
                cursor: 'pointer',
              }}
            />
          </div>
        </div>
      )}
    </div>
  );
};
