import React from 'react';
import { InfoModal } from '../../../components/InfoModal';

type SolveMode = 'rated' | 'unrated';

interface ManualSolveModeEntryModalProps {
  isOpen: boolean;
  mode: SolveMode;
  onStart: () => void;
}

export const ManualSolveModeEntryModal: React.FC<ManualSolveModeEntryModalProps> = ({
  isOpen,
  mode,
  onStart,
}) => {
  const isRated = mode === 'rated';

  return (
    <InfoModal
      isOpen={isOpen}
      onClose={onStart}
      title={isRated ? 'Rated Solve' : 'Unrated Solve'}
    >
      <div style={{ lineHeight: '1.7', fontSize: '15px' }}>
        {isRated ? (
          <>
            <p style={{ marginTop: 0 }}>
              <strong>Score is tracked.</strong>
            </p>
            <p>
              • Placing a piece earns <strong>+1 point</strong>.
            </p>
            <p>
              • Using hints places the piece but awards <strong>no point</strong> (net 0).
            </p>
            <p>
              • Solvability checks cost <strong>-1 point</strong>.
            </p>
            <p>
              • Undo is <strong>restricted to last move only</strong>.
            </p>
            <p style={{ marginTop: '1rem', padding: '12px', background: 'rgba(59, 130, 246, 0.1)', borderRadius: '8px', border: '1px solid rgba(59, 130, 246, 0.3)' }}>
              💡 <strong>Strategy:</strong> This mode is for competitive solving. Plan your moves carefully!
            </p>
          </>
        ) : (
          <>
            <p style={{ marginTop: 0 }}>
              <strong>No score is kept.</strong>
            </p>
            <p>
              • Hints and solvability checks are <strong>free</strong>.
            </p>
            <p>
              • <strong>Unlimited undo</strong> is available.
            </p>
            <p>
              • This mode is for <strong>exploration and learning</strong>.
            </p>
            <p style={{ marginTop: '1rem', padding: '12px', background: 'rgba(34, 197, 94, 0.1)', borderRadius: '8px', border: '1px solid rgba(34, 197, 94, 0.3)' }}>
              🌱 <strong>Relax and explore:</strong> Experiment freely without pressure!
            </p>
          </>
        )}

        <div style={{ marginTop: '2rem', textAlign: 'center' }}>
          <button
            onClick={onStart}
            style={{
              background: isRated 
                ? 'linear-gradient(135deg, #ef4444, #dc2626)' 
                : 'linear-gradient(135deg, #10b981, #059669)',
              color: '#fff',
              border: 'none',
              padding: '14px 32px',
              borderRadius: '8px',
              fontSize: '16px',
              fontWeight: 700,
              cursor: 'pointer',
              boxShadow: '0 4px 12px rgba(0, 0, 0, 0.3)',
              transition: 'all 0.2s ease',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.transform = 'translateY(-2px)';
              e.currentTarget.style.boxShadow = '0 6px 16px rgba(0, 0, 0, 0.4)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.transform = 'translateY(0)';
              e.currentTarget.style.boxShadow = '0 4px 12px rgba(0, 0, 0, 0.3)';
            }}
          >
            {isRated ? '🏆 Start Rated Solve' : '🌟 Start Solving'}
          </button>
        </div>
      </div>
    </InfoModal>
  );
};
