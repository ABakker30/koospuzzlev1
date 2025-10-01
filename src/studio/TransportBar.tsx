// Transport Bar - compact controls for active effects
import { useState, useEffect, useRef } from 'react';

export interface TransportBarProps {
  activeEffectId: string | null;
  isLoaded: boolean;
  activeEffectInstance?: any; // Effect instance to control
}

export const TransportBar: React.FC<TransportBarProps> = ({ activeEffectId, isLoaded, activeEffectInstance }) => {
  const [isPlaying, setIsPlaying] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [position, setPosition] = useState({ x: window.innerWidth - 220, y: 80 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const transportRef = useRef<HTMLDivElement>(null);

  // Keyboard shortcuts - MUST be before early return
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

  // Don't render if no active effect or shape not loaded
  console.log('🔍 TransportBar: activeEffectId=', activeEffectId, 'isLoaded=', isLoaded, 'visible=', !!(activeEffectId && isLoaded));
  
  if (!activeEffectId || !isLoaded) {
    return null;
  }

  const handlePlayPause = () => {
    if (!activeEffectInstance) {
      console.log(`transport:action=play-pause effect=${activeEffectId} note=no effect instance`);
      return;
    }

    const newState = !isPlaying;
    setIsPlaying(newState);
    
    try {
      if (newState) {
        // Check if we should resume or start fresh
        if (activeEffectInstance.state === 'paused') {
          activeEffectInstance.resume();
          console.log(`transport:action=resume effect=${activeEffectId}`);
        } else {
          activeEffectInstance.play();
          console.log(`transport:action=play effect=${activeEffectId}`);
        }
      } else {
        // Pause
        activeEffectInstance.pause();
        console.log(`transport:action=pause effect=${activeEffectId}`);
      }
    } catch (error) {
      console.error(`❌ Transport: Failed to ${newState ? 'play/resume' : 'pause'} effect:`, error);
      setIsPlaying(!newState); // Revert state on error
    }
  };

  const handleStop = () => {
    if (!activeEffectInstance) {
      console.log(`transport:action=stop effect=${activeEffectId} note=no effect instance`);
      return;
    }

    try {
      activeEffectInstance.stop();
      setIsPlaying(false);
      console.log(`transport:action=stop effect=${activeEffectId}`);
    } catch (error) {
      console.error('❌ Transport: Failed to stop effect:', error);
    }
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

  // Drag handlers
  const handleMouseDown = (e: React.MouseEvent) => {
    if (transportRef.current) {
      const rect = transportRef.current.getBoundingClientRect();
      setDragOffset({
        x: e.clientX - rect.left,
        y: e.clientY - rect.top
      });
      setIsDragging(true);
    }
  };

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (isDragging) {
        setPosition({
          x: e.clientX - dragOffset.x,
          y: e.clientY - dragOffset.y
        });
      }
    };

    const handleMouseUp = () => {
      setIsDragging(false);
    };

    if (isDragging) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
    }

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging, dragOffset]);

  // Update position on window resize to keep it in upper right
  useEffect(() => {
    const handleResize = () => {
      setPosition(prev => ({
        x: Math.min(prev.x, window.innerWidth - 220), // Keep within bounds with margin
        y: prev.y
      }));
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  return (
    <div 
      ref={transportRef}
      onMouseDown={handleMouseDown}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '0.5rem',
        padding: '0.5rem',
        backgroundColor: '#fff',
        border: '1px solid #ddd',
        borderRadius: '6px',
        boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
        position: 'fixed',
        left: `${position.x}px`,
        top: `${position.y}px`,
        cursor: isDragging ? 'grabbing' : 'grab',
        userSelect: 'none',
        zIndex: 1000
      }}
    >
      {/* Play/Pause Toggle */}
      <button
        onClick={handlePlayPause}
        style={{
          padding: '0',
          minWidth: '2rem',
          height: '2rem',
          border: '1px solid #ccc',
          borderRadius: '4px',
          backgroundColor: isPlaying ? '#e3f2fd' : '#fff',
          cursor: 'pointer',
          fontSize: '1rem',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center'
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
          padding: '0',
          minWidth: '2rem',
          height: '2rem',
          border: '1px solid #ccc',
          borderRadius: '4px',
          backgroundColor: '#fff',
          cursor: 'pointer',
          fontSize: '1rem',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center'
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
          padding: '0',
          minWidth: '2rem',
          height: '2rem',
          border: '1px solid #ccc',
          borderRadius: '4px',
          backgroundColor: '#fff',
          cursor: 'pointer',
          fontSize: '1rem',
          color: '#d32f2f',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center'
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
          padding: '0',
          minWidth: '2rem',
          height: '2rem',
          border: '1px solid #ccc',
          borderRadius: '4px',
          backgroundColor: showSettings ? '#e3f2fd' : '#fff',
          cursor: 'pointer',
          fontSize: '1rem',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center'
        }}
        title="Settings (Alt+S)"
        aria-label="Settings"
      >
        ⚙︎
      </button>

      {/* Settings Popover - temporarily disabled for motion PR */}
      {showSettings && (
        <div style={{
          position: 'absolute',
          top: '100%',
          right: 0,
          marginTop: '0.5rem',
          padding: '1rem',
          backgroundColor: '#fff',
          border: '1px solid #ccc',
          borderRadius: '4px',
          boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
          zIndex: 1000
        }}>
          <p>Settings coming soon!</p>
          <button onClick={() => setShowSettings(false)}>Close</button>
        </div>
      )}
    </div>
  );
};
