import { useState } from 'react';
import { useDraggable } from '../hooks/useDraggable';

interface MovieSuccessModalProps {
  isOpen: boolean;
  onClose: () => void;
  movieTitle: string;
  description?: string;
  challengeText: string;
  fileSize: number;
  effectType: string;
  movieId?: string; // Movie ID for gallery link
  movieUrl?: string;
  fileUrl?: string;
}

export const MovieSuccessModal = ({ 
  isOpen, 
  onClose, 
  movieId,
  movieTitle,
  fileUrl,
  fileSize,
  effectType,
  movieUrl,
  challengeText
}: MovieSuccessModalProps) => {
  const [copied, setCopied] = useState<'url' | 'challenge' | null>(null);
  const draggable = useDraggable();

  const handleCopy = (text: string, type: 'url' | 'challenge') => {
    navigator.clipboard.writeText(text);
    setCopied(type);
    setTimeout(() => setCopied(null), 2000);
  };

  if (!isOpen) return null;

  const fileSizeMB = (fileSize / 1024 / 1024).toFixed(2);

  return (
    <>
      {/* Backdrop */}
      <div style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        background: 'transparent',
        backdropFilter: 'none',
        zIndex: 10000
      }} onClick={onClose} />
      
      {/* Modal - Centered and Draggable */}
      <div ref={draggable.ref} onClick={(e) => e.stopPropagation()} style={{ 
        position: 'fixed',
        top: '50%',
        left: '50%',
        maxWidth: '550px',
        width: '90%',
        background: '#1a1a1a',
        color: '#ffffff',
        borderRadius: '12px',
        padding: '0',
        zIndex: 10001,
        boxShadow: '0 8px 32px rgba(0, 0, 0, 0.3)',
        border: '2px solid rgba(156, 39, 176, 0.5)',
        ...draggable.style
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
            <div style={{ fontSize: '14px', color: 'rgba(255,255,255,0.8)', marginBottom: '0.5rem' }}>
              Your movie has been saved to the gallery!
            </div>
            <div style={{ fontSize: '12px', color: 'rgba(76,175,80,1)', fontWeight: 600 }}>
              ✨ Ready to share with the world
            </div>
          </div>

          {/* Gallery Link */}
          <div style={{
            padding: '1rem',
            background: 'linear-gradient(135deg, rgba(156,39,176,0.15), rgba(103,58,183,0.15))',
            border: '2px solid rgba(156,39,176,0.4)',
            borderRadius: '8px',
            marginBottom: '1.5rem',
            textAlign: 'center'
          }}>
            <div style={{ fontSize: '14px', color: 'rgba(255,255,255,0.7)', marginBottom: '0.75rem' }}>
              🎬 Effect: <strong style={{ color: '#ffffff', textTransform: 'capitalize' }}>{effectType}</strong>
            </div>
            <a
              href="/gallery"
              style={{
                display: 'inline-block',
                padding: '0.75rem 1.5rem',
                background: 'linear-gradient(135deg, #9c27b0, #673ab7)',
                color: 'white',
                textDecoration: 'none',
                borderRadius: '8px',
                fontWeight: 600,
                fontSize: '16px',
                transition: 'all 0.2s',
                boxShadow: '0 4px 12px rgba(156, 39, 176, 0.4)'
              }}
              onMouseOver={(e) => {
                e.currentTarget.style.transform = 'scale(1.05)';
                e.currentTarget.style.boxShadow = '0 6px 16px rgba(156, 39, 176, 0.6)';
              }}
              onMouseOut={(e) => {
                e.currentTarget.style.transform = 'scale(1)';
                e.currentTarget.style.boxShadow = '0 4px 12px rgba(156, 39, 176, 0.4)';
              }}
            >
              🎉 View in Movie Gallery
            </a>
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
    </>
  );
}
