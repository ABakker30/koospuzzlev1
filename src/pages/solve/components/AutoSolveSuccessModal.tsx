import React from 'react';
import { ModalBase } from '../../../components/ModalBase';

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
};

export const AutoSolveSuccessModal: React.FC<AutoSolveSuccessModalProps> = ({
  isOpen,
  stats,
  onClose,
}) => {
  return (
    <ModalBase
      isOpen={isOpen && !!stats}
      onClose={onClose}
      draggable
      floatingClose
      maxWidth={400}
      surface="linear-gradient(135deg, #1e88e5, #42a5f5)"
    >
      {stats && (
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: '64px', marginBottom: '16px' }}>🎉</div>
          <div style={{ fontSize: '32px', fontWeight: 700, marginBottom: '8px', color: '#ffffff' }}>
            Solution Found!
          </div>
          <div style={{ fontSize: '18px', fontWeight: 600, marginBottom: '24px', opacity: 0.95 }}>
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
            <div style={{ marginBottom: '12px', fontSize: '16px', fontWeight: 600 }}>
              ✨ Auto-Solve Complete!
            </div>
            <div>
              <strong>📅 Date:</strong> {new Date().toLocaleDateString()}
            </div>
            <div>
              <strong>🧩 Pieces:</strong> {stats.pieceCount}
            </div>
            <div>
              <strong>📦 Cells:</strong> {stats.cellCount}
            </div>
          </div>

          <div
            style={{
              fontSize: '14px',
              fontWeight: 'normal',
              opacity: 0.9,
              padding: '12px',
              background: 'rgba(0,0,0,0.15)',
              borderRadius: '8px',
            }}
          >
            ✅ Your solution has been automatically saved!
          </div>
        </div>
      )}
    </ModalBase>
  );
};
