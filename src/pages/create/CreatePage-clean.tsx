import { useState, useRef, useEffect } from "react";
import { useNavigate } from 'react-router-dom';
import type { IJK } from "../../types/shape";
import { ijkToXyz } from "../../lib/ijk";
import ShapeEditorCanvas from "../../components/ShapeEditorCanvas";
import { computeViewTransforms, type ViewTransforms } from "../../services/ViewTransforms";
import { quickHullWithCoplanarMerge } from "../../lib/quickhull-adapter";
import { InfoModal } from "../../components/InfoModal";
import { SettingsModal } from "../../components/SettingsModal";
import type { StudioSettings } from "../../types/studio";
import { DEFAULT_STUDIO_SETTINGS } from "../../types/studio";
import { useActionTracker } from "./hooks/useActionTracker";
import { CreationMovieModal } from "./components/CreationMovieModal";
import SavePuzzleModal from "./components/SavePuzzleModal";
import { ShareModal } from "./components/ShareModal";
import { PuzzleSavedModal } from "./components/PuzzleSavedModal";
import { RecordingService } from "../../services/RecordingService";
import { supabase } from "../../lib/supabase";
import "../../styles/shape.css";
import "./CreateMode.css";

const STORAGE_KEY_SETTINGS = 'create.environmentSettings';

type PageMode = 'edit' | 'playback';

