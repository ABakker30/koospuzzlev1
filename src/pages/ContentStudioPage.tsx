// koos.shape@1 format
interface KoosShape {
  schema: 'koos.shape';
  version: 1;
  id: string;
  lattice: string;
  cells: [number, number, number][];
}

import { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useActiveState } from '../context/ActiveStateContext';
import { StudioCanvas } from '../components/StudioCanvas';
import { SettingsModal } from '../components/SettingsModal';
import { InfoModal } from '../components/InfoModal';
import { orientSolutionWorld } from './solution-viewer/pipeline/orient';
import { buildSolutionGroup, computeRevealOrder, applyRevealK, applyExplosion } from './solution-viewer/pipeline/build';
import { loadAllPieces } from '../engines/piecesLoader';
import type { SolutionJSON, PieceOrderEntry } from './solution-viewer/types';
import { StudioSettingsService } from '../services/StudioSettingsService';
import { StudioSettings, DEFAULT_STUDIO_SETTINGS } from '../types/studio';
import type { ViewTransforms } from '../services/ViewTransforms';
import { computeViewTransforms } from '../services/ViewTransforms';
import { quickHullWithCoplanarMerge } from '../lib/quickhull-adapter';
import { ijkToXyz } from '../lib/ijk';
import type { IJK } from '../types/shape';
import { TransportBar } from '../studio/TransportBar';
import { buildEffectContext, type EffectContext } from '../studio/EffectContext';
import { getEffect } from '../effects/registry';
import { TurnTableEffect } from '../effects/turntable/TurnTableEffect';
import type { TurnTableConfig } from '../effects/turntable/presets';
import { TurnTableModal } from '../effects/turntable/TurnTableModal';
import { OrbitModal } from '../effects/orbit/OrbitModal';
import type { OrbitConfig } from '../effects/orbit/types';
import { DEFAULT_CONFIG as DEFAULT_ORBIT_CONFIG } from '../effects/orbit/presets';
import { RevealModal } from '../effects/reveal/RevealModal';
import type { RevealConfig } from '../effects/reveal/presets';
import { ExplosionModal } from '../effects/explosion/ExplosionModal';
import type { ExplosionConfig } from '../effects/explosion/presets';
// import { GravityModal } from '../effects/gravity/GravityModal'; // Temporarily disabled
// import type { GravityEffectConfig } from '../effects/gravity/types'; // Temporarily disabled
import { listContractSolutions, getContractSolutionSignedUrl } from '../api/contracts';
import { BrowseContractShapesModal } from '../components/BrowseContractShapesModal';
import { BrowseContractSolutionsModal } from '../components/BrowseContractSolutionsModal';
import * as THREE from 'three';

