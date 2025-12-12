import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import SceneCanvas from '../../components/SceneCanvas';
import { AutoSolveSlidersPanel } from '../solve/components/AutoSolveSlidersPanel';
import { SolutionInfoModal } from './SolutionInfoModal';
import { getPuzzleSolution, type PuzzleSolutionRecord } from '../../api/solutions';
import { computeViewTransforms, type ViewTransforms } from '../../services/ViewTransforms';
import { ijkToXyz } from '../../lib/ijk';
import { quickHullWithCoplanarMerge } from '../../lib/quickhull-adapter';
import { DEFAULT_STUDIO_SETTINGS, type StudioSettings } from '../../types/studio';
import { supabase } from '../../lib/supabase';
import type { IJK } from '../../types/shape';
import type { PlacedPiece } from '../solve/types/manualSolve';

// Bright settings for analysis view
const ANALYSIS_SETTINGS: StudioSettings = {
  ...DEFAULT_STUDIO_SETTINGS,
  lights: {
    ...DEFAULT_STUDIO_SETTINGS.lights,
    brightness: 2.7,  // Much brighter for analysis
  }
};

// FCC transformation matrix
const T_ijk_to_xyz = [
  [0.5, 0.5, 0, 0],
  [0.5, 0, 0.5, 0],  
  [0, 0.5, 0.5, 0],
  [0, 0, 0, 1]
];

