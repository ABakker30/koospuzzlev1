import React, { CSSProperties, RefObject } from 'react';

type AutoSolutionStats = {
  solutionId: string | null;
  pieceCount: number;
  cellCount: number;
  savedAt?: string;
};

type AutoSolveSuccessModalProps = {
  isOpen: boolean;
  stats: AutoSolutionStats | null;
  onClose: () => void;
  onMakeMovie: () => void;
  draggableRef: RefObject<HTMLDivElement>;
  draggableStyle: CSSProperties;
  draggableHeaderStyle: CSSProperties;
};

export const AutoSolveSuccessModal: React.FC<AutoSolveSuccessModalProps> = ({
  isOpen,
  stats,
  onClose,
  onMakeMovie,
  draggableRef,
  draggableStyle,
  draggableHeaderStyle,
}) => {
  if (!isOpen || !stats) {
    return null;
  }

  return (
    <div
      ref={draggableRef}
      style={{
        position: 'fixed',
        top: '50%',
        left: '50%',
        background: 'linear-gradient(135deg, #1e88e5, #42a5f5)',
        color: 'white',
        padding: '32px 40px',
        borderRadius: '16px',
        fontSize: '20px',
        fontWeight: 'bold',
        textAlign: 'center',
        boxShadow: '0 12px 40px rgba(30, 136, 229, 0.5)',
        zIndex: 2000,
        maxWidth: '400px',
        minWidth: '320px',
        ...draggableStyle,
      }}
    >
      {/* Draggable handle */}
      <div
        style={{
          position: 'absolute',
          top: '8px',
          left: '50%',
          transform: 'translateX(-50%)',
          width: '60px',
          height: '4px',
          background: 'rgba(255, 255, 255, 0.4)',
          borderRadius: '2px',
          ...draggableHeaderStyle,
        }}
      />

      {/* Close button */}
      <button
        onClick={onClose}
        style={{
          position: 'absolute',
          top: '12px',
          right: '12px',
          background: 'transparent',
          border: 'none',
          color: 'white',
          fontSize: '28px',
          cursor: 'pointer',
          padding: '4px 8px',
          lineHeight: '1',
          opacity: 0.8,
          fontWeight: 'normal',
        }}
        title="Close"
      >
        ×
      </button>

      <div style={{ fontSize: '64px', marginBottom: '16px' }}>🎉</div>
      <div
        style={{
          fontSize: '32px',
          fontWeight: 700,
          marginBottom: '8px',
          color: '#ffffff',
        }}
      >
        Solution Found!
      </div>
      <div
        style={{
          fontSize: '18px',
          fontWeight: 600,
          marginBottom: '24px',
          opacity: 0.95,
        }}
      >
        Puzzle Solved by Engine 2
      </div>

      <div
        style={{
          fontSize: '15px',
          fontWeight: 'normal',
          lineHeight: '1.8',
          textAlign: 'left',
          background: 'rgba(0,0,0,0.2)',
          padding: '20px',
          borderRadius: '12px',
          marginBottom: '20px',
          color: '#ffffff',
        }}
      >
        <div
          style={{
            marginBottom: '12px',
            fontSize: '16px',
            fontWeight: 600,
          }}
        >
          ✨ Auto-Solve Complete!
        </div>
        <div>
          <strong>🧩 Pieces:</strong> {stats.pieceCount}
        </div>
        <div>
          <strong>📦 Cells:</strong> {stats.cellCount}
        </div>
        {stats.solutionId && (
          <div
            style={{
              marginTop: '12px',
              paddingTop: '12px',
              borderTop: '1px solid rgba(255,255,255,0.3)',
            }}
          >
            <strong>💾 Solution ID:</strong>{' '}
            {stats.solutionId.slice(0, 8)}
            ...
          </div>
        )}
      </div>

      <div
        style={{
          fontSize: '14px',
          fontWeight: 'normal',
          opacity: 0.9,
          marginBottom: '16px',
          padding: '12px',
          background: 'rgba(0,0,0,0.15)',
          borderRadius: '8px',
        }}
      >
        🎬 Create a movie or continue solving
      </div>

      <div style={{ display: 'flex', gap: '12px', width: '100%' }}>
        <button
          onClick={onMakeMovie}
          style={{
            flex: 1,
            padding: '14px 24px',
            background: 'rgba(139, 69, 255, 0.3)',
            border: '2px solid rgba(139, 69, 255, 0.8)',
            color: 'white',
            borderRadius: '10px',
            fontSize: '16px',
            fontWeight: 600,
            cursor: 'pointer',
            transition: 'all 0.2s ease',
          }}
          onMouseOver={e => {
            e.currentTarget.style.background = 'rgba(139, 69, 255, 0.4)';
            e.currentTarget.style.transform = 'translateY(-2px)';
          }}
          onMouseOut={e => {
            e.currentTarget.style.background = 'rgba(139, 69, 255, 0.3)';
            e.currentTarget.style.transform = 'translateY(0)';
          }}
        >
          🎬 Make a Movie
        </button>
        <button
          onClick={onClose}
          style={{
            flex: 1,
            padding: '14px 24px',
            background: 'rgba(255,255,255,0.25)',
            border: '2px solid rgba(255,255,255,0.8)',
            color: 'white',
            borderRadius: '10px',
            fontSize: '16px',
            fontWeight: 600,
            cursor: 'pointer',
            transition: 'all 0.2s ease',
          }}
          onMouseOver={e => {
            e.currentTarget.style.background = 'rgba(255,255,255,0.35)';
            e.currentTarget.style.transform = 'translateY(-2px)';
          }}
          onMouseOut={e => {
            e.currentTarget.style.background = 'rgba(255,255,255,0.25)';
            e.currentTarget.style.transform = 'translateY(0)';
          }}
        >
          Continue
        </button>
      </div>
    </div>
  );
};
