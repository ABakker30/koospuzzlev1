import { useState } from 'react';

interface CreditsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (credits: CreditsData) => void;
  onDownload?: (credits: CreditsData) => void; // Trigger recording + download
  puzzleName?: string;
  effectType?: string;
  recordedBlob?: Blob;
  isRecording?: boolean; // Show recording progress
}

export interface CreditsData {
  title: string;
  description: string;
  challengeText: string;
  showPuzzleName: boolean;
  showEffectType: boolean;
}

export function CreditsModal({ 
  isOpen, 
  onClose, 
  onSave,
  onDownload,
  puzzleName = 'Puzzle',
  effectType = 'effect',
  recordedBlob,
  isRecording = false
}: CreditsModalProps) {
  const [title, setTitle] = useState(getSuggestedTitle());
  const [description, setDescription] = useState('');
  const [challengeText, setChallengeText] = useState('Can you solve this puzzle? Try to beat my solution!');
  const [showPuzzleName, setShowPuzzleName] = useState(true);
  const [showEffectType, setShowEffectType] = useState(true);

  function getSuggestedTitle(): string {
    const effectName = effectType.charAt(0).toUpperCase() + effectType.slice(1);
    return `${puzzleName} - ${effectName}`;
  }

  const handleSave = () => {
    onSave({
      title,
      description,
      challengeText,
      showPuzzleName,
      showEffectType
    });
    onClose();
  };

  const handleShare = async () => {
    // Generate shareable URL (we'll use current page URL as base for now)
    const shareUrl = window.location.href;
    const shareData = {
      title: title || 'Check out my puzzle movie!',
      text: description || 'I created an awesome puzzle movie. Can you solve it?',
      url: shareUrl
    };

    try {
      // Try native share API (works on mobile and some desktop browsers)
      if (navigator.share) {
        await navigator.share(shareData);
        console.log('✅ Shared successfully via native share');
      } else {
        // Fallback: Copy to clipboard
        await navigator.clipboard.writeText(shareUrl);
        alert('🔗 Link copied to clipboard!\n\nShare it with your friends!');
        console.log('✅ Link copied to clipboard');
      }
    } catch (error) {
      // User cancelled or error occurred
      if ((error as Error).name !== 'AbortError') {
        console.error('❌ Error sharing:', error);
        alert('Failed to share. Please try again.');
      }
    }
  };

  const handleDownload = () => {
    // If we have a blob, download it directly
    if (recordedBlob) {
      const url = URL.createObjectURL(recordedBlob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${title.replace(/[^a-z0-9]/gi, '_').toLowerCase()}_${Date.now()}.webm`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } 
    // Otherwise, trigger recording first
    else if (onDownload) {
      onDownload({
        title,
        description,
        challengeText,
        showPuzzleName,
        showEffectType
      });
    }
  };

  if (!isOpen) {
    console.log('🎬 CreditsModal: Not rendering (isOpen=false)');
    return null;
  }

  console.log('🎬 CreditsModal: Rendering modal', { puzzleName, effectType, hasBlob: !!recordedBlob });

  return (
    <>
      {/* Custom Scrollbar Styles */}
      <style>{`
        .credits-modal-scrollable::-webkit-scrollbar {
          width: 12px;
        }
        .credits-modal-scrollable::-webkit-scrollbar-track {
          background: rgba(168, 85, 247, 0.1);
          border-radius: 10px;
          margin: 20px 0;
        }
        .credits-modal-scrollable::-webkit-scrollbar-thumb {
          background: linear-gradient(180deg, #a855f7, #7c3aed);
          border-radius: 10px;
          border: 2px solid rgba(232, 221, 255, 0.5);
        }
        .credits-modal-scrollable::-webkit-scrollbar-thumb:hover {
          background: linear-gradient(180deg, #7c3aed, #6366f1);
        }
        .credits-modal-scrollable::-webkit-scrollbar-thumb:active {
          background: #6366f1;
        }
        .credits-modal-scrollable {
          scrollbar-width: thin;
          scrollbar-color: #a855f7 rgba(168, 85, 247, 0.1);
        }
      `}</style>
      
      <div className="modal-overlay" onClick={onClose} style={{ overflowY: 'auto', background: 'transparent', backdropFilter: 'none' }}>
        <div className="modal-content credits-modal-scrollable" onClick={(e) => e.stopPropagation()} style={{ 
          maxWidth: '560px',
          width: '90%',
          background: 'linear-gradient(135deg, #f0f9ff 0%, #e0e7ff 50%, #fce7f3 100%)',
          color: '#1f2937',
          border: '3px solid rgba(168,85,247,0.6)',
          boxShadow: '0 8px 32px rgba(0, 0, 0, 0.3)',
          borderRadius: '20px',
          padding: '0',
          maxHeight: '90vh',
          overflowY: 'auto',
          overflowX: 'hidden'
        }}>
        <div className="modal-header" style={{ 
          background: 'linear-gradient(135deg, #a855f7, #7c3aed, #6366f1)',
          padding: '2rem',
          borderTopLeftRadius: '17px',
          borderTopRightRadius: '17px',
          borderBottom: '3px solid rgba(255,255,255,0.2)',
          boxShadow: '0 4px 20px rgba(168,85,247,0.4)'
        }}>
          <h2 style={{ 
            color: '#ffffff', 
            margin: 0,
            fontSize: '1.5rem',
            fontWeight: 700,
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem'
          }}>🎬 Create Your Movie!</h2>
          <button className="modal-close" onClick={onClose} style={{
            background: 'rgba(255,255,255,0.2)',
            color: '#fff',
            border: 'none',
            fontSize: '1.5rem',
            width: '32px',
            height: '32px',
            borderRadius: '50%',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            transition: 'all 0.2s'
          }}>×</button>
        </div>

        <div className="modal-body" style={{ padding: '1.5rem' }}>
          {/* Title Input */}
          <div style={{ marginBottom: '1rem' }}>
            <label style={{ 
              display: 'flex', 
              alignItems: 'center',
              gap: '0.5rem',
              marginBottom: '0.5rem', 
              fontWeight: 600, 
              color: '#374151',
              fontSize: '0.95rem'
            }}>
              <span>🎯</span>
              <span>Movie Title</span>
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Enter movie title..."
              style={{
                width: '100%',
                padding: '0.75rem',
                borderRadius: '8px',
                border: '2px solid rgba(168,85,247,0.3)',
                background: 'rgba(255,255,255,0.9)',
                color: '#1f2937',
                fontSize: '14px',
                fontWeight: 500
              }}
            />
          </div>

          {/* Description */}
          <div style={{ marginBottom: '1rem' }}>
            <label style={{ 
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
              marginBottom: '0.5rem', 
              fontWeight: 600, 
              color: '#374151',
              fontSize: '0.95rem'
            }}>
              <span>✨</span>
              <span>Description (optional)</span>
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Add a description..."
              rows={3}
              style={{
                width: '100%',
                padding: '0.75rem',
                borderRadius: '8px',
                border: '2px solid rgba(168,85,247,0.3)',
                background: 'rgba(255,255,255,0.9)',
                color: '#1f2937',
                fontSize: '14px',
                resize: 'vertical',
                fontWeight: 500
              }}
            />
          </div>

          {/* Challenge Text */}
          <div style={{ marginBottom: '1rem' }}>
            <label style={{ 
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
              marginBottom: '0.5rem', 
              fontWeight: 600, 
              color: '#374151',
              fontSize: '0.95rem'
            }}>
              <span>💪</span>
              <span>Challenge Text</span>
            </label>
            <textarea
              value={challengeText}
              onChange={(e) => setChallengeText(e.target.value)}
              placeholder="Challenge viewers to solve the puzzle..."
              rows={2}
              style={{
                width: '100%',
                padding: '0.75rem',
                borderRadius: '8px',
                border: '2px solid rgba(168,85,247,0.3)',
                background: 'rgba(255,255,255,0.9)',
                color: '#1f2937',
                fontSize: '14px',
                resize: 'vertical',
                fontWeight: 500
              }}
            />
            <div style={{ fontSize: '12px', color: '#6b7280', marginTop: '0.25rem', fontStyle: 'italic' }}>
              This text will appear at the end of your movie
            </div>
          </div>

          {/* Options */}
          <div style={{ marginBottom: '1rem' }}>
            <label style={{ display: 'flex', alignItems: 'center', marginBottom: '0.5rem', cursor: 'pointer', color: '#374151', fontWeight: 500 }}>
              <input
                type="checkbox"
                checked={showPuzzleName}
                onChange={(e) => setShowPuzzleName(e.target.checked)}
                style={{ marginRight: '0.5rem', cursor: 'pointer' }}
              />
              Show puzzle name in credits
            </label>
            <label style={{ display: 'flex', alignItems: 'center', cursor: 'pointer', color: '#374151', fontWeight: 500 }}>
              <input
                type="checkbox"
                checked={showEffectType}
                onChange={(e) => setShowEffectType(e.target.checked)}
                style={{ marginRight: '0.5rem', cursor: 'pointer' }}
              />
              Show effect type in credits
            </label>
          </div>

          {/* File info */}
          {recordedBlob && (
            <div style={{
              padding: '0.75rem',
              background: 'rgba(255,255,255,0.05)',
              borderRadius: '4px',
              marginBottom: '1rem',
              fontSize: '13px',
              color: 'rgba(255,255,255,0.7)'
            }}>
              <div>📹 Recording: {(recordedBlob.size / 1024 / 1024).toFixed(2)} MB</div>
              <div>🎞️ Format: WebM</div>
            </div>
          )}

          {/* Preview */}
          <div style={{
            padding: '1.5rem',
            background: 'linear-gradient(135deg, rgba(168,85,247,0.15), rgba(236,72,153,0.15))',
            border: '2px solid rgba(168,85,247,0.4)',
            borderRadius: '12px',
            marginBottom: '1rem',
            boxShadow: '0 4px 16px rgba(168,85,247,0.2)',
            backdropFilter: 'blur(10px)'
          }}>
            <div style={{ 
              fontSize: '11px', 
              color: '#7c3aed', 
              marginBottom: '0.75rem', 
              fontWeight: 700,
              textTransform: 'uppercase',
              letterSpacing: '1px',
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem'
            }}>
              <span>🎞️</span>
              <span>Preview</span>
            </div>
            <div style={{ fontSize: '18px', fontWeight: 700, marginBottom: '0.25rem', color: '#1f2937' }}>
              {title || 'Untitled Movie'}
            </div>
            {description && (
              <div style={{ fontSize: '14px', color: '#4b5563', marginBottom: '0.5rem' }}>
                {description}
              </div>
            )}
            <div style={{ fontSize: '12px', color: '#6b7280', fontWeight: 500 }}>
              {showPuzzleName && <span>Puzzle: {puzzleName}</span>}
              {showPuzzleName && showEffectType && <span> • </span>}
              {showEffectType && <span>Effect: {effectType}</span>}
            </div>
          </div>
        </div>

        <div className="modal-footer" style={{ 
          display: 'flex', 
          flexDirection: 'column',
          gap: '0.75rem',
          padding: '1.5rem',
          background: 'linear-gradient(135deg, rgba(168,85,247,0.15) 0%, rgba(168,85,247,0.08) 100%)',
          borderBottomLeftRadius: '17px',
          borderBottomRightRadius: '17px'
        }}>
          {/* Primary Actions Row */}
          <div style={{ 
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            gap: '0.75rem'
          }}>
            <button 
              className="pill" 
              onClick={handleShare}
              style={{ 
                background: 'linear-gradient(135deg, #10b981, #059669)',
                color: '#fff',
                fontWeight: 600,
                padding: '0.875rem 1.25rem',
                fontSize: '0.95rem',
                boxShadow: '0 4px 16px rgba(16,185,129,0.35)',
                border: 'none'
              }}
            >
              <span style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', justifyContent: 'center', whiteSpace: 'nowrap' }}><span style={{ fontSize: '1.1em' }}>🔗</span><span>Share Link</span></span>
            </button>
            <button 
              className="pill pill--primary" 
              onClick={handleSave}
              disabled={isRecording}
              style={{ 
                background: 'linear-gradient(135deg, #a855f7, #7c3aed)',
                fontWeight: 600,
                padding: '0.875rem 1.25rem',
                fontSize: '0.95rem',
                boxShadow: '0 4px 16px rgba(168,85,247,0.4)'
              }}
            >
              <span style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', justifyContent: 'center', whiteSpace: 'nowrap' }}><span style={{ fontSize: '1.1em' }}>🎉</span><span>Save to Gallery</span></span>
            </button>
          </div>
          
          {/* Secondary Actions Row */}
          <div style={{ 
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            gap: '0.75rem'
          }}>
            <button 
              className="pill" 
              onClick={handleDownload}
              disabled={isRecording}
              style={{ 
                background: isRecording ? '#6c757d' : 'linear-gradient(135deg, #3b82f6, #2563eb)',
                color: '#fff',
                fontWeight: 600,
                padding: '0.875rem 1.25rem',
                fontSize: '0.9rem',
                boxShadow: isRecording ? 'none' : '0 4px 16px rgba(59,130,246,0.35)'
              }}
            >
              {isRecording ? <span style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', justifyContent: 'center', whiteSpace: 'nowrap' }}><span style={{ fontSize: '1.1em' }}>⏳</span><span>Recording...</span></span> : <span style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', justifyContent: 'center', whiteSpace: 'nowrap' }}><span style={{ fontSize: '1.1em' }}>📥</span><span>Download Video</span></span>}
            </button>
            <button 
              className="pill" 
              onClick={onClose}
              style={{
                padding: '0.875rem 1.25rem',
                fontSize: '0.9rem',
                fontWeight: 600,
                background: 'rgba(107,114,128,0.12)',
                color: '#4b5563',
                border: '2px solid rgba(107,114,128,0.25)',
                boxShadow: 'none'
              }}
            >
              <span style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', justifyContent: 'center', whiteSpace: 'nowrap' }}><span style={{ fontSize: '1.1em' }}>✖️</span><span>Cancel</span></span>
            </button>
          </div>
        </div>
      </div>
    </div>
    </>
  );
};
