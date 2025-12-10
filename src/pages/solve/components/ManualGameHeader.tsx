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
      {/* All detailed instructions live in the How to play modal now */}
    </header>
  );
};
