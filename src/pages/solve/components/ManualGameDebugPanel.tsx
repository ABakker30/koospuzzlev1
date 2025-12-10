import React from 'react';
import type { GameSessionState } from '../types/manualGame';

interface ManualGameDebugPanelProps {
  session: GameSessionState;
  onPlacePiece: () => void;
  onHint: () => void;
  onSolvabilityCheck: () => void;
}

export const ManualGameDebugPanel: React.FC<ManualGameDebugPanelProps> = ({
  session,
  onPlacePiece,
  onHint,
  onSolvabilityCheck,
}) => {
  const current = session.players[session.currentPlayerIndex];

  return (
    <section className="vs-debug">
      <div className="vs-debug-header">
        <span>Debug · game actions (dev only)</span>
        <span
          style={{
            fontSize: '0.75rem',
            opacity: 0.7,
          }}
        >
          Current:{' '}
          <span style={{ color: current.color }}>{current.name}</span>
        </span>
      </div>
      <div className="vs-debug-buttons">
        <button type="button" className="btn" onClick={onPlacePiece}>
          ✅ Place piece (+1 &amp; next turn)
        </button>
        <button type="button" className="btn" onClick={onHint}>
          💡 Use hint (next turn)
        </button>
        <button
          type="button"
          className="btn"
          onClick={onSolvabilityCheck}
        >
          🔍 Check solvability (stay on turn)
        </button>
      </div>
      <p className="vs-debug-footnote">
        These controls are for testing turn logic only. In normal play, your
        moves and the computer&apos;s moves drive the game.
      </p>
    </section>
  );
};
