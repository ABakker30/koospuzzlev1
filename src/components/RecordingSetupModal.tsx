// Recording Setup Modal - Configure aspect ratio and quality before recording
import React, { useState } from 'react';
import { useDraggable } from '../hooks/useDraggable';

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
  const draggable = useDraggable();

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
      background: 'transparent',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 10000,
      padding: '20px',
      pointerEvents: 'none'
    }} onClick={onClose}>
      <div
        ref={draggable.ref}
        style={{
          background: 'linear-gradient(135deg, #ddd6fe 0%, #e9d5ff 50%, #fce7f3 100%)',
          borderRadius: '20px',
          padding: '0',
          maxWidth: '420px',
          width: '90%',
          boxShadow: '0 25px 80px rgba(139,92,246,0.8), 0 0 60px rgba(139,92,246,0.4)',
          border: '3px solid rgba(139,92,246,0.6)',
          pointerEvents: 'auto',
          ...draggable.style
        }} onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div style={{ 
          background: 'linear-gradient(135deg, #8b5cf6, #7c3aed, #6d28d9)',
          padding: '1.25rem 1.5rem',
          borderRadius: '17px 17px 0 0',
          marginBottom: '20px',
          borderBottom: '3px solid rgba(255,255,255,0.3)',
          boxShadow: '0 4px 20px rgba(139,92,246,0.4)',
          position: 'relative',
          ...draggable.headerStyle
        }}>
          <button
            onClick={onClose}
            style={{
              position: 'absolute',
              top: '12px',
              right: '12px',
              background: 'rgba(255,255,255,0.2)',
              border: 'none',
              borderRadius: '50%',
              width: '28px',
              height: '28px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
              fontSize: '18px',
              color: '#fff',
              fontWeight: 700,
              transition: 'all 0.2s'
            }}
            title="Close"
          >
            ×
          </button>
          <h2 style={{ 
            color: '#fff', 
            fontSize: '20px', 
            fontWeight: 700,
            margin: 0,
            textShadow: '0 2px 4px rgba(0,0,0,0.2)',
            display: 'flex',
            alignItems: 'center',
            gap: '8px'
          }}>
            <span style={{ fontSize: '24px' }}>🎬</span>
            <span>Recording Setup</span>
          </h2>
        </div>

        {/* Format Selection */}
        <div style={{ marginBottom: '20px', padding: '0 1.5rem' }}>
          <label style={{ 
            color: '#1e293b', 
            fontSize: '13px', 
            fontWeight: 600,
            display: 'block',
            marginBottom: '10px'
          }}>
            Format
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
                    padding: '14px 10px',
                    background: selected ? 'linear-gradient(135deg, #8b5cf6, #7c3aed)' : 'rgba(255, 255, 255, 0.7)',
                    border: selected ? '2px solid #a78bfa' : '2px solid rgba(139,92,246,0.3)',
                    borderRadius: '10px',
                    color: selected ? '#fff' : '#1e293b',
                    cursor: 'pointer',
                    textAlign: 'center',
                    transition: 'all 0.2s ease',
                    boxShadow: selected ? '0 4px 12px rgba(139,92,246,0.4)' : '0 2px 8px rgba(0,0,0,0.05)'
                  }}
                >
                  <div style={{ fontSize: '24px', marginBottom: '6px' }}>{info.icon}</div>
                  <div style={{ fontSize: '14px', fontWeight: 600 }}>{info.label}</div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Quality Selection */}
        <div style={{ marginBottom: '24px', padding: '0 1.5rem' }}>
          <label style={{ 
            color: '#1e293b', 
            fontSize: '13px', 
            fontWeight: 600,
            display: 'block',
            marginBottom: '10px'
          }}>
            Quality
          </label>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px' }}>
            {(Object.keys(QUALITIES) as Array<keyof typeof QUALITIES>).map((qual) => {
              const info = QUALITIES[qual];
              const selected = quality === qual;
              return (
                <button
                  key={qual}
                  onClick={() => setQuality(qual)}
                  style={{
                    padding: '12px 14px',
                    background: selected ? 'linear-gradient(135deg, #8b5cf6, #7c3aed)' : 'rgba(255, 255, 255, 0.7)',
                    border: selected ? '2px solid #a78bfa' : '2px solid rgba(139,92,246,0.3)',
                    borderRadius: '10px',
                    color: selected ? '#fff' : '#1e293b',
                    cursor: 'pointer',
                    textAlign: 'center',
                    transition: 'all 0.2s ease',
                    boxShadow: selected ? '0 4px 12px rgba(139,92,246,0.4)' : '0 2px 8px rgba(0,0,0,0.05)'
                  }}
                >
                  <div style={{ fontSize: '15px', fontWeight: 600 }}>{info.label}</div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Actions */}
        <div style={{ display: 'flex', gap: '10px', padding: '0 1.5rem 1.5rem' }}>
          <button
            onClick={onClose}
            style={{
              flex: 1,
              padding: '12px 20px',
              background: 'rgba(255, 255, 255, 0.7)',
              border: '2px solid rgba(139,92,246,0.4)',
              borderRadius: '10px',
              color: '#1e293b',
              fontSize: '14px',
              fontWeight: 600,
              cursor: 'pointer',
              transition: 'all 0.2s ease',
              boxShadow: '0 2px 8px rgba(0,0,0,0.1)'
            }}
            onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(255, 255, 255, 0.9)'}
            onMouseLeave={(e) => e.currentTarget.style.background = 'rgba(255, 255, 255, 0.7)'}
          >
            Cancel
          </button>
          <button
            onClick={handleStart}
            style={{
              flex: 1,
              padding: '14px 20px',
              background: 'linear-gradient(135deg, #ef4444, #dc2626)',
              border: 'none',
              borderRadius: '12px',
              color: '#fff',
              fontSize: '16px',
              fontWeight: 700,
              cursor: 'pointer',
              transition: 'all 0.2s ease',
              boxShadow: '0 6px 20px rgba(239, 68, 68, 0.4)',
              textShadow: '0 2px 4px rgba(0,0,0,0.2)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '8px'
            }}
            onMouseEnter={(e) => e.currentTarget.style.transform = 'translateY(-2px)'}
            onMouseLeave={(e) => e.currentTarget.style.transform = 'translateY(0)'}
          >
            <span>⬤</span>
            <span>Start Recording</span>
          </button>
        </div>
      </div>
    </div>
  );
};
