import { useState, useRef, useEffect } from "react";
import { useNavigate, useLocation } from 'react-router-dom';
import type { IJK } from "../../types/shape";
import { ijkToXyz } from "../../lib/ijk";
import ShapeEditorCanvas from "../../components/ShapeEditorCanvas";
import { computeViewTransforms, type ViewTransforms } from "../../services/ViewTransforms";
import { quickHullWithCoplanarMerge } from "../../lib/quickhull-adapter";
import { PresetSelectorModal } from "../../components/PresetSelectorModal";
import type { StudioSettings } from "../../types/studio";
import { DEFAULT_STUDIO_SETTINGS } from "../../types/studio";
import { ENVIRONMENT_PRESETS } from "../../constants/environmentPresets";
import { CreationMovieModal } from "./components/CreationMovieModal";
import SavePuzzleModal from "./components/SavePuzzleModal";
import { ShareModal } from "./components/ShareModal";
import { PuzzleSavedModal } from "./components/PuzzleSavedModal";
import { CreatePuzzleGuideModal } from "../shape-editor/CreatePuzzleGuideModal";
import { RecordingService } from "../../services/RecordingService";
import { supabase } from "../../lib/supabase";
import { canonicalizeShape, computeShapeId } from "../../services/shapeCanonical";
import "../../styles/shape.css";
import "./CreateMode.css";

const STORAGE_KEY_SETTINGS = 'create.environmentSettings';

type PageMode = 'edit' | 'playback';

