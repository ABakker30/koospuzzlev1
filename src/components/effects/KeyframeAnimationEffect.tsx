import React, { useState } from 'react';

export interface KeyframeAnimationConfig {
  duration: number; // Animation duration in seconds
  fps: number; // Frames per second
  easing: 'linear' | 'ease-in' | 'ease-out' | 'ease-in-out';
  loop: boolean;
  keyframes: CameraKeyframe[];
  export: {
    format: 'mp4' | 'gif' | 'frames';
    quality: 'low' | 'medium' | 'high';
    resolution: '720p' | '1080p' | '4k';
  };
}

export interface CameraKeyframe {
  id: string;
  time: number; // Time in seconds
  position: { x: number; y: number; z: number };
  target: { x: number; y: number; z: number };
  fov?: number; // Optional FOV change
  name?: string; // Optional keyframe name
}

interface KeyframeAnimationEffectProps {
  config: KeyframeAnimationConfig;
  onConfigChange: (config: KeyframeAnimationConfig) => void;
  onPreview: () => void;
  onExport: () => void;
}

const DEFAULT_CONFIG: KeyframeAnimationConfig = {
  duration: 5.0,
  fps: 30,
  easing: 'ease-in-out',
  loop: false,
  keyframes: [],
  export: {
    format: 'mp4',
    quality: 'medium',
    resolution: '1080p'
  }
};

