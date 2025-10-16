import { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { StudioCanvas } from '../components/StudioCanvas';
import { SettingsModal } from '../components/SettingsModal';
import { LoadShapeModal } from '../components/LoadShapeModal';
import { InfoModal } from '../components/InfoModal';
import { StudioSettingsService } from '../services/StudioSettingsService';
import { StudioSettings, DEFAULT_STUDIO_SETTINGS } from '../types/studio';
import type { ShapeFile } from '../services/ShapeFileService';
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
import * as THREE from 'three';

const ContentStudioPage: React.FC = () => {
  const navigate = useNavigate();
  const settingsService = useRef(new StudioSettingsService());
  
  // Core state
  const [cells, setCells] = useState<IJK[]>([]);
  const [view, setView] = useState<ViewTransforms | null>(null);
  const [showInfo, setShowInfo] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [showLoad, setShowLoad] = useState(false);
  
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
  
  // Build effect context when real scene objects are available
  useEffect(() => {
    if (!loaded || !view || !realSceneObjects) return;
    
    console.log('🎬 ContentStudioPage: Building EffectContext with REAL scene objects');
    try {
      const context = buildEffectContext({
        scene: realSceneObjects.scene,
        spheresGroup: realSceneObjects.spheresGroup,
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
        spheresGroup: !!realSceneObjects.spheresGroup,
        centroidWorld: realSceneObjects.centroidWorld
      });
      
    } catch (error) {
      console.error('❌ ContentStudioPage: Failed to build EffectContext:', error);
    }
  }, [loaded, view, realSceneObjects]);

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
    }
  };

  const handleActivateEffect = (effectId: string, config: TurnTableConfig | null) => {
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
    handleActivateEffect('orbit', config as any); // TODO: Fix typing
  };

  const handleOrbitCancel = () => {
    console.log('effect=orbit action=cancel-modal');
    setShowOrbitModal(false);
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

  const onLoaded = (file: ShapeFile) => {
    console.log("📥 ContentStudio: Loading file:", file);
    const newCells = file.cells.map(([i,j,k]) => ({ i, j, k }));
    
    setCells(newCells);
    setLoaded(true);
    setShowLoad(false);

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
                <button className="btn" style={{ height: "2.5rem" }} onClick={() => setShowLoad(true)}>Browse</button>
                
                {/* Effects Dropdown */}
                <div style={{ position: "relative" }}>
                <button 
                  className="btn" 
                  style={{ height: "2.5rem" }} 
                  onClick={() => setShowEffectsDropdown(!showEffectsDropdown)} 
                  disabled={!loaded}
                >
                  Effects ▼
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
                      borderRadius: "4px",
                      boxShadow: "0 2px 8px rgba(0,0,0,0.15)",
                      zIndex: 4000,
                      minWidth: "180px",
                      pointerEvents: "auto"
                    }}>
                    <button
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        handleEffectSelect('turntable');
                      }}
                      style={{
                        width: "100%",
                        padding: "0.75rem 1rem",
                        border: "none",
                        backgroundColor: "transparent",
                        textAlign: "left",
                        cursor: "pointer",
                        fontSize: "0.9rem",
                        borderRadius: "4px 4px 0 0"
                      }}
                      onMouseEnter={(e) => (e.target as HTMLElement).style.backgroundColor = "#f8f9fa"}
                      onMouseLeave={(e) => (e.target as HTMLElement).style.backgroundColor = "transparent"}
                    >
                      Turn Table
                    </button>
                    <button
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        handleEffectSelect('orbit');
                      }}
                      style={{
                        width: "100%",
                        padding: "0.75rem 1rem",
                        border: "none",
                        backgroundColor: "transparent",
                        textAlign: "left",
                        cursor: "pointer",
                        fontSize: "0.9rem",
                        borderRadius: "0 0 4px 4px"
                      }}
                      onMouseEnter={(e) => (e.target as HTMLElement).style.backgroundColor = "#f8f9fa"}
                      onMouseLeave={(e) => (e.target as HTMLElement).style.backgroundColor = "transparent"}
                    >
                      Orbit (Keyframes)
                    </button>
                  </div>
                )}
              </div>
              </div>
              
              <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                <button 
                  className="btn" 
                  onClick={() => setShowSettings(!showSettings)} 
                  disabled={!loaded}
                  style={{ 
                    height: "2.5rem", 
                    width: "2.5rem", 
                    minWidth: "2.5rem", 
                    padding: "0", 
                    display: "flex", 
                    alignItems: "center", 
                    justifyContent: "center",
                    fontFamily: "monospace", 
                    fontSize: "1.4em" 
                  }}
                  title="Settings"
                >
                  ⚙
                </button>
                <button 
                  className="btn" 
                  onClick={() => setShowInfo(true)}
                  style={{ 
                    height: "2.5rem", 
                    width: "2.5rem", 
                    minWidth: "2.5rem", 
                    padding: "0", 
                    display: "flex", 
                    alignItems: "center", 
                    justifyContent: "center",
                    fontFamily: "monospace", 
                    fontSize: "1.2em" 
                  }}
                  title="Help & Information"
                >
                  ℹ
                </button>
                <button 
                  className="btn" 
                  onClick={() => navigate('/')}
                  style={{ 
                    height: "2.5rem", 
                    width: "2.5rem", 
                    minWidth: "2.5rem", 
                    padding: "0", 
                    display: "flex", 
                    alignItems: "center", 
                    justifyContent: "center",
                    fontFamily: "monospace", 
                    fontSize: "1.4em" 
                  }}
                  title="Home"
                >
                  ⌂
                </button>
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
              <button className="btn" style={{ height: "2.5rem" }} onClick={() => setShowLoad(true)}>Browse</button>
              
              {/* Effects Dropdown */}
              <div style={{ position: "relative" }}>
                <button 
                  className="btn" 
                  style={{ height: "2.5rem" }} 
                  onClick={() => setShowEffectsDropdown(!showEffectsDropdown)} 
                  disabled={!loaded}
                >
                  Effects ▼
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
                      borderRadius: "4px",
                      boxShadow: "0 2px 8px rgba(0,0,0,0.15)",
                      zIndex: 4000,
                      minWidth: "180px",
                      pointerEvents: "auto"
                    }}>
                    <button
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        handleEffectSelect('turntable');
                      }}
                      style={{
                        width: "100%",
                        padding: "0.75rem 1rem",
                        border: "none",
                        backgroundColor: "transparent",
                        textAlign: "left",
                        cursor: "pointer",
                        fontSize: "0.9rem",
                        borderRadius: "4px 4px 0 0"
                      }}
                      onMouseEnter={(e) => (e.target as HTMLElement).style.backgroundColor = "#f8f9fa"}
                      onMouseLeave={(e) => (e.target as HTMLElement).style.backgroundColor = "transparent"}
                    >
                      Turn Table
                    </button>
                    <button
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        handleEffectSelect('orbit');
                      }}
                      style={{
                        width: "100%",
                        padding: "0.75rem 1rem",
                        border: "none",
                        backgroundColor: "transparent",
                        textAlign: "left",
                        cursor: "pointer",
                        fontSize: "0.9rem",
                        borderRadius: "0 0 4px 4px"
                      }}
                      onMouseEnter={(e) => (e.target as HTMLElement).style.backgroundColor = "#f8f9fa"}
                      onMouseLeave={(e) => (e.target as HTMLElement).style.backgroundColor = "transparent"}
                    >
                      Orbit (Keyframes)
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

            {/* Right aligned icon buttons */}
            <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
              <button 
                className="btn" 
                onClick={() => setShowSettings(!showSettings)} 
                disabled={!loaded}
                style={{ 
                  height: "2.5rem", 
                  width: "2.5rem", 
                  minWidth: "2.5rem", 
                  padding: "0", 
                  display: "flex", 
                  alignItems: "center", 
                  justifyContent: "center",
                  fontFamily: "monospace", 
                  fontSize: "1.4em" 
                }}
                title="Settings"
              >
                ⚙
              </button>
              <button 
                className="btn" 
                onClick={() => setShowInfo(true)}
                style={{ 
                  height: "2.5rem", 
                  width: "2.5rem", 
                  minWidth: "2.5rem", 
                  padding: "0", 
                  display: "flex", 
                  alignItems: "center", 
                  justifyContent: "center",
                  fontFamily: "monospace", 
                  fontSize: "1.2em" 
                }}
                title="Help & Information"
              >
                ℹ
              </button>
              <button 
                className="btn" 
                onClick={() => navigate('/')}
                style={{ 
                  height: "2.5rem", 
                  width: "2.5rem", 
                  minWidth: "2.5rem", 
                  padding: "0", 
                  display: "flex", 
                  alignItems: "center", 
                  justifyContent: "center",
                  fontFamily: "monospace", 
                  fontSize: "1.4em" 
                }}
                title="Home"
              >
                ⌂
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Main Content */}
      <div style={{ flex: 1, position: 'relative', overflow: 'hidden' }}>
        {loaded && view && (
          <>
            <StudioCanvas
              cells={cells}
              view={view}
              settings={settings}
              onSettingsChange={setSettings}
              onSceneReady={handleSceneReady}
              effectIsPlaying={activeEffectInstance?.state === 'playing'}
            />
          </>
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
          onClose={handleOrbitCancel}
          onSave={handleOrbitSave}
          centroid={realSceneObjects?.centroidWorld.toArray() as [number, number, number] || [0, 0, 0]}
          currentCameraState={realSceneObjects ? {
            position: realSceneObjects.camera.position.toArray() as [number, number, number],
            target: realSceneObjects.controls?.target?.toArray() as [number, number, number] || [0, 0, 0],
            fov: realSceneObjects.camera.fov
          } : undefined}
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

      </div>

      {/* Load Shape Modal */}
      {showLoad && (
        <LoadShapeModal
          open={showLoad}
          onLoaded={onLoaded}
          onClose={() => setShowLoad(false)}
        />
      )}

      {/* Info Modal */}
      <InfoModal
        isOpen={showInfo}
        onClose={() => setShowInfo(false)}
        title="Content Studio Help"
      >
        <div style={{ lineHeight: '1.6' }}>
          <h4 style={{ marginTop: 0 }}>Getting Started</h4>
          <ul style={{ paddingLeft: '1.5rem' }}>
            <li><strong>Browse:</strong> Load a shape file to begin</li>
            <li><strong>Effects:</strong> Choose Turntable or Orbit to animate your shape</li>
            <li><strong>Settings:</strong> Customize lighting, materials, and appearance</li>
          </ul>

          <h4>Effects</h4>
          <p><strong>Turntable:</strong></p>
          <ul style={{ paddingLeft: '1.5rem' }}>
            <li>Simple rotation effect around vertical axis</li>
            <li>Configure speed, direction, and duration</li>
            <li>Great for product-style presentations</li>
          </ul>

          <p><strong>Orbit:</strong></p>
          <ul style={{ paddingLeft: '1.5rem' }}>
            <li>Create custom camera movements with keyframes</li>
            <li>Define camera position, target, and field of view</li>
            <li>Preview and jump between keyframes</li>
            <li>Record smooth orbits for dynamic views</li>
          </ul>

          <h4>Playback Controls</h4>
          <ul style={{ paddingLeft: '1.5rem' }}>
            <li><strong>Play/Pause:</strong> Control effect playback</li>
            <li><strong>Record:</strong> Capture frames during playback</li>
            <li><strong>Stop:</strong> End recording and download frames as ZIP</li>
          </ul>

          <h4>Settings</h4>
          <ul style={{ paddingLeft: '1.5rem' }}>
            <li><strong>Lighting:</strong> Ambient, directional, and shadow settings</li>
            <li><strong>Material:</strong> Brightness, metalness, roughness</li>
            <li><strong>Ground:</strong> Toggle floor plane visibility</li>
            <li><strong>Background:</strong> Solid colors or gradients</li>
          </ul>

          <h4>Camera Controls</h4>
          <ul style={{ paddingLeft: '1.5rem' }}>
            <li><strong>Rotate:</strong> Left-click and drag</li>
            <li><strong>Pan:</strong> Right-click and drag</li>
            <li><strong>Zoom:</strong> Mouse wheel or pinch</li>
          </ul>
        </div>
      </InfoModal>
    </div>
  );
};

export default ContentStudioPage;
