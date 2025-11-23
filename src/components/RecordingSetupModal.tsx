// Recording Setup Modal - Configure aspect ratio and quality before recording
import React, { useState } from 'react';

export interface RecordingSetup {
  aspectRatio: 'landscape' | 'portrait' | 'square';
  quality: 'low' | 'medium' | 'high';
}

interface RecordingSetupModalProps {
  isOpen: boolean;
  onClose: () => void;
  onStart: (setup: RecordingSetup) => void;
}

const ASPECT_RATIOS = {
  landscape: { label: 'Landscape', icon: '🖼️', ratio: '16:9', desc: 'YouTube, Desktop' },
  portrait: { label: 'Portrait', icon: '📱', ratio: '9:16', desc: 'TikTok, Instagram Stories' },
  square: { label: 'Square', icon: '⬜', ratio: '1:1', desc: 'Instagram Feed' }
};

const QUALITIES = {
  low: { label: 'Low', desc: '720p @ 24fps', size: 'Small file' },
  medium: { label: 'Medium', desc: '1080p @ 30fps', size: 'Balanced' },
  high: { label: 'High', desc: '1440p @ 60fps', size: 'Large file (may be jittery)' }
};

export const RecordingSetupModal: React.FC<RecordingSetupModalProps> = ({
  isOpen,
  onClose,
  onStart
}) => {
  const [aspectRatio, setAspectRatio] = useState<'landscape' | 'portrait' | 'square'>('landscape');
  const [quality, setQuality] = useState<'low' | 'medium' | 'high'>('medium');

  if (!isOpen) return null;

  const handleStart = () => {
    onStart({ aspectRatio, quality });
  };

  return (
    <div style={{
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      background: 'rgba(0, 0, 0, 0.85)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 10000,
      padding: '20px'
    }}>
      <div style={{
        background: 'linear-gradient(135deg, #1f2937 0%, #111827 100%)',
        borderRadius: '16px',
        padding: '32px',
        maxWidth: '500px',
        width: '100%',
        boxShadow: '0 20px 60px rgba(0, 0, 0, 0.5)',
        border: '1px solid rgba(255, 255, 255, 0.1)'
      }}>
        {/* Header */}
        <div style={{ marginBottom: '24px' }}>
          <h2 style={{ 
            color: '#fff', 
            fontSize: '24px', 
            fontWeight: 600,
            margin: 0,
            marginBottom: '8px'
          }}>
            🎬 Recording Setup
          </h2>
          <p style={{ 
            color: '#9ca3af', 
            fontSize: '14px',
            margin: 0
          }}>
            Configure your video settings before recording
          </p>
        </div>

        {/* Aspect Ratio Selection */}
        <div style={{ marginBottom: '24px' }}>
          <label style={{ 
            color: '#fff', 
            fontSize: '14px', 
            fontWeight: 500,
            display: 'block',
            marginBottom: '12px'
          }}>
            Aspect Ratio
          </label>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px' }}>
            {(Object.keys(ASPECT_RATIOS) as Array<keyof typeof ASPECT_RATIOS>).map((ratio) => {
              const info = ASPECT_RATIOS[ratio];
              const selected = aspectRatio === ratio;
              return (
                <button
                  key={ratio}
                  onClick={() => setAspectRatio(ratio)}
                  style={{
                    padding: '16px 12px',
                    background: selected ? '#3b82f6' : 'rgba(255, 255, 255, 0.05)',
                    border: selected ? '2px solid #60a5fa' : '2px solid transparent',
                    borderRadius: '8px',
                    color: '#fff',
                    cursor: 'pointer',
                    textAlign: 'center',
                    transition: 'all 0.2s ease'
                  }}
                >
                  <div style={{ fontSize: '24px', marginBottom: '4px' }}>{info.icon}</div>
                  <div style={{ fontSize: '13px', fontWeight: 500 }}>{info.label}</div>
                  <div style={{ fontSize: '11px', color: '#9ca3af', marginTop: '2px' }}>{info.ratio}</div>
                  <div style={{ fontSize: '10px', color: '#6b7280', marginTop: '2px' }}>{info.desc}</div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Quality Selection */}
        <div style={{ marginBottom: '32px' }}>
          <label style={{ 
            color: '#fff', 
            fontSize: '14px', 
            fontWeight: 500,
            display: 'block',
            marginBottom: '12px'
          }}>
            Quality
          </label>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {(Object.keys(QUALITIES) as Array<keyof typeof QUALITIES>).map((qual) => {
              const info = QUALITIES[qual];
              const selected = quality === qual;
              return (
                <button
                  key={qual}
                  onClick={() => setQuality(qual)}
                  style={{
                    padding: '12px 16px',
                    background: selected ? '#3b82f6' : 'rgba(255, 255, 255, 0.05)',
                    border: selected ? '2px solid #60a5fa' : '2px solid transparent',
                    borderRadius: '8px',
                    color: '#fff',
                    cursor: 'pointer',
                    textAlign: 'left',
                    transition: 'all 0.2s ease',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center'
                  }}
                >
                  <div>
                    <div style={{ fontSize: '14px', fontWeight: 500 }}>{info.label}</div>
                    <div style={{ fontSize: '12px', color: '#9ca3af', marginTop: '2px' }}>{info.desc}</div>
                  </div>
                  <div style={{ fontSize: '11px', color: '#6b7280' }}>{info.size}</div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Actions */}
        <div style={{ display: 'flex', gap: '12px' }}>
          <button
            onClick={onClose}
            style={{
              flex: 1,
              padding: '12px 24px',
              background: 'rgba(255, 255, 255, 0.1)',
              border: 'none',
              borderRadius: '8px',
              color: '#fff',
              fontSize: '14px',
              fontWeight: 500,
              cursor: 'pointer',
              transition: 'background 0.2s ease'
            }}
            onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(255, 255, 255, 0.15)'}
            onMouseLeave={(e) => e.currentTarget.style.background = 'rgba(255, 255, 255, 0.1)'}
          >
            Cancel
          </button>
          <button
            onClick={handleStart}
            style={{
              flex: 1,
              padding: '12px 24px',
              background: '#ef4444',
              border: 'none',
              borderRadius: '8px',
              color: '#fff',
              fontSize: '14px',
              fontWeight: 600,
              cursor: 'pointer',
              transition: 'background 0.2s ease',
              boxShadow: '0 4px 12px rgba(239, 68, 68, 0.3)'
            }}
            onMouseEnter={(e) => e.currentTarget.style.background = '#dc2626'}
            onMouseLeave={(e) => e.currentTarget.style.background = '#ef4444'}
          >
            ⬤ Start Recording
          </button>
        </div>
      </div>
    </div>
  );
};
