import React, { useEffect, useState } from 'react';

interface ReferenceCardTransitionProps {
  snapshotImage: string;
  onDone: () => void;
  target: { x: number; y: number; visible: boolean } | null;
  cardSize?: { w: number; h: number };
}

export const ReferenceCardTransition: React.FC<ReferenceCardTransitionProps> = ({
  snapshotImage,
  onDone,
  target,
  cardSize = { w: 240, h: 160 },
}) => {
  const [animationState, setAnimationState] = useState<'fullscreen' | 'transitioning' | 'card'>('fullscreen');

  useEffect(() => {
    // Start fullscreen, then trigger transition after brief delay
    const startTimer = setTimeout(() => {
      setAnimationState('transitioning');
    }, 100);

    // After transition completes, set to card state and notify parent
    const completeTimer = setTimeout(() => {
      setAnimationState('card');
      onDone();
    }, 1700); // 100ms delay + 1600ms transition

    return () => {
      clearTimeout(startTimer);
      clearTimeout(completeTimer);
    };
  }, [onDone]);

  // Calculate styles based on animation state
  const getImageStyles = (): React.CSSProperties => {
    const baseStyles: React.CSSProperties = {
      position: 'fixed',
      backgroundImage: `url(${snapshotImage})`,
      backgroundSize: 'cover',
      backgroundPosition: 'center',
      backgroundRepeat: 'no-repeat',
      zIndex: 9998,
    };

    if (animationState === 'fullscreen') {
      return {
        ...baseStyles,
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        width: '100%',
        height: '100%',
        borderRadius: '0',
        border: 'none',
        boxShadow: 'none',
        transition: 'none',
      };
    }

    // Always animate to bottom-left corner
    const finalLeft = 24;
    const finalTop = window.innerHeight - cardSize.h - 24;

    return {
      ...baseStyles,
      left: `${finalLeft}px`,
      top: `${finalTop}px`,
      width: `${cardSize.w}px`,
      height: `${cardSize.h}px`,
      borderRadius: '12px',
      border: '3px solid rgba(255, 255, 255, 0.9)',
      boxShadow: '0 8px 24px rgba(0, 0, 0, 0.5), 0 0 0 1px rgba(0, 0, 0, 0.2)',
      transition: animationState === 'transitioning' ? 'all 1.6s cubic-bezier(0.4, 0, 0.2, 1)' : 'none',
    };
  };

  return (
    <>
      {/* Dim background (subtle) */}
      {animationState === 'fullscreen' && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0, 0, 0, 0.3)',
            zIndex: 9997,
          }}
        />
      )}

      {/* Animated snapshot image */}
      <div style={getImageStyles()} />

      {/* Label - only show when in card state */}
      {animationState === 'card' && (
        <div
          style={{
            position: 'fixed',
            bottom: '24px',
            left: '24px',
            width: '240px',
            paddingTop: '168px', // Position below the card
            textAlign: 'center',
            color: 'rgba(255, 255, 255, 0.7)',
            fontSize: '0.75rem',
            fontWeight: 600,
            textShadow: '0 2px 4px rgba(0, 0, 0, 0.5)',
            zIndex: 9998,
            pointerEvents: 'none',
          }}
        >
          Reference
        </div>
      )}
    </>
  );
};
