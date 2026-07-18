import React, { useState, useEffect } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import SceneCanvas from '../../components/SceneCanvas';
import { SceneErrorBoundary } from '../../components/SceneErrorBoundary';
import { AutoSolveSlidersPanel } from '../solve/components/AutoSolveSlidersPanel';
import { SolutionInfoModal } from './SolutionInfoModal';
import { AssemblyGuideWelcomeModal } from './AssemblyGuideWelcomeModal';
import { PresetSelectorModal } from '../../components/PresetSelectorModal';
import { ENVIRONMENT_PRESETS } from '../../constants/environmentPresets';
import { getPuzzleSolution, getSolutionById, getPuzzleSolutionsList, type PuzzleSolutionRecord, type PuzzleSolutionSummary } from '../../api/solutions';
import { SolutionPickerModal } from './SolutionPickerModal';
import { computeViewTransforms, type ViewTransforms } from '../../services/ViewTransforms';
import { ijkToXyz } from '../../lib/ijk';
import { quickHullWithCoplanarMerge } from '../../lib/quickhull-adapter';
import { DEFAULT_STUDIO_SETTINGS, type StudioSettings } from '../../types/studio';
import { supabase } from '../../lib/supabase';
import { ThreeDotMenu } from '../../components/ThreeDotMenu';
import { useTranslation } from 'react-i18next';
import type { IJK } from '../../types/shape';
import type { PlacedPiece } from '../solve/types/manualSolve';
import { PieceViewerModal } from './PieceViewerModal';
import { ExploreClipModal } from './ExploreClipModal';
import { orderForPhysicalBuildWorld } from '../../utils/physicalSupport';
import { carriedPresetSettings, loadCarriedPreset, saveCarriedPreset } from '../../utils/environmentCarry';
import { useAuth } from '../../context/AuthContext';

const ASSEMBLY_GUIDE_DISMISSED_KEY = 'solutionViewer.assemblyGuideDismissed';

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

