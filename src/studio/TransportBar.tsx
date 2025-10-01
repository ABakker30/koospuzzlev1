// Transport Bar - compact controls for active effects
import { useState, useEffect } from 'react';
import { SettingsPopover } from './SettingsPopover';

export interface TransportBarProps {
  activeEffectId: string | null;
  isLoaded: boolean;
}

export const TransportBar: React.FC<TransportBarProps> = ({ activeEffectId, isLoaded }) => {
  const [isPlaying, setIsPlaying] = useState(false);
  const [showSettings, setShowSettings] = useState(false);

  // Don't render if no active effect or shape not loaded
  if (!activeEffectId || !isLoaded) {
    return null;
  }

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Only handle if not in input field
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
        return;
      }

      switch (e.key.toLowerCase()) {
        case 'p':
          e.preventDefault();
          handlePlayPause();
          break;
        case 's':
          if (e.altKey) {
            e.preventDefault();
            setShowSettings(!showSettings);
          } else {
            e.preventDefault();
            handleStop();
          }
          break;
        case 'r':
          e.preventDefault();
          handleRecord();
          break;
        case 'escape':
          if (showSettings) {
            e.preventDefault();
            setShowSettings(false);
          }
          break;
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isPlaying, showSettings, activeEffectId]);

  const handlePlayPause = () => {
    const newState = !isPlaying;
    setIsPlaying(newState);
    
    const action = newState ? 'play' : (isPlaying ? 'pause' : 'resume');
    console.log(`transport:action=${action} effect=${activeEffectId}`);
  };

  const handleStop = () => {
    setIsPlaying(false);
    console.log(`transport:action=stop effect=${activeEffectId}`);
  };

  const handleRecord = () => {
    console.log(`transport:action=record effect=${activeEffectId}`);
  };

  const handleSettingsToggle = () => {
    const newState = !showSettings;
    setShowSettings(newState);
    if (newState) {
      console.log(`transport:action=open-settings effect=${activeEffectId}`);
    }
  };

  return (
    <div 
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '0.5rem',
        padding: '0.5rem',
        backgroundColor: '#fff',
        border: '1px solid #ddd',
        borderRadius: '6px',
        boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
        position: 'relative'
      }}
    >
      {/* Play/Pause Toggle */}
      <button
        onClick={handlePlayPause}
        style={{
          padding: '0.5rem',
          minWidth: '2rem',
          height: '2rem',
          border: '1px solid #ccc',
          borderRadius: '4px',
          backgroundColor: isPlaying ? '#e3f2fd' : '#fff',
          cursor: 'pointer',
          fontSize: '1rem'
        }}
        title={isPlaying ? 'Pause (P)' : 'Play (P)'}
        aria-label={isPlaying ? 'Pause' : 'Play'}
      >
        {isPlaying ? '‖' : '▸'}
      </button>

      {/* Stop */}
      <button
        onClick={handleStop}
        style={{
          padding: '0.5rem',
          minWidth: '2rem',
          height: '2rem',
          border: '1px solid #ccc',
          borderRadius: '4px',
          backgroundColor: '#fff',
          cursor: 'pointer',
          fontSize: '1rem'
        }}
        title="Stop (S)"
        aria-label="Stop"
      >
        ■
      </button>

      {/* Record */}
      <button
        onClick={handleRecord}
        style={{
          padding: '0.5rem',
          minWidth: '2rem',
          height: '2rem',
          border: '1px solid #ccc',
          borderRadius: '4px',
          backgroundColor: '#fff',
          cursor: 'pointer',
          fontSize: '1rem',
          color: '#d32f2f'
        }}
        title="Record (R)"
        aria-label="Record"
      >
        ⬤
      </button>

      {/* Settings */}
      <button
        onClick={handleSettingsToggle}
        style={{
          padding: '0.5rem',
          minWidth: '2rem',
          height: '2rem',
          border: '1px solid #ccc',
          borderRadius: '4px',
          backgroundColor: showSettings ? '#e3f2fd' : '#fff',
          cursor: 'pointer',
          fontSize: '1rem'
        }}
        title="Settings (Alt+S)"
        aria-label="Settings"
      >
        ⚙︎
      </button>

      {/* Settings Popover */}
      {showSettings && (
        <SettingsPopover
          onClose={() => setShowSettings(false)}
          activeEffectId={activeEffectId}
        />
      )}
    </div>
  );
};
