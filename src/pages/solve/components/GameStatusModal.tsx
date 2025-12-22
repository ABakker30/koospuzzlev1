import React from 'react';
import { useTranslation } from 'react-i18next';
import type { EnhancedDLXCheckResult } from '../../../engines/dlxSolver';
import type { GameSessionState } from '../types/manualGame';

interface GameStatusModalProps {
  isOpen: boolean;
  onClose: () => void;
  solverResult: EnhancedDLXCheckResult | null;
  session: GameSessionState | null;
  puzzleName?: string;
}

export const GameStatusModal: React.FC<GameStatusModalProps> = ({
  isOpen,
  onClose,
  solverResult,
  session,
  puzzleName,
}) => {
  const { t } = useTranslation();

  if (!isOpen) return null;

  const state = solverResult?.state ?? 'orange';

  // State emoji and description
  const stateEmoji = state === 'green' ? '🟢' : state === 'red' ? '🔴' : '🟠';
  const stateLabel = 
    state === 'green' ? t('gameStatus.state.solvable') :
    state === 'red' ? t('gameStatus.state.unsolvable') :
    t('gameStatus.state.unknown');

  const stateExplanation = solverResult?.reason || 
    (state === 'orange' ? t('gameStatus.explanation.notYetDetermined') : '');

  return (
    <div 
      className="modal-backdrop" 
      onClick={onClose}
      style={{ zIndex: 2000 }}
    >
      <div 
        className="modal-content"
        onClick={(e) => e.stopPropagation()}
        style={{
          maxWidth: '500px',
          padding: '1.5rem',
          borderRadius: '16px',
          backgroundColor: '#1a1a1a',
          color: '#fff',
        }}
      >
        {/* Header */}
        <div style={{ 
          display: 'flex', 
          justifyContent: 'space-between', 
          alignItems: 'center',
          marginBottom: '1.5rem',
        }}>
          <h2 style={{ margin: 0, fontSize: '1.5rem' }}>
            ⓘ {t('gameStatus.title')}
          </h2>
          <button
            onClick={onClose}
            style={{
              background: 'none',
              border: 'none',
              color: '#999',
              fontSize: '1.5rem',
              cursor: 'pointer',
              padding: '0 0.5rem',
            }}
          >
            ✖
          </button>
        </div>

        {/* Section 1: Score */}
        <section style={{ marginBottom: '1.5rem' }}>
          <h3 style={{ 
            fontSize: '1rem', 
            color: '#888', 
            marginBottom: '0.75rem',
            textTransform: 'uppercase',
            letterSpacing: '0.05em',
          }}>
            {t('gameStatus.score.title')}
          </h3>
          <div style={{ 
            backgroundColor: 'rgba(255,255,255,0.08)',
            padding: '1.5rem',
            borderRadius: '12px',
            border: '2px solid #a78bfa',
          }}>
            {session && (
              <>
                <div style={{ fontSize: '2rem', fontWeight: '900', color: '#4c1d95', marginBottom: '0.5rem', textAlign: 'center' }}>
                  {(() => {
                    const humanPlayer = session.players.find(p => !p.isComputer);
                    const computerPlayer = session.players.find(p => p.isComputer);
                    const userScore = humanPlayer ? (session.scores[humanPlayer.id] ?? 0) : 0;
                    const computerScore = computerPlayer ? (session.scores[computerPlayer.id] ?? 0) : 0;
                    return (
                      <>
                        <div style={{ color: '#6366f1', marginBottom: '0.5rem' }}>
                          {t('gameStatus.score.user')}: {userScore}
                        </div>
                        <div style={{ color: '#a78bfa' }}>
                          {t('gameStatus.score.computer')}: {computerScore}
                        </div>
                      </>
                    );
                  })()}
                </div>
              </>
            )}
            {puzzleName && (
              <div style={{ marginTop: '1rem', color: '#888', textAlign: 'center', fontSize: '0.9rem' }}>
                {t('gameStatus.progress.puzzle')}: {puzzleName}
              </div>
            )}
          </div>
        </section>

        {/* Section 2: Solvability Status */}
        <section style={{ marginBottom: '1.5rem' }}>
          <h3 style={{ 
            fontSize: '1rem', 
            color: '#888', 
            marginBottom: '0.75rem',
            textTransform: 'uppercase',
            letterSpacing: '0.05em',
          }}>
            {t('gameStatus.solvability.title')}
          </h3>
          <div style={{ 
            backgroundColor: 
              state === 'green' ? 'rgba(22,163,74,0.15)' :
              state === 'red' ? 'rgba(220,38,38,0.15)' :
              'rgba(249,115,22,0.15)',
            padding: '1rem',
            borderRadius: '8px',
            borderLeft: `4px solid ${
              state === 'green' ? '#16a34a' :
              state === 'red' ? '#dc2626' :
              '#f97316'
            }`,
          }}>
            <div style={{ 
              fontSize: '1.25rem', 
              marginBottom: '0.5rem',
              fontWeight: 'bold',
            }}>
              {stateEmoji} {stateLabel}
            </div>
            <div style={{ color: '#ccc', fontSize: '0.9rem' }}>
              {stateExplanation}
            </div>
          </div>
        </section>

        {/* Section 3: Solver Insights */}
        {solverResult && !solverResult.thresholdSkipped && (
          <section style={{ marginBottom: '1.5rem' }}>
            <h3 style={{ 
              fontSize: '1rem', 
              color: '#888', 
              marginBottom: '0.75rem',
              textTransform: 'uppercase',
              letterSpacing: '0.05em',
            }}>
              {t('gameStatus.insights.title')}
            </h3>
            <div style={{ 
              backgroundColor: 'rgba(255,255,255,0.05)',
              padding: '1rem',
              borderRadius: '8px',
              fontSize: '0.9rem',
            }}>
              <div style={{ marginBottom: '0.5rem' }}>
                <strong>{t('gameStatus.insights.emptyCells')}:</strong> {solverResult.emptyCellCount}
              </div>
              
              {solverResult.estimatedSearchSpace && (
                <div style={{ marginBottom: '0.5rem' }}>
                  <strong>{t('gameStatus.insights.searchSpace')}:</strong> {solverResult.estimatedSearchSpace}
                </div>
              )}
              
              {solverResult.solutionCount !== undefined && (
                <div style={{ marginBottom: '0.5rem' }}>
                  <strong>{t('gameStatus.insights.solutionCount')}:</strong> {solverResult.solutionsCapped ? '1000+' : solverResult.solutionCount}
                </div>
              )}
              
              {solverResult.validNextMoveCount !== undefined && (
                <div>
                  <strong>{t('gameStatus.insights.validMoves')}:</strong> {solverResult.validNextMoveCount}
                </div>
              )}
            </div>
          </section>
        )}

        {/* Section 4: Solver Metadata */}
        {solverResult && (
          <section>
            <h3 style={{ 
              fontSize: '0.85rem', 
              color: '#666', 
              marginBottom: '0.5rem',
              textTransform: 'uppercase',
              letterSpacing: '0.05em',
            }}>
              {t('gameStatus.metadata.title')}
            </h3>
            <div style={{ 
              fontSize: '0.8rem',
              color: '#888',
              padding: '0.75rem',
              backgroundColor: 'rgba(255,255,255,0.03)',
              borderRadius: '6px',
            }}>
              <div style={{ marginBottom: '0.25rem' }}>
                {t('gameStatus.metadata.checkDepth')}: <strong style={{ color: '#aaa' }}>
                  {solverResult.checkedDepth}
                </strong>
              </div>
              <div>
                {t('gameStatus.metadata.timedOut')}: <strong style={{ color: '#aaa' }}>
                  {solverResult.timedOut ? t('common.yes') : t('common.no')}
                </strong>
              </div>
              {solverResult.thresholdSkipped && (
                <div style={{ marginTop: '0.25rem', color: '#999' }}>
                  {t('gameStatus.metadata.skippedEarly')}
                </div>
              )}
            </div>
          </section>
        )}

        {/* Close button */}
        <button
          onClick={onClose}
          className="btn"
          style={{
            width: '100%',
            marginTop: '1.5rem',
            padding: '0.75rem',
          }}
        >
          {t('button.close')}
        </button>
      </div>
    </div>
  );
};