export const AnalyzeSolutionPage: React.FC = () => {
  const { puzzleId } = useParams<{ puzzleId: string }>();
  const navigate = useNavigate();
  
  const [solution, setSolution] = useState<PuzzleSolutionRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  const [cells, setCells] = useState<IJK[]>([]);
  const [view, setView] = useState<ViewTransforms | null>(null);
  const [placedPieces, setPlacedPieces] = useState<PlacedPiece[]>([]);
  const [envSettings, setEnvSettings] = useState<StudioSettings>(ANALYSIS_SETTINGS);
  const [puzzleStats, setPuzzleStats] = useState<{
    cellCount: number;
    createdAt: string;
    creatorName: string;
    totalSolutions: number;
    autoSolveCount: number;
    manualSolveCount: number;
    gamesPlayed: number;
  } | null>(null);
  
  const [revealK, setRevealK] = useState(0);  // Start at 0 like movie pages
  const [revealMax, setRevealMax] = useState(0);  // Start at 0 to show all initially
  const [explosionFactor, setExplosionFactor] = useState(0);
  const [showInfoModal, setShowInfoModal] = useState(false);

  // Load solution data from Supabase
  useEffect(() => {
    const loadSolution = async () => {
      if (!puzzleId) {
        setError('No puzzle ID provided');
        setLoading(false);
        return;
      }

      try {
        setLoading(true);
        console.log('🔍 Loading solution for puzzle:', puzzleId);
        const data = await getPuzzleSolution(puzzleId);
        
        if (!data) {
          console.warn('⚠️ No solution found for puzzle:', puzzleId);
          setError('No solution found for this puzzle');
          setLoading(false);
          return;
        }
        
        console.log('✅ Solution loaded:', {
          id: data.id,
          solver: data.solver_name,
          type: data.solution_type,
          placed_pieces: data.placed_pieces?.length || 0,
          final_geometry: data.final_geometry ? 'present' : 'missing',
          actions: data.actions?.length || 0
        });
        
        // Extract geometry
        const geometry = data.final_geometry as IJK[];
        if (!geometry || geometry.length === 0) {
          setError('Solution has no geometry');
          setLoading(false);
          return;
        }
        
        setCells(geometry);
        
        // Compute view transforms
        let v;
        try {
          v = computeViewTransforms(geometry, ijkToXyz, T_ijk_to_xyz, quickHullWithCoplanarMerge);
          setView(v);
          console.log(`📐 View computed: ${geometry.length} cells`);
        } catch (err) {
          console.error('Failed to compute view:', err);
          setError('Failed to process geometry');
          setLoading(false);
          return;
        }
        
        // Extract placed pieces and sort by lowest Y (centroid)
        const pieces = (data.placed_pieces || []) as PlacedPiece[];
        
        // Sort pieces by lowest Y position (centroid), with more spheres prioritized at same Y
        const sortedPieces = [...pieces].sort((a, b) => {
          // Calculate centroid Y for piece A
          const aCentroidY = a.cells.reduce((sum, cell) => {
            const y = v.M_world[1][0] * cell.i + v.M_world[1][1] * cell.j + v.M_world[1][2] * cell.k + v.M_world[1][3];
            return sum + y;
          }, 0) / a.cells.length;
          
          // Calculate centroid Y for piece B
          const bCentroidY = b.cells.reduce((sum, cell) => {
            const y = v.M_world[1][0] * cell.i + v.M_world[1][1] * cell.j + v.M_world[1][2] * cell.k + v.M_world[1][3];
            return sum + y;
          }, 0) / b.cells.length;
          
          // Primary sort: lowest Y first
          const yDiff = aCentroidY - bCentroidY;
          if (Math.abs(yDiff) > 0.01) return yDiff;
          
          // Secondary sort: more spheres first (at same Y level)
          return b.cells.length - a.cells.length;
        });
        
        setPlacedPieces(sortedPieces);
        
        // Set up reveal slider to show all pieces by default
        setRevealMax(sortedPieces.length);
        setRevealK(sortedPieces.length);
        console.log(`🧩 Loaded ${sortedPieces.length} placed pieces, sorted by lowest Y, revealing all`);
        
        // Debug: Log first piece structure
        if (pieces.length > 0) {
          console.log('🔍 First piece structure:', {
            keys: Object.keys(pieces[0]),
            sample: pieces[0],
            hasCells: !!pieces[0].cells,
            hasUid: !!pieces[0].uid,
            cellsLength: pieces[0].cells?.length
          });
        }
        
        setSolution(data);
        
        // Try to load movie settings for this puzzle (optional)
        try {
          const { data: movieData } = await supabase
            .from('movies')
            .select('credits_config')
            .eq('puzzle_id', puzzleId)
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle();
          
          if (movieData?.credits_config?.scene_settings) {
            const sceneSettings = movieData.credits_config.scene_settings as StudioSettings;
            // Ensure brightness is reasonable for analysis
            const adjustedSettings = {
              ...sceneSettings,
              lights: {
                ...sceneSettings.lights,
                brightness: Math.max(sceneSettings.lights.brightness, 2.0), // At least 2.0
              }
            };
            setEnvSettings(adjustedSettings);
            console.log('🎨 Loaded movie scene settings with brightness:', adjustedSettings.lights.brightness);
          } else {
            console.log('📌 No movie settings found, using default analysis settings');
          }
        } catch (movieErr) {
          console.log('⚠️ Could not load movie settings, using defaults:', movieErr);
        }
        
        // Fetch puzzle statistics
        try {
          // Get puzzle info
          const { data: puzzleData } = await supabase
            .from('puzzles')
            .select('creator_name, created_at')
            .eq('id', puzzleId)
            .single();
          
          // Count total solutions
          const { count: totalCount } = await supabase
            .from('solutions')
            .select('*', { count: 'exact', head: true })
            .eq('puzzle_id', puzzleId);
          
          // Count auto-solved
          const { count: autoCount } = await supabase
            .from('solutions')
            .select('*', { count: 'exact', head: true })
            .eq('puzzle_id', puzzleId)
            .eq('solution_type', 'auto');
          
          // Count manual
          const { count: manualCount } = await supabase
            .from('solutions')
            .select('*', { count: 'exact', head: true })
            .eq('puzzle_id', puzzleId)
            .eq('solution_type', 'manual');
          
          // Count games played
          const { count: gamesCount } = await supabase
            .from('game_sessions')
            .select('*', { count: 'exact', head: true })
            .eq('puzzle_id', puzzleId);
          
          setPuzzleStats({
            cellCount: geometry.length,
            createdAt: puzzleData?.created_at || '',
            creatorName: puzzleData?.creator_name || 'Unknown',
            totalSolutions: totalCount || 0,
            autoSolveCount: autoCount || 0,
            manualSolveCount: manualCount || 0,
            gamesPlayed: gamesCount || 0,
          });
          
          console.log('📊 Loaded puzzle stats:', {
            cells: geometry.length,
            solutions: totalCount,
            games: gamesCount
          });
        } catch (statsErr) {
          console.log('⚠️ Could not load puzzle stats:', statsErr);
        }
        
        setLoading(false);
      } catch (err) {
        console.error('❌ Failed to load solution:', err);
        const errorMessage = err instanceof Error ? err.message : 'Unknown error';
        setError(`Failed to load solution: ${errorMessage}`);
        setLoading(false);
      }
    };

    loadSolution();
  }, [puzzleId]);

  const handleBackToGallery = () => {
    navigate('/gallery?tab=movies');
  };
  
  // Get visible pieces based on reveal slider (match movie page pattern)
  const visiblePieces = React.useMemo(() => {
    if (revealMax === 0) {
      // No reveal slider active - show all pieces
      console.log(`👁️ Showing all ${placedPieces.length} pieces (revealMax=0)`);
      return placedPieces;
    }
    // Reveal slider active - show subset
    const visible = placedPieces.slice(0, revealK);
    console.log(`👁️ Revealing ${visible.length} / ${placedPieces.length} pieces`);
    if (visible.length > 0) {
      console.log('🔍 First visible piece:', {
        uid: visible[0].uid,
        pieceId: visible[0].pieceId,
        hasCells: !!visible[0].cells,
        cellsCount: visible[0].cells?.length,
        firstCell: visible[0].cells?.[0]
      });
    }
    return visible;
  }, [placedPieces, revealK, revealMax]);

  // Hide container when reveal is active (only show pieces)
  const containerOpacity = revealMax > 0 && revealK < placedPieces.length ? 0 : 0.15;

  if (loading) {
    return (
      <div
        style={{
          width: '100vw',
          height: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: '#000',
          color: '#fff',
          fontSize: '1.2rem',
        }}
      >
        Loading solution...
      </div>
    );
  }

  if (error || !solution) {
    return (
      <div
        style={{
          width: '100vw',
          height: '100vh',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          background: '#000',
          color: '#fff',
          gap: '20px',
        }}
      >
        <div style={{ fontSize: '1.2rem' }}>{error || 'Solution not found'}</div>
        <button
          onClick={handleBackToGallery}
          style={{
            background: 'rgba(255, 255, 255, 0.2)',
            border: '1px solid rgba(255, 255, 255, 0.3)',
            borderRadius: '8px',
            color: '#fff',
            padding: '12px 24px',
            fontSize: '1rem',
            cursor: 'pointer',
          }}
        >
          Back to Gallery
        </button>
      </div>
    );
  }

  return (
    <div
      style={{
        width: '100vw',
        height: '100vh',
        position: 'relative',
        overflow: 'hidden',
        background: '#000',
      }}
    >
      {/* Solution Info Button - Top Left */}
      <button
        onClick={() => setShowInfoModal(true)}
        style={{
          position: 'fixed',
          top: '20px',
          left: '20px',
          background: 'linear-gradient(135deg, rgba(59, 130, 246, 0.8), rgba(37, 99, 235, 0.8))',
          backdropFilter: 'blur(10px)',
          border: '1px solid rgba(255, 255, 255, 0.3)',
          borderRadius: '12px',
          color: '#fff',
          padding: '12px 20px',
          fontSize: '0.95rem',
          fontWeight: 600,
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          zIndex: 1000,
          transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
          boxShadow: '0 4px 12px rgba(59, 130, 246, 0.3)',
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.background = 'linear-gradient(135deg, rgba(37, 99, 235, 0.9), rgba(29, 78, 216, 0.9))';
          e.currentTarget.style.transform = 'translateY(-2px)';
          e.currentTarget.style.boxShadow = '0 6px 20px rgba(59, 130, 246, 0.4)';
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.background = 'linear-gradient(135deg, rgba(59, 130, 246, 0.8), rgba(37, 99, 235, 0.8))';
          e.currentTarget.style.transform = 'translateY(0)';
          e.currentTarget.style.boxShadow = '0 4px 12px rgba(59, 130, 246, 0.3)';
        }}
        title="Solution Information"
      >
        <span style={{ fontSize: '1.1rem' }}>ℹ️</span>
        <span>Solution Info</span>
      </button>

      {/* Back to Gallery Button - Top Right */}
      <button
        onClick={handleBackToGallery}
        style={{
          position: 'fixed',
          top: '20px',
          right: '20px',
          background: 'linear-gradient(135deg, rgba(16, 185, 129, 0.8), rgba(5, 150, 105, 0.8))',
          backdropFilter: 'blur(10px)',
          border: '1px solid rgba(255, 255, 255, 0.3)',
          borderRadius: '12px',
          color: '#fff',
          padding: '12px 20px',
          fontSize: '0.95rem',
          fontWeight: 600,
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          zIndex: 1000,
          transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
          boxShadow: '0 4px 12px rgba(16, 185, 129, 0.3)',
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.background = 'linear-gradient(135deg, rgba(5, 150, 105, 0.9), rgba(4, 120, 87, 0.9))';
          e.currentTarget.style.transform = 'translateY(-2px)';
          e.currentTarget.style.boxShadow = '0 6px 20px rgba(16, 185, 129, 0.4)';
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.background = 'linear-gradient(135deg, rgba(16, 185, 129, 0.8), rgba(5, 150, 105, 0.8))';
          e.currentTarget.style.transform = 'translateY(0)';
          e.currentTarget.style.boxShadow = '0 4px 12px rgba(16, 185, 129, 0.3)';
        }}
        title="Return to Movie Gallery"
      >
        <span>Gallery</span>
        <span style={{ fontSize: '1.1rem' }}>🎬</span>
      </button>

      {/* 3D Canvas - Full screen container */}
      <div
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          width: '100%',
          height: '100%',
          zIndex: 0,
        }}
      >
        {view && cells.length > 0 ? (
          <>
            {console.log('🎬 Rendering SceneCanvas:', {
              cellsCount: cells.length,
              viewPresent: !!view,
              visiblePiecesCount: visiblePieces.length,
              explosionFactor,
              brightness: envSettings.lights.brightness
            })}
            <SceneCanvas
              cells={cells}
              view={view}
              editMode={false}
              mode="add"
              onCellsChange={() => {}}
              layout="fullscreen"
              placedPieces={visiblePieces}
              hidePlacedPieces={false}
              explosionFactor={explosionFactor}
              settings={envSettings}
              puzzleMode="unlimited"
              showBonds={true}
              containerOpacity={containerOpacity}
              containerColor="#888888"
              alwaysShowContainer={true}
              visibility={{
                xray: false,
                emptyOnly: false,
                sliceY: { center: 0.5, thickness: 1.0 },
              }}
              onSelectPiece={() => {}}
            />
          </>
        ) : (
          <>
            {console.log('⚠️ NOT rendering SceneCanvas:', {
              viewPresent: !!view,
              cellsCount: cells.length,
              reason: !view ? 'no view' : 'no cells'
            })}
          </>
        )}
      </div>

      {/* Slider Controls */}
      <AutoSolveSlidersPanel
        revealK={revealK}
        revealMax={revealMax}
        explosionFactor={explosionFactor}
        onChangeRevealK={setRevealK}
        onChangeExplosionFactor={setExplosionFactor}
      />

      {/* Solution Info Modal */}
      {showInfoModal && solution && (
        <SolutionInfoModal
          isOpen={showInfoModal}
          onClose={() => setShowInfoModal(false)}
          solution={solution}
          puzzleStats={puzzleStats || undefined}
        />
      )}
    </div>
  );
};
