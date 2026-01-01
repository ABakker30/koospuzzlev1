import { useState, useEffect, useRef, useCallback } from 'react';

export interface PhysicsSettings {
  // Ground settings
  groundExtent: number;      // Multiplier for ground size relative to placemat
  groundThickness: number;   // Half-height of ground slab
  groundOffset: number;      // How far below placemat min.y
  
  // Placemat slab settings
  placematThickness: number; // Thickness of placemat slab
  
  // Piece settings
  linearDamping: number;
  angularDamping: number;
  pieceFriction: number;     // Friction coefficient for piece collisions
  pieceRestitution: number;  // Bounciness of pieces (0=dead, 1=perfectly elastic)
  
  // Simulation settings
  gravity: number;           // Gravity magnitude (positive = down)
  dropHeight: number;        // Height to offset pieces for drop
  maxSimTime: number;        // Max seconds before force settling
  
  // Settling thresholds
  settledLinearVelocity: number;  // Speed threshold for "settled" (m/s)
  settledAngularVelocity: number; // Angular speed threshold (rad/s)
  
  // Removal settings
  removalMargin: number;     // Multiplier for sphere radius margin outside mat
}

// Real-world units: 1 unit = 1 meter
// Geometry is now scaled to real meters via WORLD_SCALE
const DEFAULT_PHYSICS_SETTINGS: PhysicsSettings = {
  groundExtent: 5.0,         // 5x placemat size
  groundThickness: 0.01,     // 1cm
  groundOffset: 0.002,       // 2mm below placemat
  placematThickness: 0.005,  // 5mm silicone mat
  linearDamping: 0.3,        // Moderate damping to help pieces stop
  angularDamping: 0.3,       // Moderate damping to help pieces stop
  pieceFriction: 0.3,        // ABS plastic friction
  pieceRestitution: 0.5,     // Bouncy plastic
  gravity: 9.81,             // Real-world gravity m/s²
  dropHeight: 0.20,          // 20cm drop - visible animation
  maxSimTime: 3.0,           // 3 seconds max before force settling
  settledLinearVelocity: 0.01,   // Higher threshold = freeze earlier
  settledAngularVelocity: 0.05,  // Higher threshold = freeze earlier (was 0.005)
  removalMargin: 6,          // 6x sphere radius
};

const STORAGE_KEY = 'sandbox.physicsSettings';
const SETTINGS_VERSION = 6; // Increment to force reset of stale settings
const VERSION_KEY = 'sandbox.physicsSettingsVersion';

export function loadPhysicsSettings(): PhysicsSettings {
  try {
    const storedVersion = localStorage.getItem(VERSION_KEY);
    const currentVersion = storedVersion ? parseInt(storedVersion, 10) : 0;
    
    // If version mismatch, clear old settings and use defaults
    if (currentVersion !== SETTINGS_VERSION) {
      console.log(`🔄 [PHYSICS] Settings version changed (${currentVersion} → ${SETTINGS_VERSION}), resetting to defaults`);
      localStorage.removeItem(STORAGE_KEY);
      localStorage.setItem(VERSION_KEY, String(SETTINGS_VERSION));
      return DEFAULT_PHYSICS_SETTINGS;
    }
    
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      return { ...DEFAULT_PHYSICS_SETTINGS, ...JSON.parse(stored) };
    }
  } catch {
    // ignore
  }
  return DEFAULT_PHYSICS_SETTINGS;
}

export function savePhysicsSettings(settings: PhysicsSettings): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch {
    // ignore
  }
}

interface PhysicsSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  settings: PhysicsSettings;
  onSettingsChange: (settings: PhysicsSettings) => void;
  onReinitialize: () => void;
  onDropTest: () => void;
  onRemoveTest: () => void;
  physicsState: string; // Current physics state for enabling/disabling buttons
}

