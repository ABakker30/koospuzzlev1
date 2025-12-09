import React from 'react';

interface ManualGameHeaderProps {
  puzzleName: string;
}

export const ManualGameHeader: React.FC<ManualGameHeaderProps> = ({
  puzzleName,
}) => {
  return (
    <header className="vs-header">
      <div className="vs-header-eyebrow">
        Koos Puzzle · Versus Mode
      </div>
      <h1
        className="vs-header-title"
        style={{
          background:
            'linear-gradient(90deg, #facc6b, #fbbf24, #a5b4fc, #c0c0c0)',
          WebkitBackgroundClip: 'text',
          color: 'transparent',
        }}
      >
        Play vs Computer – {puzzleName}
      </h1>
      <p className="vs-header-subtitle">
        Gold moves first, silver responds. This mode will reuse the manual
        solve drawing &amp; placement, and add turn logic, scoring, and
        animated playback of every move.
      </p>
    </header>
  );
};