export const KeyframeAnimationEffect: React.FC<KeyframeAnimationEffectProps> = ({
  config = DEFAULT_CONFIG,
  onConfigChange,
  onPreview,
  onExport
}) => {
  const [activeTab, setActiveTab] = useState<'timeline' | 'settings' | 'export'>('timeline');

  const updateConfig = (updates: Partial<KeyframeAnimationConfig>) => {
    onConfigChange({ ...config, ...updates });
  };

  const addKeyframe = () => {
    const newKeyframe: CameraKeyframe = {
      id: `keyframe-${Date.now()}`,
      time: config.keyframes.length * (config.duration / 4), // Distribute evenly
      position: { x: 0, y: 0, z: 10 },
      target: { x: 0, y: 0, z: 0 },
      name: `Keyframe ${config.keyframes.length + 1}`
    };

    updateConfig({
      keyframes: [...config.keyframes, newKeyframe]
    });
  };

  const removeKeyframe = (id: string) => {
    updateConfig({
      keyframes: config.keyframes.filter(kf => kf.id !== id)
    });
  };

  return (
    <div style={containerStyle}>
      {/* Tab Navigation */}
      <div style={tabsStyle}>
        {(['timeline', 'settings', 'export'] as const).map(tab => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            style={{
              ...tabButtonStyle,
              backgroundColor: activeTab === tab ? '#007bff' : '#f8f9fa',
              color: activeTab === tab ? 'white' : '#333'
            }}
          >
            {tab.charAt(0).toUpperCase() + tab.slice(1)}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      <div style={contentStyle}>
        {activeTab === 'timeline' && (
          <div>
            <div style={sectionHeaderStyle}>
              <h4>Animation Timeline</h4>
              <button onClick={addKeyframe} style={addButtonStyle}>
                + Add Keyframe
              </button>
            </div>

            <div style={fieldStyle}>
              <label>Duration: {config.duration}s</label>
              <input
                type="range"
                min="1"
                max="30"
                step="0.5"
                value={config.duration}
                onChange={(e) => updateConfig({ duration: parseFloat(e.target.value) })}
                style={sliderStyle}
              />
            </div>

            <div style={keyframesListStyle}>
              {config.keyframes.length === 0 ? (
                <div style={emptyStateStyle}>
                  No keyframes yet. Add your first keyframe to start creating an animation.
                </div>
              ) : (
                config.keyframes.map((keyframe, index) => (
                  <div key={keyframe.id} style={keyframeItemStyle}>
                    <div style={keyframeHeaderStyle}>
                      <span style={keyframeNameStyle}>
                        {keyframe.name || `Keyframe ${index + 1}`}
                      </span>
                      <span style={keyframeTimeStyle}>
                        {keyframe.time.toFixed(1)}s
                      </span>
                      <button
                        onClick={() => removeKeyframe(keyframe.id)}
                        style={removeButtonStyle}
                      >
                        ×
                      </button>
                    </div>
                    <div style={keyframeDetailsStyle}>
                      Position: ({keyframe.position.x.toFixed(1)}, {keyframe.position.y.toFixed(1)}, {keyframe.position.z.toFixed(1)})
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        )}

        {activeTab === 'settings' && (
          <div>
            <h4>Animation Settings</h4>

            <div style={fieldStyle}>
              <label>Frame Rate: {config.fps} FPS</label>
              <input
                type="range"
                min="15"
                max="60"
                step="15"
                value={config.fps}
                onChange={(e) => updateConfig({ fps: parseInt(e.target.value) })}
                style={sliderStyle}
              />
            </div>

            <div style={fieldStyle}>
              <label>Easing:</label>
              <select
                value={config.easing}
                onChange={(e) => updateConfig({ easing: e.target.value as any })}
                style={selectStyle}
              >
                <option value="linear">Linear</option>
                <option value="ease-in">Ease In</option>
                <option value="ease-out">Ease Out</option>
                <option value="ease-in-out">Ease In-Out</option>
              </select>
            </div>

            <div style={fieldStyle}>
              <label>
                <input
                  type="checkbox"
                  checked={config.loop}
                  onChange={(e) => updateConfig({ loop: e.target.checked })}
                />
                Loop Animation
              </label>
            </div>
          </div>
        )}

        {activeTab === 'export' && (
          <div>
            <h4>Export Settings</h4>

            <div style={fieldStyle}>
              <label>Format:</label>
              <select
                value={config.export.format}
                onChange={(e) => updateConfig({
                  export: { ...config.export, format: e.target.value as any }
                })}
                style={selectStyle}
              >
                <option value="mp4">MP4 Video</option>
                <option value="gif">Animated GIF</option>
                <option value="frames">Image Sequence</option>
              </select>
            </div>

            <div style={fieldStyle}>
              <label>Quality:</label>
              <select
                value={config.export.quality}
                onChange={(e) => updateConfig({
                  export: { ...config.export, quality: e.target.value as any }
                })}
                style={selectStyle}
              >
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
              </select>
            </div>

            <div style={fieldStyle}>
              <label>Resolution:</label>
              <select
                value={config.export.resolution}
                onChange={(e) => updateConfig({
                  export: { ...config.export, resolution: e.target.value as any }
                })}
                style={selectStyle}
              >
                <option value="720p">720p</option>
                <option value="1080p">1080p</option>
                <option value="4k">4K</option>
              </select>
            </div>
          </div>
        )}
      </div>

      {/* Action Buttons */}
      <div style={actionsStyle}>
        <button onClick={onPreview} style={previewButtonStyle}>
          🎬 Preview Animation
        </button>
        <button onClick={onExport} style={exportButtonStyle}>
          📤 Export Animation
        </button>
      </div>
    </div>
  );
};

// Styles
const containerStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  height: '100%'
};

const tabsStyle: React.CSSProperties = {
  display: 'flex',
  borderBottom: '1px solid #eee',
  marginBottom: '16px'
};

const tabButtonStyle: React.CSSProperties = {
  flex: 1,
  padding: '12px',
  border: 'none',
  cursor: 'pointer',
  fontSize: '14px',
  fontWeight: 500,
  transition: 'all 0.2s ease'
};

const contentStyle: React.CSSProperties = {
  flex: 1,
  overflowY: 'auto'
};

const sectionHeaderStyle: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  marginBottom: '16px'
};

const addButtonStyle: React.CSSProperties = {
  padding: '8px 16px',
  backgroundColor: '#28a745',
  color: 'white',
  border: 'none',
  borderRadius: '4px',
  cursor: 'pointer',
  fontSize: '14px'
};

const fieldStyle: React.CSSProperties = {
  marginBottom: '16px'
};

const sliderStyle: React.CSSProperties = {
  width: '100%',
  marginTop: '4px'
};

const selectStyle: React.CSSProperties = {
  width: '100%',
  padding: '8px',
  marginTop: '4px',
  border: '1px solid #ddd',
  borderRadius: '4px'
};

const keyframesListStyle: React.CSSProperties = {
  marginTop: '16px'
};

const emptyStateStyle: React.CSSProperties = {
  textAlign: 'center',
  color: '#666',
  fontStyle: 'italic',
  padding: '32px',
  border: '2px dashed #ddd',
  borderRadius: '8px'
};

const keyframeItemStyle: React.CSSProperties = {
  border: '1px solid #ddd',
  borderRadius: '6px',
  padding: '12px',
  marginBottom: '8px',
  backgroundColor: '#f8f9fa'
};

const keyframeHeaderStyle: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  marginBottom: '4px'
};

const keyframeNameStyle: React.CSSProperties = {
  fontWeight: 500,
  fontSize: '14px'
};

const keyframeTimeStyle: React.CSSProperties = {
  fontSize: '12px',
  color: '#666'
};

const removeButtonStyle: React.CSSProperties = {
  background: 'none',
  border: 'none',
  fontSize: '18px',
  cursor: 'pointer',
  color: '#dc3545',
  padding: '0 4px'
};

const keyframeDetailsStyle: React.CSSProperties = {
  fontSize: '12px',
  color: '#666'
};

const actionsStyle: React.CSSProperties = {
  display: 'flex',
  gap: '12px',
  paddingTop: '16px',
  borderTop: '1px solid #eee',
  marginTop: '16px'
};

const previewButtonStyle: React.CSSProperties = {
  flex: 1,
  padding: '12px',
  backgroundColor: '#007bff',
  color: 'white',
  border: 'none',
  borderRadius: '6px',
  cursor: 'pointer',
  fontSize: '14px',
  fontWeight: 500
};

const exportButtonStyle: React.CSSProperties = {
  flex: 1,
  padding: '12px',
  backgroundColor: '#28a745',
  color: 'white',
  border: 'none',
  borderRadius: '6px',
  cursor: 'pointer',
  fontSize: '14px',
  fontWeight: 500
};
