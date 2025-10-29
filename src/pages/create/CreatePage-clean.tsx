import { useState, useRef, useEffect } from "react";
import type { IJK } from "../../types/shape";
import { ijkToXyz } from "../../lib/ijk";
import ShapeEditorCanvas from "../../components/ShapeEditorCanvas";
import { computeViewTransforms, type ViewTransforms } from "../../services/ViewTransforms";
import { quickHullWithCoplanarMerge } from "../../lib/quickhull-adapter";
import { InfoModal } from "../../components/InfoModal";
import { SettingsModal } from "../../components/SettingsModal";
import type { StudioSettings } from "../../types/studio";
import { DEFAULT_STUDIO_SETTINGS } from "../../types/studio";
import "../../styles/shape.css";
import "./CreateMode.css";

function CreatePage() {
  // Start with 1 sphere at origin - standard starting point for all shapes
  const [cells, setCells] = useState<IJK[]>([{ i: 0, j: 0, k: 0 }]);
  const [mode, setMode] = useState<"add" | "remove">("add");
  const [view, setView] = useState<ViewTransforms | null>(null);
  const [history, setHistory] = useState<IJK[][]>([]);
  
  // Environment settings
  const [settings, setSettings] = useState<StudioSettings>(DEFAULT_STUDIO_SETTINGS);
  
  // UI state
  const [showSaveModal, setShowSaveModal] = useState(false);
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [showInfoModal, setShowInfoModal] = useState(false);
  
  // Refs
  const cellsRef = useRef<IJK[]>(cells);
  const pillbarRef = useRef<HTMLDivElement>(null);
  
  useEffect(() => {
    cellsRef.current = cells;
  }, [cells]);

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
    // Mark as editing operation to prevent camera repositioning
    if ((window as any).setEditingFlag) {
      (window as any).setEditingFlag(true);
    }
    
    // Add current state to history before changing
    if (cells.length > 0) {
      setHistory(prev => [...prev, cells]);
    }
    
    setCells(newCells);
  };
  
  const handleUndo = () => {
    if (history.length === 0) return;
    
    const previousState = history[history.length - 1];
    setHistory(prev => prev.slice(0, -1));
    setCells(previousState);
    
    // Mark as editing operation
    if ((window as any).setEditingFlag) {
      (window as any).setEditingFlag(true);
    }
  };
  
  const onSave = () => {
    setShowSaveModal(true);
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
            className={`pill ${mode === "add" ? "pill--primary" : "pill--ghost"}`}
            onClick={() => setMode("add")}
            title="Add cells"
          >
            Add
          </button>
          <button
            className={`pill ${mode === "remove" ? "pill--primary" : "pill--ghost"}`}
            onClick={() => setMode("remove")}
            title="Remove cells"
          >
            Remove
          </button>
          <button
            className="pill pill--ghost"
            onClick={handleUndo}
            disabled={history.length === 0}
            title={history.length === 0 ? "No history to undo" : `Undo (${history.length} steps available)`}
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
              mode={mode}
              editEnabled={true}
              onCellsChange={handleCellsChange}
              settings={settings}
            />
            
            {/* On-canvas Cell Count Overlay - Enhanced */}
            <div style={{
              position: 'absolute',
              top: '20px',
              right: '20px',
              background: cells.length % 4 === 0 
                ? 'linear-gradient(135deg, rgba(34,197,94,0.15) 0%, rgba(34,197,94,0.25) 100%)'
                : 'linear-gradient(135deg, rgba(59,130,246,0.15) 0%, rgba(59,130,246,0.25) 100%)',
              backdropFilter: 'blur(10px)',
              border: cells.length % 4 === 0
                ? '1px solid rgba(34,197,94,0.3)'
                : '1px solid rgba(59,130,246,0.3)',
              borderRadius: '12px',
              padding: '12px 20px',
              color: 'white',
              fontSize: '14px',
              fontWeight: 500,
              zIndex: 10,
              display: 'flex',
              flexDirection: 'column',
              gap: '4px',
              boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
              transition: 'all 0.3s ease'
            }}>
              <div style={{ fontSize: '16px', fontWeight: 600 }}>
                {cells.length} {cells.length === 1 ? 'Sphere' : 'Spheres'}
              </div>
              {cells.length % 4 === 0 && (
                <div style={{ 
                  color: 'rgba(34,197,94,1)', 
                  fontSize: '12px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px'
                }}>
                  <span>✓</span> Ready to save
                </div>
              )}
              {cells.length % 4 !== 0 && (
                <div style={{ 
                  color: 'rgba(156,163,175,0.9)', 
                  fontSize: '11px'
                }}>
                  Need {4 - (cells.length % 4)} more
                </div>
              )}
            </div>
          </>
        )}
      </div>

      {/* TODO: Add Save Modal with Supabase integration */}
      {showSaveModal && (
        <div style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(0,0,0,0.5)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 2000
        }}>
          <div style={{
            background: '#fff',
            borderRadius: '12px',
            padding: '2rem',
            maxWidth: '500px',
            width: '90%'
          }}>
            <h2>Save Puzzle (Coming Soon)</h2>
            <button onClick={() => setShowSaveModal(false)}>Close</button>
          </div>
        </div>
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
          <p style={{ margin: 0 }}><strong>Add</strong> — Double-click ghost spheres to add cells</p>
          <p style={{ margin: 0 }}><strong>Remove</strong> — Double-click existing cells to remove them</p>
          <p style={{ margin: 0 }}><strong>Undo</strong> — Revert your last change</p>
          <p style={{ margin: 0 }}><strong>Save</strong> — Publish your puzzle (requires multiple of 4 cells)</p>
          <p style={{ margin: 0 }}><strong>Settings ⚙️</strong> — Customize environment (materials, lighting, camera, presets)</p>
        </div>
      </InfoModal>
    </div>
  );
};

export default CreatePage;
