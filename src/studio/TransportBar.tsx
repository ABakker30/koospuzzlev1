// Transport Bar - compact controls for active effects
import { useState, useEffect, useRef } from 'react';
import { RecordingService, RecordingOptions, RecordingStatus } from '../services/RecordingService';
import { RecordingSettingsModal } from '../components/RecordingSettingsModal';

export interface TransportBarProps {
  activeEffectId: string | null;
  isLoaded: boolean;
  activeEffectInstance?: any; // Effect instance to control
  isMobile?: boolean; // New prop to control mobile layout
  galleryMode?: boolean; // Gallery playback mode - only show play button
  movieMode?: boolean; // Movie creation mode - only play button, no recording controls
  onConfigureEffect?: () => void; // Callback to open effect settings
  onShowRecordingSettings?: () => void; // Callback to show recording settings modal
  onReloadFile?: () => void; // Callback to reload the original file on stop
  onRecordingComplete?: (blob: Blob) => void; // Callback when recording completes with the blob
}

export const TransportBar: React.FC<TransportBarProps> = ({ activeEffectId, isLoaded, activeEffectInstance, galleryMode = false, movieMode = false, onConfigureEffect, onReloadFile, onRecordingComplete }) => {
  const [isPlaying, setIsPlaying] = useState(false);
  const transportRef = useRef<HTMLDivElement>(null);
  
  // Recording state
  const [recordingService] = useState(() => new RecordingService());
  const [recordingStatus, setRecordingStatus] = useState<RecordingStatus>({ state: 'idle' });
  const [showRecordingSettings, setShowRecordingSettings] = useState(false);
  const [canvas, setCanvas] = useState<HTMLCanvasElement | null>(null);
  const [recordingReady, setRecordingReady] = useState(false);
  const [recordingOptions, setRecordingOptions] = useState<RecordingOptions | null>(null);

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
          e.preventDefault();
          handleStop();
          break;
        case 'r':
          e.preventDefault();
          handleRecord();
          break;
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isPlaying, activeEffectId]);

  // Call onRecordingComplete when recording finishes with blob
  useEffect(() => {
    if (recordingStatus.state === 'idle' && recordingStatus.blob && onRecordingComplete) {
      console.log('🎬 TransportBar: Recording complete with blob, calling onRecordingComplete');
      onRecordingComplete(recordingStatus.blob);
      // Reset blob after calling callback to avoid calling multiple times
      setRecordingStatus(prev => ({ ...prev, blob: undefined, downloadUrl: undefined }));
    }
  }, [recordingStatus, onRecordingComplete]);
  
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

  // Sync isPlaying state with effect instance state
  useEffect(() => {
    if (activeEffectInstance && activeEffectInstance.state) {
      const effectIsPlaying = activeEffectInstance.state === 'playing';
      if (effectIsPlaying !== isPlaying) {
        setIsPlaying(effectIsPlaying);
        console.log(`🎬 TransportBar: Synced isPlaying=${effectIsPlaying} from effect state=${activeEffectInstance.state}`);
      }
    }
  }, [activeEffectInstance?.state]);

  // Set up effect completion callback for auto-stop recording
  useEffect(() => {
    if (activeEffectInstance && activeEffectInstance.setOnComplete) {
      // Save existing callback if any
      const existingCallback = activeEffectInstance.onComplete;
      
      const handleEffectComplete = async () => {
        console.log('🎬 TransportBar: Effect completed, checking if recording should stop');
        console.log('🎬 TransportBar: Current recording state:', recordingStatus.state);
        
        // Handle recording first if active
        if (recordingStatus.state === 'recording') {
          console.log('🎬 TransportBar: Auto-stopping recording due to effect completion');
          // Turn off recording mode first
          if (activeEffectInstance && activeEffectInstance.setRecording) {
            activeEffectInstance.setRecording(false);
          }
          // Stop recording and wait for it to complete
          await handleStopRecording();
          console.log('🎬 TransportBar: Recording stopped, blob should be ready');
        } else {
          console.log('🎬 TransportBar: No active recording to stop (state:', recordingStatus.state, ')');
        }
        
        // Then call existing callback (e.g., from SolvePage)
        if (existingCallback) {
          console.log('🎬 TransportBar: Calling existing completion callback');
          existingCallback();
        }
      };
      
      activeEffectInstance.setOnComplete(handleEffectComplete);
      console.log('🎬 TransportBar: Effect completion callback set (chained with existing)');
    }
  }, [activeEffectInstance]);

  // Don't render if no active effect or shape not loaded
  console.log('🔍 TransportBar: activeEffectId=', activeEffectId, 'isLoaded=', isLoaded, 'visible=', !!(activeEffectId && isLoaded));
  
  if (!activeEffectId || !isLoaded) {
    return null;
  }

  const handlePlayPause = async () => {
    if (!activeEffectInstance) {
      console.log(`transport:action=play-pause effect=${activeEffectId} note=no effect instance`);
      return;
    }

    const newState = !isPlaying;
    setIsPlaying(newState);
    
    try {
      if (newState) {
        // If recording is ready, start recording now
        console.log('🎬 Play clicked. recordingReady:', recordingReady, 'recordingStatus:', recordingStatus.state);
        if (recordingReady && recordingStatus.state === 'idle') {
          console.log('🎬 Starting recording on Play...');
          await recordingService.startRecording();
          console.log('🎬 Recording started, new state:', recordingStatus.state);
          
          // Set recording mode on effect instance
          if (activeEffectInstance.setRecording) {
            activeEffectInstance.setRecording(true);
            console.log('🎬 TransportBar: Set effect recording mode to true');
          } else {
            console.warn('⚠️ Effect instance does not have setRecording method!');
          }
          
          setRecordingReady(false);
        } else {
          console.log('🎬 NOT starting recording. recordingReady:', recordingReady, 'state:', recordingStatus.state);
        }
        
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
      
      // Reload the original file to restore state
      if (onReloadFile) {
        console.log('🔄 Reloading original file to restore state');
        onReloadFile();
      }
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

  const handleReadyToRecord = async (options: RecordingOptions) => {
    if (!canvas) {
      alert('Canvas not found. Please try again.');
      return;
    }

    try {
      setShowRecordingSettings(false);
      
      // Reset effect to original position before recording
      if (activeEffectInstance && activeEffectInstance.stop) {
        console.log('🎬 TransportBar: Resetting effect to original position before recording...');
        activeEffectInstance.stop();
        setIsPlaying(false);
      }
      
      // Initialize recording service with canvas and options
      await recordingService.initialize(canvas, options);
      
      // Mark as ready to record (don't start yet)
      setRecordingReady(true);
      setRecordingOptions(options);
      
      console.log('🎬 TransportBar: Ready to record. Waiting for Play button...');
      
    } catch (error) {
      console.error('🎬 Failed to prepare recording:', error);
      alert(error instanceof Error ? error.message : 'Failed to prepare recording');
    }
  };

  const handleStopRecording = async () => {
    try {
      // Turn off recording mode on effect instance
      if (activeEffectInstance && activeEffectInstance.setRecording) {
        activeEffectInstance.setRecording(false);
        console.log('🎬 TransportBar: Set effect recording mode to false');
      }
      
      // Check if there's actually a recording to stop
      if (recordingStatus.state !== 'recording') {
        console.log('🎬 TransportBar: No active recording to stop (state:', recordingStatus.state, ')');
        return;
      }
      
      // Stop the recording service
      await recordingService.stopRecording();
      console.log('🎬 TransportBar: Recording service stopped successfully');
      
      // Stop the effect playback as well
      if (activeEffectInstance && activeEffectInstance.stop) {
        activeEffectInstance.stop();
        console.log('🎬 TransportBar: Stopped effect playback');
      }
      setIsPlaying(false);
      
    } catch (error) {
      console.error('🎬 Failed to stop recording:', error);
      // Only alert if it's not just "no active recording" error
      const errorMessage = error instanceof Error ? error.message : String(error);
      if (!errorMessage.includes('No active recording')) {
        alert('Failed to stop recording');
      }
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
        className="pill"
        onClick={handlePlayPause}
        style={{
          padding: '0.5rem 1rem',
          minWidth: movieMode ? '120px' : '2.5rem',
          border: 'none',
          backgroundColor: isPlaying ? '#28a745' : '#007bff',
          color: '#fff',
          fontWeight: '600',
          fontSize: '0.95rem',
          gap: '0.5rem',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center'
        }}
        title={isPlaying ? 'Pause effect' : 'Play effect'}
        aria-label={isPlaying ? 'Pause' : 'Play'}
      >
        <span>{isPlaying ? '‖' : '▸'}</span>
        {movieMode && <span>{isPlaying ? 'Pause' : 'Play Effect'}</span>}
      </button>

      {/* Stop - Hidden in gallery/movie mode */}
      {!galleryMode && !movieMode && (
      <button
        onClick={handleStop}
        style={{
          padding: '0.5rem 0.75rem',
          minWidth: '2.5rem',
          height: '2.5rem',
          border: 'none',
          borderRadius: '4px',
          backgroundColor: '#6c757d',
          color: '#fff',
          cursor: 'pointer',
          fontSize: '1rem',
          fontWeight: '600',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
          transition: 'all 0.2s ease'
        }}
        title="Stop (S)"
        aria-label="Stop"
        onMouseEnter={(e) => e.currentTarget.style.transform = 'translateY(-1px)'}
        onMouseLeave={(e) => e.currentTarget.style.transform = 'translateY(0)'}
      >
        ■
      </button>
      )}

      {/* Record - Hidden in gallery/movie mode */}
      {!galleryMode && !movieMode && (
      <button
        onClick={handleRecord}
        disabled={recordingStatus.state === 'starting' || recordingStatus.state === 'stopping' || recordingStatus.state === 'processing'}
        style={{
          padding: '0.5rem 0.75rem',
          minWidth: '2.5rem',
          height: '2.5rem',
          border: 'none',
          borderRadius: '4px',
          backgroundColor: recordingStatus.state === 'recording' ? '#dc3545' : '#dc3545',
          color: '#fff',
          cursor: recordingStatus.state === 'starting' || recordingStatus.state === 'stopping' || recordingStatus.state === 'processing' ? 'not-allowed' : 'pointer',
          fontSize: '1rem',
          fontWeight: '600',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
          opacity: recordingStatus.state === 'starting' || recordingStatus.state === 'stopping' || recordingStatus.state === 'processing' ? 0.6 : 1,
          animation: recordingStatus.state === 'recording' ? 'pulse 1s infinite' : 'none',
          transition: 'all 0.2s ease'
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
        onMouseEnter={(e) => {
          if (recordingStatus.state === 'idle' || recordingStatus.state === 'recording') {
            e.currentTarget.style.transform = 'translateY(-1px)';
          }
        }}
        onMouseLeave={(e) => e.currentTarget.style.transform = 'translateY(0)'}
      >
        {recordingStatus.state === 'recording' ? '⏹' : '⬤'}
      </button>
      )}

      {/* Recording Indicator - Prominent Overlay */}
      {recordingStatus.state === 'recording' && (
        <>
          {/* Top-center recording badge */}
          <div style={{
            position: 'fixed',
            top: '1.5rem',
            left: '50%',
            transform: 'translateX(-50%)',
            backgroundColor: 'rgba(211, 47, 47, 0.95)',
            backdropFilter: 'blur(8px)',
            color: '#fff',
            padding: '0.75rem 1.5rem',
            borderRadius: '24px',
            fontSize: '1rem',
            fontWeight: '600',
            zIndex: 6000,
            display: 'flex',
            alignItems: 'center',
            gap: '0.75rem',
            boxShadow: '0 4px 12px rgba(0, 0, 0, 0.3)',
            animation: 'pulse 1s infinite'
          }}>
            <span style={{
              width: '12px',
              height: '12px',
              borderRadius: '50%',
              backgroundColor: '#fff',
              animation: 'blink 1.5s infinite'
            }} />
            RECORDING
          </div>
          
          {/* Top-right compact indicator */}
          <div style={{
            position: 'fixed',
            top: '1rem',
            right: '1rem',
            width: '48px',
            height: '48px',
            backgroundColor: 'rgba(211, 47, 47, 0.9)',
            backdropFilter: 'blur(4px)',
            borderRadius: '50%',
            zIndex: 5999,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            boxShadow: '0 2px 8px rgba(0, 0, 0, 0.3)',
            animation: 'pulse 1s infinite'
          }}>
            <span style={{
              fontSize: '1.5rem',
              lineHeight: '1',
              animation: 'blink 1.5s infinite'
            }}>
              ⬤
            </span>
          </div>
        </>
      )}

      {/* Recording Settings Modal - Not used in movie mode */}
      {!movieMode && (
        <RecordingSettingsModal
          isOpen={showRecordingSettings}
          onClose={() => setShowRecordingSettings(false)}
          onStartRecording={handleReadyToRecord}
          estimatedDuration={getEstimatedDuration()}
        />
      )}

      {/* CSS Animations for recording indicators */}
      <style>{`
        @keyframes pulse {
          0% { opacity: 1; }
          50% { opacity: 0.5; }
          100% { opacity: 1; }
        }
        @keyframes blink {
          0%, 100% { opacity: 1; }
          50% { opacity: 0; }
        }
      `}</style>
    </div>
  );
};
