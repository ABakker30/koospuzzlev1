// Solve Page - Manual and Auto solving for puzzles loaded by ID
import { useState, useRef, useEffect } from "react";
import { useNavigate, useParams } from "react-router-dom";
import type { IJK } from "../../types/shape";
import type { VisibilitySettings } from "../../types/lattice";
import { ijkToXyz } from "../../lib/ijk";
import SceneCanvas from "../../components/SceneCanvas";
import { computeViewTransforms, type ViewTransforms } from "../../services/ViewTransforms";
import { quickHullWithCoplanarMerge } from "../../lib/quickhull-adapter";
import { InfoModal } from "../../components/InfoModal";
import { usePuzzleLoader } from "./hooks/usePuzzleLoader";
import { SolveStats } from "./components/SolveStats";
import "../../styles/shape.css";

function SolvePage() {
  const navigate = useNavigate();
  const { id: puzzleId } = useParams<{ id: string }>();
  
  // Load puzzle from Supabase
  const { puzzle, loading, error } = usePuzzleLoader(puzzleId);
  
  // Shape state
  const [cells, setCells] = useState<IJK[]>([]);
  const [view, setView] = useState<ViewTransforms | null>(null);
  const [loaded, setLoaded] = useState(false);
  
  // Solving state
  const [moveCount, setMoveCount] = useState(0);
  const [isStarted, setIsStarted] = useState(false);
  
  // Manual puzzle solving state
  const [placedPieces] = useState<any[]>([]); // Will be implemented in Sprint 2
  const [anchor] = useState<IJK | null>(null);
  const [previewOffsets] = useState<IJK[] | null>(null);
  
  // Fixed visibility settings
  const visibility: VisibilitySettings = {
    xray: false,
    emptyOnly: false,
    sliceY: { center: 0.5, thickness: 1.0 }
  };
  
  // UI state
  const [showInfoModal, setShowInfoModal] = useState(false);
  const [showAutoSolve, setShowAutoSolve] = useState(false); // For Phase 2 Sprint 3
  
  // Refs
  const cellsRef = useRef<IJK[]>(cells);
  useEffect(() => {
    cellsRef.current = cells;
  }, [cells]);

  // Load puzzle when data arrives
  useEffect(() => {
    if (!puzzle) return;
    
    console.log('📥 Loading puzzle for solving:', puzzle.name);
    console.log('📊 Puzzle geometry:', puzzle.geometry.length, 'spheres');
    
    // Set cells from puzzle geometry
    const newCells = puzzle.geometry;
    setCells(newCells);
    
    // Compute view transforms for orientation
    const T_ijk_to_xyz = [
      [0.5, 0.5, 0, 0],
      [0.5, 0, 0.5, 0],
      [0, 0.5, 0.5, 0],
      [0, 0, 0, 1]
    ];
    
    try {
      const v = computeViewTransforms(newCells, ijkToXyz, T_ijk_to_xyz, quickHullWithCoplanarMerge);
      setView(v);
      console.log('✅ View transforms computed');
      
      // Set OrbitControls target
      setTimeout(() => {
        if ((window as any).setOrbitTarget && v) {
          const M = v.M_world;
          let minX = Infinity, maxX = -Infinity;
          let minY = Infinity, maxY = -Infinity;
          let minZ = Infinity, maxZ = -Infinity;
          
          for (const cell of newCells) {
            const x = M[0][0] * cell.i + M[0][1] * cell.j + M[0][2] * cell.k + M[0][3];
            const y = M[1][0] * cell.i + M[1][1] * cell.j + M[1][2] * cell.k + M[1][3];
            const z = M[2][0] * cell.i + M[2][1] * cell.j + M[2][2] * cell.k + M[2][3];
            
            minX = Math.min(minX, x); maxX = Math.max(maxX, x);
            minY = Math.min(minY, y); maxY = Math.max(maxY, y);
            minZ = Math.min(minZ, z); maxZ = Math.max(maxZ, z);
          }
          
          const center = {
            x: (minX + maxX) / 2,
            y: (minY + maxY) / 2,
            z: (minZ + maxZ) / 2
          };
          
          (window as any).setOrbitTarget(center);
        }
      }, 100);
    } catch (error) {
      console.error('❌ Failed to compute view transforms:', error);
    }
    
    setLoaded(true);
  }, [puzzle]);

  // TODO Sprint 2: Implement full manual solving logic
  // - Piece placement with gold orientations
  // - Fit finding
  // - Undo/redo
  // - Completion detection
  // - Solution saving

  // Loading state
  if (loading) {
    return (
      <div style={{
        height: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: '#000',
        color: '#fff',
        flexDirection: 'column',
        gap: '1rem'
      }}>
        <div style={{ fontSize: '3rem' }}>🧩</div>
        <div style={{ fontSize: '1.5rem', fontWeight: 600 }}>Loading puzzle...</div>
      </div>
    );
  }

  // Error state
  if (error || !puzzle) {
    return (
      <div style={{
        height: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: '#000',
        color: '#fff',
        flexDirection: 'column',
        gap: '1rem'
      }}>
        <div style={{ fontSize: '3rem' }}>❌</div>
        <div style={{ fontSize: '1.5rem', fontWeight: 600 }}>Puzzle not found</div>
        <div style={{ color: 'rgba(255,255,255,0.6)' }}>{error || 'Invalid puzzle ID'}</div>
        <button
          onClick={() => navigate('/')}
          style={{
            marginTop: '1rem',
            padding: '0.75rem 1.5rem',
            fontSize: '1rem',
            background: '#2196F3',
            color: '#fff',
            border: 'none',
            borderRadius: '8px',
            cursor: 'pointer'
          }}
        >
          Go Home
        </button>
      </div>
    );
  }

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
      background: '#000'
    }}>
      {/* Header */}
      <div className="shape-header">
        {/* Left: Home */}
        <div className="header-left">
          <button
            className="pill pill--chrome"
            onClick={() => navigate('/')}
            title="Home"
          >
            ⌂
          </button>
        </div>

        {/* Center: Puzzle Info & Controls */}
        <div className="header-center">
          <div style={{
            padding: '0.5rem 1rem',
            background: 'rgba(255,255,255,0.1)',
            borderRadius: '8px',
            color: '#fff',
            fontSize: '0.9rem',
            fontWeight: 600
          }}>
            {puzzle.name}
            <span style={{ 
              marginLeft: '8px', 
              color: 'rgba(255,255,255,0.6)',
              fontSize: '0.85rem',
              fontWeight: 400
            }}>
              by {puzzle.creator_name}
            </span>
          </div>

          {/* Auto-Solve Button - Phase 2 Sprint 3 */}
          <button
            className="pill pill--ghost"
            onClick={() => setShowAutoSolve(!showAutoSolve)}
            title="Toggle auto-solve mode"
            style={{ 
              background: showAutoSolve ? '#4caf50' : 'rgba(255,255,255,0.1)',
              color: '#fff'
            }}
          >
            🤖 {showAutoSolve ? 'Back to Manual' : 'Show Auto-Solve'}
          </button>
        </div>

        {/* Right: Info */}
        <div className="header-right">
          <button
            className="pill pill--chrome"
            onClick={() => setShowInfoModal(true)}
            title="About solving"
          >
            ℹ
          </button>
        </div>
      </div>

      {/* Main Content */}
      <div className="canvas-wrap" style={{ flex: 1, position: 'relative', overflow: 'hidden' }}>
        {loaded && view ? (
          <>
            <SceneCanvas
              cells={cells}
              view={view}
              visibility={visibility}
              editMode={false}
              mode="add"
              onCellsChange={() => {}}
              onHoverCell={() => {}}
              onClickCell={undefined}
              anchor={anchor}
              previewOffsets={previewOffsets}
              placedPieces={placedPieces}
              selectedPieceUid={null}
              onSelectPiece={() => {}}
              containerOpacity={0.45}
              containerColor="#ffffff"
              containerRoughness={0.35}
              puzzleMode="unlimited"
              onCycleOrientation={undefined}
              onPlacePiece={undefined}
              onDeleteSelectedPiece={undefined}
              drawingCells={[]}
              onDrawCell={undefined}
              hidePlacedPieces={false}
              onInteraction={(type: string) => {
                // Start timer on first interaction
                if (!isStarted && type === 'place') {
                  setIsStarted(true);
                  setMoveCount(prev => prev + 1);
                }
              }}
            />
            
            {/* Stats Overlay */}
            <SolveStats
              moveCount={moveCount}
              isStarted={isStarted}
              challengeMessage={puzzle.challenge_message}
            />
          </>
        ) : (
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            height: '100%',
            color: '#fff'
          }}>
            Loading puzzle...
          </div>
        )}
      </div>

      {/* Info Modal */}
      <InfoModal
        isOpen={showInfoModal}
        title="About Solving"
        onClose={() => setShowInfoModal(false)}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', fontSize: '0.95rem' }}>
          <p style={{ margin: 0 }}><strong>Goal</strong> — Recreate the puzzle shape by placing all spheres</p>
          <p style={{ margin: 0 }}><strong>How to Play</strong> — Double-click on ghost spheres to place them</p>
          <p style={{ margin: 0 }}><strong>Timer</strong> — Starts automatically on your first move</p>
          <p style={{ margin: 0 }}><strong>Moves</strong> — Each placement counts as one move</p>
          <p style={{ margin: 0 }}><strong>Auto-Solve</strong> — Click the button to see the algorithm solve it</p>
          
          {puzzle.challenge_message && (
            <div style={{ 
              marginTop: '1rem', 
              padding: '0.75rem', 
              background: '#f0f9ff', 
              borderLeft: '3px solid #2196F3',
              borderRadius: '4px',
              fontSize: '0.875rem',
              color: '#1e40af'
            }}>
              💬 <strong>Creator's Challenge:</strong><br/>
              {puzzle.challenge_message}
            </div>
          )}
        </div>
      </InfoModal>
    </div>
  );
}

export default SolvePage;