export const SolutionsPage: React.FC = () => {
  const { puzzleId } = useParams<{ puzzleId: string }>();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { t } = useTranslation();
  
  // Get specific solution ID from URL query param (e.g., ?solution=abc123)
  const solutionIdFromUrl = searchParams.get('solution');
  
  const [solution, setSolution] = useState<PuzzleSolutionRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  const [cells, setCells] = useState<IJK[]>([]);
  const [view, setView] = useState<ViewTransforms | null>(null);
  const [placedPieces, setPlacedPieces] = useState<PlacedPiece[]>([]);
  // Latest preset chosen anywhere in the app carries in (and choices made
  // here carry forward); falls back to the bright analysis defaults.
  const [currentPreset, setCurrentPreset] = useState<string>(() =>
    loadCarriedPreset('solutions.environmentPreset')
  );
  const [envSettings, setEnvSettings] = useState<StudioSettings>(
    () => carriedPresetSettings('solutions.environmentPreset') ?? ANALYSIS_SETTINGS
  );
  const [showPresetModal, setShowPresetModal] = useState(false);
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
  // Share-clip recorder (construction animation + invite text)
  const [showClipModal, setShowClipModal] = useState(false);
  const [sceneObjs, setSceneObjs] = useState<any>(null);
  const { user: authUser } = useAuth();
  const [explosionFactor, setExplosionFactor] = useState(0);
  const [showInfoModal, setShowInfoModal] = useState(false);
  const [solutionsList, setSolutionsList] = useState<PuzzleSolutionSummary[]>([]);
  const [showSolutionPicker, setShowSolutionPicker] = useState(false);
  const [selectedPieceUid, setSelectedPieceUid] = useState<string | null>(null);
  const [showPieceModal, setShowPieceModal] = useState(false);
  const [showWelcomeModal, setShowWelcomeModal] = useState(() => {
    try {
      return localStorage.getItem(ASSEMBLY_GUIDE_DISMISSED_KEY) !== 'true';
    } catch {
      return true;
    }
  });

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
        
        let data: PuzzleSolutionRecord | null;
        
        // If a specific solution ID is provided, load that solution
        if (solutionIdFromUrl) {
          console.log('🔍 Loading specific solution:', solutionIdFromUrl);
          data = await getSolutionById(solutionIdFromUrl);
        } else {
          console.log('🔍 Loading most recent solution for puzzle:', puzzleId);
          data = await getPuzzleSolution(puzzleId);
        }
        
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
        
        // Extract placed pieces - store unsorted initially
        const pieces = (data.placed_pieces || []) as PlacedPiece[];
        setPlacedPieces(pieces);
        
        // Set up reveal slider to show all pieces by default
        setRevealMax(pieces.length);
        setRevealK(pieces.length);
        console.log(`🧩 Loaded ${pieces.length} placed pieces, revealing all`);
        
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
  }, [puzzleId, solutionIdFromUrl]);

  // Load the list of all solutions for this puzzle (for the solution picker)
  useEffect(() => {
    if (!puzzleId) return;
    let cancelled = false;
    getPuzzleSolutionsList(puzzleId)
      .then((list) => {
        if (!cancelled) setSolutionsList(list);
      })
      .catch((err) => {
        console.warn('⚠️ Could not load solutions list for picker:', err);
        if (!cancelled) setSolutionsList([]);
      });
    return () => {
      cancelled = true;
    };
  }, [puzzleId]);

  // Switch to a different solution by updating the URL query param;
  // the loadSolution effect re-runs on the changed `?solution=` value.
  const handleSelectSolution = (solutionId: string) => {
    setShowSolutionPicker(false);
    if (solutionId === solution?.id) return; // already viewing it
    navigate(`/solutions/${puzzleId}?solution=${solutionId}`);
  };

  const handleBackToGallery = () => {
    navigate('/gallery');
  };
  
  // Physical build order — the Explore construction sequence. Hard rule: a
  // piece appears only when the table + already-revealed pieces hold it under
  // gravity; preference among placeable pieces: lowest → flattest → connected
  // → most secure (see utils/physicalSupport.ts, with backtracking so the
  // preferences never cost us a buildable order). Computed in the DISPLAYED
  // orientation (M_world) — that is the orientation a physical builder
  // replicates. Falls back to lowest-first when the solution admits no stable
  // sequence at all.
  const orderedPieces = React.useMemo(() => {
    const valid = placedPieces.filter(
      (piece) => piece && piece.cells && Array.isArray(piece.cells) && piece.cells.length > 0
    );
    if (!view || valid.length === 0) return valid;

    const m = view.M_world;
    const worldPos = (c: IJK) => ({
      x: m[0][0] * c.i + m[0][1] * c.j + m[0][2] * c.k + m[0][3],
      y: m[1][0] * c.i + m[1][1] * c.j + m[1][2] * c.k + m[1][3],
      z: m[2][0] * c.i + m[2][1] * c.j + m[2][2] * c.k + m[2][3],
    });
    // Nearest-neighbor sphere distance = length of the image of the (1,0,0)
    // lattice offset (rigid transform + uniform scale preserve it).
    const step = Math.hypot(m[0][0], m[1][0], m[2][0]);

    try {
      const ordered = orderForPhysicalBuildWorld(valid, { worldPos, step });
      if (ordered) {
        console.log(`🏗️ Stable physical build order: ${ordered.map((p) => p.pieceId).join(' → ')}`);
        return ordered;
      }
      console.warn('🏗️ No stable build order exists for this solution — falling back to lowest-first');
    } catch (err) {
      console.error('❌ Physical build ordering failed:', err);
    }
    return valid
      .map((piece) => ({ piece, minY: Math.min(...piece.cells.map((c) => worldPos(c).y)) }))
      .sort((a, b) => a.minY - b.minY)
      .map((x) => x.piece);
  }, [placedPieces, view]);

  // Apply the reveal slider over the physical build order.
  const visiblePieces = React.useMemo(() => {
    if (revealMax === 0) return orderedPieces;
    return orderedPieces.slice(0, revealK);
  }, [orderedPieces, revealK, revealMax]);

  const selectedPiece = React.useMemo(() => {
    if (!selectedPieceUid) return null;
    return placedPieces.find((p) => p.uid === selectedPieceUid) || null;
  }, [placedPieces, selectedPieceUid]);

  // Hide container when reveal is active (only show pieces)
  const containerOpacity = revealMax > 0 && revealK < placedPieces.length ? 0 : 0.15;

  if (loading) {
    return (
      <div
        style={{
          width: '100vw',
          height: '100dvh',
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
          height: '100dvh',
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
        height: '100dvh',
        position: 'relative',
        overflow: 'hidden',
        background: '#000',
      }}
    >
      <div style={{ position: 'fixed', top: '20px', right: '20px', zIndex: 1000 }}>
        <ThreeDotMenu
          backgroundColor={envSettings.lights.backgroundColor}
          items={[
            {
              icon: '🧩',
              label: `Choose Solution (${solutionsList.length})`,
              onClick: () => setShowSolutionPicker(true),
              hidden: solutionsList.length <= 1,
            },
            {
              icon: '🎬',
              label: t('exploreClip.menu'),
              onClick: () => {
                // Full, unexploded model so the clip records every piece.
                setExplosionFactor(0);
                setRevealMax(0);
                setShowClipModal(true);
              },
            },
            { icon: '⚙️', label: 'Environment', onClick: () => setShowPresetModal(true) },
            { icon: 'ℹ️', label: 'Solution Info', onClick: () => setShowInfoModal(true) },
            { icon: '❓', label: 'Assembly Guide', onClick: () => setShowWelcomeModal(true) },
            { icon: '🔴', label: t('prototype.menuLabel'), onClick: () => navigate('/prototype') },
            { icon: '✕', label: 'Back to Gallery', onClick: () => navigate('/gallery') },
          ]}
        />
      </div>

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
          <SceneErrorBoundary
            fallbackMessage="The 3D view encountered an error"
            onRetry={() => window.location.reload()}
          >
            <SceneCanvas
              cells={[]}
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
              alwaysShowContainer={false}
              visibility={{
                xray: false,
                emptyOnly: false,
                sliceY: { center: 0.5, thickness: 1.0 },
              }}
              onSelectPiece={() => {}}
              onInteraction={(target, type, data) => {
                if (target !== 'piece' || type !== 'double') return;
                const uid = typeof data === 'string' ? data : data?.uid;
                if (!uid) return;
                setSelectedPieceUid(uid);
                setShowPieceModal(true);
              }}
              onSceneReady={setSceneObjs}
            />
          </SceneErrorBoundary>
        ) : (
          <div
            style={{
              width: '100%',
              height: '100%',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              background: 'linear-gradient(135deg, #1a1a2e 0%, #16213e 100%)',
              color: '#fff',
              gap: '16px',
            }}
          >
            <div style={{ fontSize: '2rem' }}>🔄</div>
            <div style={{ fontSize: '1rem', color: 'rgba(255,255,255,0.7)' }}>
              {!view ? 'Preparing 3D view...' : 'Loading geometry...'}
            </div>
            <button
              onClick={() => window.location.reload()}
              style={{
                marginTop: '20px',
                background: 'rgba(255,255,255,0.15)',
                border: '1px solid rgba(255,255,255,0.3)',
                borderRadius: '8px',
                color: '#fff',
                padding: '10px 20px',
                fontSize: '0.9rem',
                cursor: 'pointer',
              }}
            >
              Reload Page
            </button>
          </div>
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

      <PresetSelectorModal
        isOpen={showPresetModal}
        currentPreset={currentPreset}
        onClose={() => setShowPresetModal(false)}
        onSelectPreset={(presetSettings, presetKey) => {
          setEnvSettings(presetSettings);
          setCurrentPreset(presetKey);
          saveCarriedPreset(presetKey, 'solutions.environmentPreset');
        }}
      />

      {/* Solution Picker Modal */}
      <SolutionPickerModal
        isOpen={showSolutionPicker}
        onClose={() => setShowSolutionPicker(false)}
        solutions={solutionsList}
        currentSolutionId={solution?.id ?? null}
        onSelect={handleSelectSolution}
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

      <PieceViewerModal
        isOpen={showPieceModal && !!selectedPiece}
        onClose={() => {
          setShowPieceModal(false);
          setSelectedPieceUid(null);
        }}
        piece={selectedPiece}
        settings={envSettings}
      />

      {/* Construction-clip recorder — invite others to try this puzzle */}
      {showClipModal && solution && (
        <ExploreClipModal
          isOpen={showClipModal}
          onClose={() => setShowClipModal(false)}
          sceneObjects={sceneObjs}
          puzzleId={solution.puzzle_id}
          puzzleName={solution.puzzle_name ?? null}
          placementOrder={orderedPieces.map((p) => p.uid)}
          senderName={
            authUser?.username ||
            (typeof localStorage !== 'undefined'
              ? localStorage.getItem('user_preferences_username')
              : null)
          }
        />
      )}

      {/* Assembly Guide Welcome Modal */}
      <AssemblyGuideWelcomeModal
        isOpen={showWelcomeModal}
        onClose={() => setShowWelcomeModal(false)}
        onDontShowAgain={() => {
          try {
            localStorage.setItem(ASSEMBLY_GUIDE_DISMISSED_KEY, 'true');
          } catch {
            // ignore
          }
          setShowWelcomeModal(false);
        }}
      />
    </div>
  );
};
