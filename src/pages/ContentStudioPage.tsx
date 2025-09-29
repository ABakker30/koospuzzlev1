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

    // Compute view transforms for orientation
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
          <button className="btn" onClick={() => setShowSettings(!showSettings)} disabled={!loaded}>Special Effect</button>
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