export function PhysicsSettingsModal({
  isOpen,
  onClose,
  settings,
  onSettingsChange,
  onReinitialize,
  onDropTest,
  onRemoveTest,
  physicsState,
}: PhysicsSettingsModalProps) {
  const [localSettings, setLocalSettings] = useState<PhysicsSettings>(settings);
  const [isDragging, setIsDragging] = useState(false);
  const [position, setPosition] = useState({ x: 100, y: 100 });
  const dragOffset = useRef({ x: 0, y: 0 });

  useEffect(() => {
    setLocalSettings(settings);
  }, [settings]);

  const handleMouseDown = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if ((e.target as HTMLElement).closest('input, button, select')) return;
    setIsDragging(true);
    dragOffset.current = {
      x: e.clientX - position.x,
      y: e.clientY - position.y,
    };
  }, [position]);

  useEffect(() => {
    if (!isDragging) return;

    const handleMouseMove = (e: MouseEvent) => {
      setPosition({
        x: e.clientX - dragOffset.current.x,
        y: e.clientY - dragOffset.current.y,
      });
    };

    const handleMouseUp = () => {
      setIsDragging(false);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging]);

  const updateSetting = <K extends keyof PhysicsSettings>(
    key: K,
    value: PhysicsSettings[K]
  ) => {
    const newSettings = { ...localSettings, [key]: value };
    setLocalSettings(newSettings);
    onSettingsChange(newSettings);
    savePhysicsSettings(newSettings);
  };

  const resetToDefaults = () => {
    setLocalSettings(DEFAULT_PHYSICS_SETTINGS);
    onSettingsChange(DEFAULT_PHYSICS_SETTINGS);
    savePhysicsSettings(DEFAULT_PHYSICS_SETTINGS);
  };

  if (!isOpen) return null;

  const sliderStyle: React.CSSProperties = {
    width: '100%',
    accentColor: '#6366f1',
  };

  const labelStyle: React.CSSProperties = {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '4px',
    color: '#e2e8f0',
    fontSize: '13px',
  };

  const sectionStyle: React.CSSProperties = {
    marginBottom: '16px',
    paddingBottom: '12px',
    borderBottom: '1px solid #374151',
  };

  const sectionTitleStyle: React.CSSProperties = {
    color: '#94a3b8',
    fontSize: '11px',
    fontWeight: 600,
    textTransform: 'uppercase',
    letterSpacing: '0.5px',
    marginBottom: '8px',
  };

  return (
    <div
      style={{
        position: 'fixed',
        left: position.x,
        top: position.y,
        zIndex: 1000,
        background: 'linear-gradient(135deg, #1e293b 0%, #0f172a 100%)',
        borderRadius: '12px',
        boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)',
        width: '320px',
        maxHeight: '80vh',
        overflowY: 'auto',
        border: '1px solid #334155',
        cursor: isDragging ? 'grabbing' : 'default',
      }}
      onMouseDown={handleMouseDown}
    >
      {/* Header */}
      <div
        style={{
          padding: '16px',
          borderBottom: '1px solid #334155',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          cursor: 'grab',
        }}
      >
        <span style={{ color: '#f8fafc', fontWeight: 600, fontSize: '16px' }}>
          ⚛️ Physics Settings
        </span>
        <button
          onClick={onClose}
          style={{
            background: 'none',
            border: 'none',
            color: '#94a3b8',
            fontSize: '20px',
            cursor: 'pointer',
            padding: '4px',
          }}
        >
          ×
        </button>
      </div>

      {/* Content */}
      <div style={{ padding: '16px' }}>
        {/* Ground Settings */}
        <div style={sectionStyle}>
          <div style={sectionTitleStyle}>Ground Surface</div>
          
          <div style={labelStyle}>
            <span>Ground Extent (×placemat)</span>
            <span style={{ color: '#6366f1', fontWeight: 600 }}>{localSettings.groundExtent.toFixed(1)}</span>
          </div>
          <input
            type="range"
            min="2"
            max="20"
            step="0.5"
            value={localSettings.groundExtent}
            onChange={(e) => updateSetting('groundExtent', parseFloat(e.target.value))}
            style={sliderStyle}
          />

          <div style={{ ...labelStyle, marginTop: '12px' }}>
            <span>Ground Thickness</span>
            <span style={{ color: '#6366f1', fontWeight: 600 }}>{localSettings.groundThickness.toFixed(2)}</span>
          </div>
          <input
            type="range"
            min="0.1"
            max="2.0"
            step="0.1"
            value={localSettings.groundThickness}
            onChange={(e) => updateSetting('groundThickness', parseFloat(e.target.value))}
            style={sliderStyle}
          />

          <div style={{ ...labelStyle, marginTop: '12px' }}>
            <span>Ground Offset (below mat)</span>
            <span style={{ color: '#6366f1', fontWeight: 600 }}>{localSettings.groundOffset.toFixed(2)}</span>
          </div>
          <input
            type="range"
            min="0.01"
            max="0.5"
            step="0.01"
            value={localSettings.groundOffset}
            onChange={(e) => updateSetting('groundOffset', parseFloat(e.target.value))}
            style={sliderStyle}
          />
        </div>

        {/* Placemat Settings */}
        <div style={sectionStyle}>
          <div style={sectionTitleStyle}>Placemat Collider</div>
          
          <div style={labelStyle}>
            <span>Slab Thickness</span>
            <span style={{ color: '#6366f1', fontWeight: 600 }}>{localSettings.placematThickness.toFixed(2)}</span>
          </div>
          <input
            type="range"
            min="0.05"
            max="0.5"
            step="0.01"
            value={localSettings.placematThickness}
            onChange={(e) => updateSetting('placematThickness', parseFloat(e.target.value))}
            style={sliderStyle}
          />
        </div>

        {/* Piece Settings */}
        <div style={sectionStyle}>
          <div style={sectionTitleStyle}>Piece Dynamics</div>
          
          <div style={labelStyle}>
            <span>Linear Damping</span>
            <span style={{ color: '#6366f1', fontWeight: 600 }}>{localSettings.linearDamping.toFixed(2)}</span>
          </div>
          <input
            type="range"
            min="0"
            max="2"
            step="0.05"
            value={localSettings.linearDamping}
            onChange={(e) => updateSetting('linearDamping', parseFloat(e.target.value))}
            style={sliderStyle}
          />

          <div style={{ ...labelStyle, marginTop: '12px' }}>
            <span>Angular Damping</span>
            <span style={{ color: '#6366f1', fontWeight: 600 }}>{localSettings.angularDamping.toFixed(2)}</span>
          </div>
          <input
            type="range"
            min="0"
            max="2"
            step="0.05"
            value={localSettings.angularDamping}
            onChange={(e) => updateSetting('angularDamping', parseFloat(e.target.value))}
            style={sliderStyle}
          />

          <div style={{ ...labelStyle, marginTop: '12px' }}>
            <span>Friction</span>
            <span style={{ color: '#6366f1', fontWeight: 600 }}>{localSettings.pieceFriction.toFixed(2)}</span>
          </div>
          <input
            type="range"
            min="0"
            max="1"
            step="0.05"
            value={localSettings.pieceFriction}
            onChange={(e) => updateSetting('pieceFriction', parseFloat(e.target.value))}
            style={sliderStyle}
          />

          <div style={{ ...labelStyle, marginTop: '12px' }}>
            <span>Restitution (Bounce)</span>
            <span style={{ color: '#6366f1', fontWeight: 600 }}>{localSettings.pieceRestitution.toFixed(2)}</span>
          </div>
          <input
            type="range"
            min="0"
            max="1"
            step="0.05"
            value={localSettings.pieceRestitution}
            onChange={(e) => updateSetting('pieceRestitution', parseFloat(e.target.value))}
            style={sliderStyle}
          />
        </div>

        {/* Simulation Settings */}
        <div style={sectionStyle}>
          <div style={sectionTitleStyle}>Simulation</div>
          
          <div style={labelStyle}>
            <span>Gravity (m/s²)</span>
            <span style={{ color: '#6366f1', fontWeight: 600 }}>{localSettings.gravity.toFixed(1)}</span>
          </div>
          <input
            type="range"
            min="1"
            max="20"
            step="0.5"
            value={localSettings.gravity}
            onChange={(e) => updateSetting('gravity', parseFloat(e.target.value))}
            style={sliderStyle}
          />

          <div style={{ ...labelStyle, marginTop: '12px' }}>
            <span>Drop Height (m)</span>
            <span style={{ color: '#6366f1', fontWeight: 600 }}>{localSettings.dropHeight.toFixed(2)}</span>
          </div>
          <input
            type="range"
            min="0.05"
            max="1.0"
            step="0.05"
            value={localSettings.dropHeight}
            onChange={(e) => updateSetting('dropHeight', parseFloat(e.target.value))}
            style={sliderStyle}
          />

          <div style={{ ...labelStyle, marginTop: '12px' }}>
            <span>Max Sim Time (s)</span>
            <span style={{ color: '#6366f1', fontWeight: 600 }}>{localSettings.maxSimTime.toFixed(1)}</span>
          </div>
          <input
            type="range"
            min="1"
            max="15"
            step="0.5"
            value={localSettings.maxSimTime}
            onChange={(e) => updateSetting('maxSimTime', parseFloat(e.target.value))}
            style={sliderStyle}
          />
        </div>

        {/* Settling Thresholds */}
        <div style={sectionStyle}>
          <div style={sectionTitleStyle}>Settling Thresholds</div>
          
          <div style={labelStyle}>
            <span>Linear Velocity (m/s)</span>
            <span style={{ color: '#6366f1', fontWeight: 600 }}>{localSettings.settledLinearVelocity.toFixed(3)}</span>
          </div>
          <input
            type="range"
            min="0.001"
            max="0.05"
            step="0.001"
            value={localSettings.settledLinearVelocity}
            onChange={(e) => updateSetting('settledLinearVelocity', parseFloat(e.target.value))}
            style={sliderStyle}
          />
          <div style={{ color: '#64748b', fontSize: '10px', marginTop: '2px' }}>
            Higher = settle faster (less precise)
          </div>

          <div style={{ ...labelStyle, marginTop: '12px' }}>
            <span>Angular Velocity (rad/s)</span>
            <span style={{ color: '#6366f1', fontWeight: 600 }}>{localSettings.settledAngularVelocity.toFixed(3)}</span>
          </div>
          <input
            type="range"
            min="0.001"
            max="0.05"
            step="0.001"
            value={localSettings.settledAngularVelocity}
            onChange={(e) => updateSetting('settledAngularVelocity', parseFloat(e.target.value))}
            style={sliderStyle}
          />
          <div style={{ color: '#64748b', fontSize: '10px', marginTop: '2px' }}>
            Higher = settle faster (less precise)
          </div>
        </div>

        {/* Removal Settings */}
        <div style={{ marginBottom: '16px' }}>
          <div style={sectionTitleStyle}>Removal Circle</div>
          
          <div style={labelStyle}>
            <span>Margin (×sphere radius)</span>
            <span style={{ color: '#6366f1', fontWeight: 600 }}>{localSettings.removalMargin.toFixed(0)}</span>
          </div>
          <input
            type="range"
            min="2"
            max="15"
            step="1"
            value={localSettings.removalMargin}
            onChange={(e) => updateSetting('removalMargin', parseFloat(e.target.value))}
            style={sliderStyle}
          />
        </div>

        {/* Physics Test Buttons */}
        <div style={sectionStyle}>
          <div style={sectionTitleStyle}>Physics Tests</div>
          <div style={{ display: 'flex', gap: '8px', marginBottom: '8px' }}>
            <button
              onClick={onDropTest}
              disabled={physicsState !== 'ready'}
              style={{
                flex: 1,
                padding: '10px',
                background: physicsState === 'ready' 
                  ? 'linear-gradient(135deg, #10b981, #059669)' 
                  : '#374151',
                color: '#fff',
                border: 'none',
                borderRadius: '6px',
                cursor: physicsState === 'ready' ? 'pointer' : 'not-allowed',
                fontSize: '13px',
                fontWeight: 600,
                opacity: physicsState === 'ready' ? 1 : 0.5,
              }}
            >
              ⬇️ Drop Test
            </button>
            <button
              onClick={onRemoveTest}
              disabled={physicsState !== 'settled'}
              style={{
                flex: 1,
                padding: '10px',
                background: physicsState === 'settled' 
                  ? 'linear-gradient(135deg, #f59e0b, #d97706)' 
                  : '#374151',
                color: '#fff',
                border: 'none',
                borderRadius: '6px',
                cursor: physicsState === 'settled' ? 'pointer' : 'not-allowed',
                fontSize: '13px',
                fontWeight: 600,
                opacity: physicsState === 'settled' ? 1 : 0.5,
              }}
            >
              🔄 Remove Test
            </button>
          </div>
          <div style={{ color: '#94a3b8', fontSize: '11px', textAlign: 'center' }}>
            State: {physicsState}
          </div>
        </div>

        {/* Action Buttons */}
        <div style={{ display: 'flex', gap: '8px' }}>
          <button
            onClick={resetToDefaults}
            style={{
              flex: 1,
              padding: '10px',
              background: '#374151',
              color: '#e2e8f0',
              border: 'none',
              borderRadius: '6px',
              cursor: 'pointer',
              fontSize: '13px',
              fontWeight: 500,
            }}
          >
            Reset Defaults
          </button>
          <button
            onClick={onReinitialize}
            style={{
              flex: 1,
              padding: '10px',
              background: 'linear-gradient(135deg, #6366f1, #4f46e5)',
              color: '#fff',
              border: 'none',
              borderRadius: '6px',
              cursor: 'pointer',
              fontSize: '13px',
              fontWeight: 600,
            }}
          >
            Re-initialize
          </button>
        </div>
      </div>
    </div>
  );
}
