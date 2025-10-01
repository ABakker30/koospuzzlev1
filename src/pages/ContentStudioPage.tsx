import { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { StudioCanvas } from '../components/StudioCanvas';
import { SettingsModal } from '../components/SettingsModal';
import { LoadShapeModal } from '../components/LoadShapeModal';
import { StudioSettingsService } from '../services/StudioSettingsService';
import { StudioSettings, DEFAULT_STUDIO_SETTINGS } from '../types/studio';
import type { ShapeFile } from '../services/ShapeFileService';
import type { ViewTransforms } from '../services/ViewTransforms';
import { computeViewTransforms } from '../services/ViewTransforms';
import { quickHullWithCoplanarMerge } from '../lib/quickhull-adapter';
import { ijkToXyz } from '../lib/ijk';
import type { IJK } from '../types/shape';
import { EffectHost } from '../studio/EffectHost';
import { buildEffectContext, type EffectContext } from '../studio/EffectContext';
import { getEffect } from '../effects/registry';
import { TurnTableEffect } from '../effects/turntable/TurnTableEffect';
import type { TurnTableConfig } from '../effects/turntable/presets';
import * as THREE from 'three';

const ContentStudioPage: React.FC = () => {
  const navigate = useNavigate();
  const settingsService = useRef(new StudioSettingsService());
  
  // Core state
  const [cells, setCells] = useState<IJK[]>([]);
  const [view, setView] = useState<ViewTransforms | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [showLoad, setShowLoad] = useState(false);
  
  // Settings state
  const [settings, setSettings] = useState<StudioSettings>(DEFAULT_STUDIO_SETTINGS);
  const [showSettings, setShowSettings] = useState(false);
  const [settingsLoaded, setSettingsLoaded] = useState(false);
  
  // Effect context state
  const [effectContext, setEffectContext] = useState<EffectContext | null>(null);
  
  // Effects dropdown state
  const [showEffectsDropdown, setShowEffectsDropdown] = useState(false);
  const [activeEffectId, setActiveEffectId] = useState<string | null>(null);
  const [activeEffectInstance, setActiveEffectInstance] = useState<any>(null);
  
  // Build effect context when shape is loaded (demo with mock objects for PR 3)
  useEffect(() => {
    if (!loaded || !view) return;
    
    console.log('🎬 ContentStudioPage: Building demo EffectContext for PR 3');
    try {
      // Create mock THREE.js objects for demonstration
      // Real integration with StudioCanvas will be added in a later PR
      const mockScene = new THREE.Scene();
      const mockGroup = new THREE.Group();
      const mockCamera = new THREE.PerspectiveCamera(75, 1, 0.1, 1000);
      const mockRenderer = new THREE.WebGLRenderer();
      const mockControls = { enabled: true }; // Mock OrbitControls
      const mockCentroid = new THREE.Vector3(0, 0, 0);
      
      const context = buildEffectContext({
        scene: mockScene,
        spheresGroup: mockGroup,
        camera: mockCamera,
        controls: mockControls as any,
        renderer: mockRenderer,
        centroidWorld: mockCentroid
      });
      
      setEffectContext(context);
      console.log('✅ ContentStudioPage: Demo EffectContext built successfully');
      
      // Test the context APIs
      console.log('🧪 Testing EffectContext APIs:');
      
      // Test preview clock
      const unsubscribePreview = context.time.preview.onTick(() => {});
      unsubscribePreview();
      
      // Test capture clock
      const unsubscribeCapture = context.time.capture.onFrame(() => {});
      unsubscribeCapture();
      
      // Test storage
      context.storage.saveManifest({ test: 'data' });
      context.storage.loadManifest('test-id');
      context.storage.listManifests();
      
      console.log('✅ All EffectContext APIs tested successfully');
      
    } catch (error) {
      console.error('❌ ContentStudioPage: Failed to build EffectContext:', error);
    }
  }, [loaded, view]);

  // Effects dropdown handlers
  const handleEffectSelect = (effectId: string) => {
    console.log(`effect=${effectId} action=open-selection`);
    setShowEffectsDropdown(false);
    
    if (activeEffectInstance) {
      // Block if another effect is active (simple approach for PR 6)
      alert('Please clear the current effect before selecting a new one.');
      return;
    }
    
    if (effectId === 'turntable') {
      console.log(`effect=${effectId} action=open-modal`);
      // For now, create effect immediately (modal integration will be added)
      handleActivateEffect(effectId, null);
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

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (showEffectsDropdown) {
        setShowEffectsDropdown(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showEffectsDropdown]);
  
  
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

  return (
    <div className="content-studio-page" style={{ height: '100vh', width: '100vw', display: 'flex', flexDirection: 'column' }}>
      {/* Header */}
      <div style={{ 
        display: "flex", 
        alignItems: "center", 
        justifyContent: "space-between",
        padding: ".75rem 1rem", 
        borderBottom: "1px solid #eee", 
        background: "#fff"
      }}>
        {/* Left aligned buttons */}
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
              <div style={{
                position: "absolute",
                top: "100%",
                left: 0,
                marginTop: "0.25rem",
                backgroundColor: "#fff",
                border: "1px solid #ccc",
                borderRadius: "4px",
                boxShadow: "0 2px 8px rgba(0,0,0,0.1)",
                zIndex: 1000,
                minWidth: "150px"
              }}>
                <button
                  onClick={() => handleEffectSelect('turntable')}
                  style={{
                    width: "100%",
                    padding: "0.5rem",
                    border: "none",
                    backgroundColor: "transparent",
                    textAlign: "left",
                    cursor: "pointer",
                    fontSize: "0.875rem"
                  }}
                  onMouseEnter={(e) => (e.target as HTMLElement).style.backgroundColor = "#f0f0f0"}
                  onMouseLeave={(e) => (e.target as HTMLElement).style.backgroundColor = "transparent"}
                >
                  Turn Table
                </button>
                <button
                  disabled
                  style={{
                    width: "100%",
                    padding: "0.5rem",
                    border: "none",
                    backgroundColor: "transparent",
                    textAlign: "left",
                    cursor: "not-allowed",
                    fontSize: "0.875rem",
                    color: "#999"
                  }}
                  title="Coming soon"
                >
                  Keyframe Animation (coming soon)
                </button>
                {activeEffectId && (
                  <>
                    <hr style={{ margin: "0.25rem 0", border: "none", borderTop: "1px solid #eee" }} />
                    <button
                      onClick={handleClearEffect}
                      style={{
                        width: "100%",
                        padding: "0.5rem",
                        border: "none",
                        backgroundColor: "transparent",
                        textAlign: "left",
                        cursor: "pointer",
                        fontSize: "0.875rem",
                        color: "#dc3545"
                      }}
                      onMouseEnter={(e) => (e.target as HTMLElement).style.backgroundColor = "#f0f0f0"}
                      onMouseLeave={(e) => (e.target as HTMLElement).style.backgroundColor = "transparent"}
                    >
                      Clear Active Effect
                    </button>
                  </>
                )}
              </div>
            )}
          </div>
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

      {/* Main Content */}
      <div style={{ flex: 1, position: 'relative', overflow: 'hidden' }}>
        {loaded && view ? (
          <>
            <StudioCanvas
              cells={cells}
              view={view}
              settings={settings}
              onSettingsChange={setSettings}
            />
            {/* Effect Host - renders active effect placeholder + transport bar */}
            <div style={{ position: 'absolute', top: '1rem', right: '1rem', zIndex: 10 }}>
              <EffectHost 
                isLoaded={loaded} 
                effectContext={effectContext}
                activeEffectId={activeEffectId}
                activeEffectInstance={activeEffectInstance}
                onClearEffect={handleClearEffect}
              />
            </div>
          </>
        ) : (
          <div style={{ height: '100%', background: '#f8f9fa' }}>
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

      {/* Load Shape Modal */}
      {showLoad && (
        <LoadShapeModal
          open={showLoad}
          onLoaded={onLoaded}
          onClose={() => setShowLoad(false)}
        />
      )}
    </div>
  );
};

export default ContentStudioPage;
