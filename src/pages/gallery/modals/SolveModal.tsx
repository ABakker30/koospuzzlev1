import React from 'react';
import { useTranslation } from 'react-i18next';

interface SolveModalProps {
  isOpen: boolean;
  onClose: () => void;
  onBack: () => void;
  onSolveUnrated: () => void;
  onSolveRated: () => void;
  onAutoSolve: () => void;
}

export const SolveModal: React.FC<SolveModalProps> = ({
  isOpen,
  onClose,
  onBack,
  onSolveUnrated,
  onSolveRated,
  onAutoSolve,
}) => {
  const { t } = useTranslation();

  if (!isOpen) return null;

  return (
    <>
      <style>{`
        @keyframes modalSlideIn {
          from {
            opacity: 0;
            transform: translate(-50%, -45%);
          }
          to {
            opacity: 1;
            transform: translate(-50%, -50%);
          }
        }
      `}</style>

      {/* Backdrop */}
      <div
        onClick={onClose}
        style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(0, 0, 0, 0.75)',
          backdropFilter: 'blur(8px)',
          zIndex: 10002,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        {/* Modal */}
        <div
          onClick={(e) => e.stopPropagation()}
          style={{
            position: 'fixed',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            background: 'linear-gradient(135deg, #10B981 0%, #059669 100%)',
            borderRadius: '20px',
            padding: '0',
            width: '90%',
            maxWidth: '480px',
            maxHeight: '90vh',
            overflowY: 'auto',
            boxShadow: '0 20px 60px rgba(0, 0, 0, 0.5)',
            border: '2px solid rgba(255, 255, 255, 0.2)',
            animation: 'modalSlideIn 0.3s ease-out',
            zIndex: 10003,
          }}
        >
          {/* Header */}
          <div
            style={{
              background: 'rgba(0, 0, 0, 0.3)',
              padding: '16px 20px',
              minHeight: '56px',
              borderRadius: '18px 18px 0 0',
              textAlign: 'center',
              position: 'relative',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            {/* Back Button */}
            <button
              onClick={onBack}
              style={{
                position: 'absolute',
                top: '16px',
                left: '16px',
                background: 'transparent',
                border: 'none',
                cursor: 'pointer',
                fontSize: '20px',
                color: 'rgba(255, 255, 255, 0.8)',
                padding: '4px',
                lineHeight: 1,
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.color = '#fff';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.color = 'rgba(255, 255, 255, 0.8)';
              }}
            >
              ←
            </button>

            {/* Close Button */}
            <button
              onClick={onClose}
              style={{
                position: 'absolute',
                top: '16px',
                right: '16px',
                background: 'transparent',
                border: 'none',
                cursor: 'pointer',
                fontSize: '24px',
                color: 'rgba(255, 255, 255, 0.8)',
                padding: '4px',
                lineHeight: 1,
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.color = '#fff';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.color = 'rgba(255, 255, 255, 0.8)';
              }}
            >
              ✕
            </button>

            <h2
              style={{
                color: '#fff',
                fontSize: '1.1rem',
                fontWeight: 700,
                margin: 0,
                textShadow: '0 2px 8px rgba(0, 0, 0, 0.3)',
              }}
            >
              {t('gallery.modals.solve.title')}
            </h2>
          </div>

          {/* Options */}
          <div
            style={{
              padding: '20px',
              display: 'flex',
              flexDirection: 'column',
              gap: '12px',
            }}
          >
            {/* Solve Unrated Button */}
            <button
              onClick={onSolveUnrated}
              style={{
                background: 'linear-gradient(135deg, #4CAF50 0%, #45a049 100%)',
                border: 'none',
                borderRadius: '12px',
                color: '#fff',
                cursor: 'pointer',
                padding: '18px',
                fontSize: '0.95rem',
                fontWeight: 700,
                minHeight: '80px',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '8px',
                transition: 'all 0.2s',
                boxShadow: '0 4px 12px rgba(76, 175, 80, 0.4)',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.transform = 'translateY(-2px)';
                e.currentTarget.style.boxShadow = '0 6px 20px rgba(76, 175, 80, 0.6)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.transform = 'translateY(0)';
                e.currentTarget.style.boxShadow = '0 4px 12px rgba(76, 175, 80, 0.4)';
              }}
            >
              <span style={{ fontSize: '32px' }}>🎯</span>
              <span>{t('gallery.modals.solve.unrated')}</span>
            </button>

            {/* Solve Rated Button */}
            <button
              onClick={onSolveRated}
              style={{
                background: 'linear-gradient(135deg, #2196F3 0%, #1976D2 100%)',
                border: 'none',
                borderRadius: '12px',
                color: '#fff',
                cursor: 'pointer',
                padding: '18px',
                fontSize: '0.95rem',
                fontWeight: 700,
                minHeight: '80px',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '8px',
                transition: 'all 0.2s',
                boxShadow: '0 4px 12px rgba(33, 150, 243, 0.4)',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.transform = 'translateY(-2px)';
                e.currentTarget.style.boxShadow = '0 6px 20px rgba(33, 150, 243, 0.6)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.transform = 'translateY(0)';
                e.currentTarget.style.boxShadow = '0 4px 12px rgba(33, 150, 243, 0.4)';
              }}
            >
              <span style={{ fontSize: '32px' }}>🏆</span>
              <span>{t('gallery.modals.solve.rated')}</span>
            </button>

            {/* Auto Solve Button */}
            <button
              onClick={onAutoSolve}
              style={{
                background: 'linear-gradient(135deg, #9333EA 0%, #7E22CE 100%)',
                border: 'none',
                borderRadius: '12px',
                color: '#fff',
                cursor: 'pointer',
                padding: '18px',
                fontSize: '0.95rem',
                fontWeight: 700,
                minHeight: '80px',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '8px',
                transition: 'all 0.2s',
                boxShadow: '0 4px 12px rgba(147, 51, 234, 0.4)',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.transform = 'translateY(-2px)';
                e.currentTarget.style.boxShadow = '0 6px 20px rgba(147, 51, 234, 0.6)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.transform = 'translateY(0)';
                e.currentTarget.style.boxShadow = '0 4px 12px rgba(147, 51, 234, 0.4)';
              }}
            >
              <span style={{ fontSize: '32px' }}>🤖</span>
              <span>{t('gallery.modals.solve.auto')}</span>
            </button>
          </div>
        </div>
      </div>
    </>
  );
};
