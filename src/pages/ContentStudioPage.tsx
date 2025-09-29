import { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { LoadShapeModal } from '../components/LoadShapeModal';
import { StudioCanvas } from '../components/StudioCanvas';
import { SettingsModal } from '../components/SettingsModal';
import { StudioSettingsService } from '../services/StudioSettingsService';
import { StudioSettings, DEFAULT_STUDIO_SETTINGS } from '../types/studio';
import type { ShapeFile } from '../services/ShapeFileService';
import type { ViewTransforms } from '../services/ViewTransforms';
import { computeViewTransforms } from '../services/ViewTransforms';
import { quickHullWithCoplanarMerge } from '../lib/quickhull-adapter';
import { ijkToXyz } from '../lib/ijk';
import type { IJK } from '../types/shape';

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
  
  // Load settings on mount
  useEffect(() => {
    const loadedSettings = settingsService.current.loadSettings();
    setSettings(loadedSettings);
  }, []);

  // Auto-save settings on change
  useEffect(() => {
    settingsService.current.saveSettings(settings);
  }, [settings]);

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
        <div className="actions">
          <button className="btn" onClick={() => navigate('/')}>Home</button>
          <button className="btn" onClick={() => setShowLoad(true)}>Browse</button>
          <button className="btn" onClick={() => alert('Save coming soon!')} disabled={!loaded}>Save</button>
          <button className="btn" onClick={() => setShowSettings(!showSettings)} disabled={!loaded}>Settings</button>
          <button className="btn" onClick={() => alert('Special effects coming soon!')} disabled={!loaded}>Special Effect</button>
          <button className="btn" onClick={() => alert('Share coming soon!')} disabled={!loaded}>Share</button>
        </div>
      </div>

      {/* Main Content */}
      <div style={{ flex: 1, position: 'relative', overflow: 'hidden' }}>
        {loaded && view ? (
          <StudioCanvas
            cells={cells}
            view={view}
            settings={settings}
            onSettingsChange={setSettings}
          />
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
      <LoadShapeModal
        open={showLoad}
        onClose={() => setShowLoad(false)}
        onLoaded={onLoaded}
      />
    </div>
  );
};

export default ContentStudioPage;
