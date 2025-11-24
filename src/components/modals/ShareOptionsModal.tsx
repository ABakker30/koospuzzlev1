// Share Options Modal - Social sharing options for movies
import React, { useState } from 'react';
import { useDraggable } from '../../hooks/useDraggable';

type RecordingPlatform = 'instagram' | 'youtube' | 'tiktok' | 'download';

interface ShareOptionsModalProps {
  isOpen: boolean;
  onClose: () => void;
  shareUrl: string;
  movieTitle: string;
  isSaved: boolean; // Whether the movie is already saved to database
  onStartRecording: (platform: RecordingPlatform, aspectRatio?: 'landscape' | 'portrait' | 'square', quality?: 'low' | 'medium' | 'high') => void;
  onSaveFirst: () => void; // Callback to save movie before recording
}

export const ShareOptionsModal: React.FC<ShareOptionsModalProps> = ({
  isOpen,
  onClose,
  shareUrl,
  movieTitle,
  isSaved,
  onStartRecording,
  onSaveFirst
}) => {
  const draggable = useDraggable();
  const [copied, setCopied] = useState(false);
  const [message, setMessage] = useState(`Check out this puzzle movie: ${movieTitle}`);
  const [showDownloadOptions, setShowDownloadOptions] = useState(false);
  const [downloadAspectRatio, setDownloadAspectRatio] = useState<'landscape' | 'portrait' | 'square'>('landscape');
  const [downloadQuality, setDownloadQuality] = useState<'low' | 'medium' | 'high'>('high');

  // Reset download options panel when modal opens
  React.useEffect(() => {
    if (isOpen) {
      setShowDownloadOptions(false);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleCopyLink = () => {
    navigator.clipboard.writeText(shareUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // Native Share API - Share link
  const handleNativeShare = async () => {
    if (navigator.share) {
      try {
        await navigator.share({
          title: movieTitle,
          text: message,
          url: shareUrl
        });
        console.log('✅ Shared successfully via native share');
      } catch (error) {
        if ((error as Error).name !== 'AbortError') {
          console.error('❌ Share failed:', error);
          alert('Failed to share. Please try copying the link instead.');
        }
      }
    } else {
      alert('Share not supported on this browser. Please use the platform buttons or copy the link.');
    }
  };

  // Download - Show options first
  const handleDownloadClick = () => {
    setShowDownloadOptions(true);
  };

  const handleConfirmDownload = () => {
    // Check if movie is saved first
    if (!isSaved) {
      alert('💾 Please save your movie first!');
      setShowDownloadOptions(false);
      onSaveFirst();
      return;
    }
    
    onStartRecording('download', downloadAspectRatio, downloadQuality);
    onClose();
  };

  const handleCancelDownload = () => {
    setShowDownloadOptions(false);
  };

  return (
    <>
      {/* Custom Scrollbar Styles */}
      <style>{`
        .share-options-modal-scrollable::-webkit-scrollbar {
          width: 12px;
        }
        .share-options-modal-scrollable::-webkit-scrollbar-track {
          background: rgba(245, 158, 11, 0.1);
          border-radius: 10px;
          margin: 20px 0;
        }
        .share-options-modal-scrollable::-webkit-scrollbar-thumb {
          background: linear-gradient(180deg, #f59e0b, #d97706);
          border-radius: 10px;
          border: 2px solid rgba(254, 243, 199, 0.5);
        }
        .share-options-modal-scrollable::-webkit-scrollbar-thumb:hover {
          background: linear-gradient(180deg, #d97706, #b45309);
        }
        .share-options-modal-scrollable::-webkit-scrollbar-thumb:active {
          background: #b45309;
        }
        .share-options-modal-scrollable {
          scrollbar-width: thin;
          scrollbar-color: #f59e0b rgba(245, 158, 11, 0.1);
        }
      `}</style>
      
      {/* Backdrop */}
      <div style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        background: 'rgba(0, 0, 0, 0.75)',
        backdropFilter: 'blur(4px)',
        zIndex: 10000
      }} onClick={onClose} />
      
      {/* Modal */}
      <div
        ref={draggable.ref}
        className="share-options-modal-scrollable"
        style={{
          position: 'fixed',
          top: '50%',
          left: '50%',
          background: 'linear-gradient(135deg, #fef3c7 0%, #fde68a 50%, #fcd34d 100%)',
          borderRadius: '20px',
          padding: '0',
          maxWidth: '420px',
          width: '90%',
          maxHeight: '85vh',
          overflowY: 'auto',
          boxShadow: '0 8px 32px rgba(0, 0, 0, 0.3)',
          border: '3px solid rgba(251, 191, 36, 0.6)',
          zIndex: 10001,
          ...draggable.style
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div style={{ 
          background: 'linear-gradient(135deg, #f59e0b, #d97706, #b45309)',
          padding: '1.5rem',
          borderRadius: '17px 17px 0 0',
          marginBottom: '20px',
          textAlign: 'center',
          borderBottom: '3px solid rgba(255,255,255,0.3)',
          boxShadow: '0 4px 20px rgba(245, 158, 11, 0.4)',
          position: 'relative',
          userSelect: 'none',
          ...draggable.headerStyle
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
              background: 'rgba(255,255,255,0.2)',
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
            title="Close"
          >
            ×
          </button>
          <div style={{ fontSize: '48px', marginBottom: '12px' }}>📤</div>
          <h2 style={{ 
            color: '#fff', 
            fontSize: '24px', 
            fontWeight: 700,
            margin: 0,
            marginBottom: '8px',
            textShadow: '0 2px 4px rgba(0,0,0,0.2)'
          }}>
            Share Movie
          </h2>
          <p style={{ 
            color: 'rgba(255,255,255,0.95)', 
            fontSize: '14px',
            margin: 0,
            fontWeight: 600
          }}>
            {movieTitle}
          </p>
        </div>

        {/* Content */}
        <div style={{ padding: '0 1.5rem 1.5rem' }}>
          {showDownloadOptions ? (
            /* Download Options Panel */
            <>
              <div style={{
                background: 'rgba(255, 255, 255, 0.8)',
                border: '2px solid rgba(245, 158, 11, 0.3)',
                borderRadius: '12px',
                padding: '16px',
                marginBottom: '16px'
              }}>
                <div style={{ fontSize: '14px', fontWeight: 600, color: '#78716c', marginBottom: '12px' }}>
                  Aspect Ratio
                </div>
                <div style={{ display: 'flex', gap: '8px', marginBottom: '16px' }}>
                  {(['landscape', 'portrait', 'square'] as const).map(ratio => (
                    <button
                      key={ratio}
                      onClick={() => setDownloadAspectRatio(ratio)}
                      style={{
                        flex: 1,
                        padding: '10px',
                        background: downloadAspectRatio === ratio ? 'linear-gradient(135deg, #f59e0b, #d97706)' : 'rgba(255, 255, 255, 0.9)',
                        color: downloadAspectRatio === ratio ? '#fff' : '#78716c',
                        border: downloadAspectRatio === ratio ? 'none' : '1px solid rgba(120, 113, 108, 0.3)',
                        borderRadius: '8px',
                        fontSize: '12px',
                        fontWeight: 600,
                        cursor: 'pointer',
                        transition: 'all 0.2s'
                      }}
                    >
                      {ratio === 'landscape' ? '16:9' : ratio === 'portrait' ? '9:16' : '1:1'}
                    </button>
                  ))}
                </div>

                <div style={{ fontSize: '14px', fontWeight: 600, color: '#78716c', marginBottom: '12px' }}>
                  Quality
                </div>
                <div style={{ display: 'flex', gap: '8px' }}>
                  {(['low', 'medium', 'high'] as const).map(qual => (
                    <button
                      key={qual}
                      onClick={() => setDownloadQuality(qual)}
                      style={{
                        flex: 1,
                        padding: '10px',
                        background: downloadQuality === qual ? 'linear-gradient(135deg, #f59e0b, #d97706)' : 'rgba(255, 255, 255, 0.9)',
                        color: downloadQuality === qual ? '#fff' : '#78716c',
                        border: downloadQuality === qual ? 'none' : '1px solid rgba(120, 113, 108, 0.3)',
                        borderRadius: '8px',
                        fontSize: '12px',
                        fontWeight: 600,
                        cursor: 'pointer',
                        transition: 'all 0.2s',
                        textTransform: 'capitalize'
                      }}
                    >
                      {qual}
                    </button>
                  ))}
                </div>
              </div>

              <div style={{ display: 'flex', gap: '10px' }}>
                <button
                  onClick={handleCancelDownload}
                  style={{
                    flex: 1,
                    padding: '12px',
                    background: 'rgba(255, 255, 255, 0.7)',
                    border: '2px solid rgba(120, 113, 108, 0.3)',
                    borderRadius: '10px',
                    color: '#78716c',
                    fontSize: '14px',
                    fontWeight: 600,
                    cursor: 'pointer'
                  }}
                >
                  Back
                </button>
                <button
                  onClick={handleConfirmDownload}
                  style={{
                    flex: 1,
                    padding: '12px',
                    background: 'linear-gradient(135deg, #f59e0b, #d97706)',
                    border: 'none',
                    borderRadius: '10px',
                    color: '#fff',
                    fontSize: '14px',
                    fontWeight: 700,
                    cursor: 'pointer',
                    boxShadow: '0 4px 12px rgba(245, 158, 11, 0.4)'
                  }}
                >
                  Start Recording
                </button>
              </div>
            </>
          ) : (
            /* Main Share Options */
            <>
          {/* Custom Message */}
          <div style={{
            marginBottom: '20px'
          }}>
            <div style={{
              fontSize: '13px',
              color: '#78716c',
              marginBottom: '8px',
              fontWeight: 600
            }}>
              Share Message
            </div>
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Add a message..."
              rows={3}
              style={{
                width: '100%',
                padding: '10px 12px',
                background: '#fff',
                border: '1px solid rgba(120, 113, 108, 0.3)',
                borderRadius: '8px',
                fontSize: '14px',
                color: '#1f2937',
                fontFamily: 'inherit',
                resize: 'none',
                outline: 'none',
                transition: 'border-color 0.2s',
                boxSizing: 'border-box'
              }}
              onFocus={(e) => e.currentTarget.style.borderColor = 'rgba(245, 158, 11, 0.5)'}
              onBlur={(e) => e.currentTarget.style.borderColor = 'rgba(120, 113, 108, 0.3)'}
            />
          </div>

          {/* Share Link Button - Native */}
          {'share' in navigator && (
            <button
              onClick={handleNativeShare}
              style={{
                width: '100%',
                padding: '16px 20px',
                background: 'linear-gradient(135deg, #3b82f6, #2563eb)',
                border: 'none',
                borderRadius: '12px',
                color: '#fff',
                fontSize: '18px',
                fontWeight: 700,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '10px',
                boxShadow: '0 6px 20px rgba(59, 130, 246, 0.4)',
                transition: 'all 0.2s',
                marginBottom: '12px'
              }}
            >
              <span style={{ fontSize: '24px' }}>📤</span> 
              <span>Share Link</span>
            </button>
          )}

          {/* Download Video Button */}
          <button
            onClick={handleDownloadClick}
            style={{
              width: '100%',
              padding: '16px 20px',
              background: 'linear-gradient(135deg, #10b981, #059669)',
              border: 'none',
              borderRadius: '12px',
              color: '#fff',
              fontSize: '18px',
              fontWeight: 700,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '10px',
              boxShadow: '0 6px 20px rgba(16, 185, 129, 0.4)',
              transition: 'all 0.2s',
              marginBottom: '12px'
            }}
          >
            <span style={{ fontSize: '24px' }}>💾</span> 
            <span>Download Video</span>
          </button>

          {/* Copy Link Button */}
          <button
            onClick={handleCopyLink}
            style={{
              width: '100%',
              padding: '16px 20px',
              background: copied ? 'linear-gradient(135deg, #10b981, #059669)' : 'rgba(255, 255, 255, 0.7)',
              border: copied ? 'none' : '2px solid rgba(120, 113, 108, 0.3)',
              borderRadius: '12px',
              color: copied ? '#fff' : '#1e293b',
              fontSize: '18px',
              fontWeight: 700,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '10px',
              boxShadow: copied ? '0 6px 20px rgba(16, 185, 129, 0.4)' : '0 2px 8px rgba(0, 0, 0, 0.1)',
              transition: 'all 0.2s'
            }}
          >
            <span style={{ fontSize: '24px' }}>{copied ? '✓' : '📋'}</span> 
            <span>{copied ? 'Copied!' : 'Copy Link'}</span>
          </button>
          </>
          )}
        </div>
      </div>
    </>
  );
};
