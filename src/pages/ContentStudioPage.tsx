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
import { buildSolutionGroup } from './solution-viewer/pipeline/build';
import { loadAllPieces } from '../engines/piecesLoader';
import type { SolutionJSON } from './solution-viewer/types';
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
import * as THREE from 'three';

const ContentStudioPage: React.FC = () => {
  const navigate = useNavigate();
  const { activeState } = useActiveState();
  const settingsService = useRef(new StudioSettingsService());
  const lastLoadedShapeRef = useRef<string | null>(null);
  
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

  // Effects dropdown handlers
  const handleEffectSelect = (effectId: string) => {
    console.log(`effect=${effectId} action=open-selection`);
    console.log('🔍 DEBUG: isLoaded=', loaded, 'activeEffectId=', activeEffectId, 'activeEffectInstance=', !!activeEffectInstance);
    setShowEffectsDropdown(false);
    
    if (activeEffectInstance) {
      // Auto-clear current effect when selecting a new one
      console.log('🔄 Auto-clearing current effect before selecting new one');
      handleClearEffect();
    }
    
    if (effectId === 'turntable') {
      console.log(`effect=${effectId} action=open-modal`);
      console.log('🔍 About to set showTurnTableModal=true, current state=', showTurnTableModal);
      // Show modal for configuration
      setShowTurnTableModal(true);
      console.log('🔍 setShowTurnTableModal(true) called');
    } else if (effectId === 'orbit') {
      console.log(`effect=${effectId} action=open-modal`);
      // Show modal for configuration
      setShowOrbitModal(true);
    } else if (effectId === 'reveal') {
      console.log(`effect=${effectId} action=open-modal`);
      // Show modal for configuration
      setShowRevealModal(true);
    } else if (effectId === 'explosion') {
      console.log(`effect=${effectId} action=open-modal`);
      // Show modal for configuration
      setShowExplosionModal(true);
    }
  };

  const handleActivateEffect = (effectId: string, config: TurnTableConfig | OrbitConfig | RevealConfig | ExplosionConfig | null) => {
    if (!effectContext) {
      console.error('❌ Cannot activate effect: EffectContext not available');
      return;
    }

    try {
      const effectDef = getEffect(effectId);
      if (!effectDef || !effectDef.constructor) {
        console.error(`❌ Effect not found or no constructor: ${effectId}`);
        return;
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
      
    } catch (error) {
      console.error(`❌ Failed to activate effect ${effectId}:`, error);
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
  const handleRevealSave = (config: RevealConfig) => {
    console.log(`effect=reveal action=confirm-modal config=${JSON.stringify(config)}`);
    setShowRevealModal(false);
    handleActivateEffect('reveal', config);
  };

  const handleRevealCancel = () => {
    console.log('effect=reveal action=cancel-modal');
    setShowRevealModal(false);
  };

  // Explosion modal handlers
  const handleExplosionSave = (config: ExplosionConfig) => {
    console.log(`effect=explosion action=confirm-modal config=${JSON.stringify(config)}`);
    setShowExplosionModal(false);
    handleActivateEffect('explosion', config);
  };

  const handleExplosionCancel = () => {
    console.log('effect=explosion action=cancel-modal');
    setShowExplosionModal(false);
  };

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
      {/* Header */}
      <div style={{ 
        padding: isMobile ? ".5rem .75rem" : ".75rem 1rem", 
        borderBottom: "1px solid #eee", 
        background: "#fff"
      }}>
        {/* Page Title & Menu */}
        <div style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: "0.5rem"
        }}>
          <div style={{
            fontSize: isMobile ? "1.25rem" : "1.5rem",
            fontWeight: "600",
            color: "#2196F3",
            display: "flex",
            alignItems: "center",
            gap: "0.5rem"
          }}>
            <span>🎥</span>
            <span>Content Studio</span>
          </div>
          
          <button 
            className="btn" 
            onClick={() => setShowMenuModal(true)}
            style={{ 
              height: "2.5rem", 
              width: "2.5rem", 
              minWidth: "2.5rem", 
              padding: "0", 
              display: "flex", 
              alignItems: "center", 
              justifyContent: "center",
              fontFamily: "monospace", 
              fontSize: isMobile ? "1.4em" : "1.5em" 
            }}
            title="Menu"
          >
            ☰
          </button>
        </div>
        
        {isMobile ? (
          /* Mobile: Up to two lines */
          <>
            {/* Mobile Line 1: Browse, Effects | Settings, Home */}
            <div style={{ 
              display: "flex", 
              alignItems: "center", 
              justifyContent: "space-between",
              marginBottom: activeEffectId ? "0.5rem" : "0"
            }}>
              <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                {/* Effects Dropdown */}
                <div style={{ position: "relative" }}>
                <button 
                  className="btn" 
                  style={{ 
                    height: "2.5rem",
                    background: activeEffectId ? "#2196F3" : "#6c757d",
                    color: "#fff",
                    border: "none",
                    fontWeight: "500"
                  }} 
                  onClick={() => setShowEffectsDropdown(!showEffectsDropdown)} 
                  disabled={!loaded}
                >
                  {activeEffectId ? `🎬 ${activeEffectId.charAt(0).toUpperCase() + activeEffectId.slice(1)}` : "🎬 Effects"} ▼
                </button>
                
                {showEffectsDropdown && loaded && (
                  <div 
                    data-dropdown="effects"
                    style={{
                      position: "fixed",
                      top: "6rem",
                      left: "1rem",
                      backgroundColor: "#fff",
                      border: "1px solid #dee2e6",
                      borderRadius: "8px",
                      boxShadow: "0 4px 12px rgba(0,0,0,0.15)",
                      zIndex: 4000,
                      minWidth: "200px",
                      pointerEvents: "auto",
                      overflow: "hidden"
                    }}>
                    <button
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        handleEffectSelect('turntable');
                      }}
                      style={{
                        width: "100%",
                        padding: "0.875rem 1rem",
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
                        e.preventDefault();
                        e.stopPropagation();
                        handleEffectSelect('orbit');
                      }}
                      style={{
                        width: "100%",
                        padding: "0.875rem 1rem",
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
                        e.preventDefault();
                        e.stopPropagation();
                        handleEffectSelect('reveal');
                      }}
                      style={{
                        width: "100%",
                        padding: "0.875rem 1rem",
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
                        e.preventDefault();
                        e.stopPropagation();
                        handleEffectSelect('explosion');
                      }}
                      style={{
                        width: "100%",
                        padding: "0.875rem 1rem",
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
                  </div>
                )}
              </div>
              </div>
            </div>
            
            {/* Mobile Line 2: Transport Controls (only when effect is active) */}
            {activeEffectId && (
              <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                <TransportBar 
                  activeEffectId={activeEffectId} 
                  isLoaded={loaded} 
                  activeEffectInstance={activeEffectInstance}
                  isMobile={true}
                />
              </div>
            )}
          </>
        ) : (
          /* Desktop: Single line */
          <div style={{ 
            display: "flex", 
            alignItems: "center", 
            justifyContent: "space-between"
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
              {/* Browse removed - Studio auto-loads from active state */}
              
              {/* Effects Dropdown */}
              <div style={{ position: "relative" }}>
                <button 
                  className="btn" 
                  style={{ 
                    height: "2.5rem",
                    background: activeEffectId ? "#2196F3" : "#6c757d",
                    color: "#fff",
                    border: "none",
                    fontWeight: "500"
                  }} 
                  onClick={() => setShowEffectsDropdown(!showEffectsDropdown)} 
                  disabled={!loaded}
                >
                  {activeEffectId ? `🎬 ${activeEffectId.charAt(0).toUpperCase() + activeEffectId.slice(1)}` : "🎬 Effects"} ▼
                </button>
                
                {showEffectsDropdown && loaded && (
                  <div 
                    data-dropdown="effects"
                    style={{
                      position: "fixed",
                      top: "4rem",
                      left: "1rem",
                      backgroundColor: "#fff",
                      border: "1px solid #dee2e6",
                      borderRadius: "8px",
                      boxShadow: "0 4px 12px rgba(0,0,0,0.15)",
                      zIndex: 4000,
                      minWidth: "200px",
                      pointerEvents: "auto",
                      overflow: "hidden"
                    }}>
                    <button
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        handleEffectSelect('turntable');
                      }}
                      style={{
                        width: "100%",
                        padding: "0.875rem 1rem",
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
                        e.preventDefault();
                        e.stopPropagation();
                        handleEffectSelect('orbit');
                      }}
                      style={{
                        width: "100%",
                        padding: "0.875rem 1rem",
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
                        e.preventDefault();
                        e.stopPropagation();
                        handleEffectSelect('reveal');
                      }}
                      style={{
                        width: "100%",
                        padding: "0.875rem 1rem",
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
                        e.preventDefault();
                        e.stopPropagation();
                        handleEffectSelect('explosion');
                      }}
                      style={{
                        width: "100%",
                        padding: "0.875rem 1rem",
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
                  </div>
                )}
              </div>
              
              {/* Transport Controls - show inline when effect is active (desktop only) */}
              {activeEffectId && !isMobile && (
                <TransportBar 
                  activeEffectId={activeEffectId} 
                  isLoaded={loaded} 
                  activeEffectInstance={activeEffectInstance}
                  isMobile={false}
                />
              )}
            </div>
          </div>
        )}
      </div>

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

        {/* Settings Modal */}
        {showSettings && loaded && (
          <SettingsModal
            settings={settings}
            onSettingsChange={setSettings}
            onClose={() => setShowSettings(false)}
          />
        )}

        {/* Turn Table Modal */}
        <TurnTableModal
          isOpen={showTurnTableModal}
          onClose={handleTurnTableCancel}
          onSave={handleTurnTableSave}
        />

        {/* Orbit Modal */}
        <OrbitModal
          isOpen={showOrbitModal}
          config={DEFAULT_ORBIT_CONFIG}
          onClose={handleOrbitCancel}
          onSave={handleOrbitSave}
          centroid={realSceneObjects?.centroidWorld.toArray() as [number, number, number] || [0, 0, 0]}
          currentCameraState={undefined} // Don't pass static state - OrbitModal will use window.getCurrentCameraState()
          onJumpToKeyframe={(index, keyframes) => {
            // Direct keyframe preview - works even without active effect
            if (realSceneObjects?.camera && realSceneObjects?.controls && keyframes && keyframes[index]) {
              const key = keyframes[index];
              const camera = realSceneObjects.camera;
              const controls = realSceneObjects.controls;
              
              // Animate camera to keyframe position
              const startPos = camera.position.clone();
              const startTarget = controls.target.clone();
              const startFov = camera.fov;
              
              const endPos = new THREE.Vector3(...key.pos);
              const endTarget = key.target ? new THREE.Vector3(...key.target) : realSceneObjects.centroidWorld;
              const endFov = key.fov || camera.fov;
              
              const duration = 400; // 400ms animation
              const startTime = performance.now();
              
              const animate = () => {
                const elapsed = performance.now() - startTime;
                const progress = Math.min(elapsed / duration, 1);
                const easedProgress = progress < 0.5 ? 2 * progress * progress : -1 + (4 - 2 * progress) * progress;
                
                // Interpolate position
                camera.position.lerpVectors(startPos, endPos, easedProgress);
                
                // Interpolate target
                controls.target.lerpVectors(startTarget, endTarget, easedProgress);
                
                // Interpolate FOV
                camera.fov = startFov + (endFov - startFov) * easedProgress;
                camera.updateProjectionMatrix();
                
                // Update controls
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

        {/* Reveal Modal */}
        <RevealModal
          isOpen={showRevealModal}
          onClose={handleRevealCancel}
          onSave={handleRevealSave}
        />

        {/* Explosion Modal */}
        <ExplosionModal
          isOpen={showExplosionModal}
          onClose={handleExplosionCancel}
          onSave={handleExplosionSave}
        />

      </div>


      {/* Info Modal */}
      <InfoModal
        isOpen={showInfo}
        onClose={() => setShowInfo(false)}
        title="Content Studio Help"
      >
        <div style={{ lineHeight: '1.6' }}>
          <p style={{ marginTop: 0, padding: '0.75rem', backgroundColor: '#f0f9ff', borderRadius: '6px', borderLeft: '4px solid #2196F3' }}>
            <strong>Create stunning 3D animations!</strong> Studio automatically loads your shapes and solutions. 
            Add cinematic effects, adjust lighting, and record beautiful turntable animations!
          </p>

          <h4>Getting Started</h4>
          <ul style={{ paddingLeft: '1.5rem' }}>
            <li>Load a shape or solution in another page, then come here</li>
            <li>Your model appears ready to animate</li>
            <li>Choose an effect and hit Play!</li>
          </ul>

          <h4>Animation Effects</h4>
          <p style={{ fontWeight: 500 }}>🔄 Turntable:</p>
          <ul style={{ paddingLeft: '1.5rem' }}>
            <li>Smooth rotation around the model</li>
            <li>Perfect for showcasing your creations</li>
            <li>Adjust speed and direction</li>
          </ul>

          <p style={{ fontWeight: 500 }}>🎬 Orbit:</p>
          <ul style={{ paddingLeft: '1.5rem' }}>
            <li>Create custom camera movements</li>
            <li>Set keyframes for dramatic angles</li>
            <li>Great for complex presentations</li>
          </ul>

          <h4>Recording</h4>
          <ul style={{ paddingLeft: '1.5rem' }}>
            <li>Click <strong>Record</strong> to capture frames</li>
            <li>Play your animation while recording</li>
            <li>Click <strong>Stop</strong> to download all frames as a ZIP</li>
            <li>Use frames to create videos or GIFs</li>
          </ul>

          <h4>Customization</h4>
          <ul style={{ paddingLeft: '1.5rem' }}>
            <li><strong>Settings:</strong> Adjust lighting, shadows, and materials</li>
            <li><strong>Ground:</strong> Show/hide the floor plane</li>
            <li><strong>Background:</strong> Change colors and gradients</li>
          </ul>

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
                  background: '#6c757d',
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