function CreatePage() {
  const navigate = useNavigate();
  // Start with 1 sphere at origin - standard starting point for all shapes
  const [cells, setCells] = useState<IJK[]>([{ i: 0, j: 0, k: 0 }]);
  const [editMode, setEditMode] = useState<"add" | "remove">("add");
  const [pageMode, setPageMode] = useState<PageMode>('edit');
  const [view, setView] = useState<ViewTransforms | null>(null);
  
  // Action tracking for movie generation
  const { actions, trackAction, undo, canUndo, clearHistory } = useActionTracker(cells, setCells);
  
  // Playback state
  const [isPlaying, setIsPlaying] = useState(false);
  const [playbackDuration, setPlaybackDuration] = useState(5); // Duration in seconds
  const [playbackProgress, setPlaybackProgress] = useState(0);
  const [savedCells, setSavedCells] = useState<IJK[]>([]);
  const playbackTimerRef = useRef<number | null>(null);
  const playbackStartTime = useRef<number>(0);
  
  // Environment settings - load from localStorage or use defaults
  const [settings, setSettings] = useState<StudioSettings>(() => {
    try {
      const savedSettings = localStorage.getItem(STORAGE_KEY_SETTINGS);
      if (savedSettings) {
        const parsed = JSON.parse(savedSettings);
        console.log('✅ Loaded saved environment settings from localStorage');
        return parsed;
      }
    } catch (error) {
      console.error('❌ Failed to load saved settings:', error);
    }
    return DEFAULT_STUDIO_SETTINGS;
  });
  
  // UI state
  const [showSaveModal, setShowSaveModal] = useState(false);
  const [showMovieModal, setShowMovieModal] = useState(false);
  const [showShareModal, setShowShareModal] = useState(false);
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [showInfoModal, setShowInfoModal] = useState(false);
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [savedPuzzleData, setSavedPuzzleData] = useState<{id: string, name: string, sphereCount: number} | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [isRecordingReady, setIsRecordingReady] = useState(false);
  const [hasRecorded, setHasRecorded] = useState(false);
  const [puzzleUrl, setPuzzleUrl] = useState<string>('');
  
  // Refs
  const cellsRef = useRef<IJK[]>(cells);
  const pillbarRef = useRef<HTMLDivElement>(null);
  const creationStartTime = useRef(Date.now());
  const recordingServiceRef = useRef<any>(null);
  
  useEffect(() => {
    cellsRef.current = cells;
  }, [cells]);

  // Persist settings to localStorage whenever they change
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY_SETTINGS, JSON.stringify(settings));
      console.log('💾 Environment settings saved to localStorage');
    } catch (error) {
      console.error('❌ Failed to save settings:', error);
    }
  }, [settings]);

  // Playback engine - replays actions evenly over duration
  useEffect(() => {
    if (!isPlaying || pageMode !== 'playback' || actions.length === 0) {
      return;
    }

    console.log(`▶️ Starting playback: ${actions.length} actions over ${playbackDuration}s`);
    playbackStartTime.current = Date.now();
    
    // Calculate delay: divide duration by (actions + 1) to include time to show final state
    // This ensures the last action is visible for the same duration as others
    const delayBetweenActions = (playbackDuration * 1000) / (actions.length + 1);
    console.log(`⏱️ Delay between actions: ${delayBetweenActions.toFixed(0)}ms (${actions.length + 1} intervals)`);
    
    // Start from beginning
    let currentActionIndex = 0;
    setCells([{ i: 0, j: 0, k: 0 }]);
    
    const playNextAction = () => {
      if (!isPlaying) {
        console.log('⏸️ Playback paused');
        return;
      }
      
      if (currentActionIndex >= actions.length) {
        // All actions applied, show final state for remaining duration
        console.log('✅ All actions applied, showing final state');
        setCells(savedCells);
        setPlaybackProgress(100);
        
        // Wait one more interval before completing
        playbackTimerRef.current = window.setTimeout(() => {
          console.log('✅ Playback complete');
          setIsPlaying(false);
        }, delayBetweenActions);
        return;
      }
      
      const action = actions[currentActionIndex];
      
      // Apply the action
      if (action.stateAfter) {
        setCells(action.stateAfter);
        console.log(`⏩ Action ${currentActionIndex + 1}/${actions.length}: ${action.type}`);
      }
      
      // Update progress
      const progress = ((currentActionIndex + 1) / (actions.length + 1)) * 100;
      setPlaybackProgress(progress);
      
      currentActionIndex++;
      
      // Schedule next action with evenly distributed timing
      playbackTimerRef.current = window.setTimeout(playNextAction, delayBetweenActions);
    };
    
    // Start playback
    playNextAction();
    
    // Cleanup on unmount or when playback stops
    return () => {
      if (playbackTimerRef.current) {
        clearTimeout(playbackTimerRef.current);
        playbackTimerRef.current = null;
      }
    };
  }, [isPlaying, playbackDuration, pageMode, actions, savedCells]);

  // Initialize view transforms ONCE on mount - never recompute during editing
  // This ensures camera position stays under user control
  useEffect(() => {
    const T_ijk_to_xyz = [
      [0.5, 0.5, 0, 0],
      [0.5, 0, 0.5, 0],
      [0, 0.5, 0.5, 0],
      [0, 0, 0, 1]
    ];

    try {
      const v = computeViewTransforms([{ i: 0, j: 0, k: 0 }], ijkToXyz, T_ijk_to_xyz, quickHullWithCoplanarMerge);
      setView(v);
      console.log("✅ Initial view transforms computed");
    } catch (error) {
      console.error("❌ Failed to compute initial view transforms:", error);
      // Fallback - use identity transform
      setView({
        M_world: [
          [1, 0, 0, 0],
          [0, 1, 0, 0],
          [0, 0, 1, 0],
          [0, 0, 0, 1]
        ]
      });
    }
  }, []); // Empty deps - only run once on mount

  const handleCellsChange = (newCells: IJK[]) => {
    // Prevent deleting the last sphere
    if (newCells.length === 0) {
      console.log('⚠️ Cannot delete the last sphere - at least one sphere is required');
      return;
    }
    
    // Mark as editing operation to prevent camera repositioning
    if ((window as any).setEditingFlag) {
      (window as any).setEditingFlag(true);
    }
    
    // Track the action for movie generation
    if (newCells.length > cells.length) {
      const addedCount = newCells.length - cells.length;
      trackAction('ADD_SPHERE', { count: addedCount, cells: newCells });
      console.log(`➕ Added ${addedCount} sphere(s)`);
    } else if (newCells.length < cells.length) {
      const removedCount = cells.length - newCells.length;
      trackAction('REMOVE_SPHERE', { count: removedCount, cells: newCells });
      console.log(`➖ Removed ${removedCount} sphere(s)`);
    }
    
    setCells(newCells);
  };
  
  const handleUndo = () => {
    undo(); // Use action tracker's undo which includes tracking
    
    // Mark as editing operation
    if ((window as any).setEditingFlag) {
      (window as any).setEditingFlag(true);
    }
  };
  
  const onSave = () => {
    console.log(`💾 Preparing to save puzzle with ${actions.length} tracked actions`);
    setShowSaveModal(true);
  };

  const handleNewPuzzle = () => {
    // Reset to initial state immediately
    trackAction('CLEAR_ALL', { reason: 'new_puzzle' });
    setCells([{ i: 0, j: 0, k: 0 }]);
    clearHistory();
    setPageMode('edit');
    setIsPlaying(false);
    setPlaybackProgress(0);
    setHasRecorded(false);
    setIsRecordingReady(false);
    setPuzzleUrl('');
    creationStartTime.current = Date.now();
    console.log('🆕 New puzzle started - returning to edit mode');
  };

  const handleSavePuzzle = async (metadata: {
    name: string;
    creatorName: string;
    description?: string;
    challengeMessage?: string;
    visibility: 'public' | 'private';
  }) => {
    setIsSaving(true);
    try {
      console.log('💾 Saving puzzle to Supabase...');
      
      // Step 1: Create shape_id from geometry
      const geometryString = JSON.stringify(cells.map((p: any) => [p.i, p.j, p.k]).sort());
      const shapeId = `shape_${btoa(geometryString).substring(0, 16)}`;
      console.log('🔑 Generated shape_id:', shapeId);
      
      // Step 2: Ensure shape exists in contracts_shapes
      const { data: existingShape, error: checkError } = await supabase
        .from('contracts_shapes')
        .select('id')
        .eq('id', shapeId)
        .single();
      
      if (!existingShape && (!checkError || checkError.code === 'PGRST116')) {
        console.log('➕ Creating shape in contracts_shapes...');
        const { error: shapeError } = await supabase
          .from('contracts_shapes')
          .insert({
            id: shapeId,
            lattice: 'fcc',  // Face-centered cubic lattice
            cells: cells,
            size: cells.length
          });
        
        if (shapeError) {
          console.error('❌ Failed to create shape:', shapeError);
          throw new Error(`Failed to create shape: ${shapeError.message}`);
        }
        console.log('✅ Shape created');
      } else {
        console.log('✅ Shape already exists');
      }
      
      const puzzleData = {
        shape_id: shapeId,
        name: metadata.name,
        creator_name: metadata.creatorName,
        description: metadata.description || null,
        challenge_message: metadata.challengeMessage || null,
        visibility: metadata.visibility,
        geometry: cells, // Array of IJK coordinates
        actions: actions, // Full action history with timestamps
        preset_config: settings, // Environment settings for replay
        sphere_count: cells.length,
        creation_time_ms: Date.now() - creationStartTime.current
      };
      
      // Step 3: Insert puzzle into Supabase
      const { data, error } = await supabase
        .from('puzzles')
        .insert([puzzleData])
        .select()
        .single();
      
      if (error) {
        console.error('Supabase error:', error);
        throw new Error(`Failed to save puzzle: ${error.message}`);
      }
      
      if (!data) {
        throw new Error('No data returned from Supabase');
      }
      
      console.log('✅ Puzzle saved!', data);
      
      // Generate puzzle URL with real ID
      const puzzleUrl = `${window.location.origin}/solve/${data.id}`;
      setPuzzleUrl(puzzleUrl);
      console.log('🔗 Puzzle URL:', puzzleUrl);
      
      // Save final cells state
      setSavedCells([...cells]);
      
      // Store puzzle data for success modal
      setSavedPuzzleData({
        id: data.id,
        name: metadata.name,
        sphereCount: cells.length
      });
      
      // Close save modal and show success modal
      setShowSaveModal(false);
      setShowSuccessModal(true);
      
    } catch (error) {
      console.error('❌ Failed to save puzzle:', error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
      alert(`Failed to save puzzle: ${errorMessage}\n\nPlease check your internet connection and try again.`);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="content-studio-page" style={{ 
      height: '100vh', 
      width: '100vw', 
      display: 'flex', 
      flexDirection: 'column',
      overflow: 'hidden',
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      background: 'linear-gradient(to bottom, #0a0a0a 0%, #000000 100%)'
    }}>
      {/* Compact Header */}
      <div className="shape-header">
        {/* Left: Title (fixed) */}
        <div className="header-left">
          <h1 style={{
            margin: 0,
            fontSize: '1.25rem',
            fontWeight: 600,
            color: 'white',
            letterSpacing: '-0.01em'
          }}>
            Create a Puzzle
          </h1>
        </div>

        {/* Center: Scrolling action pills */}
        <div className="header-center" ref={pillbarRef}>
          <button
            className="pill pill--ghost"
            onClick={handleNewPuzzle}
            title="Start a new puzzle from scratch"
          >
            🆕 New Puzzle
          </button>
          {/* Edit Mode Buttons */}
          {pageMode === 'edit' && (
            <>
              <button
                className={`pill ${editMode === "add" ? "pill--primary" : "pill--ghost"}`}
                onClick={() => setEditMode("add")}
                title="Add cells"
              >
                Add
              </button>
              <button
                className={`pill ${editMode === "remove" ? "pill--primary" : "pill--ghost"}`}
                onClick={() => setEditMode("remove")}
                title="Remove cells"
              >
                Remove
              </button>
            </>
          )}

          {/* Playback Mode Buttons */}
          {pageMode === 'playback' && (
            <>
              <button
                className={`pill ${isPlaying ? "pill--primary" : "pill--ghost"}`}
                onClick={async () => {
                  if (!isPlaying && isRecordingReady) {
                    // Initialize and start recording when play is pressed
                    const canvas = document.querySelector('canvas');
                    if (canvas) {
                      try {
                        const recordingService = new RecordingService();
                        recordingServiceRef.current = recordingService;
                        
                        await recordingService.initialize(canvas, {
                          quality: 'medium',
                          filename: `creation_${new Date().toISOString().slice(0, 10)}`
                        });
                        await recordingService.startRecording();
                        
                        setIsRecording(true);
                        setIsRecordingReady(false);
                        console.log('🎬 Recording started!');
                        
                        // Auto-stop after duration
                        setTimeout(async () => {
                          await recordingService.stopRecording();
                          recordingServiceRef.current = null;
                          setIsRecording(false);
                          setHasRecorded(true);
                          console.log('✅ Recording complete! Staying in playback mode.');
                        }, playbackDuration * 1000);
                      } catch (error) {
                        console.error('Failed to start recording:', error);
                        alert('Failed to start recording. Please try again.');
                        setIsRecordingReady(false);
                        return;
                      }
                    }
                  }
                  setIsPlaying(!isPlaying);
                }}
                title={isPlaying ? "Pause" : isRecordingReady ? "Play & Start Recording" : "Play"}
              >
                {isPlaying ? '⏸️' : '▶️'} {isPlaying ? 'Pause' : 'Play'}
              </button>
              <button
                className="pill pill--ghost"
                onClick={() => { 
                  setIsPlaying(false); 
                  setPlaybackProgress(0);
                  setCells([{ i: 0, j: 0, k: 0 }]);
                  if (playbackTimerRef.current) {
                    clearTimeout(playbackTimerRef.current);
                    playbackTimerRef.current = null;
                  }
                  console.log('⏹️ Playback stopped and reset');
                }}
                title="Stop and reset to beginning"
              >
                ⏹️ Stop
              </button>
            </>
          )}

          {/* Undo and Save - only in edit mode */}
          {pageMode === 'edit' && (
            <>
              <button
                className="pill pill--ghost"
                onClick={handleUndo}
                disabled={!canUndo}
                title={canUndo ? `Undo last action (${actions.length} total actions tracked)` : "No actions to undo"}
              >
                Undo
              </button>
              <button
                className="pill pill--primary"
                onClick={onSave}
                disabled={cells.length % 4 !== 0}
                title={cells.length % 4 === 0 ? "Save puzzle" : `Need ${4 - (cells.length % 4)} more cells`}
              >
                Save
              </button>
            </>
          )}

          {/* Record button - only in playback mode */}
          {pageMode === 'playback' && (
            <button
              className="pill pill--ghost"
              onClick={() => {
                if (!isRecording) {
                  if (hasRecorded) {
                    // Reset recording state to allow re-recording
                    setHasRecorded(false);
                    setIsRecordingReady(false);
                  }
                  setShowMovieModal(true);
                }
              }}
              disabled={isRecording}
              title={
                hasRecorded 
                  ? "Click to record again" 
                  : isRecordingReady 
                  ? "Recording ready - press Play to start" 
                  : isRecording
                  ? "Recording in progress"
                  : "Record creation movie"
              }
              style={{ 
                background: isRecording 
                  ? '#dc3545'
                  : isRecordingReady 
                  ? '#28a745'
                  : hasRecorded
                  ? '#6c757d'
                  : '#dc3545',
                color: 'white',
                cursor: isRecording ? 'default' : isRecordingReady ? 'default' : 'pointer',
                opacity: hasRecorded ? 0.7 : 1,
                animation: isRecording ? 'recordPulse 1.5s infinite' : 'none'
              }}
            >
              {isRecording ? '⬤ Recording' : isRecordingReady ? '✓ Ready' : '⬤ Record'}
            </button>
          )}
          
          {/* Share button - appears after recording */}
          {pageMode === 'playback' && hasRecorded && (
            <button
              className="pill pill--primary"
              onClick={() => setShowShareModal(true)}
              title="Share your puzzle"
            >
              📤 Share
            </button>
          )}
        </div>

        {/* Right: Settings + Info (fixed) */}
        <div className="header-right">
          <button
            className="pill pill--ghost"
            onClick={() => setShowSettingsModal(true)}
            title="Environment Settings"
          >
            ⚙️
          </button>
          <button
            className="pill pill--chrome"
            onClick={() => setShowInfoModal(true)}
            title="About this page"
          >
            ℹ
          </button>
          
          <button
            className="pill pill--chrome"
            onClick={() => navigate('/gallery')}
            title="Back to Gallery"
            style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
          >
            <span style={{ fontSize: '1.1rem' }}>⊞</span>
            <span>Gallery</span>
          </button>
        </div>
      </div>

      {/* Main Content */}
      <div className="canvas-wrap" style={{ flex: 1, position: 'relative', overflow: 'hidden' }}>
        {view && (
          <>
            {/* ShapeEditorCanvas with full settings support */}
            <ShapeEditorCanvas
              cells={cells}
              view={view}
              mode={editMode}
              editEnabled={pageMode === 'edit'}
              onCellsChange={handleCellsChange}
              settings={settings}
            />
            
            {/* On-canvas Cell Count Overlay - Enhanced */}
            <div style={{
              position: 'absolute',
              top: '20px',
              right: '20px',
              background: pageMode === 'edit' && cells.length % 4 === 0 
                ? '#22c55e'
                : pageMode === 'playback'
                ? '#9c27b0'
                : '#3b82f6',
              border: pageMode === 'edit' && cells.length % 4 === 0
                ? '2px solid #16a34a'
                : pageMode === 'playback'
                ? '2px solid #7b1fa2'
                : '2px solid #2563eb',
              borderRadius: '12px',
              padding: '12px 20px',
              color: 'white',
              fontSize: '14px',
              fontWeight: 500,
              zIndex: 10,
              display: 'flex',
              flexDirection: 'column',
              gap: '4px',
              boxShadow: '0 4px 16px rgba(0,0,0,0.4)',
              transition: 'all 0.3s ease'
            }}>
              <div style={{ fontSize: '16px', fontWeight: 600 }}>
                {cells.length} {cells.length === 1 ? 'Sphere' : 'Spheres'}
              </div>
              
              {/* Edit mode info */}
              {pageMode === 'edit' && (
                <>
                  <div style={{ 
                    color: 'rgba(255,255,255,0.9)', 
                    fontSize: '11px'
                  }}>
                    🎬 {actions.length} {actions.length === 1 ? 'action' : 'actions'} tracked
                  </div>
                  {cells.length % 4 === 0 && (
                    <div style={{ 
                      color: 'rgba(255,255,255,1)', 
                      fontSize: '12px',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '4px',
                      fontWeight: 600
                    }}>
                      <span>✓</span> Ready to save
                    </div>
                  )}
                  {cells.length % 4 !== 0 && (
                    <div style={{ 
                      color: 'rgba(255,255,255,0.9)', 
                      fontSize: '11px'
                    }}>
                      Need {4 - (cells.length % 4)} more
                    </div>
                  )}
                </>
              )}
              
              {/* Playback mode info */}
              {pageMode === 'playback' && (
                <>
                  <div style={{ 
                    color: 'rgba(255,255,255,0.9)', 
                    fontSize: '11px'
                  }}>
                    {isRecording ? '🎬 Recording' : isPlaying ? '▶️ Playing' : hasRecorded ? '✓ Complete' : '⏸️ Paused'}
                  </div>
                  <div style={{ 
                    color: 'rgba(255,255,255,1)', 
                    fontSize: '12px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px',
                    fontWeight: 600
                  }}>
                    Progress: {Math.round(playbackProgress)}%
                  </div>
                </>
              )}
            </div>
          </>
        )}
      </div>

      {/* Recording Animation Styles */}
      <style>{`
        @keyframes recordPulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.8; }
        }
      `}</style>

      {/* Save Puzzle Modal */}
      {showSaveModal && (
        <SavePuzzleModal
          onSave={handleSavePuzzle}
          onCancel={() => setShowSaveModal(false)}
          isSaving={isSaving}
          puzzleStats={{
            sphereCount: cells.length,
            creationTimeMs: Date.now() - creationStartTime.current
          }}
        />
      )}

      {/* Creation Movie Modal */}
      <CreationMovieModal
        isOpen={showMovieModal}
        onClose={() => setShowMovieModal(false)}
        onRecordingReady={(duration: number) => {
          setIsRecordingReady(true);
          setPlaybackDuration(duration); // Set the chosen duration
          console.log(`✓ Recording ready! Duration: ${duration}s. Press Play to start.`);
        }}
        actions={actions}
        cells={cells}
        creationTimeMs={Date.now() - creationStartTime.current}
      />

      {/* Share Modal */}
      <ShareModal
        isOpen={showShareModal}
        onClose={() => setShowShareModal(false)}
        puzzleUrl={puzzleUrl}
        puzzleName="My Awesome Puzzle"
      />

      {/* Puzzle Saved Success Modal */}
      {savedPuzzleData && (
        <PuzzleSavedModal
          isOpen={showSuccessModal}
          onClose={() => setShowSuccessModal(false)}
          puzzleName={savedPuzzleData.name}
          puzzleId={savedPuzzleData.id}
          sphereCount={savedPuzzleData.sphereCount}
          onViewInGallery={() => {
            navigate('/gallery');
          }}
          onSolvePuzzle={() => {
            navigate(`/solve/${savedPuzzleData.id}`);
          }}
          onCreateAnother={() => {
            // Reset to create another puzzle
            setShowSuccessModal(false);
            setSavedPuzzleData(null);
            setCells([{ i: 0, j: 0, k: 0 }]);
            setSavedCells([]);
            setPuzzleUrl('');
            clearHistory();
            creationStartTime.current = Date.now();
            setPageMode('edit');
          }}
        />
      )}

      {/* Settings Modal */}
      {showSettingsModal && (
        <SettingsModal
          settings={settings}
          onSettingsChange={setSettings}
          onClose={() => setShowSettingsModal(false)}
        />
      )}

      {/* Info Modal */}
      <InfoModal
        isOpen={showInfoModal}
        title="About Create Mode"
        onClose={() => setShowInfoModal(false)}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', fontSize: '0.95rem' }}>
          <p style={{ margin: 0, fontWeight: 600, color: '#3b82f6' }}>📝 EDIT MODE</p>
          <p style={{ margin: 0 }}><strong>New Puzzle</strong> — Start fresh with a single sphere</p>
          <p style={{ margin: 0 }}><strong>Add</strong> — Double-click ghost spheres to add cells</p>
          <p style={{ margin: 0 }}><strong>Remove</strong> — Double-click existing cells to remove them</p>
          <p style={{ margin: 0 }}><strong>Undo</strong> — Revert your last change</p>
          <p style={{ margin: 0 }}><strong>Save</strong> — Publish your puzzle (multiple of 4 cells required)</p>
          
          <p style={{ margin: '1rem 0 0 0', fontWeight: 600, color: '#9c27b0' }}>▶️ PLAYBACK MODE</p>
          <p style={{ margin: 0 }}>After saving, watch your creation process animated!</p>
          <p style={{ margin: 0 }}><strong>Play/Pause</strong> — Control animation playback</p>
          <p style={{ margin: 0 }}><strong>Stop</strong> — Reset to beginning</p>
          <p style={{ margin: 0 }}><strong>Record</strong> — Set duration (default 5s), then press Play to record</p>
          <p style={{ margin: 0 }}><strong>Re-record</strong> — Click grayed-out Record button to record again</p>
          <p style={{ margin: 0 }}><strong>Share</strong> — Appears after recording completes</p>
          
          <p style={{ margin: '1rem 0 0 0' }}><strong>Settings ⚙️</strong> — Customize environment - <em>auto-saved</em></p>
          <div style={{ 
            marginTop: '1rem', 
            padding: '0.75rem', 
            background: '#f0f9ff', 
            borderLeft: '3px solid #2196F3',
            borderRadius: '4px',
            fontSize: '0.875rem',
            color: '#1e40af'
          }}>
            💾 <strong>Auto-Save:</strong> Your environment settings (materials, lights, HDR) are automatically saved and restored next time you visit!
          </div>
          <div style={{ 
            marginTop: '0.5rem', 
            padding: '0.75rem', 
            background: '#f0f9ff', 
            borderLeft: '3px solid #2196F3',
            borderRadius: '4px',
            fontSize: '0.875rem',
            color: '#1e40af'
          }}>
            🎬 <strong>Creation Movies:</strong> Every action is tracked with timestamps. After saving, create a high-quality video with adjustable duration (5-30s), quality settings, and aspect ratio (landscape, square, or portrait for social media)!
          </div>
        </div>
      </InfoModal>
    </div>
  );
};

export default CreatePage;
