import React, { useState } from 'react';
import type { EffectState, CaptureOptions } from './_shared/types';
import type { SpecialEffectsManager } from './SpecialEffectsManager';

interface GlobalControlBarProps {
  manager: SpecialEffectsManager;
  state: EffectState;
  currentTime: number;
  duration?: number;
  canPlay: boolean;
}

export const GlobalControlBar: React.FC<GlobalControlBarProps> = ({
  manager,
  state,
  currentTime,
  duration,
  canPlay
}) => {
  const [showRecordOptions, setShowRecordOptions] = useState(false);
  const [recordOptions, setRecordOptions] = useState<CaptureOptions>({
    mode: 'realtime',
    width: 1920,
    height: 1080,
    fps: 30,
    quality: 'medium'
  });

  const handlePlay = () => {
    manager.play();
  };

  const handlePause = () => {
    manager.pause();
  };

  const handleStop = () => {
    manager.stop();
  };

  const handleRecord = async () => {
    try {
      setShowRecordOptions(false);
      const opts = { ...recordOptions };
      if (duration) {
        opts.durationSec = duration;
      }
      await manager.record(opts);
    } catch (error) {
      console.error('Recording failed:', error);
      alert(`Recording failed: ${error.message}`);
    }
  };

  const formatTime = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const getPlayButtonContent = () => {
    if (state === 'playing') return '⏸️';
    return '▶️';
  };

  const getPlayButtonAction = () => {
    if (state === 'playing') return handlePause;
    return handlePlay;
  };

  const activeEffect = manager.getActiveEffect();

  return (
    <div style={containerStyle}>
      {/* Effect Info */}
      <div style={effectInfoStyle}>
        {activeEffect ? (
          <span style={effectNameStyle}>
            🎬 {activeEffect.name}
          </span>
        ) : (
          <span style={noEffectStyle}>
            No effect selected
          </span>
        )}
      </div>

      {/* Time Display */}
      <div style={timeDisplayStyle}>
        <span style={currentTimeStyle}>
          {formatTime(currentTime)}
        </span>
        {duration && (
          <>
            <span style={separatorStyle}>/</span>
            <span style={durationStyle}>
              {formatTime(duration)}
            </span>
          </>
        )}
      </div>

      {/* Progress Bar */}
      {duration && (
        <div style={progressContainerStyle}>
          <div 
            style={{
              ...progressBarStyle,
              width: `${Math.min((currentTime / duration) * 100, 100)}%`
            }}
          />
        </div>
      )}

      {/* Control Buttons */}
      <div style={controlsStyle}>
        <button
          onClick={getPlayButtonAction()}
          disabled={!canPlay || state === 'recording'}
          style={{
            ...controlButtonStyle,
            opacity: (!canPlay || state === 'recording') ? 0.5 : 1
          }}
          title={!canPlay ? 'Add at least 2 keyframes to play' : state === 'playing' ? 'Pause' : 'Play'}
        >
          {getPlayButtonContent()}
        </button>

        <button
          onClick={handleStop}
          disabled={state === 'idle'}
          style={{
            ...controlButtonStyle,
            opacity: state === 'idle' ? 0.5 : 1
          }}
          title="Stop and reset to beginning"
        >
          ⏹️
        </button>

        <div style={recordContainerStyle}>
          <button
            onClick={() => setShowRecordOptions(!showRecordOptions)}
            disabled={!canPlay || state !== 'idle'}
            style={{
              ...recordButtonStyle,
              backgroundColor: state === 'recording' ? '#dc3545' : '#28a745',
              opacity: (!canPlay || state !== 'idle') ? 0.5 : 1
            }}
            title={!canPlay ? 'Add at least 2 keyframes to record' : 'Record animation'}
          >
            {state === 'recording' ? '🔴 Recording...' : '📹 Record'}
          </button>

          {/* Record Options Popover */}
          {showRecordOptions && (
            <div style={recordPopoverStyle}>
              <h4 style={popoverTitleStyle}>Recording Options</h4>
              
              <div style={popoverFieldStyle}>
                <label>Resolution:</label>
                <select
                  value={`${recordOptions.width}x${recordOptions.height}`}
                  onChange={(e) => {
                    const [width, height] = e.target.value.split('x').map(Number);
                    setRecordOptions(prev => ({ ...prev, width, height }));
                  }}
                  style={popoverSelectStyle}
                >
                  <option value="1280x720">720p (1280×720)</option>
                  <option value="1920x1080">1080p (1920×1080)</option>
                  <option value="3840x2160">4K (3840×2160)</option>
                </select>
              </div>

              <div style={popoverFieldStyle}>
                <label>Frame Rate:</label>
                <select
                  value={recordOptions.fps}
                  onChange={(e) => setRecordOptions(prev => ({ ...prev, fps: parseInt(e.target.value) }))}
                  style={popoverSelectStyle}
                >
                  <option value="24">24 FPS</option>
                  <option value="30">30 FPS</option>
                  <option value="60">60 FPS</option>
                </select>
              </div>

              <div style={popoverFieldStyle}>
                <label>Quality:</label>
                <select
                  value={recordOptions.quality}
                  onChange={(e) => setRecordOptions(prev => ({ ...prev, quality: e.target.value as any }))}
                  style={popoverSelectStyle}
                >
                  <option value="low">Low</option>
                  <option value="medium">Medium</option>
                  <option value="high">High</option>
                  <option value="max">Maximum</option>
                </select>
              </div>

              <div style={popoverActionsStyle}>
                <button
                  onClick={() => setShowRecordOptions(false)}
                  style={cancelButtonStyle}
                >
                  Cancel
                </button>
                <button
                  onClick={handleRecord}
                  style={startRecordButtonStyle}
                >
                  Start Recording
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Loop Indicator */}
      {manager.isLooping() && (
        <div style={loopIndicatorStyle}>
          🔄 Loop
        </div>
      )}
    </div>
  );
};

// Styles
const containerStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: '16px',
  padding: '8px 16px',
  backgroundColor: '#f8f9fa',
  borderTop: '1px solid #ddd',
  borderRadius: '8px',
  margin: '8px',
  fontSize: '14px'
};

