import React from 'react';
import { useTranslation } from 'react-i18next';
import { ModalBase } from '../../../components/ModalBase';
import { tokens } from '../../../styles/tokens';

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

  const puzzleUrl = `${window.location.origin}/game/${puzzleId}?mode=quickplay&shared=true`;

  const copyToClipboard = () => {
    navigator.clipboard.writeText(puzzleUrl);
    alert(t('success.linkCopied'));
  };

  return (
    <ModalBase
      isOpen={isOpen}
      onClose={onClose}
      maxWidth={500}
      surface="#1a1a1a"
    >
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
            background: tokens.gradient.brand,
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
    </ModalBase>
  );
};
