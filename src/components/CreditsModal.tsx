import { useState } from 'react';

interface CreditsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (credits: CreditsData) => void;
  puzzleName?: string;
  effectType?: string;
  recordedBlob?: Blob;
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
  puzzleName = 'Puzzle',
  effectType = 'effect',
  recordedBlob
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

  const handleDownload = () => {
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
  };

  if (!isOpen) {
    console.log('🎬 CreditsModal: Not rendering (isOpen=false)');
    return null;
  }

  console.log('🎬 CreditsModal: Rendering modal', { puzzleName, effectType, hasBlob: !!recordedBlob });

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ 
        maxWidth: '500px',
        background: '#1a1a1a',
        color: '#ffffff'
      }}>
        <div className="modal-header">
          <h2 style={{ color: '#ffffff' }}>🎬 Save Movie</h2>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>

        <div className="modal-body">
          {/* Title */}
          <div style={{ marginBottom: '1rem' }}>
            <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 600, color: '#ffffff' }}>
              Title
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Enter movie title..."
              style={{
                width: '100%',
                padding: '0.5rem',
                borderRadius: '4px',
                border: '1px solid rgba(255,255,255,0.3)',
                background: 'rgba(255,255,255,0.05)',
                color: '#ffffff',
                fontSize: '14px'
              }}
            />
          </div>

          {/* Description */}
          <div style={{ marginBottom: '1rem' }}>
            <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 600, color: '#ffffff' }}>
              Description (optional)
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Add a description..."
              rows={3}
              style={{
                width: '100%',
                padding: '0.5rem',
                borderRadius: '4px',
                border: '1px solid rgba(255,255,255,0.3)',
                background: 'rgba(255,255,255,0.05)',
                color: '#ffffff',
                fontSize: '14px',
                resize: 'vertical'
              }}
            />
          </div>

          {/* Challenge Text */}
          <div style={{ marginBottom: '1rem' }}>
            <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 600, color: '#ffffff' }}>
              Challenge Text 🎯
            </label>
            <textarea
              value={challengeText}
              onChange={(e) => setChallengeText(e.target.value)}
              placeholder="Challenge viewers to solve the puzzle..."
              rows={2}
              style={{
                width: '100%',
                padding: '0.5rem',
                borderRadius: '4px',
                border: '1px solid rgba(255,255,255,0.3)',
                background: 'rgba(255,255,255,0.05)',
                color: '#ffffff',
                fontSize: '14px',
                resize: 'vertical'
              }}
            />
            <div style={{ fontSize: '12px', color: 'rgba(255,255,255,0.6)', marginTop: '0.25rem' }}>
              This text will appear at the end of your movie
            </div>
          </div>

          {/* Options */}
          <div style={{ marginBottom: '1rem' }}>
            <label style={{ display: 'flex', alignItems: 'center', marginBottom: '0.5rem', cursor: 'pointer', color: '#ffffff' }}>
              <input
                type="checkbox"
                checked={showPuzzleName}
                onChange={(e) => setShowPuzzleName(e.target.checked)}
                style={{ marginRight: '0.5rem' }}
              />
              Show puzzle name in credits
            </label>
            <label style={{ display: 'flex', alignItems: 'center', cursor: 'pointer', color: '#ffffff' }}>
              <input
                type="checkbox"
                checked={showEffectType}
                onChange={(e) => setShowEffectType(e.target.checked)}
                style={{ marginRight: '0.5rem' }}
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
            padding: '1rem',
            background: 'rgba(156,39,176,0.2)',
            border: '1px solid rgba(156,39,176,0.5)',
            borderRadius: '4px',
            marginBottom: '1rem'
          }}>
            <div style={{ fontSize: '12px', color: '#ffffff', marginBottom: '0.5rem', fontWeight: 600 }}>
              PREVIEW
            </div>
            <div style={{ fontSize: '18px', fontWeight: 600, marginBottom: '0.25rem', color: '#ffffff' }}>
              {title || 'Untitled Movie'}
            </div>
            {description && (
              <div style={{ fontSize: '14px', color: '#ffffff', marginBottom: '0.5rem' }}>
                {description}
              </div>
            )}
            <div style={{ fontSize: '12px', color: 'rgba(255,255,255,0.8)' }}>
              {showPuzzleName && <span>Puzzle: {puzzleName}</span>}
              {showPuzzleName && showEffectType && <span> • </span>}
              {showEffectType && <span>Effect: {effectType}</span>}
            </div>
          </div>
        </div>

        <div className="modal-footer">
          <button 
            className="pill pill--ghost" 
            onClick={handleDownload}
            disabled={!recordedBlob}
            style={{ marginRight: 'auto' }}
          >
            💾 Download Only
          </button>
          <button className="pill pill--ghost" onClick={onClose}>
            Cancel
          </button>
          <button 
            className="pill pill--primary" 
            onClick={handleSave}
            style={{ background: '#9c27b0' }}
          >
            💾 Save Movie
          </button>
        </div>
      </div>
    </div>
  );
}
