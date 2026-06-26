import React from 'react';
import { useTranslation } from 'react-i18next';
import { ModalBase } from '../../../components/ModalBase';

interface PuzzleOptionsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectExplore: () => void;
  onSelectSolve: () => void;
  onSelectPlay: () => void;
  hasSolutions?: boolean;
  solutionCount?: number;
}

export const PuzzleOptionsModal: React.FC<PuzzleOptionsModalProps> = ({
  isOpen,
  onClose,
  onSelectExplore,
  onSelectSolve,
  onSelectPlay,
  hasSolutions = false,
  solutionCount = 0,
}) => {
  const { t } = useTranslation();

  return (
    <ModalBase
      isOpen={isOpen}
      onClose={onClose}
      maxWidth={540}
      title={t('gallery.modals.topLevel.title')}
    >
      {/* Main Options - 3 Button Layout */}
      <div
        style={{
          // Match original padding (12px top, 20px sides/bottom) within the 20px body pad.
          margin: '-20px',
          padding: '12px 20px 20px 20px',
          display: 'flex',
          flexDirection: 'column',
          gap: '12px',
        }}
      >
        {/* Top Row: Explore + Solve */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '12px' }}>
          {/* Explore Button */}
          <button
            onClick={onSelectExplore}
            style={{
              background: 'linear-gradient(135deg, #8B5CF6 0%, #7C3AED 100%)',
              border: 'none',
              borderRadius: '12px',
              color: '#fff',
              cursor: 'pointer',
              padding: '16px 12px',
              fontSize: '0.9rem',
              fontWeight: 700,
              minHeight: '100px',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '8px',
              transition: 'all 0.2s',
              boxShadow: '0 4px 12px rgba(139, 92, 246, 0.4)',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.transform = 'translateY(-2px)';
              e.currentTarget.style.boxShadow = '0 6px 20px rgba(139, 92, 246, 0.6)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.transform = 'translateY(0)';
              e.currentTarget.style.boxShadow = '0 4px 12px rgba(139, 92, 246, 0.4)';
            }}
          >
            <span style={{ fontSize: '32px' }}>🔍</span>
            <span>{t('gallery.modals.topLevel.explore')}</span>
          </button>

          {/* Solve Button - Dynamic text based on solution count */}
          <button
            onClick={onSelectSolve}
            style={{
              background: 'linear-gradient(135deg, #10B981 0%, #059669 100%)',
              border: 'none',
              borderRadius: '12px',
              color: '#fff',
              cursor: 'pointer',
              padding: '16px 12px',
              fontSize: '0.9rem',
              fontWeight: 700,
              minHeight: '100px',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '8px',
              transition: 'all 0.2s',
              boxShadow: '0 4px 12px rgba(16, 185, 129, 0.4)',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.transform = 'translateY(-2px)';
              e.currentTarget.style.boxShadow = '0 6px 20px rgba(16, 185, 129, 0.6)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.transform = 'translateY(0)';
              e.currentTarget.style.boxShadow = '0 4px 12px rgba(16, 185, 129, 0.4)';
            }}
          >
            <span style={{ fontSize: '32px' }}>🧩</span>
            <span>
              {hasSolutions
                ? `Solve (${solutionCount} existing)`
                : t('gallery.modals.topLevel.solve')}
            </span>
          </button>
        </div>

        {/* Bottom Row: Play (full width) */}
        <button
          onClick={onSelectPlay}
          style={{
            background: 'linear-gradient(135deg, #F59E0B 0%, #D97706 100%)',
            border: 'none',
            borderRadius: '12px',
            color: '#fff',
            cursor: 'pointer',
            padding: '16px 12px',
            fontSize: '0.9rem',
            fontWeight: 700,
            minHeight: '100px',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '8px',
            transition: 'all 0.2s',
            boxShadow: '0 4px 12px rgba(245, 158, 11, 0.4)',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.transform = 'translateY(-2px)';
            e.currentTarget.style.boxShadow = '0 6px 20px rgba(245, 158, 11, 0.6)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.transform = 'translateY(0)';
            e.currentTarget.style.boxShadow = '0 4px 12px rgba(245, 158, 11, 0.4)';
          }}
        >
          <span style={{ fontSize: '32px' }}>🎮</span>
          <span>{t('gallery.modals.topLevel.play')}</span>
        </button>
      </div>
    </ModalBase>
  );
};