const ContentStudioPage: React.FC = () => {
  const navigate = useNavigate();
  const { activeState } = useActiveState();
  const settingsService = useRef(new StudioSettingsService());
  const lastLoadedShapeRef = useRef<string | null>(null);
  const lastLoadedDataRef = useRef<{ type: 'shape' | 'solution', data: any } | null>(null);
  const welcomeAnimationShown = useRef(false);
  const welcomeAnimationPending = useRef(false);
  
  // Core state
  const [cells, setCells] = useState<IJK[]>([]);
  const [view, setView] = useState<ViewTransforms | null>(null);
  const [showInfo, setShowInfo] = useState(false);
  const [loaded, setLoaded] = useState(false);
  
  // Solution mode state
  const [solutionGroup, setSolutionGroup] = useState<THREE.Group | null>(null);
  const [isSolutionMode, setIsSolutionMode] = useState(false);
  
  // Settings state
  const [settings, setSettings] = useState<StudioSettings>(DEFAULT_STUDIO_SETTINGS);
  const [showSettings, setShowSettings] = useState(false);
  const [settingsLoaded, setSettingsLoaded] = useState(false);
  
  // Effect context state
  const [effectContext, setEffectContext] = useState<EffectContext | null>(null);
  
  // Real scene objects from StudioCanvas
  const [realSceneObjects, setRealSceneObjects] = useState<{
    scene: THREE.Scene;
    camera: THREE.PerspectiveCamera;
    renderer: THREE.WebGLRenderer;
    controls: any;
    spheresGroup: THREE.Group;
    centroidWorld: THREE.Vector3;
  } | null>(null);
  
  // Effects dropdown state
  const [showEffectsDropdown, setShowEffectsDropdown] = useState(false);
  const [activeEffectId, setActiveEffectId] = useState<string | null>(null);
  const [activeEffectInstance, setActiveEffectInstance] = useState<any>(null);
  
  // Turn Table modal state
  const [showTurnTableModal, setShowTurnTableModal] = useState(false);
  
  // Orbit modal state
  const [showOrbitModal, setShowOrbitModal] = useState(false);
  
  // Reveal modal state
  const [showRevealModal, setShowRevealModal] = useState(false);
  
  // Explosion modal state
  const [showExplosionModal, setShowExplosionModal] = useState(false);
  
  // Gravity modal state - Temporarily disabled
  // const [showGravityModal, setShowGravityModal] = useState(false);
  
  // Presets modal state
  const [showPresetsModal, setShowPresetsModal] = useState(false);
  
  // Browse modal state
  const [showBrowseModal, setShowBrowseModal] = useState(false);
  const [showShapeBrowser, setShowShapeBrowser] = useState(false);
  const [showSolutionBrowser, setShowSolutionBrowser] = useState(false);
  
  // Solution reveal and explosion state
  const [revealOrder, setRevealOrder] = useState<PieceOrderEntry[]>([]);
  const [revealK, setRevealK] = useState<number>(0);
  const [revealMax, setRevealMax] = useState<number>(0);
  const [explosionFactor, setExplosionFactor] = useState<number>(0); // 0 = assembled, 1 = 3x exploded
  
  // Menu modal state
  const [showMenuModal, setShowMenuModal] = useState(false);
  const [menuPosition, setMenuPosition] = useState({ x: 0, y: 0 });
  const [menuDragging, setMenuDragging] = useState(false);
  const [menuDragOffset, setMenuDragOffset] = useState({ x: 0, y: 0 });
  
  // Build effect context when real scene objects are available
  useEffect(() => {
    if (!loaded || (!view && !isSolutionMode) || !realSceneObjects) return;
    
    console.log('🎬 ContentStudioPage: Building EffectContext with REAL scene objects');
    try {
      // In solution mode, use solution group instead of spheresGroup
      const targetGroup = isSolutionMode && solutionGroup ? solutionGroup : realSceneObjects.spheresGroup;
      
      const context = buildEffectContext({
        scene: realSceneObjects.scene,
        spheresGroup: targetGroup,
        camera: realSceneObjects.camera,
        controls: realSceneObjects.controls,
        renderer: realSceneObjects.renderer,
        centroidWorld: realSceneObjects.centroidWorld
      });
      
      setEffectContext(context);
      console.log('✅ ContentStudioPage: Real EffectContext built successfully');
      console.log('🎯 Real objects:', {
        scene: !!realSceneObjects.scene,
        camera: !!realSceneObjects.camera,
        controls: !!realSceneObjects.controls,
        spheresGroup: !!targetGroup,
        centroidWorld: realSceneObjects.centroidWorld,
        solutionMode: isSolutionMode
      });
      
    } catch (error) {
      console.error('❌ ContentStudioPage: Failed to build EffectContext:', error);
    }
  }, [loaded, view, realSceneObjects, isSolutionMode, solutionGroup]);

  // Trigger welcome animation when effectContext becomes ready
  useEffect(() => {
    if (effectContext && welcomeAnimationPending.current) {
      console.log('🎬 EffectContext ready, triggering welcome animation...');
      welcomeAnimationPending.current = false;
      
      // Small delay to ensure everything is fully initialized
      setTimeout(() => {
        triggerRandomEffect();
      }, 500);
    }
  }, [effectContext]);

  // Effects dropdown handlers
  const handleEffectSelect = (effectId: string) => {
    console.log(`effect=${effectId} action=open-selection`);
    console.log('🔍 DEBUG: isLoaded=', loaded, 'activeEffectId=', activeEffectId, 'activeEffectInstance=', !!activeEffectInstance);
    
    if (activeEffectInstance) {
      // Auto-clear current effect when selecting a new one
      console.log('🔄 Auto-clearing current effect before selecting new one');
      handleClearEffect();
    }
    
    // Close dropdown first
    setShowEffectsDropdown(false);
    
    // Open modal immediately (dropdown will close via state change)
    if (effectId === 'turntable') {
      console.log(`🎬 Opening TurnTable modal, current state=`, showTurnTableModal);
      setShowTurnTableModal(true);
      console.log('🎬 setShowTurnTableModal(true) called');
    } else if (effectId === 'orbit') {
      console.log(`🌐 Opening Orbit modal, current state=`, showOrbitModal);
      setShowOrbitModal(true);
    } else if (effectId === 'reveal') {
      console.log(`✨ Opening Reveal modal, current state=`, showRevealModal);
      setShowRevealModal(true);
    } else if (effectId === 'explosion') {
      console.log(`💥 Opening Explosion modal, current state=`, showExplosionModal);
      setShowExplosionModal(true);
    } // else if (effectId === 'gravity') {
      // console.log(`🌍 Opening Gravity modal, current state=`, showGravityModal);
      // setShowGravityModal(true);
    // }
  };

  const handleActivateEffect = (effectId: string, config: TurnTableConfig | OrbitConfig | RevealConfig | ExplosionConfig | null): any => {
    
    if (!effectContext) {
      console.error('❌ Cannot activate effect: EffectContext not available');
      return null;
    }

    try {
      const effectDef = getEffect(effectId);
      if (!effectDef || !effectDef.constructor) {
        console.error(`❌ Effect not found or no constructor: ${effectId}`);
        return null;
      }

      // Create effect instance
      const instance = new effectDef.constructor();
      
      // Initialize with context
      instance.init(effectContext);
      
      // Set config if provided
      if (config) {
        instance.setConfig(config);
      }
      
      // Store active effect
      setActiveEffectId(effectId);
      setActiveEffectInstance(instance);
      
      console.log(`effect=${effectId} action=activate state=idle`);
      console.log('🔍 DEBUG: Effect activated - activeEffectId=', effectId, 'instance=', !!instance);
      
      // Return instance for immediate use
      return instance;
    } catch (error) {
      console.error(`❌ Failed to activate effect ${effectId}:`, error);
      return null;
    }
  };

  const handleClearEffect = () => {
    if (activeEffectInstance) {
      try {
        activeEffectInstance.dispose();
        console.log(`effect=${activeEffectId} action=clear-selection`);
      } catch (error) {
        console.error('❌ Error disposing effect:', error);
      }
    }
    
    setActiveEffectId(null);
    setActiveEffectInstance(null);
    setShowEffectsDropdown(false);
  };

  // Turn Table modal handlers
  const handleTurnTableSave = (config: TurnTableConfig) => {
    console.log(`effect=turntable action=confirm-modal config=${JSON.stringify(config)}`);
    setShowTurnTableModal(false);
    handleActivateEffect('turntable', config);
  };

  const handleTurnTableCancel = () => {
    console.log('effect=turntable action=cancel-modal');
    setShowTurnTableModal(false);
  };

  // Orbit modal handlers
  const handleOrbitSave = (config: OrbitConfig) => {
    console.log(`effect=orbit action=confirm-modal config=${JSON.stringify(config)}`);
    setShowOrbitModal(false);
    handleActivateEffect('orbit', config);
  };

  const handleOrbitCancel = () => {
    console.log('effect=orbit action=cancel-modal');
    setShowOrbitModal(false);
  };

  // Reveal modal handlers
  const revealSaveInProgress = useRef(false);
  const handleRevealSave = (config: RevealConfig) => {
    // Prevent double-firing on mobile
    if (revealSaveInProgress.current) {
      console.log('⚠️ Reveal save already in progress, ignoring duplicate call');
      return;
    }
    revealSaveInProgress.current = true;
    
    console.log(`effect=reveal action=confirm-modal config=${JSON.stringify(config)}`);
    setShowRevealModal(false);
    handleActivateEffect('reveal', config);
    
    // Reset flag after a delay
    setTimeout(() => {
      revealSaveInProgress.current = false;
    }, 1000);
  };

  const handleRevealCancel = () => {
    console.log('effect=reveal action=cancel-modal');
    setShowRevealModal(false);
  };

  // Explosion modal handlers
  const explosionSaveInProgress = useRef(false);
  const handleExplosionSave = (config: ExplosionConfig) => {
    // Prevent double-firing on mobile
    if (explosionSaveInProgress.current) {
      console.log('⚠️ Explosion save already in progress, ignoring duplicate call');
      return;
    }
    explosionSaveInProgress.current = true;
    
    console.log(`effect=explosion action=confirm-modal config=${JSON.stringify(config)}`);
    setShowExplosionModal(false);
    handleActivateEffect('explosion', config);
    
    // Reset flag after a delay
    setTimeout(() => {
      explosionSaveInProgress.current = false;
    }, 1000);
  };

  const handleExplosionCancel = () => {
    console.log('effect=explosion action=cancel-modal');
    setShowExplosionModal(false);
  };

  // Gravity modal handlers - Temporarily disabled
  // const handleGravitySave = (config: GravityEffectConfig) => {
  //   console.log(`effect=gravity action=confirm-modal config=${JSON.stringify(config)}`);
  //   setShowGravityModal(false);
  //   handleActivateEffect('gravity', config);
  // };

  // const handleGravityCancel = () => {
  //   console.log('effect=gravity action=cancel-modal');
  //   setShowGravityModal(false);
  // };

  // Handle scene ready callback from StudioCanvas
  const handleSceneReady = (sceneObjects: {
    scene: THREE.Scene;
    camera: THREE.PerspectiveCamera;
    renderer: THREE.WebGLRenderer;
    controls: any;
    spheresGroup: THREE.Group;
    centroidWorld: THREE.Vector3;
  }) => {
    console.log('🎯 ContentStudioPage: Real scene objects received from StudioCanvas');
    setRealSceneObjects(sceneObjects);
    
    // Expose live camera state getter for OrbitModal
    (window as any).getCurrentCameraState = () => {
      const camera = sceneObjects.camera;
      const controls = sceneObjects.controls;
      const state = {
        position: camera.position.toArray() as [number, number, number],
        target: controls?.target?.toArray() as [number, number, number] || [0, 0, 0],
        fov: camera.fov
      };
      console.log('🎥 getCurrentCameraState called - live state:', state);
      return state;
    };
  };

  // Close dropdown when clicking outside (but not on dropdown buttons)
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (showEffectsDropdown && event.target) {
        const target = event.target as Element;
        // Don't close if clicking inside the dropdown
        if (!target.closest('[data-dropdown="effects"]')) {
          setShowEffectsDropdown(false);
        }
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showEffectsDropdown]);

  // Tick driver for active effects
  useEffect(() => {
    if (!activeEffectInstance) return;

    let animationId: number;
    
    const tick = () => {
      const time = performance.now() / 1000; // Convert to seconds
      activeEffectInstance.tick(time);
      animationId = requestAnimationFrame(tick);
    };

    animationId = requestAnimationFrame(tick);
    
    return () => {
      if (animationId) {
        cancelAnimationFrame(animationId);
      }
    };
  }, [activeEffectInstance]);
  
  
  // Load settings on mount
  useEffect(() => {
    console.log('🔄 ContentStudioPage: Loading settings on mount');
    const loadedSettings = settingsService.current.loadSettings();
    console.log('🔄 ContentStudioPage: Loaded settings:', loadedSettings);
    setSettings(loadedSettings);
    setSettingsLoaded(true);
  }, []);

  // Auto-save settings on change (but not on initial load)
  useEffect(() => {
    if (!settingsLoaded) {
      console.log('💾 ContentStudioPage: Skipping save on initial load');
      return;
    }
    console.log('💾 ContentStudioPage: Settings changed, auto-saving to localStorage');
    console.log('💾 Settings being saved:', JSON.stringify(settings, null, 2));
    settingsService.current.saveSettings(settings);
    console.log('💾 Settings saved successfully');
  }, [settings, settingsLoaded]);

  // Welcome Animation: Load random solution and play random effect on first visit
  useEffect(() => {
    if (welcomeAnimationShown.current || activeState || loaded) return;
    
    const loadWelcomeAnimation = async () => {
      console.log('🎉 Studio: Loading welcome animation...');
      welcomeAnimationShown.current = true;
      
      try {
        // Fetch all solutions
        const allSolutions = await listContractSolutions();
        if (allSolutions.length === 0) {
          console.log('⚠️ No solutions available for welcome animation');
          return;
        }
        
        // Filter for 100-cell solutions
        const solutions100 = allSolutions.filter(s => {
          const metadata = s.metadata as any;
          return metadata?.cellCount === 100 || metadata?.cell_count === 100;
        });
        
        // Use 100-cell solutions if available, otherwise use any solution
        const solutions = solutions100.length > 0 ? solutions100 : allSolutions;
        console.log(`🎲 Found ${solutions.length} solutions (${solutions100.length} with 100 cells)`);
        
        // Pick random solution
        const randomSolution = solutions[Math.floor(Math.random() * solutions.length)];
        console.log(`🎲 Picked random solution: ${randomSolution.id}`);
        
        // Fetch solution file
        const signedUrl = await getContractSolutionSignedUrl(randomSolution.id);
        const response = await fetch(signedUrl);
        const solutionData = await response.json();
        
        console.log('🔍 Solution data:', solutionData);
        console.log('🔍 First placement:', solutionData.placements?.[0]);
        
        // Check if this is already a legacy format solution or contract format
        if (solutionData.placements && Array.isArray(solutionData.placements) && solutionData.placements[0]?.cells_ijk) {
          // Already in legacy format, just orient and build
          console.log('✅ Solution already in legacy format');
          const oriented = orientSolutionWorld(solutionData as SolutionJSON);
          const { root } = buildSolutionGroup(oriented);
          
          setIsSolutionMode(true);
          setSolutionGroup(root);
          setLoaded(true);
          
          console.log('✅ Welcome solution loaded (legacy format), marking animation as pending...');
          welcomeAnimationPending.current = true;
          return;
        }
        
        // Load pieces database to get cell positions for contract format
        const piecesDb = await loadAllPieces();
        console.log('🔍 Pieces DB loaded, size:', piecesDb.size);
        
        // Convert to legacy format with proper cells_ijk
        const legacySolution: SolutionJSON = {
          version: 1,
          containerCidSha256: randomSolution.shape_id || '',
          lattice: 'fcc',
          piecesUsed: {},
          placements: solutionData.placements.map((p: any, index: number) => {
            const [i, j, k] = p.ijk || p.anchorIJK || [0, 0, 0];
            const pieceId = p.pieceId || p.piece;
            const oriIndex = p.orientationIndex ?? p.ori ?? 0;
            
            console.log(`🔍 Placement ${index}: piece=${pieceId}, ori=${oriIndex}, anchor=[${i},${j},${k}]`);
            
            const orientations = piecesDb.get(pieceId);
            if (!orientations) {
              console.warn(`⚠️ Piece ${pieceId} not found in database`);
              return null;
            }
            
            const orientation = orientations[oriIndex];
            if (!orientation) {
              console.warn(`⚠️ Orientation ${oriIndex} not found for piece ${pieceId}`);
              return null;
            }
            
            const cells_ijk = orientation.cells.map((cell: any) => [
              cell[0] + i, cell[1] + j, cell[2] + k
            ] as [number, number, number]);
            
            return {
              piece: pieceId,
              ori: oriIndex,
              t: [i, j, k] as [number, number, number],
              cells_ijk
            };
          }).filter((p: any) => p !== null),
          sid_state_sha256: randomSolution.id,
          sid_route_sha256: '',
          sid_state_canon_sha256: '',
          mode: 'welcome',
          solver: { engine: 'unknown', seed: 0, flags: {} }
        };
        
        // Orient and build solution
        const oriented = orientSolutionWorld(legacySolution);
        const { root } = buildSolutionGroup(oriented);
        
        // Set solution mode
        setIsSolutionMode(true);
        setSolutionGroup(root);
        setLoaded(true);
        
        console.log('✅ Welcome solution loaded, marking animation as pending...');
        
        // Mark animation as pending - it will trigger when effectContext is ready
        welcomeAnimationPending.current = true;
        
      } catch (error) {
        console.error('❌ Failed to load welcome animation:', error);
      }
    };
    
    loadWelcomeAnimation();
  }, [activeState, loaded]);

  // Helper to trigger random effect with random config
  const triggerRandomEffect = () => {
    const effects = ['turntable', 'reveal'];
    const randomEffect = effects[Math.floor(Math.random() * effects.length)];
    
    console.log(`🎲 Playing random effect: ${randomEffect}`);
    
    if (randomEffect === 'turntable') {
      const config: TurnTableConfig = {
        schemaVersion: 1,
        durationSec: 10 + Math.random() * 10, // 10-20 seconds
        degrees: 360,
        direction: Math.random() > 0.5 ? 'cw' : 'ccw',
        mode: 'object',
        easing: 'ease-in-out',
        finalize: 'returnToStart'
      };
      const instance = handleActivateEffect('turntable', config);
      // Auto-play after activation with the returned instance
      setTimeout(() => {
        if (instance && instance.play) {
          instance.play();
          console.log('🎬 Welcome animation: Auto-playing turntable');
        }
      }, 100);
    } else if (randomEffect === 'reveal') {
      const config: RevealConfig = {
        schemaVersion: 1,
        durationSec: 8 + Math.random() * 7, // 8-15 seconds
        loop: true,
        pauseBetweenLoops: 1.0,
        rotationEnabled: true,
        rotationDegrees: 180,
        rotationEasing: 'ease-in-out',
        revealEasing: 'ease-in-out'
      };
      const instance = handleActivateEffect('reveal', config);
      // Auto-play after activation with the returned instance
      setTimeout(() => {
        if (instance && instance.play) {
          instance.play();
          console.log('🎬 Welcome animation: Auto-playing reveal');
        }
      }, 100);
    }
  };

  // CONTRACT: Studio - Consume activeState (read-only)
  // Auto-load shape or solution when activeState is available
  useEffect(() => {
    if (!activeState) return; // Skip if no state
    
    // Skip if we've already loaded this exact shapeRef
    if (lastLoadedShapeRef.current === activeState.shapeRef) {
      console.log("🎬 Studio: Already loaded this shapeRef, skipping");
      return;
    }
    
    console.log("🎬 Content Studio: ActiveState available (read-only)", {
      shapeRef: activeState.shapeRef.substring(0, 24) + '...',
      placements: activeState.placements.length,
      currentlyLoaded: loaded,
      lastLoaded: lastLoadedShapeRef.current?.substring(0, 24) || 'none'
    });
    
    // Clear any previously loaded content
    if (loaded) {
      console.log("🔄 Studio: Clearing previous content to load new activeState");
      setLoaded(false);
      setSolutionGroup(null);
      setIsSolutionMode(false);
    }
    
    // Update the last loaded ref
    lastLoadedShapeRef.current = activeState.shapeRef;
    
    // Check if this is a solution (has placements) or just a shape
    const hasSolution = activeState.placements && activeState.placements.length > 0;
    
    if (hasSolution) {
      // Load as solution
      loadSolution();
    } else {
      // Load as shape
      loadShape();
    }
    
    async function loadShape() {
      try {
        console.log("🔄 Content Studio: Auto-loading shape from activeState...");
        
        const { supabase } = await import('../lib/supabase');
        
        const { data: urlData, error: urlError} = await supabase.storage
          .from('shapes')
          .createSignedUrl(`${activeState!.shapeRef}.shape.json`, 300);
        
        if (urlError) throw urlError;
        
        const response = await fetch(urlData.signedUrl);
        if (!response.ok) throw new Error('Failed to fetch shape');
        
        const shape = await response.json() as KoosShape;
        
        if (shape.schema !== 'koos.shape' || shape.version !== 1) {
          throw new Error('Invalid shape format');
        }
        
        console.log("✅ Content Studio: Auto-loaded shape from activeState");
        onLoaded(shape);
        
      } catch (error) {
        console.error("❌ Content Studio: Failed to auto-load shape:", error);
      }
    }
    
    async function loadSolution() {
      try {
        console.log("🔄 Content Studio: Auto-loading SOLUTION from activeState...");
        console.log(`   Placements: ${activeState!.placements.length}`);
        
        // Load pieces database
        const piecesDb = await loadAllPieces();
        console.log(`   Loaded ${piecesDb.size} pieces`);
        
        // Convert koos.state to legacy format for Solution Viewer pipeline
        const legacySolution = convertKoosStateToLegacy(activeState!, piecesDb);
        
        // Orient using Solution Viewer pipeline
        const oriented = orientSolutionWorld(legacySolution);
        console.log(`   Oriented ${oriented.pieces?.length || 0} pieces`);
        
        // Build solution group with high-quality meshes
        const { root } = buildSolutionGroup(oriented);
        console.log(`   Built solution group with ${root.children.length} piece groups`);
        
        // Set solution mode
        setIsSolutionMode(true);
        setSolutionGroup(root);
        setLoaded(true);
        console.log("✅ Content Studio: Auto-loaded SOLUTION from activeState");
        
      } catch (error) {
        console.error("❌ Content Studio: Failed to auto-load solution:", error);
      }
    }
    
    // Helper: Convert koos.state@1 to legacy format
    function convertKoosStateToLegacy(state: any, piecesDb: any): SolutionJSON {
      const placements = state.placements.map((placement: any) => {
        const [i, j, k] = placement.anchorIJK;
        const orientations = piecesDb.get(placement.pieceId);
        const orientation = orientations?.[placement.orientationIndex];
        const cells_ijk = orientation?.cells.map((cell: any) => [
          cell[0] + i, cell[1] + j, cell[2] + k
        ] as [number, number, number]) || [];
        
        return {
          piece: placement.pieceId,
          ori: placement.orientationIndex,
          t: placement.anchorIJK,
          cells_ijk
        };
      });
      
      const piecesUsed: Record<string, number> = {};
      state.placements.forEach((p: any) => {
        piecesUsed[p.pieceId] = (piecesUsed[p.pieceId] || 0) + 1;
      });
      
      return {
        version: 1,
        containerCidSha256: state.shapeRef,
        lattice: 'fcc',
        piecesUsed,
        placements,
        sid_state_sha256: state.id || '',
        sid_route_sha256: '',
        sid_state_canon_sha256: '',
        mode: 'koos.state@1',
        solver: { engine: 'unknown', seed: 0, flags: {} }
      };
    }
    
  }, [activeState, loaded]);

  const onLoaded = (shape: KoosShape) => {
    console.log("📥 ContentStudio: Loading koos.shape@1:", shape.id.substring(0, 24), "...");
    const newCells = shape.cells.map(([i,j,k]) => ({ i, j, k }));
    
    setCells(newCells);
    setLoaded(true);
    
    // Store shape data for reload
    lastLoadedDataRef.current = {
      type: 'shape',
      data: { cells: newCells, shape }
    };

    // Compute view transforms for orientation (following Shape Editor pattern)
    const T_ijk_to_xyz = [
      [0.5, 0.5, 0, 0],    // FCC basis vector 1: (0.5, 0.5, 0)
      [0.5, 0, 0.5, 0],    // FCC basis vector 2: (0.5, 0, 0.5)  
      [0, 0.5, 0.5, 0],    // FCC basis vector 3: (0, 0.5, 0.5)
      [0, 0, 0, 1]         // Homogeneous coordinate
    ];

    console.log("🔄 Computing view transforms...");
    try {
      const v = computeViewTransforms(newCells, ijkToXyz, T_ijk_to_xyz, quickHullWithCoplanarMerge);
      setView(v);
      console.log("🎯 View transforms computed successfully:", v);
      
      // Update stored data with computed view
      if (lastLoadedDataRef.current && lastLoadedDataRef.current.type === 'shape') {
        lastLoadedDataRef.current.data.view = v;
      }
      
      // Set OrbitControls target to the center of the new shape (following Shape Editor pattern)
      setTimeout(() => {
        if ((window as any).setOrbitTarget && v) {
          // Calculate shape center in world coordinates
          const M = [
            [v.M_world[0][0], v.M_world[0][1], v.M_world[0][2], v.M_world[0][3]],
            [v.M_world[1][0], v.M_world[1][1], v.M_world[1][2], v.M_world[1][3]],
            [v.M_world[2][0], v.M_world[2][1], v.M_world[2][2], v.M_world[2][3]],
            [v.M_world[3][0], v.M_world[3][1], v.M_world[3][2], v.M_world[3][3]]
          ];
          
          // Compute bounding box center
          let minX = Infinity, maxX = -Infinity;
          let minY = Infinity, maxY = -Infinity; 
          let minZ = Infinity, maxZ = -Infinity;
          
          for (const cell of newCells) {
            // Transform IJK to world coordinates
            const x = M[0][0] * cell.i + M[0][1] * cell.j + M[0][2] * cell.k + M[0][3];
            const y = M[1][0] * cell.i + M[1][1] * cell.j + M[1][2] * cell.k + M[1][3];
            const z = M[2][0] * cell.i + M[2][1] * cell.j + M[2][2] * cell.k + M[2][3];
            
            minX = Math.min(minX, x); maxX = Math.max(maxX, x);
            minY = Math.min(minY, y); maxY = Math.max(maxY, y);
            minZ = Math.min(minZ, z); maxZ = Math.max(maxZ, z);
          }
          
          const centerX = (minX + maxX) / 2;
          const centerY = (minY + maxY) / 2;
          const centerZ = (minZ + maxZ) / 2;
          
          console.log("🎯 Setting OrbitControls target to:", { centerX, centerY, centerZ });
          (window as any).setOrbitTarget(centerX, centerY, centerZ);
        }
      }, 100);
    } catch (error) {
      console.error("❌ Failed to compute view transforms:", error);
    }
  };

  const handleSavePreset = () => {
    const name = prompt("Enter preset name:");
    if (name && name.trim()) {
      settingsService.current.savePreset(name.trim(), settings);
      alert(`Preset "${name}" saved!`);
    }
  };

  const handleLoadPreset = () => {
    const presets = settingsService.current.loadPresets();
    if (presets.length === 0) {
      alert("No presets saved yet.");
      return;
    }
    
    const presetNames = presets.map(p => p.name);
    const choice = prompt(`Load preset:\n${presetNames.map((name, i) => `${i + 1}. ${name}`).join('\n')}\n\nEnter number:`);
    
    if (choice) {
      const index = parseInt(choice) - 1;
      if (index >= 0 && index < presets.length) {
        setSettings(presets[index].settings);
        alert(`Preset "${presets[index].name}" loaded!`);
      }
    }
  };

  // Mobile detection
  const [isMobile, setIsMobile] = useState(window.innerWidth <= 768);
  
  useEffect(() => {
    const handleResize = () => {
      setIsMobile(window.innerWidth <= 768);
    };
    
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Apply reveal effect when revealK changes
  useEffect(() => {
    if (!solutionGroup || revealOrder.length === 0 || !isSolutionMode) return;
    
    console.log(`👁️ Studio: Applying reveal K=${revealK}/${revealMax}`);
    applyRevealK(solutionGroup, revealOrder, revealK);
  }, [revealK, solutionGroup, revealOrder, revealMax, isSolutionMode]);

  // Apply explosion effect when explosionFactor changes
  useEffect(() => {
    if (!solutionGroup || revealOrder.length === 0 || !isSolutionMode) return;
    
    console.log(`💥 Studio: Applying explosion factor=${explosionFactor.toFixed(2)}`);
    applyExplosion(solutionGroup, revealOrder, explosionFactor);
  }, [explosionFactor, solutionGroup, revealOrder, isSolutionMode]);

  // Reload the currently loaded file
  const handleReloadFile = () => {
    console.log('🔄 handleReloadFile called');
    
    if (!lastLoadedDataRef.current) {
      console.log('🔄 No file data to reload');
      return;
    }
    
    console.log('🔄 Reloading file:', lastLoadedDataRef.current.type);
    
    // Force complete scene clear
    setLoaded(false);
    setCells([]);
    setView(null);
    setSolutionGroup(null);
    
    // Trigger reload after delay to ensure complete cleanup
    setTimeout(() => {
      if (lastLoadedDataRef.current!.type === 'shape') {
        const shape = lastLoadedDataRef.current!.data;
        console.log('🔄 Reloading shape with', shape.cells?.length || 0, 'cells');
        
        // Call onLoaded again to fully rebuild from scratch
        if (shape.shape) {
          onLoaded(shape.shape);
        }
        setIsSolutionMode(false);
      } else if (lastLoadedDataRef.current!.type === 'solution') {
        // For solutions, rebuild from stored JSON
        const solutionData = lastLoadedDataRef.current!.data;
        console.log('🔄 Reloading solution with', solutionData.revealOrder.length, 'pieces');
        
        // Rebuild solution from original JSON
        const oriented = solutionData.solutionJSON;
        const { root, pieceMeta } = buildSolutionGroup(oriented);
        const order = computeRevealOrder(pieceMeta);
        
        setIsSolutionMode(true);
        setSolutionGroup(root);
        setRevealOrder(order);
        setRevealMax(order.length);
        setRevealK(order.length);
        setExplosionFactor(0);
        setLoaded(true);
      }
      
      console.log('✅ File reloaded successfully');
    }, 200);
  };

  return (
    <div className="content-studio-page" style={{ 
      height: '100vh', 
      width: '100vw', 
      display: 'flex', 
      flexDirection: 'column',
      overflow: 'hidden', // Prevent page-level scrolling
      position: 'fixed', // Ensure full viewport coverage
      top: 0,
      left: 0,
      right: 0,
      bottom: 0
    }}>
      {/* Header - Compact three-zone design */}
      <div className="shape-header">
        <div className="header-left">
          <button className="pill pill--chrome" onClick={() => navigate('/')} title="Home">
            ⌂
          </button>
        </div>

        <div className="header-center">
          <button className="pill pill--ghost" onClick={() => setShowBrowseModal(true)} title="Browse Shapes or Solutions">
            Browse
          </button>

          <button 
            className={`pill ${activeEffectId ? 'pill--primary' : 'pill--ghost'}`}
            onClick={() => {
              console.log('🎯 Effects button clicked! Current state:', showEffectsDropdown, 'Will toggle to:', !showEffectsDropdown);
              setShowEffectsDropdown(!showEffectsDropdown);
            }} 
            disabled={!loaded}
            title="Select effect"
          >
            Effects ▼
          </button>

          {activeEffectId && (
            <TransportBar 
              activeEffectId={activeEffectId} 
              isLoaded={loaded} 
              activeEffectInstance={activeEffectInstance}
              isMobile={false}
              onReloadFile={handleReloadFile}
            />
          )}
        </div>

        <div className="header-right">
          <button className="pill pill--ghost" onClick={() => setShowSettings(true)} title="Settings">
            ⚙️
          </button>
          <button className="pill pill--chrome" onClick={() => setShowInfo(true)} title="About Studio">
            ℹ
          </button>
        </div>
      </div>

      {/* Effects Dropdown Menu */}
      {showEffectsDropdown && loaded && (() => {
        console.log('🎯 Rendering dropdown menu, showEffectsDropdown=', showEffectsDropdown, 'loaded=', loaded);
        return true;
      })() && (
        <div 
          onClick={(e) => {
            console.log('🎯 Dropdown container clicked!', e.target);
            e.stopPropagation(); // CRITICAL: Prevent bubbling to Effects button
          }}
          onMouseDown={(e) => {
            console.log('🎯 Dropdown container mousedown!', e.target);
            e.stopPropagation(); // CRITICAL: Prevent bubbling to Effects button
          }}
          style={{
            position: "fixed",
            top: "60px",
            left: "50%",
            transform: "translateX(-50%)",
            backgroundColor: "#fff",
            border: "1px solid #dee2e6",
            borderRadius: "8px",
            boxShadow: "0 4px 12px rgba(0,0,0,0.15)",
            zIndex: 4500,
            minWidth: "200px",
            maxWidth: "90vw",
            overflow: "hidden",
            pointerEvents: "auto"
          }}>
          <button
            onClick={(e) => {
              console.log('🔄 TurnTable button clicked!');
              e.preventDefault();
              e.stopPropagation();
              handleEffectSelect('turntable');
              console.log('🔄 handleEffectSelect(turntable) called');
            }}
            style={{
              width: "100%",
              padding: "0.875rem 1rem",
              minHeight: "44px",
              border: "none",
              backgroundColor: activeEffectId === 'turntable' ? "#e3f2fd" : "transparent",
              textAlign: "left",
              cursor: "pointer",
              fontSize: "0.95rem",
              fontWeight: activeEffectId === 'turntable' ? "600" : "normal",
              color: activeEffectId === 'turntable' ? "#2196F3" : "#333",
              display: "flex",
              alignItems: "center",
              gap: "0.5rem"
            }}
            onMouseEnter={(e) => (e.target as HTMLElement).style.backgroundColor = activeEffectId === 'turntable' ? "#e3f2fd" : "#f5f5f5"}
            onMouseLeave={(e) => (e.target as HTMLElement).style.backgroundColor = activeEffectId === 'turntable' ? "#e3f2fd" : "transparent"}
          >
            <span style={{ fontSize: "1.2rem" }}>🔄</span>
            <span>Turn Table</span>
          </button>
          <button
            onClick={(e) => {
              console.log('🌐 Orbit button clicked!');
              e.preventDefault();
              e.stopPropagation();
              handleEffectSelect('orbit');
              console.log('🌐 handleEffectSelect(orbit) called');
            }}
            style={{
              width: "100%",
              padding: "0.875rem 1rem",
              minHeight: "44px",
              border: "none",
              backgroundColor: activeEffectId === 'orbit' ? "#e3f2fd" : "transparent",
              textAlign: "left",
              cursor: "pointer",
              fontSize: "0.95rem",
              fontWeight: activeEffectId === 'orbit' ? "600" : "normal",
              color: activeEffectId === 'orbit' ? "#2196F3" : "#333",
              display: "flex",
              alignItems: "center",
              gap: "0.5rem"
            }}
            onMouseEnter={(e) => (e.target as HTMLElement).style.backgroundColor = activeEffectId === 'orbit' ? "#e3f2fd" : "#f5f5f5"}
            onMouseLeave={(e) => (e.target as HTMLElement).style.backgroundColor = activeEffectId === 'orbit' ? "#e3f2fd" : "transparent"}
          >
            <span style={{ fontSize: "1.2rem" }}>🌐</span>
            <span>Orbit</span>
          </button>
          <button
            onClick={(e) => {
              console.log('✨ Reveal button clicked!');
              e.preventDefault();
              e.stopPropagation();
              handleEffectSelect('reveal');
              console.log('✨ handleEffectSelect(reveal) called');
            }}
            style={{
              width: "100%",
              padding: "0.875rem 1rem",
              minHeight: "44px",
              border: "none",
              backgroundColor: activeEffectId === 'reveal' ? "#e3f2fd" : "transparent",
              textAlign: "left",
              cursor: "pointer",
              fontSize: "0.95rem",
              fontWeight: activeEffectId === 'reveal' ? "600" : "normal",
              color: activeEffectId === 'reveal' ? "#2196F3" : "#333",
              display: "flex",
              alignItems: "center",
              gap: "0.5rem"
            }}
            onMouseEnter={(e) => (e.target as HTMLElement).style.backgroundColor = activeEffectId === 'reveal' ? "#e3f2fd" : "#f5f5f5"}
            onMouseLeave={(e) => (e.target as HTMLElement).style.backgroundColor = activeEffectId === 'reveal' ? "#e3f2fd" : "transparent"}
          >
            <span style={{ fontSize: "1.2rem" }}>✨</span>
            <span>Reveal</span>
          </button>
          <button
            onClick={(e) => {
              console.log('💥 Explosion button clicked!');
              e.preventDefault();
              e.stopPropagation();
              handleEffectSelect('explosion');
              console.log('💥 handleEffectSelect(explosion) called');
            }}
            style={{
              width: "100%",
              padding: "0.875rem 1rem",
              minHeight: "44px",
              border: "none",
              backgroundColor: activeEffectId === 'explosion' ? "#e3f2fd" : "transparent",
              textAlign: "left",
              cursor: "pointer",
              fontSize: "0.95rem",
              fontWeight: activeEffectId === 'explosion' ? "600" : "normal",
              color: activeEffectId === 'explosion' ? "#2196F3" : "#333",
              display: "flex",
              alignItems: "center",
              gap: "0.5rem"
            }}
            onMouseEnter={(e) => (e.target as HTMLElement).style.backgroundColor = activeEffectId === 'explosion' ? "#e3f2fd" : "#f5f5f5"}
            onMouseLeave={(e) => (e.target as HTMLElement).style.backgroundColor = activeEffectId === 'explosion' ? "#e3f2fd" : "transparent"}
          >
            <span style={{ fontSize: "1.2rem" }}>💥</span>
            <span>Explosion</span>
          </button>
          <button
            onClick={(e) => {
              console.log('🌍 Gravity button clicked!');
              e.preventDefault();
              e.stopPropagation();
              handleEffectSelect('gravity');
              console.log('🌍 handleEffectSelect(gravity) called');
            }}
            style={{
              width: "100%",
              padding: "0.875rem 1rem",
              minHeight: "44px",
              border: "none",
              backgroundColor: activeEffectId === 'gravity' ? "#e3f2fd" : "transparent",
              textAlign: "left",
              cursor: "pointer",
              fontSize: "0.95rem",
              fontWeight: activeEffectId === 'gravity' ? "600" : "normal",
              color: activeEffectId === 'gravity' ? "#2196F3" : "#333",
              display: "flex",
              alignItems: "center",
              gap: "0.5rem"
            }}
            onMouseEnter={(e) => (e.target as HTMLElement).style.backgroundColor = activeEffectId === 'gravity' ? "#e3f2fd" : "#f5f5f5"}
            onMouseLeave={(e) => (e.target as HTMLElement).style.backgroundColor = activeEffectId === 'gravity' ? "#e3f2fd" : "transparent"}
          >
            <span style={{ fontSize: "1.2rem" }}>🌍</span>
            <span>Gravity</span>
          </button>
        </div>
      )}

      {/* Main Content */}
      <div style={{ flex: 1, position: 'relative', overflow: 'hidden' }}>
        {loaded && (view || isSolutionMode) && (
          <StudioCanvas
            cells={isSolutionMode ? undefined : cells}
            view={isSolutionMode ? undefined : view || undefined}
            settings={settings}
            onSettingsChange={setSettings}
            onSceneReady={handleSceneReady}
            effectIsPlaying={activeEffectInstance?.state === 'playing'}
            solutionGroup={isSolutionMode ? (solutionGroup || undefined) : undefined}
          />
        )}

        {/* HUD Chips */}
        {loaded && isSolutionMode && (
          <div className="hud-chip" style={{ left: '12px' }}>
            Solution: Active
          </div>
        )}
        {loaded && activeEffectId && (
          <div className="hud-chip" style={{ left: 'auto', right: '12px' }}>
            Effect: {activeEffectId.charAt(0).toUpperCase() + activeEffectId.slice(1)}
          </div>
        )}

        {/* Solution Dock - Reveal & Explosion Sliders */}
        {revealMax > 0 && isSolutionMode && (
          <div className="solution-dock">
            <div className="dock-inner">
              <div className="slider-group">
                <label className="dock-label">Reveal</label>
                <input
                  type="range"
                  className="dock-slider"
                  min={1}
                  max={revealMax}
                  step={1}
                  value={revealK}
                  onChange={(e) => setRevealK(parseInt(e.target.value, 10))}
                  aria-label="Reveal Solution"
                />
              </div>
              <div className="slider-group">
                <label className="dock-label">Explosion</label>
                <input
                  type="range"
                  className="dock-slider"
                  min={0}
                  max={100}
                  step={1}
                  value={explosionFactor * 100}
                  onChange={(e) => setExplosionFactor(parseInt(e.target.value, 10) / 100)}
                  aria-label="Explosion Amount"
                />
              </div>
            </div>
          </div>
        )}

        {/* Settings Modal */}
        {showSettings && loaded && (
          <SettingsModal
            settings={settings}
            onSettingsChange={setSettings}
            onClose={() => setShowSettings(false)}
          />
        )}
      </div>

      {/* Effect Modals - Outside main content to prevent clipping */}
      <TurnTableModal
        isOpen={showTurnTableModal}
        onClose={handleTurnTableCancel}
        onSave={handleTurnTableSave}
      />

      <OrbitModal
        isOpen={showOrbitModal}
        config={DEFAULT_ORBIT_CONFIG}
        onClose={handleOrbitCancel}
        onSave={handleOrbitSave}
        centroid={realSceneObjects?.centroidWorld.toArray() as [number, number, number] || [0, 0, 0]}
        currentCameraState={undefined}
        onJumpToKeyframe={(index, keyframes) => {
          if (realSceneObjects?.camera && realSceneObjects?.controls && keyframes && keyframes[index]) {
            const key = keyframes[index];
            const camera = realSceneObjects.camera;
            const controls = realSceneObjects.controls;
            
            const startPos = camera.position.clone();
            const startTarget = controls.target.clone();
            const startFov = camera.fov;
            
            const endPos = new THREE.Vector3(...key.pos);
            const endTarget = key.target ? new THREE.Vector3(...key.target) : realSceneObjects.centroidWorld;
            const endFov = key.fov || camera.fov;
            
            const duration = 400;
            const startTime = performance.now();
            
            const animate = () => {
              const elapsed = performance.now() - startTime;
              const progress = Math.min(elapsed / duration, 1);
              const easedProgress = progress < 0.5 ? 2 * progress * progress : -1 + (4 - 2 * progress) * progress;
              
              camera.position.lerpVectors(startPos, endPos, easedProgress);
              controls.target.lerpVectors(startTarget, endTarget, easedProgress);
              camera.fov = startFov + (endFov - startFov) * easedProgress;
              camera.updateProjectionMatrix();
              controls.update();
              
              if (progress < 1) {
                requestAnimationFrame(animate);
              }
            };
            
            animate();
            console.log(`🎥 ContentStudio: Jumping to keyframe ${index}`, key);
          }
        }}
      />

      <RevealModal
        isOpen={showRevealModal}
        onClose={handleRevealCancel}
        onSave={handleRevealSave}
      />

      <ExplosionModal
        isOpen={showExplosionModal}
        onClose={handleExplosionCancel}
        onSave={handleExplosionSave}
      />

      {/* Gravity Modal - Temporarily disabled
      <GravityModal
        isOpen={showGravityModal}
        onClose={handleGravityCancel}
        onSave={handleGravitySave}
      />
      */}

      {/* Browse Selection Modal */}
      {showBrowseModal && (
        <div 
          style={{
            position: "fixed",
            inset: 0,
            backgroundColor: "rgba(0, 0, 0, 0.5)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 5000
          }}
          onClick={() => setShowBrowseModal(false)}
        >
          <div 
            style={{
              backgroundColor: "#fff",
              borderRadius: "12px",
              padding: "2rem",
              maxWidth: "400px",
              width: "90%",
              boxShadow: "0 8px 32px rgba(0,0,0,0.3)"
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <h2 style={{ margin: "0 0 1.5rem 0", fontSize: "1.5rem", fontWeight: "600", textAlign: "center" }}>
              Browse
            </h2>
            <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
              <button
                className="pill pill--primary"
                onClick={() => {
                  setShowBrowseModal(false);
                  setShowShapeBrowser(true);
                }}
                style={{
                  padding: "1rem",
                  fontSize: "1rem",
                  width: "100%",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: "0.5rem"
                }}
              >
                🧩 Browse Shapes
              </button>
              <button
                className="pill pill--primary"
                onClick={() => {
                  setShowBrowseModal(false);
                  setShowSolutionBrowser(true);
                }}
                style={{
                  padding: "1rem",
                  fontSize: "1rem",
                  width: "100%",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: "0.5rem"
                }}
              >
                📂 Browse Solutions
              </button>
              <button
                className="pill pill--ghost"
                onClick={() => setShowBrowseModal(false)}
                style={{
                  padding: "0.75rem",
                  fontSize: "0.95rem",
                  width: "100%"
                }}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Shape Browser Modal */}
      <BrowseContractShapesModal
        open={showShapeBrowser}
        onClose={() => setShowShapeBrowser(false)}
        onLoaded={(shape, shapeName) => {
          console.log("📥 Studio: Shape selected", shape.id, shapeName);
          
          // Stop any active effect
          if (activeEffectInstance) {
            try {
              activeEffectInstance.dispose();
              console.log('🛑 Studio: Stopped active effect before loading shape');
            } catch (error) {
              console.error('❌ Failed to dispose effect:', error);
            }
            setActiveEffectId(null);
            setActiveEffectInstance(null);
          }
          
          // Clear solution mode and reset sliders
          setIsSolutionMode(false);
          setSolutionGroup(null);
          setRevealOrder([]);
          setRevealK(0);
          setRevealMax(0);
          setExplosionFactor(0);
          
          // Temporarily unload to clear scene
          setLoaded(false);
          
          // Load the new shape (onLoaded will set loaded=true)
          setTimeout(() => {
            onLoaded(shape);
            setShowShapeBrowser(false);
            console.log("✅ Studio: Scene reset and shape loaded");
          }, 50);
        }}
      />

      {/* Solution Browser Modal */}
      <BrowseContractSolutionsModal
        open={showSolutionBrowser}
        onClose={() => setShowSolutionBrowser(false)}
        onLoaded={async (solutionJSON, filename) => {
          console.log("📥 Studio: Solution selected", filename);
          
          // Stop any active effect
          if (activeEffectInstance) {
            try {
              activeEffectInstance.dispose();
              console.log('🛑 Studio: Stopped active effect before loading solution');
            } catch (error) {
              console.error('❌ Failed to dispose effect:', error);
            }
            setActiveEffectId(null);
            setActiveEffectInstance(null);
          }
          
          // Clear shape mode
          setView(null);
          setCells([]);
          
          // Temporarily unload to clear scene
          setLoaded(false);
          
          // Load after a brief delay to ensure scene clears
          setTimeout(async () => {
            try {
              // Orient the solution first (computes global positioning)
              const oriented = orientSolutionWorld(solutionJSON);
              console.log(`✅ Oriented ${oriented.pieces?.length || 0} pieces`);
              
              // Build the solution group with high-quality meshes
              const { root, pieceMeta } = buildSolutionGroup(oriented);
              
              // Compute reveal order for sliders
              const order = computeRevealOrder(pieceMeta);
              setRevealOrder(order);
              setRevealMax(order.length);
              setRevealK(order.length); // Show all by default
              setExplosionFactor(0); // Reset explosion
              
              setIsSolutionMode(true);
              setSolutionGroup(root);
              setLoaded(true);
              setShowSolutionBrowser(false);
              
              // Store solution data for reload
              lastLoadedDataRef.current = {
                type: 'solution',
                data: {
                  group: root,
                  revealOrder: order,
                  solutionJSON: oriented
                }
              };
              
              console.log(`✅ Studio: Scene reset and solution loaded with ${order.length} pieces`);
            } catch (error) {
              console.error("❌ Studio: Failed to load solution:", error);
            }
          }, 50);
        }}
      />

      {/* Info Modal */}
      <InfoModal
        isOpen={showInfo}
        onClose={() => setShowInfo(false)}
        title="Studio"
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', fontSize: '0.95rem' }}>
          <p style={{ margin: 0 }}>• <strong>Load Solution or Shape</strong> to begin</p>
          <p style={{ margin: 0 }}>• Choose an <strong>Effect</strong> and adjust its settings</p>
          <p style={{ margin: 0 }}>• Load/Save <strong>Presets</strong> for your favorite configurations</p>
          <p style={{ margin: 0 }}>• Use <strong>Start, Stop, and Record</strong> to control playback</p>
          <p style={{ margin: 0 }}>• You can open Studio from Home or from any completed solution</p>
          <div style={{ 
            marginTop: '1rem', 
            padding: '0.75rem', 
            background: '#f0f9ff', 
            borderLeft: '3px solid #2196F3',
            borderRadius: '4px',
            fontSize: '0.875rem',
            color: '#1e40af'
          }}>
            💡 <strong>Tip:</strong> Use "Back to Shape" to select a different puzzle shape.
          </div>
        </div>
        <div style={{ lineHeight: '1.6', marginTop: '1rem' }}>
          <h4>View Controls</h4>
          <ul style={{ paddingLeft: '1.5rem' }}>
            <li><strong>Rotate:</strong> Left-click and drag</li>
            <li><strong>Pan:</strong> Right-click and drag</li>
            <li><strong>Zoom:</strong> Mouse wheel or pinch</li>
          </ul>
        </div>
      </InfoModal>

      {/* Menu Modal */}
      {showMenuModal && (
        <div 
          style={{
            position: 'fixed',
            inset: 0,
            pointerEvents: 'none',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 2000
          }}
          onMouseMove={(e) => {
            if (menuDragging) {
              setMenuPosition({
                x: e.clientX - menuDragOffset.x,
                y: e.clientY - menuDragOffset.y
              });
            }
          }}
          onMouseUp={() => setMenuDragging(false)}
        >
          <div 
            style={{
              position: menuPosition.x === 0 && menuPosition.y === 0 ? 'relative' : 'fixed',
              left: menuPosition.x === 0 && menuPosition.y === 0 ? 'auto' : `${menuPosition.x}px`,
              top: menuPosition.y === 0 && menuPosition.y === 0 ? 'auto' : `${menuPosition.y}px`,
              background: '#fff',
              borderRadius: '12px',
              padding: '0',
              maxWidth: '500px',
              width: '90%',
              boxShadow: '0 8px 32px rgba(0,0,0,0.3)',
              cursor: menuDragging ? 'grabbing' : 'default',
              pointerEvents: 'auto'
            }}
          >
            {/* Draggable Header */}
            <div 
              style={{
                padding: '1rem 2rem',
                cursor: 'grab',
                userSelect: 'none',
                borderBottom: '1px solid #dee2e6',
                borderRadius: '12px 12px 0 0',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}
              onMouseDown={(e) => {
                setMenuDragging(true);
                const rect = e.currentTarget.parentElement!.getBoundingClientRect();
                setMenuDragOffset({
                  x: e.clientX - rect.left,
                  y: e.clientY - rect.top
                });
              }}
            >
              <div style={{ fontSize: '2rem' }}>☰</div>
            </div>
            
            <div style={{ padding: '1rem 2rem 2rem 2rem' }}>
            <h2 style={{ margin: '0 0 1.5rem 0', fontSize: '1.5rem', textAlign: 'center' }}>Menu</h2>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              <button
                className="btn"
                onClick={() => {
                  setShowMenuModal(false);
                  navigate('/shape');
                }}
                style={{
                  width: '100%',
                  padding: '1rem',
                  fontSize: '1rem',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.75rem',
                  background: '#6c757d',
                  color: '#fff',
                  border: 'none',
                  justifyContent: 'flex-start'
                }}
              >
                <span style={{ fontSize: '1.5rem' }}>🧩</span>
                <span>Shape Selector</span>
              </button>
              
              <button
                className="btn"
                onClick={() => {
                  setShowMenuModal(false);
                  navigate('/solutions');
                }}
                style={{
                  width: '100%',
                  padding: '1rem',
                  fontSize: '1rem',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.75rem',
                  background: '#6c757d',
                  color: '#fff',
                  border: 'none',
                  justifyContent: 'flex-start'
                }}
              >
                <span style={{ fontSize: '1.5rem' }}>📂</span>
                <span>Solution Viewer</span>
              </button>
              
              <button
                className="btn"
                onClick={() => {
                  setShowMenuModal(false);
                  setShowSettings(true);
                }}
                style={{
                  width: '100%',
                  padding: '1rem',
                  fontSize: '1rem',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.75rem',
                  background: '#9c27b0',
                  color: '#fff',
                  border: 'none',
                  justifyContent: 'flex-start'
                }}
              >
                <span style={{ fontSize: '1.5rem' }}>⚙️</span>
                <span>Studio Settings</span>
              </button>

              <button
                className="btn"
                onClick={() => {
                  setShowMenuModal(false);
                  setShowInfo(true);
                }}
                style={{
                  width: '100%',
                  padding: '1rem',
                  fontSize: '1rem',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.75rem',
                  background: '#6c757d',
                  color: '#fff',
                  border: 'none',
                  justifyContent: 'flex-start'
                }}
              >
                <span style={{ fontSize: '1.5rem' }}>💡</span>
                <span>Help & Information</span>
              </button>

              <button
                className="btn"
                onClick={() => setShowMenuModal(false)}
                style={{
                  width: '100%',
                  padding: '0.75rem',
                  fontSize: '0.95rem',
                  background: 'transparent',
                  color: '#6c757d',
                  border: '1px solid #dee2e6'
                }}
              >
                Close
              </button>
            </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ContentStudioPage;
