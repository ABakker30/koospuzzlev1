import React from 'react';
import type { GameSessionState } from '../types/manualGame';

interface ManualGameArenaProps {
  session: GameSessionState;
}

export const ManualGameArena: React.FC<ManualGameArenaProps> = ({ session }) => {
  const currentPlayer = session.players[session.currentPlayerIndex];

  return (
    <section
      className="vs-arena"
      style={{
        background:
          'radial-gradient(circle at top left, rgba(250,204,21,0.18), transparent 55%), radial-gradient(circle at top right, rgba(192,192,192,0.22), transparent 55%), rgba(15,23,42,0.9)',
      }}
    >
      <div className="vs-arena-main">
        {session.players.map((player, idx) => {
          const isCurrent = currentPlayer.id === player.id;

          return (
            <div
              key={player.id}
              className="vs-player-card"
              style={{
                background: isCurrent
                  ? 'rgba(15,23,42,0.9)'
                  : 'rgba(15,23,42,0.7)',
                border: `2px solid ${
                  isCurrent ? player.color : 'rgba(148,163,184,0.45)'
                }`,
              }}
            >
              {/* subtle glow */}
              <div
                style={{
                  position: 'absolute',
                  inset: 0,
                  background: `radial-gradient(circle at top left, ${player.color}33, transparent 60%)`,
                  opacity: isCurrent ? 0.8 : 0.4,
                  pointerEvents: 'none',
                }}
              />
              <div className="vs-player-top">
                <div>
                  <div className="vs-player-label">
                    {idx === 0 ? 'Player 1' : 'Player 2'}
                  </div>
                  <div
                    className="vs-player-name"
                    style={{ color: player.color }}
                  >
                    {player.name}
                    {player.isComputer ? ' (Computer)' : ' (You)'}
                  </div>
                </div>
                <div className="vs-player-score-wrap">
                  <span className="vs-player-score-label">Score</span>
                  <span className="vs-player-score">
                    {session.scores[player.id] ?? 0}
                  </span>
                  <span
                    style={{
                      width: '12px',
                      height: '12px',
                      borderRadius: '999px',
                      background: player.color,
                      boxShadow: `0 0 10px ${player.color}`,
                    }}
                  />
                </div>
              </div>

              <div className="vs-player-meta">
                <span>
                  Color: <span style={{ color: player.color }}>●</span>
                </span>
                {isCurrent && (
                  <span
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '0.25rem',
                      fontWeight: 600,
                    }}
                  >
                    <span
                      style={{
                        width: '6px',
                        height: '6px',
                        borderRadius: '999px',
                        background: player.color,
                        boxShadow: `0 0 8px ${player.color}`,
                      }}
                    />
                    Your turn
                  </span>
                )}
              </div>
            </div>
          );
        })}

        {/* VS badge */}
        <div className="vs-badge">VS</div>
      </div>

      {/* Turn indicator & mode chips */}
      <div className="vs-arena-footer">
        <div className="vs-turn-label">
          <strong>Current turn: </strong>
          <span
            style={{
              color: currentPlayer.color,
              fontWeight: 700,
            }}
          >
            {currentPlayer.name}
          </span>
        </div>

        <div className="vs-mode-chips">
          <span className="vs-chip">Gold moves first</span>
          <span className="vs-chip">Draw pieces, don&apos;t just drop them</span>
          <span className="vs-chip">
            Future: hints, solvability flashes &amp; replay
          </span>
        </div>
      </div>
    </section>
  );
};
