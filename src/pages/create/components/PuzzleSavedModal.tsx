import React from 'react';
import { useTranslation } from 'react-i18next';

interface PuzzleSavedModalProps {
  isOpen: boolean;
  onClose: () => void;
  puzzleName: string;
  puzzleId: string;
  sphereCount: number;
  onViewInGallery: () => void;
  onSolvePuzzle: () => void;
  onCreateAnother: () => void;
}

export const PuzzleSavedModal: React.FC<PuzzleSavedModalProps> = ({
  isOpen,
  onClose,
  puzzleName,
  puzzleId,
  sphereCount,
  onViewInGallery,
  onSolvePuzzle,
  onCreateAnother
}) => {
  const { t } = useTranslation();
  if (!isOpen) return null;

  const puzzleUrl = `${window.location.origin}/game/${puzzleId}?mode=quickplay&shared=true`;

  const copyToClipboard = () => {
    navigator.clipboard.writeText(puzzleUrl);
    alert(t('success.linkCopied'));
  };

  return (
    <div style={{
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      backgroundColor: 'rgba(0, 0, 0, 0.8)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 10000,
      padding: '20px'
    }}>
      <div style={{
        backgroundColor: '#1a1a1a',
        borderRadius: '16px',
        padding: '32px',
        maxWidth: '500px',
        width: '100%',
        border: '2px solid #4CAF50',
        boxShadow: '0 8px 32px rgba(76, 175, 80, 0.3)',
        position: 'relative'
      }}>
        <button
          onClick={(e) => {
            e.stopPropagation();
            onClose();
          }}
          onTouchEnd={(e) => {
            e.stopPropagation();
            onClose();
          }}
          style={{
            position: 'absolute',
            top: '12px',
            right: '12px',
            background: 'rgba(255,255,255,0.1)',
            border: 'none',
            borderRadius: '50%',
            width: '32px',
            height: '32px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
            fontSize: '20px',
            color: '#fff',
            fontWeight: 700,
            transition: 'all 0.2s',
            touchAction: 'manipulation',
            WebkitTapHighlightColor: 'transparent'
          }}
          onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(255,255,255,0.2)')}
          onMouseLeave={(e) => (e.currentTarget.style.background = 'rgba(255,255,255,0.1)')}
          title={t('button.close')}
        >
          ×
        </button>
        {/* Success Icon */}
        <div style={{
          width: '64px',
          height: '64px',
          borderRadius: '50%',
          backgroundColor: '#4CAF50',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          margin: '0 auto 24px',
          fontSize: '32px'
        }}>
          ✓
        </div>

        {/* Title */}
        <h2 style={{
          color: '#fff',
          textAlign: 'center',
          marginBottom: '8px',
          fontSize: '24px',
          fontWeight: '600'
        }}>
          {t('success.puzzleSaved')}
        </h2>

        {/* Puzzle Details */}
        <div style={{
          backgroundColor: '#252525',
          borderRadius: '8px',
          padding: '16px',
          marginBottom: '24px'
        }}>
          <div style={{ color: '#aaa', fontSize: '14px', marginBottom: '8px' }}>
            {t('success.puzzleNameLabel')}
          </div>
          <div style={{ color: '#fff', fontSize: '18px', fontWeight: '500', marginBottom: '16px' }}>
            {puzzleName}
          </div>
          
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <div>
              <div style={{ color: '#aaa', fontSize: '12px' }}>{t('success.spheresLabel')}</div>
              <div style={{ color: '#4CAF50', fontSize: '20px', fontWeight: '600' }}>
                {sphereCount}
              </div>
            </div>
            <div>
              <div style={{ color: '#aaa', fontSize: '12px' }}>{t('success.statusLabel')}</div>
              <div style={{ color: '#4CAF50', fontSize: '16px', fontWeight: '500' }}>
                {t('success.publicStatus')}
              </div>
            </div>
          </div>
        </div>

        {/* Share Link */}
        <div style={{
          backgroundColor: '#252525',
          borderRadius: '8px',
          padding: '12px',
          marginBottom: '24px',
          display: 'flex',
          alignItems: 'center',
          gap: '8px'
        }}>
          <input
            type="text"
            value={puzzleUrl}
            readOnly
            style={{
              flex: 1,
              background: '#1a1a1a',
              border: '1px solid #333',
              borderRadius: '4px',
              padding: '8px 12px',
              color: '#aaa',
              fontSize: '14px',
              fontFamily: 'monospace'
            }}
          />
          <button
            onClick={copyToClipboard}
            style={{
              background: '#4CAF50',
              border: 'none',
              borderRadius: '4px',
              padding: '8px 16px',
              color: '#fff',
              fontSize: '14px',
              fontWeight: '500',
              cursor: 'pointer',
              whiteSpace: 'nowrap'
            }}
          >
            {t('button.copy')}
          </button>
        </div>

        {/* Action Buttons */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <button
            onClick={onSolvePuzzle}
            style={{
              background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
              border: 'none',
              borderRadius: '8px',
              padding: '14px 24px',
              color: '#fff',
              fontSize: '16px',
              fontWeight: '600',
              cursor: 'pointer',
              transition: 'transform 0.2s'
            }}
            onMouseOver={(e) => e.currentTarget.style.transform = 'scale(1.02)'}
            onMouseOut={(e) => e.currentTarget.style.transform = 'scale(1)'}
          >
            🧩 {t('success.trySolveButton')}
          </button>

          <button
            onClick={onViewInGallery}
            style={{
              background: '#333',
              border: '1px solid #555',
              borderRadius: '8px',
              padding: '14px 24px',
              color: '#fff',
              fontSize: '16px',
              fontWeight: '500',
              cursor: 'pointer',
              transition: 'transform 0.2s'
            }}
            onMouseOver={(e) => e.currentTarget.style.transform = 'scale(1.02)'}
            onMouseOut={(e) => e.currentTarget.style.transform = 'scale(1)'}
          >
            📚 {t('success.viewGalleryButton')}
          </button>

          <button
            onClick={onCreateAnother}
            style={{
              background: 'transparent',
              border: '1px solid #4CAF50',
              borderRadius: '8px',
              padding: '14px 24px',
              color: '#4CAF50',
              fontSize: '16px',
              fontWeight: '500',
              cursor: 'pointer',
              transition: 'all 0.2s'
            }}
            onMouseOver={(e) => {
              e.currentTarget.style.transform = 'scale(1.02)';
              e.currentTarget.style.backgroundColor = 'rgba(76, 175, 80, 0.1)';
            }}
            onMouseOut={(e) => {
              e.currentTarget.style.transform = 'scale(1)';
              e.currentTarget.style.backgroundColor = 'transparent';
            }}
          >
            ✨ {t('success.createAnotherButton')}
          </button>
        </div>
      </div>
    </div>
  );
};