const effectInfoStyle: React.CSSProperties = {
  minWidth: '150px'
};

const effectNameStyle: React.CSSProperties = {
  fontWeight: 500,
  color: '#007bff'
};

const noEffectStyle: React.CSSProperties = {
  color: '#666',
  fontStyle: 'italic'
};

const timeDisplayStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: '4px',
  fontFamily: 'monospace',
  fontSize: '16px'
};

const currentTimeStyle: React.CSSProperties = {
  fontWeight: 'bold'
};

const separatorStyle: React.CSSProperties = {
  color: '#666'
};

const durationStyle: React.CSSProperties = {
  color: '#666'
};

const progressContainerStyle: React.CSSProperties = {
  flex: 1,
  height: '4px',
  backgroundColor: '#e9ecef',
  borderRadius: '2px',
  overflow: 'hidden'
};

const progressBarStyle: React.CSSProperties = {
  height: '100%',
  backgroundColor: '#007bff',
  transition: 'width 0.1s ease'
};

const controlsStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: '8px'
};

const controlButtonStyle: React.CSSProperties = {
  padding: '8px 12px',
  border: '1px solid #ddd',
  borderRadius: '4px',
  backgroundColor: 'white',
  cursor: 'pointer',
  fontSize: '16px',
  transition: 'all 0.2s ease'
};

const recordContainerStyle: React.CSSProperties = {
  position: 'relative'
};

const recordButtonStyle: React.CSSProperties = {
  padding: '8px 16px',
  border: 'none',
  borderRadius: '4px',
  color: 'white',
  cursor: 'pointer',
  fontSize: '14px',
  fontWeight: 500,
  transition: 'all 0.2s ease'
};

const recordPopoverStyle: React.CSSProperties = {
  position: 'absolute',
  bottom: '100%',
  right: 0,
  marginBottom: '8px',
  backgroundColor: 'white',
  border: '1px solid #ddd',
  borderRadius: '8px',
  padding: '16px',
  boxShadow: '0 4px 12px rgba(0, 0, 0, 0.15)',
  zIndex: 1000,
  minWidth: '250px'
};

const popoverTitleStyle: React.CSSProperties = {
  margin: '0 0 12px 0',
  fontSize: '16px'
};

const popoverFieldStyle: React.CSSProperties = {
  marginBottom: '12px'
};

const popoverSelectStyle: React.CSSProperties = {
  width: '100%',
  padding: '6px',
  marginTop: '4px',
  border: '1px solid #ddd',
  borderRadius: '4px'
};

const popoverActionsStyle: React.CSSProperties = {
  display: 'flex',
  gap: '8px',
  marginTop: '16px'
};

const cancelButtonStyle: React.CSSProperties = {
  flex: 1,
  padding: '8px',
  border: '1px solid #ddd',
  borderRadius: '4px',
  backgroundColor: 'white',
  cursor: 'pointer'
};

const startRecordButtonStyle: React.CSSProperties = {
  flex: 1,
  padding: '8px',
  border: 'none',
  borderRadius: '4px',
  backgroundColor: '#dc3545',
  color: 'white',
  cursor: 'pointer',
  fontWeight: 500
};

const loopIndicatorStyle: React.CSSProperties = {
  padding: '4px 8px',
  backgroundColor: '#007bff',
  color: 'white',
  borderRadius: '12px',
  fontSize: '12px',
  fontWeight: 500
};
