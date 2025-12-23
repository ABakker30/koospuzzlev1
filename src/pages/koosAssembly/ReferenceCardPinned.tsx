import React from 'react';

interface ReferenceCardPinnedProps {
  snapshotImage: string;
  target: { x: number; y: number; visible: boolean } | null;
  cardSize?: { w: number; h: number };
}

export const ReferenceCardPinned: React.FC<ReferenceCardPinnedProps> = ({
  snapshotImage,
  target,
  cardSize = { w: 240, h: 160 },
}) => {
  // Always position in bottom-left corner
  const finalLeft = 24;
  const finalTop = window.innerHeight - cardSize.h - 24;

  return (
    <>
      {/* Card */}
      <div
        style={{
          position: 'fixed',
          left: `${finalLeft}px`,
          top: `${finalTop}px`,
          width: `${cardSize.w}px`,
          height: `${cardSize.h}px`,
          backgroundImage: `url(${snapshotImage})`,
          backgroundSize: 'cover',
          backgroundPosition: 'center',
          backgroundRepeat: 'no-repeat',
          borderRadius: '12px',
          border: '3px solid rgba(255, 255, 255, 0.9)',
          boxShadow: '0 8px 24px rgba(0, 0, 0, 0.5), 0 0 0 1px rgba(0, 0, 0, 0.2)',
          zIndex: 9998,
        }}
      />

      {/* Label */}
      <div
        style={{
          position: 'fixed',
          left: `${finalLeft}px`,
          top: `${finalTop + cardSize.h + 8}px`,
          width: `${cardSize.w}px`,
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
    </>
  );
};
