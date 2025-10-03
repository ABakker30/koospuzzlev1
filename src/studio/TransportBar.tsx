// Transport Bar - compact controls for active effects
import { useState, useEffect, useRef } from 'react';
import { RecordingService, RecordingOptions, RecordingStatus } from '../services/RecordingService';
import { RecordingSettingsModal } from '../components/RecordingSettingsModal';

export interface TransportBarProps {
  activeEffectId: string | null;
  isLoaded: boolean;
  activeEffectInstance?: any; // Effect instance to control
  isMobile?: boolean; // New prop to control mobile layout
  onConfigureEffect?: () => void; // Callback to open effect settings
}

export const TransportBar: React.FC<TransportBarProps> = ({ activeEffectId, isLoaded, activeEffectInstance, isMobile = false, onConfigureEffect }) => {
  const [isPlaying, setIsPlaying] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const transportRef = useRef<HTMLDivElement>(null);
  
  // Recording state
  const [recordingService] = useState(() => new RecordingService());
  const [recordingStatus, setRecordingStatus] = useState<RecordingStatus>({ state: 'idle' });
  const [showRecordingSettings, setShowRecordingSettings] = useState(false);
  const [canvas, setCanvas] = useState<HTMLCanvasElement | null>(null);

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

  // Initialize recording service
  useEffect(() => {
    recordingService.setStatusCallback(setRecordingStatus);
    
    // Find canvas element (look for THREE.js canvas)
    const canvasElement = document.querySelector('canvas');
    if (canvasElement) {
      setCanvas(canvasElement);
      console.log('🎬 TransportBar: Canvas found for recording');
    }
    
    return () => {
      recordingService.dispose();
    };
  }, [recordingService]);

  // Set up effect completion callback for auto-stop recording
  useEffect(() => {
    if (activeEffectInstance && activeEffectInstance.setOnComplete) {
      const handleEffectComplete = () => {
        console.log('🎬 TransportBar: Effect completed, checking if recording should stop');
        if (recordingStatus.state === 'recording') {
          console.log('🎬 TransportBar: Auto-stopping recording due to effect completion');
          handleStopRecording();
        }
      };
      
      activeEffectInstance.setOnComplete(handleEffectComplete);
      console.log('🎬 TransportBar: Effect completion callback set');
    }
  }, [activeEffectInstance, recordingStatus.state]);

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
    console.log(`transport:action=record effect=${activeEffectId} state=${recordingStatus.state}`);
    
    if (recordingStatus.state === 'idle') {
      // Check if canvas is available first
      if (!canvas) {
        alert('Canvas not found. Please try again.');
        return;
      }
      
      // Check if MediaRecorder exists at all
      if (!window.MediaRecorder) {
        alert('Recording not supported in this browser. Try Chrome or Firefox for best results.');
        return;
      }
      
      // Show recording settings modal - let the actual recording attempt handle detailed compatibility
      console.log('🎬 MediaRecorder available, showing settings modal');
      setShowRecordingSettings(true);
    } else if (recordingStatus.state === 'recording') {
      // Stop recording
      handleStopRecording();
    }
  };

  const handleStartRecording = async (options: RecordingOptions) => {
    if (!canvas) {
      alert('Canvas not found. Please try again.');
      return;
    }

    try {
      setShowRecordingSettings(false);
      
      // Initialize recording service with canvas and options
      await recordingService.initialize(canvas, options);
      
      // Start recording
      await recordingService.startRecording();
      
      // Auto-start animation if not already playing
      if (!isPlaying && activeEffectInstance) {
        handlePlayPause();
      }
      
    } catch (error) {
      console.error('🎬 Failed to start recording:', error);
      alert(error instanceof Error ? error.message : 'Failed to start recording');
    }
  };

  const handleStopRecording = async () => {
    try {
      await recordingService.stopRecording();
    } catch (error) {
      console.error('🎬 Failed to stop recording:', error);
      alert('Failed to stop recording');
    }
  };

  // Get estimated animation duration for recording settings
  const getEstimatedDuration = (): number => {
    if (activeEffectInstance && activeEffectInstance.getConfig) {
      const config = activeEffectInstance.getConfig();
      return config.durationSec || 30;
    }
    return 30; // Default fallback
  };

  const handleSettingsToggle = () => {
    if (onConfigureEffect) {
      // Use the effect-specific configuration modal
      onConfigureEffect();
      console.log(`transport:action=configure-effect effect=${activeEffectId}`);
    } else {
      // Fallback to generic settings
      const newState = !showSettings;
      setShowSettings(newState);
      if (newState) {
        console.log(`transport:action=open-settings effect=${activeEffectId}`);
      }
    }
  };

  // Drag handlers

  return (
    <div 
      ref={transportRef}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '0.5rem',
        padding: '0.5rem',
        backgroundColor: 'transparent',
        border: 'none',
        borderRadius: '0',
        boxShadow: 'none',
        position: 'static',
        cursor: 'default',
        userSelect: 'none'
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
        disabled={recordingStatus.state === 'starting' || recordingStatus.state === 'stopping' || recordingStatus.state === 'processing'}
        style={{
          padding: '0',
          minWidth: '2rem',
          height: '2rem',
          border: `1px solid ${recordingStatus.state === 'recording' ? '#d32f2f' : '#ccc'}`,
          borderRadius: '4px',
          backgroundColor: recordingStatus.state === 'recording' ? '#ffebee' : '#fff',
          cursor: recordingStatus.state === 'starting' || recordingStatus.state === 'stopping' || recordingStatus.state === 'processing' ? 'not-allowed' : 'pointer',
          fontSize: '1rem',
          color: '#d32f2f',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          animation: recordingStatus.state === 'recording' ? 'pulse 1s infinite' : 'none'
        }}
        title={
          recordingStatus.state === 'idle' ? 'Record (R)' :
          recordingStatus.state === 'recording' ? 'Stop Recording (R)' :
          recordingStatus.state === 'starting' ? 'Starting...' :
          recordingStatus.state === 'stopping' ? 'Stopping...' :
          recordingStatus.state === 'processing' ? 'Processing...' :
          'Record'
        }
        aria-label={recordingStatus.state === 'recording' ? 'Stop Recording' : 'Record'}
      >
        {recordingStatus.state === 'recording' ? '⏹' : '⬤'}
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

      {/* Recording Indicator */}
      {recordingStatus.state === 'recording' && (
        <div style={{
          position: 'fixed',
          top: '1rem',
          right: '1rem',
          backgroundColor: '#d32f2f',
          color: '#fff',
          padding: '0.5rem 1rem',
          borderRadius: '20px',
          fontSize: '0.8rem',
          fontWeight: '500',
          zIndex: 6000,
          display: 'flex',
          alignItems: 'center',
          gap: '0.5rem',
          animation: 'pulse 1s infinite'
        }}>
          🔴 REC
        </div>
      )}

      {/* Recording Settings Modal */}
      <RecordingSettingsModal
        isOpen={showRecordingSettings}
        onClose={() => setShowRecordingSettings(false)}
        onStartRecording={handleStartRecording}
        estimatedDuration={getEstimatedDuration()}
      />

      {/* CSS Animation for pulse effect */}
      <style>{`
        @keyframes pulse {
          0% { opacity: 1; }
          50% { opacity: 0.5; }
          100% { opacity: 1; }
        }
      `}</style>
    </div>
  );
};
