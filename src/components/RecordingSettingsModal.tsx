// Recording Settings Modal - Configure video recording options
import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { RECORDING_QUALITIES, RecordingOptions } from '../services/RecordingService';

export interface RecordingSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onStartRecording: (options: RecordingOptions) => void;
  estimatedDuration?: number; // seconds
}

export const RecordingSettingsModal: React.FC<RecordingSettingsModalProps> = ({
  isOpen,
  onClose,
  onStartRecording,
  estimatedDuration = 30
}) => {
  const [selectedQuality, setSelectedQuality] = useState<keyof typeof RECORDING_QUALITIES>('medium');
  const [customFilename, setCustomFilename] = useState('');

  // Reset form when modal opens
  useEffect(() => {
    if (isOpen) {
      setSelectedQuality('medium');
      setCustomFilename('');
    }
  }, [isOpen]);

  // Calculate estimated file size
  const getEstimatedSize = (quality: keyof typeof RECORDING_QUALITIES): string => {
    const qualityConfig = RECORDING_QUALITIES[quality];
    const estimatedBytes = (qualityConfig.bitrate * estimatedDuration) / 8;
    const estimatedMB = estimatedBytes / 1024 / 1024;
    return `~${estimatedMB.toFixed(1)} MB`;
  };

  const handleStartRecording = () => {
    const options: RecordingOptions = {
      quality: selectedQuality,
      filename: customFilename.trim() || undefined
    };
    onStartRecording(options);
  };

  if (!isOpen) return null;

  const modalContent = (
    <div style={{
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      backgroundColor: 'rgba(0, 0, 0, 0.5)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 5000,
      padding: '1rem'
    }}>
      <div style={{
        backgroundColor: '#fff',
        borderRadius: '8px',
        padding: '1.5rem',
        maxWidth: '500px',
        width: '100%',
        boxShadow: '0 4px 20px rgba(0, 0, 0, 0.15)'
      }}>
        {/* Header */}
        <div style={{ 
          display: 'flex', 
          alignItems: 'center', 
          justifyContent: 'space-between',
          marginBottom: '1.5rem'
        }}>
          <h3 style={{ 
            margin: 0, 
            fontSize: '1.25rem', 
            fontWeight: '600',
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem'
          }}>
            🎬 Recording Settings
          </h3>
          <button
            onClick={onClose}
            style={{
              background: 'none',
              border: 'none',
              fontSize: '1.5rem',
              cursor: 'pointer',
              padding: '0.25rem',
              color: '#666'
            }}
            title="Close"
          >
            ✕
          </button>
        </div>

        {/* Quality Selection */}
        <div style={{ marginBottom: '1.5rem' }}>
          <label style={{ 
            display: 'block', 
            fontWeight: '500', 
            marginBottom: '0.75rem',
            fontSize: '0.9rem'
          }}>
            Recording Quality
          </label>
          
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            {Object.entries(RECORDING_QUALITIES).map(([key, quality]) => (
              <label
                key={key}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  padding: '0.75rem',
                  border: `2px solid ${selectedQuality === key ? '#007bff' : '#e9ecef'}`,
                  borderRadius: '6px',
                  cursor: 'pointer',
                  backgroundColor: selectedQuality === key ? '#f8f9ff' : '#fff',
                  transition: 'all 0.2s ease'
                }}
              >
                <input
                  type="radio"
                  name="quality"
                  value={key}
                  checked={selectedQuality === key}
                  onChange={(e) => setSelectedQuality(e.target.value as keyof typeof RECORDING_QUALITIES)}
                  style={{ marginRight: '0.75rem' }}
                />
                <div style={{ flex: 1 }}>
                  <div style={{ 
                    fontWeight: '500', 
                    fontSize: '0.9rem',
                    marginBottom: '0.25rem'
                  }}>
                    {quality.name} - {quality.description}
                  </div>
                  <div style={{ 
                    fontSize: '0.75rem', 
                    color: '#666',
                    display: 'flex',
                    gap: '1rem'
                  }}>
                    <span>{quality.resolution.width}×{quality.resolution.height}</span>
                    <span>{quality.fps}fps</span>
                    <span>{getEstimatedSize(key)} for {estimatedDuration}s</span>
                  </div>
                </div>
              </label>
            ))}
          </div>
        </div>

        {/* Custom Filename */}
        <div style={{ marginBottom: '1.5rem' }}>
          <label style={{ 
            display: 'block', 
            fontWeight: '500', 
            marginBottom: '0.5rem',
            fontSize: '0.9rem'
          }}>
            Filename (optional)
          </label>
          <input
            type="text"
            value={customFilename}
            onChange={(e) => setCustomFilename(e.target.value)}
            placeholder="turntable_animation_2024-10-02"
            style={{
              width: '100%',
              padding: '0.5rem',
              border: '1px solid #ccc',
              borderRadius: '4px',
              fontSize: '0.875rem',
              boxSizing: 'border-box'
            }}
          />
          <div style={{ 
            fontSize: '0.75rem', 
            color: '#666', 
            marginTop: '0.25rem' 
          }}>
            Leave empty for automatic naming. Extension (.mp4) will be added automatically.
          </div>
        </div>

        {/* Info Box */}
        <div style={{
          backgroundColor: '#f8f9fa',
          border: '1px solid #e9ecef',
          borderRadius: '6px',
          padding: '0.75rem',
          marginBottom: '1.5rem',
          fontSize: '0.8rem',
          color: '#495057'
        }}>
          <div style={{ fontWeight: '500', marginBottom: '0.25rem' }}>
            📹 Recording will capture:
          </div>
          <ul style={{ margin: 0, paddingLeft: '1.2rem' }}>
            <li>Current canvas view and aspect ratio</li>
            <li>Full Turn Table animation cycle</li>
            <li>MP4 format compatible with Google Photos and all devices</li>
          </ul>
        </div>

        {/* Action Buttons */}
        <div style={{ 
          display: 'flex', 
          gap: '0.75rem', 
          justifyContent: 'flex-end' 
        }}>
          <button
            onClick={onClose}
            style={{
              padding: '0.75rem 1.5rem',
              border: '1px solid #ccc',
              borderRadius: '6px',
              backgroundColor: '#fff',
              color: '#333',
              cursor: 'pointer',
              fontSize: '0.875rem',
              fontWeight: '500'
            }}
          >
            Cancel
          </button>
          <button
            onClick={handleStartRecording}
            style={{
              padding: '0.75rem 1.5rem',
              border: 'none',
              borderRadius: '6px',
              backgroundColor: '#dc3545',
              color: '#fff',
              cursor: 'pointer',
              fontSize: '0.875rem',
              fontWeight: '500',
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem'
            }}
          >
            ✅ Ready to Record
          </button>
        </div>
      </div>
    </div>
  );

  return createPortal(modalContent, document.body);
};
