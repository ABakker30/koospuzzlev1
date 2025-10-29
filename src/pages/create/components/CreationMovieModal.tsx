// Creation Movie Modal - Record playback of puzzle creation
import { useState } from 'react';
import { createPortal } from 'react-dom';
import { RECORDING_QUALITIES } from '../../../services/RecordingService';
import type { Action } from '../hooks/useActionTracker';
import type { IJK } from '../../../types/shape';

interface CreationMovieModalProps {
  isOpen: boolean;
  onClose: () => void;
  onRecordingReady?: (duration: number) => void;
  actions: Action[];
  cells: IJK[];
  creationTimeMs: number;
}

type AspectRatio = 'square' | 'landscape' | 'portrait';

export const CreationMovieModal: React.FC<CreationMovieModalProps> = ({
  isOpen,
  onClose,
  onRecordingReady,
  actions,
  cells,
  creationTimeMs
}) => {
  const [selectedQuality, setSelectedQuality] = useState<keyof typeof RECORDING_QUALITIES>('medium');
  const [aspectRatio, setAspectRatio] = useState<AspectRatio>('landscape');
  const [duration, setDuration] = useState<number>(5); // Duration in seconds (default: 5s)
  const [customFilename, setCustomFilename] = useState('');

  // Calculate estimated file size
  const getEstimatedSize = (quality: keyof typeof RECORDING_QUALITIES): string => {
    const qualityConfig = RECORDING_QUALITIES[quality];
    const estimatedBytes = (qualityConfig.bitrate * duration) / 8;
    const estimatedMB = estimatedBytes / 1024 / 1024;
    return `~${estimatedMB.toFixed(1)} MB`;
  };

  const handlePrepareRecording = () => {
    console.log(`✓ Recording prepared: ${actions.length} actions over ${duration}s`);
    console.log(`Settings: ${selectedQuality}, ${aspectRatio}`);
    
    // Close modal and notify parent that recording is ready
    onClose();
    
    if (onRecordingReady) {
      onRecordingReady(duration);
    }
  };

  const handleClose = () => {
    onClose();
  };

  if (!isOpen) return null;

  const modalContent = (
    <div style={{
      position: 'fixed',
      inset: 0,
      backgroundColor: 'rgba(0, 0, 0, 0.7)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 5000
    }}>
      <div style={{
        backgroundColor: '#fff',
        borderRadius: '12px',
        padding: '2rem',
        maxWidth: '600px',
        width: '90%',
        maxHeight: '90vh',
        overflowY: 'auto',
        boxShadow: '0 8px 32px rgba(0, 0, 0, 0.3)'
      }}>
        <h2 style={{ margin: '0 0 1rem 0', fontSize: '1.5rem', fontWeight: 600 }}>
          🎬 Create Movie
        </h2>
            
            <div style={{ 
              padding: '1rem', 
              background: '#f0f9ff', 
              borderRadius: '8px',
              marginBottom: '1.5rem',
              borderLeft: '4px solid #2196F3'
            }}>
              <div style={{ fontSize: '0.875rem', marginBottom: '0.5rem' }}>
                <strong>Your Creation:</strong>
              </div>
              <div style={{ fontSize: '0.8rem', color: '#666' }}>
                • {cells.length} spheres<br/>
                • {actions.length} actions tracked<br/>
                • {(creationTimeMs / 1000).toFixed(1)}s creation time
              </div>
            </div>

            {/* Aspect Ratio */}
            <div style={{ marginBottom: '1.5rem' }}>
              <label style={{ display: 'block', fontWeight: 500, marginBottom: '0.75rem' }}>
                Aspect Ratio
              </label>
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <button
                  onClick={() => setAspectRatio('landscape')}
                  style={{
                    flex: 1,
                    padding: '0.75rem',
                    border: `2px solid ${aspectRatio === 'landscape' ? '#007bff' : '#e9ecef'}`,
                    borderRadius: '6px',
                    backgroundColor: aspectRatio === 'landscape' ? '#f8f9ff' : '#fff',
                    cursor: 'pointer',
                    fontWeight: aspectRatio === 'landscape' ? 600 : 400,
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    gap: '0.25rem'
                  }}
                >
                  <div style={{ fontSize: '1.2rem' }}>🖼️</div>
                  <div>Landscape</div>
                  <div style={{ fontSize: '0.75rem', color: '#666' }}>16:9</div>
                </button>
                <button
                  onClick={() => setAspectRatio('square')}
                  style={{
                    flex: 1,
                    padding: '0.75rem',
                    border: `2px solid ${aspectRatio === 'square' ? '#007bff' : '#e9ecef'}`,
                    borderRadius: '6px',
                    backgroundColor: aspectRatio === 'square' ? '#f8f9ff' : '#fff',
                    cursor: 'pointer',
                    fontWeight: aspectRatio === 'square' ? 600 : 400,
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    gap: '0.25rem'
                  }}
                >
                  <div style={{ fontSize: '1.2rem' }}>⬜</div>
                  <div>Square</div>
                  <div style={{ fontSize: '0.75rem', color: '#666' }}>1:1</div>
                </button>
                <button
                  onClick={() => setAspectRatio('portrait')}
                  style={{
                    flex: 1,
                    padding: '0.75rem',
                    border: `2px solid ${aspectRatio === 'portrait' ? '#007bff' : '#e9ecef'}`,
                    borderRadius: '6px',
                    backgroundColor: aspectRatio === 'portrait' ? '#f8f9ff' : '#fff',
                    cursor: 'pointer',
                    fontWeight: aspectRatio === 'portrait' ? 600 : 400,
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    gap: '0.25rem'
                  }}
                >
                  <div style={{ fontSize: '1.2rem' }}>📱</div>
                  <div>Portrait</div>
                  <div style={{ fontSize: '0.75rem', color: '#666' }}>9:16</div>
                </button>
              </div>
            </div>

            {/* Duration */}
            <div style={{ marginBottom: '1.5rem' }}>
              <label style={{ display: 'block', fontWeight: 500, marginBottom: '0.75rem' }}>
                Movie Duration (seconds)
              </label>
              <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                <input
                  type="range"
                  min="5"
                  max="30"
                  step="1"
                  value={duration}
                  onChange={(e) => setDuration(Number(e.target.value))}
                  style={{ flex: 1 }}
                />
                <div style={{
                  minWidth: '60px',
                  padding: '0.5rem 1rem',
                  border: '2px solid #007bff',
                  borderRadius: '6px',
                  backgroundColor: '#f8f9ff',
                  textAlign: 'center',
                  fontWeight: 600,
                  color: '#007bff'
                }}>
                  {duration}s
                </div>
              </div>
              <div style={{ fontSize: '0.75rem', color: '#666', marginTop: '0.5rem' }}>
                Actions will be spread evenly over {duration} seconds
              </div>
            </div>

            {/* Quality Selection */}
            <div style={{ marginBottom: '1.5rem' }}>
              <label style={{ display: 'block', fontWeight: 500, marginBottom: '0.75rem' }}>
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
                      backgroundColor: selectedQuality === key ? '#f8f9ff' : '#fff'
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
                      <div style={{ fontWeight: 500, fontSize: '0.9rem', marginBottom: '0.25rem' }}>
                        {quality.name} - {quality.description}
                      </div>
                      <div style={{ fontSize: '0.75rem', color: '#666', display: 'flex', gap: '1rem' }}>
                        <span>{quality.resolution.width}×{quality.resolution.height}</span>
                        <span>{quality.fps}fps</span>
                        <span>{getEstimatedSize(key)}</span>
                      </div>
                    </div>
                  </label>
                ))}
              </div>
            </div>

            {/* Filename */}
            <div style={{ marginBottom: '1.5rem' }}>
              <label style={{ display: 'block', fontWeight: 500, marginBottom: '0.5rem' }}>
                Filename (optional)
              </label>
              <input
                type="text"
                value={customFilename}
                onChange={(e) => setCustomFilename(e.target.value)}
                placeholder="my_puzzle_creation"
                style={{
                  width: '100%',
                  padding: '0.5rem',
                  border: '1px solid #ccc',
                  borderRadius: '4px',
                  fontSize: '0.875rem',
                  boxSizing: 'border-box'
                }}
              />
            </div>

            {/* Actions */}
            <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end' }}>
              <button
                onClick={handleClose}
                style={{
                  padding: '0.75rem 1.5rem',
                  border: '1px solid #ccc',
                  borderRadius: '6px',
                  backgroundColor: '#fff',
                  cursor: 'pointer'
                }}
              >
                Cancel
              </button>
              <button
                onClick={handlePrepareRecording}
                style={{
                  padding: '0.75rem 1.5rem',
                  border: 'none',
                  borderRadius: '6px',
                  backgroundColor: '#28a745',
                  color: '#fff',
                  cursor: 'pointer',
                  fontWeight: 500
                }}
              >
                ✓ Ready to Record
              </button>
            </div>

        <style>{`
          @keyframes pulse {
            0%, 100% { opacity: 1; transform: scale(1); }
            50% { opacity: 0.7; transform: scale(0.95); }
          }
        `}</style>
      </div>
    </div>
  );

  return createPortal(modalContent, document.body);
};
