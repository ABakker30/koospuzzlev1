# Movie Page Pattern - Complete Template

This document defines the complete pattern for all movie effect pages (Turntable, Gravity, Reveal, etc.)

## Current Status: TurntableMoviePage ✅

**Working:**
- ✅ SceneCanvas piece rendering with HDR
- ✅ Camera positioning
- ✅ Effect activation (TurnTableModal → Config → Instance)
- ✅ Animation loop (requestAnimationFrame tick)
- ✅ TransportBar (Play/Pause/Record)
- ✅ Credits modal on completion
- ✅ StrictMode disabled (prevents double-mount clearing pieces)

**To Add:**
- ⏳ Reveal slider (show 1..N pieces)
- ⏳ Explosion slider (0-1 explosion factor)
- ⏳ Visibility flags (hide sliders during recording)
- ⏳ Environment settings (materials, lighting, HDR)
- ⏳ Settings modal button in header

---

## Required Components

### 1. State Management

```typescript
// Reveal slider
const [revealK, setRevealK] = useState<number>(0);      // Current number of pieces shown
const [revealMax, setRevealMax] = useState<number>(0);  // Max pieces available

// Explosion slider  
const [explosionFactor, setExplosionFactor] = useState<number>(0); // 0 = assembled, 1 = exploded

// Environment settings
const settingsService = useRef(new StudioSettingsService());
const [envSettings, setEnvSettings] = useState<StudioSettings>(() => {
  // Load from localStorage
  const stored = localStorage.getItem('contentStudio_v2');
  return stored ? JSON.parse(stored) : DEFAULT_STUDIO_SETTINGS;
});
const [showEnvSettings, setShowEnvSettings] = useState(false);

// Visibility flags
const [showSliders, setShowSliders] = useState(true); // Hide during recording
```

### 2. Visible Pieces Logic

```typescript
const visiblePlacedPieces = useMemo(() => {
  if (revealMax === 0) {
    // No reveal slider - show all pieces
    return Array.from(placed.values());
  }
  
  // Use reveal slider to show 1..N pieces
  const sorted = Array.from(placed.values()).sort((a, b) => a.placedAt - b.placedAt);
  return sorted.slice(0, revealK);
}, [placed, revealK, revealMax]);
```

### 3. SceneCanvas Integration

```typescript
<SceneCanvas
  cells={cells}
  view={view}
  editMode={false}
  mode="add"
  onCellsChange={() => {}}
  placedPieces={visiblePlacedPieces}  // Use filtered pieces
  hidePlacedPieces={false}
  explosionFactor={explosionFactor}    // Wire explosion slider
  settings={envSettings}               // Wire environment settings
  containerOpacity={0}
  containerColor="#888888"
  visibility={{
    xray: false,
    emptyOnly: false,
    sliceY: { center: 0.5, thickness: 1.0 }
  }}
  puzzleMode="oneOfEach"
  onSelectPiece={() => {}}
  onSceneReady={handleSceneReady}
/>
```

### 4. Slider Overlay UI

```typescript
{/* Reveal / Explosion Sliders - Bottom Right (hidden during recording) */}
{showSliders && (revealMax > 0 || explosionFactor > 0) && (
  <div style={{
    position: 'absolute',
    bottom: '20px',
    right: '20px',
    background: 'rgba(0, 0, 0, 0.8)',
    padding: '15px',
    borderRadius: '8px',
    minWidth: '200px',
    zIndex: 100
  }}>
    {/* Reveal Slider */}
    {revealMax > 0 && (
      <div style={{ marginBottom: '15px' }}>
        <div style={{ color: '#fff', marginBottom: '5px', fontSize: '12px' }}>
          Reveal: {revealK}/{revealMax} pieces
        </div>
        <input
          type="range"
          min={1}
          max={revealMax}
          step={1}
          value={revealK}
          onChange={(e) => setRevealK(parseInt(e.target.value, 10))}
          style={{ width: '100%' }}
        />
      </div>
    )}
    
    {/* Explosion Slider */}
    <div>
      <div style={{ color: '#fff', marginBottom: '5px', fontSize: '12px' }}>
        Explosion: {Math.round(explosionFactor * 100)}%
      </div>
      <input
        type="range"
        min={0}
        max={100}
        step={1}
        value={explosionFactor * 100}
        onChange={(e) => setExplosionFactor(parseInt(e.target.value, 10) / 100)}
        style={{ width: '100%' }}
      />
    </div>
  </div>
)}
```

### 5. Environment Settings Button

Add to header:

```typescript
<button
  className="pill pill--ghost"
  onClick={() => setShowEnvSettings(true)}
  title="Environment settings"
>
  ⚙️ Scene
</button>
```

### 6. Settings Modal

```typescript
import { SettingsModal } from '../../components/SettingsModal';

{showEnvSettings && (
  <SettingsModal
    settings={envSettings}
    onSettingsChange={(newSettings) => {
      setEnvSettings(newSettings);
      settingsService.current.saveSettings(newSettings);
    }}
    onClose={() => setShowEnvSettings(false)}
  />
)}
```

### 7. Effect Initialization

When solution loads:

```typescript
useEffect(() => {
  if (!solution) return;
  
  // ... load pieces ...
  
  // Enable reveal slider
  setRevealMax(placedMap.size);
  setRevealK(placedMap.size); // Show all initially
}, [solution]);
```

### 8. Recording Integration

Hide sliders during recording:

```typescript
// In TransportBar's onRecordingStart callback
setShowSliders(false);

// In TransportBar's onRecordingComplete callback  
setShowSliders(true);
```

---

## Complete File Structure

```
TurntableMoviePage.tsx
├── Imports
│   ├── React hooks
│   ├── SceneCanvas
│   ├── ViewTransforms
│   ├── Effect components (TurnTableEffect, TurnTableModal)
│   ├── TransportBar
│   ├── CreditsModal
│   ├── SettingsModal
│   └── StudioSettingsService
│
├── State
│   ├── Solution data (cells, view, placed)
│   ├── Scene objects (camera, renderer, controls)
│   ├── Effect context
│   ├── Active effect instance
│   ├── Reveal slider (revealK, revealMax)
│   ├── Explosion slider (explosionFactor)
│   ├── Environment settings (envSettings, showEnvSettings)
│   ├── Modal states (showTurnTableModal, showCreditsModal)
│   └── Recording state (recordedBlob, showSliders)
│
├── Effects
│   ├── Load solution from URL
│   ├── Build effect context when scene ready
│   ├── Auto-activate from URL params
│   ├── Animation loop (tick effect on every frame)
│   └── Camera positioning
│
├── Handlers
│   ├── handleActivateEffect()
│   ├── handleTurnTableSave()
│   ├── handleRecordingComplete()
│   ├── handleCreditsSubmit()
│   └── handleDownloadVideo()
│
└── UI
    ├── Header (back, title, configure, settings)
    ├── SceneCanvas (with all wired props)
    ├── Slider overlay (reveal + explosion)
    ├── TransportBar (when effect active)
    ├── TurnTableModal
    ├── CreditsModal
    └── SettingsModal
```

---

## Usage Pattern for New Effect Pages

1. **Copy** TurntableMoviePage.tsx
2. **Rename** file and component (e.g., GravityMoviePage)
3. **Replace** TurnTableEffect → GravityEffect
4. **Replace** TurnTableModal → GravityModal  
5. **Update** effect ID in TransportBar
6. **Keep** all other patterns identical:
   - Reveal/explosion sliders
   - Environment settings
   - Animation loop
   - TransportBar integration
   - Credits flow

---

## Critical Patterns

### Animation Loop (DO NOT CHANGE)

```typescript
useEffect(() => {
  if (!activeEffectInstance) return;
  
  let animationFrameId: number;
  const tick = () => {
    activeEffectInstance.tick(performance.now());
    animationFrameId = requestAnimationFrame(tick);
  };
  
  animationFrameId = requestAnimationFrame(tick);
  
  return () => cancelAnimationFrame(animationFrameId);
}, [activeEffectInstance]);
```

This prevents React re-renders and enables smooth recording with credits!

### StrictMode (MUST BE DISABLED)

In `main.tsx`:
```typescript
// StrictMode causes double-mount that clears SceneCanvas pieces
ReactDOM.createRoot(document.getElementById('root')!).render(
  // <React.StrictMode>  // DISABLED
    <AuthProvider>
      <App />
    </AuthProvider>
  // </React.StrictMode>
)
```

---

## Next Steps

1. ✅ Add reveal slider to TurntableMoviePage
2. ✅ Add explosion slider to TurntableMoviePage  
3. ✅ Add environment settings to TurntableMoviePage
4. ✅ Test complete workflow
5. ✅ Create GravityMoviePage using pattern
6. ✅ Create RevealMoviePage using pattern
7. ✅ Update SolutionViewer to use pattern

---

**Pattern Status**: 🟡 In Progress (85% complete)
**Ready for**: Adding sliders and settings
