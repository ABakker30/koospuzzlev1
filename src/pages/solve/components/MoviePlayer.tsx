// Movie Player - Replay solve actions and generate animations
import React, { useState, useEffect, useRef } from 'react';
import type { SolveAction } from '../hooks/useSolveActionTracker';

export type MovieMode = 'action-replay' | 'reveal-animation' | 'explosion-combo';

interface MoviePlayerProps {
  actions: SolveAction[];
  totalPieces: number;
  onClose: () => void;
  onPlaybackFrame?: (frameData: PlaybackFrame) => void;
  puzzleName?: string;
  puzzleMode?: 'oneOfEach' | 'unlimited' | 'single';
  moveCount?: number;
}

export interface PlaybackFrame {
  mode: MovieMode;
  currentStep: number;
  totalSteps: number;
  revealK?: number; // For reveal/explosion modes
  explosionFactor?: number; // For explosion combo
  hideContainerCells?: boolean; // Hide empty container cells during movie playback
  turntableRotation?: number; // Y-axis rotation in radians for turntable effect
  pieceToPlace?: {
    pieceId: string;
    orientation: string | number;
    cells: Array<{ i: number; j: number; k: number }>;
  };
}

export const MoviePlayer: React.FC<MoviePlayerProps> = ({
  actions,
  totalPieces,
  onClose,
  onPlaybackFrame,
  puzzleName = 'Puzzle Solution',
  puzzleMode = 'unlimited',
  moveCount = 0
}) => {
  const [mode, setMode] = useState<MovieMode>('action-replay');
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentStep, setCurrentStep] = useState(0);
  const [duration, setDuration] = useState(10); // Duration in seconds
  const [isDownloading, setIsDownloading] = useState(false);
  const [showCredits, setShowCredits] = useState(false);
  const [format, setFormat] = useState<'square' | 'portrait' | 'landscape'>('landscape');
  
  // Mode-specific options
  const [enableTurntable, setEnableTurntable] = useState(true);
  
  // Draggable position
  const [position, setPosition] = useState({ x: window.innerWidth / 2 - 400, y: 50 });
  const [isDragging, setIsDragging] = useState(false);
  const dragStartRef = useRef({ x: 0, y: 0 });
  
  const animationFrameRef = useRef<number>();
  const lastFrameTimeRef = useRef<number>(0);
  const playbackStartTimeRef = useRef<number>(0);
  const pausedElapsedTimeRef = useRef<number>(0); // Track elapsed time when paused
  const creditsDrawIntervalRef = useRef<number>();
  const isRecordingRef = useRef(false); // Track if we're recording
  
  const FPS = 30;
  const FRAME_TIME = 1000 / FPS; // ~33.33ms per frame
  
  // Calculate total steps based on mode
  const placeActions = actions.filter(a => a.type === 'PLACE_PIECE');
  const totalSteps = mode === 'action-replay' 
    ? placeActions.length
    : totalPieces;
  
  // Debug: Log action tracking status
  React.useEffect(() => {
    console.log('🎬 MoviePlayer initialized:', {
      mode,
      totalActions: actions.length,
      placeActions: placeActions.length,
      totalPieces,
      totalSteps,
      actionsPreview: actions.slice(0, 3)
    });
  }, [mode, actions.length, totalPieces]);
  
  // Stop playback
  const stop = () => {
    setIsPlaying(false);
    setCurrentStep(0);
    playbackStartTimeRef.current = 0;
    lastFrameTimeRef.current = 0;
    pausedElapsedTimeRef.current = 0;
    setShowCredits(false);
    stopCreditsDrawing(); // Stop credits drawing
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
    }
  };
  
  // Draw credits on canvas for video capture
  const drawCreditsOnCanvas = React.useCallback(() => {
    const canvas = document.querySelector('canvas') as HTMLCanvasElement;
    if (!canvas) return;
    
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    
    const width = canvas.width;
    const height = canvas.height;
    
    // Semi-transparent overlay
    ctx.fillStyle = 'rgba(0, 0, 0, 0.75)';
    ctx.fillRect(0, 0, width, height);
    
    // Calculate dimensions based on format
    const maxWidth = format === 'portrait' ? width * 0.85 : format === 'square' ? width * 0.7 : width * 0.6;
    const centerX = width / 2;
    let y = height * 0.15;
    
    // Gradient background for credits card
    const gradient = ctx.createLinearGradient(centerX - maxWidth/2, y, centerX + maxWidth/2, y + height * 0.7);
    gradient.addColorStop(0, 'rgba(102, 126, 234, 0.95)');
    gradient.addColorStop(1, 'rgba(118, 75, 162, 0.95)');
    ctx.fillStyle = gradient;
    ctx.fillRect(centerX - maxWidth/2, y, maxWidth, height * 0.7);
    
    y += 60;
    
    // Confetti emoji
    ctx.font = '64px Arial';
    ctx.textAlign = 'center';
    ctx.fillText('🎉', centerX, y);
    
    y += 80;
    
    // Title
    ctx.fillStyle = 'white';
    ctx.font = 'bold 48px Arial';
    ctx.fillText('Puzzle Mastered!', centerX, y);
    
    y += 60;
    
    // Puzzle name
    ctx.font = 'bold 28px Arial';
    ctx.fillText(`"${puzzleName}"`, centerX, y);
    
    y += 60;
    
    // Stats
    ctx.font = '24px Arial';
    ctx.textAlign = 'left';
    const leftX = centerX - maxWidth/2 + 60;
    
    const stats = [
      `👤 Solver: PuzzleMaster3000`,
      `📅 Date: ${new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}`,
      `⏱️ Time: ${Math.floor(duration)} seconds`,
      `🎯 Pieces: ${totalSteps} placed`,
      `🔢 Moves: ${moveCount} tried`,
      `🎮 Mode: ${puzzleMode === 'oneOfEach' ? 'One of Each' : puzzleMode === 'unlimited' ? 'Unlimited' : 'Single Piece'}`
    ];
    
    stats.forEach((stat, index) => {
      ctx.fillText(stat, leftX, y + (index * 40));
    });
    
    y += stats.length * 40 + 50;
    
    // Challenge message
    ctx.font = 'italic 26px Arial';
    ctx.textAlign = 'center';
    ctx.fillText('🏆 "Think you can beat this time?', centerX, y);
    ctx.fillText('Your turn!"', centerX, y + 35);
  }, [format, puzzleName, duration, totalSteps, moveCount, puzzleMode]);
  
  // Start continuous credits drawing
  const startCreditsDrawing = React.useCallback(() => {
    // Just draw once immediately when credits start
    drawCreditsOnCanvas();
  }, [drawCreditsOnCanvas]);
  
  // Stop credits drawing
  const stopCreditsDrawing = React.useCallback(() => {
    if (creditsDrawIntervalRef.current) {
      clearInterval(creditsDrawIntervalRef.current);
      creditsDrawIntervalRef.current = undefined;
    }
  }, []);
  
  // Play/Resume playback
  const play = () => {
    stopCreditsDrawing(); // Stop any existing credits drawing
    if (currentStep >= totalSteps) {
      setCurrentStep(0); // Restart if at end
      playbackStartTimeRef.current = 0;
      lastFrameTimeRef.current = 0;
      pausedElapsedTimeRef.current = 0;
    } else if (pausedElapsedTimeRef.current > 0) {
      // Resume from paused position - reset start time to account for paused duration
      playbackStartTimeRef.current = 0; // Will be reset in animate loop
      lastFrameTimeRef.current = 0;
    }
    setIsPlaying(true);
  };
  
  // Playback loop at 60 fps
  useEffect(() => {
    if (!isPlaying) return;
    
    const animate = (timestamp: number) => {
      if (!playbackStartTimeRef.current) {
        playbackStartTimeRef.current = timestamp;
        lastFrameTimeRef.current = timestamp;
      }
      
      const elapsedSinceLastFrame = timestamp - lastFrameTimeRef.current;
      
      // Render at 30 fps - allow some tolerance for recording overhead
      if (elapsedSinceLastFrame >= FRAME_TIME * 0.9) {
        // Use actual timestamp to stay in sync
        lastFrameTimeRef.current = timestamp;
        
        // Calculate elapsed time since start (accounting for pause/resume)
        let elapsedTime = (timestamp - playbackStartTimeRef.current) / 1000; // seconds
        
        // If resuming from pause, add the paused elapsed time
        if (pausedElapsedTimeRef.current > 0) {
          elapsedTime += pausedElapsedTimeRef.current;
        }
        
        const CREDITS_DURATION = 2; // Show credits for 2 seconds at end
        const totalDuration = duration + CREDITS_DURATION;
        const progress = Math.min(1, elapsedTime / duration);
        
        // Calculate which step we should be on
        // Spread pieces across duration + 1 intervals so last piece appears earlier
        // This leaves the final portion showing the completed puzzle
        const targetStep = Math.min(totalSteps, Math.floor(progress * (totalSteps + 1)));
        
        // Update step if needed
        if (targetStep !== currentStep && targetStep <= totalSteps) {
          setCurrentStep(targetStep);
        }
        
        // Emit frame with smooth turntable rotation
        emitFrame(targetStep, progress);
        
        // Show credits at 100% of main duration (but keep playing for recording)
        if (progress >= 1) {
          if (!showCredits) {
            setShowCredits(true);
          }
          // Draw credits directly on canvas when recording
          if (isRecordingRef.current) {
            // Wait for Three.js and browser render to complete, then draw credits
            requestAnimationFrame(() => {
              requestAnimationFrame(() => drawCreditsOnCanvas());
            });
          }
        }
        
        // Stop after credits duration (duration + 2 seconds)
        if (elapsedTime >= totalDuration) {
          setIsPlaying(false);
          setCurrentStep(totalSteps);
          pausedElapsedTimeRef.current = 0;
          stopCreditsDrawing();
          return;
        }
      }
      
      if (isPlaying) {
        animationFrameRef.current = requestAnimationFrame(animate);
      }
    };
    
    animationFrameRef.current = requestAnimationFrame(animate);
    
    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
      stopCreditsDrawing();
    };
  }, [isPlaying, currentStep, duration, mode, totalSteps, stopCreditsDrawing, startCreditsDrawing, drawCreditsOnCanvas, showCredits]);
  
  
  // Emit playback frame
  const emitFrame = (step: number, progress: number) => {
    if (!onPlaybackFrame) return;
    
    const frameData: PlaybackFrame = {
      mode,
      currentStep: step,
      totalSteps,
      hideContainerCells: true, // Always hide empty cells during movie playback
    };
    
    // Turntable rotation: Smooth 360° rotation over the duration based on time, not steps
    if (enableTurntable) {
      frameData.turntableRotation = progress * Math.PI * 2; // 0 to 2π radians
    }
    
    if (mode === 'action-replay') {
      // Get the action at this step
      const placeActions = actions.filter(a => a.type === 'PLACE_PIECE');
      const action = placeActions[step - 1];
      
      if (action && action.data) {
        frameData.pieceToPlace = {
          pieceId: action.data.pieceId!,
          orientation: action.data.orientation!,
          cells: action.data.cells!,
        };
      }
    } else if (mode === 'reveal-animation') {
      // Reveal mode: just set revealK
      frameData.revealK = step;
      frameData.explosionFactor = 0;
    } else if (mode === 'explosion-combo') {
      // Explosion combo: sync reveal with explosion decrease
      frameData.revealK = step;
      // Start at 100% explosion, decrease to 0% as pieces reveal
      frameData.explosionFactor = Math.max(0, 1 - (step / totalSteps));
    }
    
    onPlaybackFrame(frameData);
  };
  
  // Handle drag start
  const handleMouseDown = (e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest('button, input')) return; // Don't drag on buttons/inputs
    setIsDragging(true);
    dragStartRef.current = {
      x: e.clientX - position.x,
      y: e.clientY - position.y
    };
  };
  
  // Handle drag move
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isDragging) return;
      setPosition({
        x: e.clientX - dragStartRef.current.x,
        y: e.clientY - dragStartRef.current.y
      });
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
  }, [isDragging]);
  
  return (
    <>
      {/* Draggable Modal - No backdrop, canvas stays bright */}
      <div 
        onMouseDown={handleMouseDown}
        style={{
          position: 'fixed',
          left: `${position.x}px`,
          top: `${position.y}px`,
          width: '600px',
          maxWidth: 'calc(100vw - 40px)',
          background: '#1a1a1a',
          borderRadius: '12px',
          boxShadow: '0 16px 48px rgba(0, 0, 0, 0.9)', // Stronger shadow for better contrast
          zIndex: 3001,
          cursor: isDragging ? 'grabbing' : 'grab',
          border: '3px solid rgba(255, 255, 255, 0.3)', // Thicker border for visibility
          padding: '16px',
          display: 'flex',
          flexDirection: 'column',
          gap: '12px',
          maxHeight: '90vh',
          overflowY: 'auto'
        }}
      >
        {/* Header with Close */}
        <div style={{
          display: 'flex',
          justifyContent: 'flex-end',
          alignItems: 'center'
        }}>
        <button
          onClick={onClose}
          style={{
            background: 'transparent',
            border: 'none',
            color: 'rgba(255, 255, 255, 0.7)',
            padding: '4px',
            cursor: 'pointer',
            fontSize: '1.5rem',
            lineHeight: 1
          }}
          onMouseEnter={(e) => e.currentTarget.style.color = 'white'}
          onMouseLeave={(e) => e.currentTarget.style.color = 'rgba(255, 255, 255, 0.7)'}
        >
          ×
        </button>
      </div>
      
      {/* Mode Selection Dropdown */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
        <label style={{ color: 'white', fontSize: '0.9rem', opacity: 0.9 }}>
          Movie Type:
        </label>
        <select
          value={mode}
          onChange={(e) => {
            stop();
            setMode(e.target.value as MovieMode);
          }}
          style={{
            flex: 1,
            padding: '10px 12px',
            background: '#2196F3',
            border: '1px solid rgba(255, 255, 255, 0.3)',
            borderRadius: '8px',
            color: 'white',
            fontSize: '1rem',
            fontWeight: 'bold',
            cursor: 'pointer',
            outline: 'none'
          }}
        >
          <option value="action-replay" style={{ background: '#1a1a1a', color: 'white' }}>
            🎮 Action Replay
          </option>
          <option value="reveal-animation" style={{ background: '#1a1a1a', color: 'white' }}>
            📊 Reveal Animation
          </option>
          <option value="explosion-combo" style={{ background: '#1a1a1a', color: 'white' }}>
            💥 Explosion Combo
          </option>
        </select>
      </div>
      
      {/* Playback Controls - Single Play Button */}
      <div style={{
        display: 'flex',
        justifyContent: 'center'
      }}>
        {!isPlaying && (
          <button
            onClick={play}
            style={{
              padding: '12px 32px',
              background: '#2196F3',
              border: 'none',
              borderRadius: '8px',
              color: 'white',
              cursor: 'pointer',
              fontSize: '1.2rem',
              fontWeight: 'bold',
              boxShadow: '0 4px 12px rgba(33, 150, 243, 0.4)'
            }}
          >
            ▶️ Play
          </button>
        )}
      </div>
      
      {/* Duration & Options */}
      <div style={{
        display: 'flex',
        gap: '12px',
        justifyContent: 'center',
        alignItems: 'center',
        flexWrap: 'wrap',
        fontSize: '0.85rem'
      }}>
        <div style={{ color: 'white', display: 'flex', gap: '8px', alignItems: 'center' }}>
          <label style={{ fontSize: '0.9rem', opacity: 0.8 }}>Duration (seconds):</label>
          <input
            type="number"
            min={1}
            max={60}
            value={duration}
            onChange={(e) => setDuration(Math.max(1, parseInt(e.target.value) || 10))}
            style={{
              width: '80px',
              padding: '6px 12px',
              background: 'rgba(255, 255, 255, 0.1)',
              border: '1px solid rgba(255, 255, 255, 0.3)',
              borderRadius: '6px',
              color: 'white',
              fontSize: '0.9rem',
              textAlign: 'center'
            }}
          />
        </div>
        
        <button
          onClick={async () => {
            setIsDownloading(true);
            try {
              // Get the canvas element
              const canvas = document.querySelector('canvas');
              if (!canvas) {
                alert('Canvas not found. Please ensure the 3D view is visible.');
                return;
              }

              // Create video stream from canvas
              const stream = canvas.captureStream(30); // 30 fps
              const mediaRecorder = new MediaRecorder(stream, {
                mimeType: 'video/webm;codecs=vp9',
                videoBitsPerSecond: 5000000 // 5 Mbps - reduced for smoother recording
              });

              const chunks: Blob[] = [];
              mediaRecorder.ondataavailable = (e) => {
                if (e.data.size > 0) {
                  chunks.push(e.data);
                }
              };

              mediaRecorder.onstop = () => {
                isRecordingRef.current = false; // Clear recording flag
                const blob = new Blob(chunks, { type: 'video/webm' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `${puzzleName.replace(/\s+/g, '_')}_movie.webm`;
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
                URL.revokeObjectURL(url);
                setIsDownloading(false);
              };

              // Start recording
              mediaRecorder.start();
              isRecordingRef.current = true; // Track recording state
              console.log('🎬 Recording started...');

              // Reset and play the movie
              setCurrentStep(0);
              playbackStartTimeRef.current = 0;
              lastFrameTimeRef.current = 0;
              pausedElapsedTimeRef.current = 0;
              setShowCredits(false);
              setIsPlaying(true);

              // Calculate total duration including credits
              const CREDITS_DURATION = 2;
              const totalDuration = (duration + CREDITS_DURATION) * 1000; // Convert to ms

              // Stop recording after movie completes (including credits)
              setTimeout(() => {
                mediaRecorder.stop();
                console.log('🎬 Recording stopped.');
              }, totalDuration + 500); // Extra 500ms buffer

            } catch (err) {
              console.error('Download failed:', err);
              isRecordingRef.current = false; // Clear recording flag on error
              alert('Recording failed. Your browser may not support video capture.\n\nPlease try using Chrome, Edge, or Firefox for best compatibility.');
              setIsDownloading(false);
            }
          }}
          disabled={isDownloading || isPlaying}
          style={{
            padding: '8px 16px',
            background: isDownloading ? '#666' : '#4CAF50',
            border: 'none',
            borderRadius: '6px',
            color: 'white',
            cursor: isDownloading ? 'not-allowed' : 'pointer',
            fontSize: '0.9rem',
            fontWeight: 'bold'
          }}
        >
          {isDownloading ? '⏳ Recording...' : '📥 Download Movie'}
        </button>
        
        
        <label style={{ color: 'white', display: 'flex', gap: '8px', alignItems: 'center', cursor: 'pointer' }}>
          <input
            type="checkbox"
            checked={enableTurntable}
            onChange={(e) => setEnableTurntable(e.target.checked)}
            style={{ cursor: 'pointer' }}
          />
          <span style={{ fontSize: '0.9rem' }}>🔄 Turntable Rotation</span>
        </label>
        
        {/* Format Selector */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <label style={{ color: 'white', fontSize: '0.85rem', opacity: 0.8 }}>
            Format:
          </label>
          <select
            value={format}
            onChange={(e) => setFormat(e.target.value as 'square' | 'portrait' | 'landscape')}
            style={{
              padding: '6px 10px',
              background: 'rgba(255, 255, 255, 0.1)',
              border: '1px solid rgba(255, 255, 255, 0.3)',
              borderRadius: '6px',
              color: 'white',
              fontSize: '0.85rem',
              cursor: 'pointer',
              outline: 'none'
            }}
          >
            <option value="landscape" style={{ background: '#1a1a1a', color: 'white' }}>
              📺 Landscape
            </option>
            <option value="square" style={{ background: '#1a1a1a', color: 'white' }}>
              ⬜ Square
            </option>
            <option value="portrait" style={{ background: '#1a1a1a', color: 'white' }}>
              📱 Portrait
            </option>
          </select>
        </div>
      </div>
      </div>
      
      {/* Credits Modal - Appears at movie end */}
      {showCredits && (
        <>
          {/* Backdrop */}
          <div style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0, 0, 0, 0.8)',
            zIndex: 4000,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center'
          }}>
            {/* Credits Card */}
            <div style={{
              background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
              borderRadius: '20px',
              padding: '40px',
              maxWidth: format === 'portrait' ? '400px' : format === 'square' ? '500px' : '600px',
              width: '90%',
              boxShadow: '0 20px 60px rgba(0, 0, 0, 0.5)',
              color: 'white',
              textAlign: 'center',
              position: 'relative',
              animation: 'slideIn 0.5s ease-out'
            }}>
              {/* Close Button */}
              <button
                onClick={() => {
                  setShowCredits(false);
                }}
                style={{
                  position: 'absolute',
                  top: '15px',
                  right: '15px',
                  background: 'rgba(255, 255, 255, 0.2)',
                  border: 'none',
                  color: 'white',
                  padding: '8px 12px',
                  cursor: 'pointer',
                  fontSize: '1.5rem',
                  lineHeight: 1,
                  borderRadius: '50%',
                  width: '36px',
                  height: '36px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center'
                }}
                onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(255, 255, 255, 0.3)'}
                onMouseLeave={(e) => e.currentTarget.style.background = 'rgba(255, 255, 255, 0.2)'}
              >
                ×
              </button>
              
              {/* Confetti decoration */}
              <div style={{
                fontSize: '4rem',
                marginBottom: '20px',
                animation: 'bounce 1s infinite'
              }}>
                🎉
              </div>
              
              <h1 style={{
                fontSize: '2.5rem',
                fontWeight: 'bold',
                marginBottom: '10px',
                textShadow: '2px 2px 4px rgba(0,0,0,0.3)'
              }}>
                Puzzle Mastered!
              </h1>
              
              <div style={{
                background: 'rgba(255, 255, 255, 0.2)',
                borderRadius: '12px',
                padding: '25px',
                marginTop: '25px',
                marginBottom: '25px',
                backdropFilter: 'blur(10px)'
              }}>
                <div style={{ fontSize: '1.2rem', marginBottom: '20px', fontWeight: 'bold' }}>
                  "{puzzleName}"
                </div>
                
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', textAlign: 'left' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <span style={{ fontSize: '1.5rem' }}>👤</span>
                    <span style={{ fontSize: '1.1rem' }}>
                      <strong>Solver:</strong> PuzzleMaster3000
                    </span>
                  </div>
                  
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <span style={{ fontSize: '1.5rem' }}>📅</span>
                    <span style={{ fontSize: '1.1rem' }}>
                      <strong>Date:</strong> {new Date().toLocaleDateString('en-US', { 
                        month: 'long', 
                        day: 'numeric', 
                        year: 'numeric' 
                      })}
                    </span>
                  </div>
                  
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <span style={{ fontSize: '1.5rem' }}>⏱️</span>
                    <span style={{ fontSize: '1.1rem' }}>
                      <strong>Time:</strong> {Math.floor(duration)} seconds
                    </span>
                  </div>
                  
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <span style={{ fontSize: '1.5rem' }}>🎯</span>
                    <span style={{ fontSize: '1.1rem' }}>
                      <strong>Pieces:</strong> {totalSteps} placed
                    </span>
                  </div>
                  
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <span style={{ fontSize: '1.5rem' }}>🔢</span>
                    <span style={{ fontSize: '1.1rem' }}>
                      <strong>Moves:</strong> {moveCount} tried
                    </span>
                  </div>
                  
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <span style={{ fontSize: '1.5rem' }}>🎮</span>
                    <span style={{ fontSize: '1.1rem' }}>
                      <strong>Mode:</strong> {puzzleMode === 'oneOfEach' ? 'One of Each' : puzzleMode === 'unlimited' ? 'Unlimited' : 'Single Piece'}
                    </span>
                  </div>
                </div>
                
                {/* Challenge message */}
                <div style={{
                  marginTop: '20px',
                  padding: '15px',
                  background: 'rgba(255, 255, 255, 0.15)',
                  borderRadius: '8px',
                  fontSize: '1.1rem',
                  fontStyle: 'italic',
                  borderLeft: '4px solid rgba(255, 255, 255, 0.5)'
                }}>
                  🏆 "Think you can beat this time? Your turn!"
                </div>
              </div>
            </div>
          </div>
          
          <style>{`
            @keyframes slideIn {
              from {
                transform: translateY(-50px);
                opacity: 0;
              }
              to {
                transform: translateY(0);
                opacity: 1;
              }
            }
            
            @keyframes bounce {
              0%, 100% { transform: translateY(0); }
              50% { transform: translateY(-10px); }
            }
          `}</style>
        </>
      )}
    </>
  );
};