function CreatePage() {
  const navigate = useNavigate();
  const location = useLocation();
  
  // Check if we're loading an existing puzzle (for re-saving with thumbnail OR editing)
  const loadPuzzle = (location.state as any)?.loadPuzzle;
  const isEditingPuzzle = loadPuzzle?.isEditing === true; // true = create new puzzle from existing, false = re-save existing
  
  // Start with 1 sphere at origin - standard starting point for all shapes
  // Unless we're loading an existing puzzle
  const [cells, setCells] = useState<IJK[]>(loadPuzzle?.cells || [{ i: 0, j: 0, k: 0 }]);
  const [editMode, setEditMode] = useState<"add" | "remove">("add");
  // Only set loadedPuzzleInfo if NOT editing (i.e., re-saving with thumbnail)
  // When editing, we always create a new puzzle
  const [loadedPuzzleInfo, setLoadedPuzzleInfo] = useState<{ id: string; name: string } | null>(
    loadPuzzle && !isEditingPuzzle ? { id: loadPuzzle.id, name: loadPuzzle.name } : null
  );
  const [pageMode, setPageMode] = useState<PageMode>('edit');
  const [view, setView] = useState<ViewTransforms | null>(null);
  
  // Canvas ref for thumbnail capture
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  
  // Playback state (minimal - no action tracking)
  const [isPlaying, setIsPlaying] = useState(false);
  const playbackTimerRef = useRef<number | null>(null);
  
  // Environment settings - load from localStorage or use metallic-light preset as default
  const [settings, setSettings] = useState<StudioSettings>(() => {
    try {
      const savedSettings = localStorage.getItem(STORAGE_KEY_SETTINGS);
      if (savedSettings) {
        const parsed = JSON.parse(savedSettings);
        console.log('✅ Loaded saved environment settings from localStorage');
        // Merge with defaults to ensure new properties exist (like emptyCells)
        return {
          ...DEFAULT_STUDIO_SETTINGS,
          ...parsed,
          emptyCells: parsed.emptyCells || DEFAULT_STUDIO_SETTINGS.emptyCells
        };
      }
    } catch (error) {
      console.error('❌ Failed to load saved settings:', error);
    }
    // Default to metallic-light preset for great initial visuals
    return ENVIRONMENT_PRESETS['metallic-light'];
  });
  
  // UI state
  const [thumbnailBlob, setThumbnailBlob] = useState<Blob | null>(null);
  const [isCapturingThumbnail, setIsCapturingThumbnail] = useState(false);
  const [showSaveModal, setShowSaveModal] = useState(false);
  const [showMovieModal, setShowMovieModal] = useState(false);
  const [showShareModal, setShowShareModal] = useState(false);
  const [showPresetModal, setShowPresetModal] = useState(false);
  const [currentPreset, setCurrentPreset] = useState<string>('metallic-light');
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [savedPuzzleData, setSavedPuzzleData] = useState<{id: string, name: string, sphereCount: number} | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [showGuideModal, setShowGuideModal] = useState(() => {
    try {
      return localStorage.getItem('createPuzzle.guideDismissed') !== 'true';
    } catch {
      return true;
    }
  });
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

  // Playback removed - no action tracking

  // Initialize view transforms ONCE on mount - never recompute during editing
  // This ensures camera position stays under user control
  // When loading a puzzle for editing, use its cells for proper convex hull orientation
  useEffect(() => {
    const T_ijk_to_xyz = [
      [0.5, 0.5, 0, 0],
      [0.5, 0, 0.5, 0],
      [0, 0.5, 0.5, 0],
      [0, 0, 0, 1]
    ];

    try {
      // Use loaded puzzle cells if available, otherwise single origin sphere
      const cellsForTransform = loadPuzzle?.cells && loadPuzzle.cells.length > 0 
        ? loadPuzzle.cells 
        : [{ i: 0, j: 0, k: 0 }];
      
      const v = computeViewTransforms(cellsForTransform, ijkToXyz, T_ijk_to_xyz, quickHullWithCoplanarMerge);
      setView(v);
      console.log("✅ Initial view transforms computed with", cellsForTransform.length, "cells");
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
    
    setCells(newCells);
  };
  
  
  const onSave = async () => {
    console.log('💾 Preparing to save puzzle');
    
    // Capture thumbnail from current canvas view
    if (canvasRef.current) {
      setIsCapturingThumbnail(true);
      try {
        // Wait 2 frames to ensure the scene has rendered
        await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
        
        console.log('📸 Capturing thumbnail from current view...');
        const { captureCanvasScreenshot } = await import('../../services/thumbnailService');
        const blob = await captureCanvasScreenshot(canvasRef.current);
        console.log('✅ Thumbnail captured, size:', (blob.size / 1024).toFixed(2), 'KB');
        setThumbnailBlob(blob);
      } catch (err) {
        console.error('⚠️ Failed to capture thumbnail:', err);
        // Continue without thumbnail
      } finally {
        setIsCapturingThumbnail(false);
      }
    }
    
    // Show save modal
    setShowSaveModal(true);
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
      
      // Step 1: Check if puzzle with same geometry already exists (uniqueness check)
      // Convert IJK cells to the format expected by canonicalizeShape
      const cellsForHash = cells.map(c => [c.i, c.j, c.k] as [number, number, number]);
      const canonicalShape = canonicalizeShape({
        schema: 'koos.shape',
        version: 1,
        lattice: 'fcc',
        cells: cellsForHash
      });
      const shapeHash = await computeShapeId(canonicalShape);
      console.log('🔑 Shape hash:', shapeHash);
      
      // Check if a puzzle with this geometry already exists
      // We compare the canonical cells array
      const { data: existingPuzzles, error: checkError } = await supabase
        .from('puzzles')
        .select('id, name')
        .limit(100); // Get recent puzzles to check
      
      if (!checkError && existingPuzzles) {
        // Check each puzzle's geometry for a match
        for (const existing of existingPuzzles) {
          if (existing.id === loadedPuzzleInfo?.id) continue; // Skip if re-saving same puzzle
          
          // Fetch full puzzle to compare geometry
          const { data: fullPuzzle } = await supabase
            .from('puzzles')
            .select('geometry')
            .eq('id', existing.id)
            .single();
          
          if (fullPuzzle?.geometry) {
            const existingCells = (fullPuzzle.geometry as any[]).map((c: any) => 
              [c.i, c.j, c.k] as [number, number, number]
            );
            const existingCanonical = canonicalizeShape({
              schema: 'koos.shape',
              version: 1,
              lattice: 'fcc',
              cells: existingCells
            });
            const existingHash = await computeShapeId(existingCanonical);
            
            if (existingHash === shapeHash) {
              alert(`This puzzle already exists! It was saved as "${existing.name}". Try modifying the shape to create a unique puzzle.`);
              setIsSaving(false);
              return;
            }
          }
        }
      }
      
      console.log('✅ Puzzle geometry is unique');
      
      // Step 3: Upload already-captured thumbnail
      let thumbnailUrl: string | null = null;
      if (thumbnailBlob) {
        try {
          console.log('📸 Uploading pre-captured thumbnail...');
          // Generate temporary ID for thumbnail
          const tempId = `temp_${Date.now()}`;
          
          // Upload the blob we already captured
          const { uploadThumbnail } = await import('../../services/thumbnailService');
          thumbnailUrl = await uploadThumbnail(thumbnailBlob, tempId);
          console.log('✅ Thumbnail uploaded:', thumbnailUrl);
        } catch (err) {
          console.error('⚠️ Failed to upload thumbnail, continuing without it:', err);
          // Continue saving puzzle even if thumbnail fails
        }
      } else {
        console.warn('⚠️ No thumbnail blob available');
      }
      
      const puzzleData = {
        shape_id: null, // User puzzles don't need shape_id - geometry is in puzzles.geometry
        name: metadata.name,
        creator_name: metadata.creatorName,
        description: metadata.description || null,
        challenge_message: metadata.challengeMessage || null,
        visibility: metadata.visibility,
        geometry: cells, // Array of IJK coordinates
        preset_config: settings, // Environment settings for replay
        sphere_count: cells.length,
        creation_time_ms: Date.now() - creationStartTime.current,
        thumbnail_url: thumbnailUrl
      };
      
      // Step 3: Insert or update puzzle in Supabase
      let data;
      let error;
      
      if (loadedPuzzleInfo) {
        // Update existing puzzle (re-saving with thumbnail)
        console.log('📝 Updating existing puzzle:', loadedPuzzleInfo.id);
        const result = await supabase
          .from('puzzles')
          .update({
            thumbnail_url: thumbnailUrl,
            // Update these fields too in case user changed them
            name: puzzleData.name,
            description: puzzleData.description,
            challenge_message: puzzleData.challenge_message
          })
          .eq('id', loadedPuzzleInfo.id)
          .select()
          .single();
        data = result.data;
        error = result.error;
        
        // Clear loaded puzzle info after saving
        setLoadedPuzzleInfo(null);
      } else {
        // Insert new puzzle
        console.log('➕ Creating new puzzle');
        const result = await supabase
          .from('puzzles')
          .insert([puzzleData])
          .select()
          .single();
        data = result.data;
        error = result.error;
      }
      
      if (error) {
        console.error('Supabase error:', error);
        throw new Error(`Failed to save puzzle: ${error.message}`);
      }
      
      if (!data) {
        throw new Error('No data returned from Supabase');
      }
      
      console.log('✅ Puzzle saved!', data);
      
      // Generate puzzle URL with real ID
      const puzzleUrl = `${window.location.origin}/game/${data.id}?mode=quickplay`;
      setPuzzleUrl(puzzleUrl);
      console.log('🔗 Puzzle URL:', puzzleUrl);
      
      
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
      {/* Top Center: Sphere Counter */}
      <div style={{
        position: 'fixed',
        top: '20px',
        left: '50%',
        transform: 'translateX(-50%)',
        zIndex: 1000
      }}>
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: '16px',
          fontWeight: 600,
          color: '#fff',
          padding: '8px 16px',
          borderRadius: '20px',
          background: 'linear-gradient(135deg, #3b82f6, #2563eb)',
          boxShadow: '0 2px 8px rgba(0, 0, 0, 0.3)',
          border: '1px solid rgba(255, 255, 255, 0.15)',
          transition: 'all 0.2s ease',
          cursor: 'default'
        }}>
          {cells.length} {cells.length === 1 ? 'Sphere' : 'Spheres'}
        </div>
      </div>

      {/* Top Right: Environment & Home Buttons */}
      <div style={{
        position: 'fixed',
        top: '20px',
        right: '20px',
        display: 'flex',
        gap: '8px',
        zIndex: 1000
      }}>
        {/* Environment Button */}
        <button
          className="pill"
          onClick={() => setShowPresetModal(true)}
          title="Environment"
          style={{
            background: 'linear-gradient(135deg, #6366f1, #4f46e5)',
            color: '#fff',
            fontWeight: 700,
            border: 'none',
            fontSize: '22px',
            padding: '8px 12px',
            minWidth: '40px',
            minHeight: '40px',
            borderRadius: '8px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            boxShadow: '0 2px 8px rgba(0, 0, 0, 0.3)',
            transition: 'all 0.2s ease',
            cursor: 'pointer'
          }}
        >
          ⚙️
        </button>
        
        {/* Close Button - Back to Gallery */}
        <button
          className="pill"
          onClick={() => navigate('/gallery')}
          title="Back to Gallery"
          style={{
            background: 'linear-gradient(135deg, #667eea, #764ba2)',
            color: '#fff',
            fontWeight: 700,
            border: 'none',
            fontSize: '22px',
            padding: '8px 12px',
            minWidth: '40px',
            minHeight: '40px',
            borderRadius: '8px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            boxShadow: '0 2px 8px rgba(0, 0, 0, 0.3)',
            transition: 'all 0.2s ease',
            cursor: 'pointer'
          }}
        >
          ✕
        </button>
      </div>

      {/* Bottom Center: Edit Controls */}
      {pageMode === 'edit' && (
        <div style={{
          position: 'fixed',
          bottom: '20px',
          left: '50%',
          transform: 'translateX(-50%)',
          display: 'flex',
          gap: '12px',
          alignItems: 'center',
          zIndex: 1000
        }} ref={pillbarRef}>
          {/* Edit Mode Toggle Button */}
          <button
            className="pill"
            onClick={() => setEditMode(editMode === 'add' ? 'remove' : 'add')}
            title={editMode === 'add' ? 'Switch to Remove Mode' : 'Switch to Add Mode'}
            style={{
              background: editMode === 'add' 
                ? 'linear-gradient(135deg, #10b981, #059669)' 
                : 'linear-gradient(135deg, #ef4444, #dc2626)',
              color: '#fff',
              fontWeight: 700,
              border: '1px solid rgba(255, 255, 255, 0.2)',
              fontSize: '22px',
              padding: '8px 12px',
              minWidth: '48px',
              minHeight: '48px',
              borderRadius: '8px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: '0 4px 12px rgba(0, 0, 0, 0.4)',
              transition: 'all 0.2s ease',
              cursor: 'pointer'
            }}
          >
            {editMode === 'add' ? '+' : '−'}
          </button>

          {/* Save Button */}
          {cells.length % 4 === 0 && (
            <button
              className="pill"
              onClick={onSave}
              title="Save puzzle"
              style={{
                background: 'linear-gradient(135deg, #3b82f6, #2563eb)',
                color: '#fff',
                fontWeight: 700,
                border: '1px solid rgba(255, 255, 255, 0.2)',
                fontSize: '22px',
                padding: '8px 12px',
                minWidth: '48px',
                minHeight: '48px',
                borderRadius: '8px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                boxShadow: '0 4px 12px rgba(0, 0, 0, 0.4)',
                transition: 'all 0.2s ease',
                cursor: 'pointer'
              }}
            >
              💾
            </button>
          )}
        </div>
      )}


      {/* Dev-Only: Re-save Banner */}
      {import.meta.env.DEV && loadedPuzzleInfo && (
        <div style={{
          background: 'linear-gradient(135deg, #FF9800 0%, #F57C00 100%)',
          color: '#fff',
          padding: '12px 20px',
          textAlign: 'center',
          fontSize: '0.95rem',
          fontWeight: 600,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '12px',
          boxShadow: '0 2px 8px rgba(0, 0, 0, 0.3)'
        }}>
          <span style={{ fontSize: '1.3rem' }}>🔄</span>
          <span>Re-saving: <strong>{loadedPuzzleInfo.name}</strong> (Position puzzle and click Save to update thumbnail)</span>
        </div>
      )}

      {/* Canvas - Full Screen */}
      <div className="canvas-wrap" style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0 }}>
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
              onSceneReady={(canvas) => {
                canvasRef.current = canvas;
                console.log('📸 Canvas ready for thumbnail capture');
              }}
              interactionsDisabled={
                showSaveModal || 
                showMovieModal || 
                showShareModal || 
                showPresetModal || 
                showSuccessModal ||
                isCapturingThumbnail
              }
            />
          </>
        )}
      </div>

      {/* Animation Styles */}
      <style>{`
        @keyframes recordPulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.8; }
        }
        @keyframes fadeIn {
          from { opacity: 0; transform: translateX(-50%) translateY(-10px); }
          to { opacity: 1; transform: translateX(-50%) translateY(0); }
        }
      `}</style>

      {/* Thumbnail Capture Indicator */}
      {isCapturingThumbnail && (
        <div style={{
          position: 'fixed',
          top: '100px',
          left: '50%',
          transform: 'translateX(-50%)',
          background: 'rgba(76, 175, 80, 0.95)',
          color: '#fff',
          padding: '16px 32px',
          borderRadius: '12px',
          fontSize: '1.1rem',
          fontWeight: 600,
          zIndex: 9999,
          boxShadow: '0 8px 24px rgba(0, 0, 0, 0.3)',
          display: 'flex',
          alignItems: 'center',
          gap: '12px',
          animation: 'fadeIn 0.3s ease'
        }}>
          <span style={{ fontSize: '1.5rem' }}>📸</span>
          <span>Capturing thumbnail from current view...</span>
        </div>
      )}

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
          initialData={loadedPuzzleInfo ? {
            name: loadedPuzzleInfo.name,
            description: loadPuzzle?.description,
            challengeMessage: loadPuzzle?.challengeMessage
          } : undefined}
        />
      )}

      {/* Creation Movie Modal */}
      <CreationMovieModal
        isOpen={showMovieModal}
        onClose={() => setShowMovieModal(false)}
        onRecordingReady={(duration: number) => {
          setIsRecordingReady(true);
          // Duration set for recording
          console.log(`✓ Recording ready! Duration: ${duration}s. Press Play to start.`);
        }}
        actions={[]}
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
            navigate(`/game/${savedPuzzleData.id}?mode=quickplay`);
          }}
          onCreateAnother={() => {
            // Reset to create another puzzle
            setShowSuccessModal(false);
            setSavedPuzzleData(null);
            setCells([{ i: 0, j: 0, k: 0 }]);
            setPuzzleUrl('');
            creationStartTime.current = Date.now();
            setPageMode('edit');
          }}
        />
      )}

      {/* Preset Selector Modal */}
      <PresetSelectorModal
        isOpen={showPresetModal}
        currentPreset={currentPreset}
        onClose={() => setShowPresetModal(false)}
        onSelectPreset={(presetSettings, presetKey) => {
          setSettings(presetSettings);
          setCurrentPreset(presetKey);
          localStorage.setItem(STORAGE_KEY_SETTINGS, JSON.stringify(presetSettings));
          console.log('✨ Applied preset:', presetKey);
        }}
      />

      {/* Create Puzzle Guide Modal */}
      <CreatePuzzleGuideModal
        isOpen={showGuideModal}
        onClose={() => setShowGuideModal(false)}
        onDontShowAgain={() => {
          try {
            localStorage.setItem('createPuzzle.guideDismissed', 'true');
          } catch {
            // ignore
          }
        }}
      />
    </div>
  );
};

export default CreatePage;
