import { useState } from 'react';

interface MovieSuccessModalProps {
  isOpen: boolean;
  onClose: () => void;
  movieTitle: string;
  movieUrl?: string;
  challengeText: string;
  fileSize: number; // in bytes
  effectType: string;
}

export function MovieSuccessModal({ 
  isOpen, 
  onClose, 
  movieTitle,
  movieUrl,
  challengeText,
  fileSize,
  effectType
}: MovieSuccessModalProps) {
  const [copied, setCopied] = useState<'url' | 'challenge' | null>(null);

  const handleCopy = (text: string, type: 'url' | 'challenge') => {
    navigator.clipboard.writeText(text);
    setCopied(type);
    setTimeout(() => setCopied(null), 2000);
  };

  if (!isOpen) return null;

  const fileSizeMB = (fileSize / 1024 / 1024).toFixed(2);

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ 
        maxWidth: '550px',
        background: '#1a1a1a',
        color: '#ffffff'
      }}>
        <div className="modal-header">
          <h2 style={{ color: '#ffffff' }}>🎉 Movie Saved Successfully!</h2>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>

        <div className="modal-body">
          {/* Celebration Message */}
          <div style={{
            padding: '1.5rem',
            background: 'linear-gradient(135deg, rgba(156,39,176,0.2), rgba(103,58,183,0.2))',
            border: '2px solid rgba(156,39,176,0.5)',
            borderRadius: '8px',
            marginBottom: '1.5rem',
            textAlign: 'center'
          }}>
            <div style={{ fontSize: '48px', marginBottom: '0.5rem' }}>🎬</div>
            <div style={{ fontSize: '20px', fontWeight: 600, marginBottom: '0.5rem', color: '#ffffff' }}>
              {movieTitle}
            </div>
            <div style={{ fontSize: '14px', color: 'rgba(255,255,255,0.8)' }}>
              Your movie is ready to share with the world!
            </div>
          </div>

          {/* Stats */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            gap: '1rem',
            marginBottom: '1.5rem'
          }}>
            <div style={{
              padding: '1rem',
              background: 'rgba(255,255,255,0.05)',
              borderRadius: '6px',
              border: '1px solid rgba(255,255,255,0.1)'
            }}>
              <div style={{ fontSize: '12px', color: 'rgba(255,255,255,0.6)', marginBottom: '0.25rem' }}>
                File Size
              </div>
              <div style={{ fontSize: '18px', fontWeight: 600, color: '#ffffff' }}>
                {fileSizeMB} MB
              </div>
            </div>
            <div style={{
              padding: '1rem',
              background: 'rgba(255,255,255,0.05)',
              borderRadius: '6px',
              border: '1px solid rgba(255,255,255,0.1)'
            }}>
              <div style={{ fontSize: '12px', color: 'rgba(255,255,255,0.6)', marginBottom: '0.25rem' }}>
                Effect Type
              </div>
              <div style={{ fontSize: '18px', fontWeight: 600, color: '#ffffff', textTransform: 'capitalize' }}>
                {effectType}
              </div>
            </div>
          </div>

          {/* Share URL */}
          {movieUrl && (
            <div style={{ marginBottom: '1.5rem' }}>
              <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 600, color: '#ffffff' }}>
                📎 Share Link
              </label>
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <input
                  type="text"
                  value={movieUrl}
                  readOnly
                  style={{
                    flex: 1,
                    padding: '0.5rem',
                    borderRadius: '4px',
                    border: '1px solid rgba(255,255,255,0.3)',
                    background: 'rgba(255,255,255,0.05)',
                    color: '#ffffff',
                    fontSize: '14px'
                  }}
                />
                <button
                  onClick={() => handleCopy(movieUrl, 'url')}
                  className="pill pill--primary"
                  style={{ 
                    background: copied === 'url' ? '#4caf50' : '#9c27b0',
                    minWidth: '80px'
                  }}
                >
                  {copied === 'url' ? '✓ Copied' : 'Copy'}
                </button>
              </div>
            </div>
          )}

          {/* Challenge Text */}
          {challengeText && (
            <div style={{ marginBottom: '1rem' }}>
              <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 600, color: '#ffffff' }}>
                🎯 Challenge Text
              </label>
              <div style={{
                padding: '1rem',
                background: 'rgba(255,193,7,0.1)',
                border: '1px solid rgba(255,193,7,0.3)',
                borderRadius: '6px',
                marginBottom: '0.5rem'
              }}>
                <div style={{ fontSize: '14px', color: '#ffffff', fontStyle: 'italic' }}>
                  "{challengeText}"
                </div>
              </div>
              <button
                onClick={() => handleCopy(challengeText, 'challenge')}
                className="pill pill--ghost"
                style={{ 
                  background: copied === 'challenge' ? 'rgba(76,175,80,0.2)' : 'rgba(255,255,255,0.1)',
                  width: '100%'
                }}
              >
                {copied === 'challenge' ? '✓ Copied Challenge Text' : '📋 Copy Challenge Text'}
              </button>
            </div>
          )}
        </div>

        <div className="modal-footer">
          <button 
            className="pill pill--ghost" 
            onClick={onClose}
          >
            Close
          </button>
          <button 
            className="pill pill--primary" 
            onClick={onClose}
            style={{ background: '#9c27b0' }}
          >
            Create Another Movie
          </button>
        </div>
      </div>
    </div>
  );
}
