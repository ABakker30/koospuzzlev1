// Share Options Modal - Choose between sharing link or downloading video
import { useState } from 'react';

export type VideoFormat = 'landscape' | 'portrait' | 'square';

interface ShareOptionsModalProps {
  isOpen: boolean;
  onClose: () => void;
  movieTitle: string;
  movieId: string;
  onShareLink: () => void;
  onDownloadVideo: (format: VideoFormat) => void;
}

export function ShareOptionsModal({
  isOpen,
  onClose,
  movieTitle,
  onShareLink,
  onDownloadVideo
}: ShareOptionsModalProps) {
  const [hoveredOption, setHoveredOption] = useState<'link' | 'video' | null>(null);
  const [selectedFormat, setSelectedFormat] = useState<VideoFormat>('landscape');

  if (!isOpen) return null;

  return (
    <>
      <style>{`
        @keyframes shareModalFadeIn {
          from {
            opacity: 0;
            transform: scale(0.95);
          }
          to {
            opacity: 1;
            transform: scale(1);
          }
        }

        @keyframes shareOptionPulse {
          0%, 100% {
            transform: scale(1);
          }
          50% {
            transform: scale(1.05);
          }
        }
      `}</style>

      {/* Backdrop */}
      <div
        onClick={onClose}
        style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(0, 0, 0, 0.75)',
          backdropFilter: 'blur(8px)',
          zIndex: 10000,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '20px',
        }}
      >
        {/* Modal */}
        <div
          onClick={(e) => e.stopPropagation()}
          style={{
            background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
            borderRadius: '24px',
            padding: '32px 24px',
            maxWidth: '400px',
            width: '100%',
            boxShadow: '0 20px 60px rgba(0, 0, 0, 0.4)',
            animation: 'shareModalFadeIn 0.3s ease-out',
          }}
        >
          {/* Header */}
          <div style={{ marginBottom: '24px', textAlign: 'center' }}>
            <h2
              style={{
                margin: 0,
                fontSize: '1.5rem',
                fontWeight: 700,
                color: '#fff',
                marginBottom: '8px',
              }}
            >
              How to Share?
            </h2>
            <p
              style={{
                margin: 0,
                fontSize: '0.9rem',
                color: 'rgba(255, 255, 255, 0.8)',
              }}
            >
              Choose your sharing method
            </p>
          </div>

          {/* Options */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            {/* Share Link Option */}
            <button
              onClick={() => {
                onShareLink();
                onClose();
              }}
              onMouseEnter={() => setHoveredOption('link')}
              onMouseLeave={() => setHoveredOption(null)}
              style={{
                background: hoveredOption === 'link'
                  ? 'linear-gradient(135deg, #4facfe 0%, #00f2fe 100%)'
                  : 'rgba(255, 255, 255, 0.15)',
                border: '2px solid rgba(255, 255, 255, 0.3)',
                borderRadius: '16px',
                padding: '20px',
                cursor: 'pointer',
                transition: 'all 0.3s ease',
                animation: hoveredOption === 'link' ? 'shareOptionPulse 0.6s ease-in-out' : 'none',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                <div
                  style={{
                    fontSize: '2.5rem',
                    lineHeight: 1,
                  }}
                >
                  🔗
                </div>
                <div style={{ flex: 1, textAlign: 'left' }}>
                  <div
                    style={{
                      fontSize: '1.1rem',
                      fontWeight: 700,
                      color: '#fff',
                      marginBottom: '4px',
                    }}
                  >
                    Share Link
                  </div>
                  <div
                    style={{
                      fontSize: '0.85rem',
                      color: 'rgba(255, 255, 255, 0.9)',
                      lineHeight: 1.4,
                    }}
                  >
                    Perfect for: WhatsApp, Email, Messages
                  </div>
                </div>
              </div>
            </button>

            {/* Share Video Option */}
            <button
              onClick={() => {
                onDownloadVideo(selectedFormat);
                onClose();
              }}
              onMouseEnter={() => setHoveredOption('video')}
              onMouseLeave={() => setHoveredOption(null)}
              style={{
                width: '100%',
                background: hoveredOption === 'video'
                  ? 'linear-gradient(135deg, #f093fb 0%, #f5576c 100%)'
                  : 'rgba(255, 255, 255, 0.15)',
                border: '2px solid rgba(255, 255, 255, 0.3)',
                borderRadius: '16px',
                padding: '20px',
                cursor: 'pointer',
                transition: 'all 0.3s ease',
                animation: hoveredOption === 'video' ? 'shareOptionPulse 0.6s ease-in-out' : 'none',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '16px', marginBottom: '16px' }}>
                <div
                  style={{
                    fontSize: '2.5rem',
                    lineHeight: 1,
                  }}
                >
                  📹
                </div>
                <div style={{ flex: 1, textAlign: 'left' }}>
                  <div
                    style={{
                      fontSize: '1.1rem',
                      fontWeight: 700,
                      color: '#fff',
                      marginBottom: '4px',
                    }}
                  >
                    Share Video
                  </div>
                  <div
                    style={{
                      fontSize: '0.85rem',
                      color: 'rgba(255, 255, 255, 0.9)',
                      lineHeight: 1.4,
                    }}
                  >
                    Perfect for: TikTok, YouTube, Instagram
                  </div>
                </div>
              </div>

              {/* Format Selection */}
              <div style={{ marginTop: '8px' }}>
                <div style={{ fontSize: '0.75rem', color: 'rgba(255, 255, 255, 0.7)', marginBottom: '10px', textAlign: 'center' }}>
                  Video Format
                </div>
                <div style={{ display: 'flex', justifyContent: 'center', gap: '12px' }}>
                  {([
                    { format: 'landscape', icon: '▬', size: '1.6rem' },
                    { format: 'portrait', icon: '▮', size: '1.6rem' },
                    { format: 'square', icon: '◼', size: '1.5rem' }
                  ] as Array<{format: VideoFormat, icon: string, size: string}>).map(({ format, icon, size }) => (
                    <div
                      key={format}
                      onClick={(e) => {
                        e.stopPropagation();
                        setSelectedFormat(format);
                      }}
                      style={{
                        width: '54px',
                        height: '54px',
                        borderRadius: '50%',
                        border: selectedFormat === format 
                          ? '3px solid #4ade80' 
                          : '2px solid rgba(255, 255, 255, 0.3)',
                        background: selectedFormat === format 
                          ? 'linear-gradient(135deg, #10b981 0%, #059669 100%)' 
                          : 'rgba(255, 255, 255, 0.08)',
                        color: '#fff',
                        fontSize: size,
                        fontWeight: selectedFormat === format ? 700 : 400,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        cursor: 'pointer',
                        transition: 'all 0.2s',
                        position: 'relative',
                        boxShadow: selectedFormat === format 
                          ? '0 4px 12px rgba(16, 185, 129, 0.4)' 
                          : 'none',
                        transform: selectedFormat === format ? 'scale(1.05)' : 'scale(1)',
                      }}
                      onMouseEnter={(e) => {
                        if (selectedFormat !== format) {
                          e.currentTarget.style.background = 'rgba(255, 255, 255, 0.15)';
                          e.currentTarget.style.transform = 'scale(1.08)';
                        }
                      }}
                      onMouseLeave={(e) => {
                        if (selectedFormat !== format) {
                          e.currentTarget.style.background = 'rgba(255, 255, 255, 0.08)';
                          e.currentTarget.style.transform = 'scale(1)';
                        }
                      }}
                    >
                      <span style={{ 
                        display: 'block',
                        lineHeight: 1,
                        textAlign: 'center',
                      }}>
                        {icon}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </button>
          </div>

          {/* Cancel Button */}
          <button
            onClick={onClose}
            style={{
              marginTop: '20px',
              background: 'transparent',
              border: 'none',
              color: 'rgba(255, 255, 255, 0.7)',
              fontSize: '0.9rem',
              cursor: 'pointer',
              width: '100%',
              padding: '12px',
              transition: 'color 0.2s',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.color = '#fff';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.color = 'rgba(255, 255, 255, 0.7)';
            }}
          >
            Cancel
          </button>
        </div>
      </div>
    </>
  );
}
