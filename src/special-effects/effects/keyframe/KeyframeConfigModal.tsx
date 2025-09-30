import React, { useState } from 'react';
import type { CameraKeyOrbit, KeyframeConfig, Easing } from '../../_shared/types';
import type { KeyframeAnimationEffect } from './KeyframeAnimationEffect';

interface KeyframeConfigModalProps {
  effect: KeyframeAnimationEffect;
  onConfigChange: (config: Partial<KeyframeConfig>) => void;
  onCapture: () => void;
  onSnapToKey: (index: number) => void;
}

export const KeyframeConfigModal: React.FC<KeyframeConfigModalProps> = ({
  effect,
  onConfigChange,
  onCapture,
  onSnapToKey
}) => {
  const [activeTab, setActiveTab] = useState<'timeline' | 'settings' | 'export'>('timeline');
  const [isAddingKeyframe, setIsAddingKeyframe] = useState(false);
  
  const config = effect.getConfig();
  const keys = effect.getKeys();

  const updateConfig = (updates: Partial<KeyframeConfig>) => {
    onConfigChange(updates);
  };

  const handleAddKeyframe = () => {
    if (isAddingKeyframe) {
      console.log(`🎬 Ignoring duplicate add keyframe click`);
      return;
    }
    
    console.log(`🎬 Adding new keyframe`);
    setIsAddingKeyframe(true);
    onCapture();
    
    // Reset flag after a short delay to prevent double-clicks
    setTimeout(() => {
      setIsAddingKeyframe(false);
    }, 500);
  };

  const handleRemoveKeyframe = (index: number) => {
    console.log(`🎬 Attempting to remove keyframe at index ${index}`);
    console.log(`🎬 Current keyframes count: ${keys.length}`);
    
    effect.removeKey(index);
    
    // Trigger UI update by notifying config change
    const updatedKeys = effect.getKeys();
    console.log(`🎬 Keyframes after removal: ${updatedKeys.length}`);
    console.log(`🎬 Updated keyframes:`, updatedKeys.map((k, i) => `${i + 1}: Camera Position ${i + 1}`));
    
    onConfigChange({ keys: updatedKeys });
  };


  const handleMoveUp = (index: number) => {
    effect.moveKeyUp(index);
    // Trigger UI update by notifying config change
    onConfigChange({ keys: effect.getKeys() });
  };

  const handleMoveDown = (index: number) => {
    effect.moveKeyDown(index);
    // Trigger UI update by notifying config change
    onConfigChange({ keys: effect.getKeys() });
  };

  const handleSnapToKey = (index: number) => {
    onSnapToKey(index);
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
              <div style={buttonGroupStyle}>
                <button onClick={handleAddKeyframe} style={addButtonStyle}>
                  + Add Keyframe
                </button>
              </div>
            </div>

            <div style={fieldStyle}>
              <label>Duration: {config.durationSec}s</label>
              <input
                type="range"
                min="1"
                max="30"
                step="0.5"
                value={config.durationSec}
                onChange={(e) => updateConfig({ durationSec: parseFloat(e.target.value) })}
                style={sliderStyle}
              />
            </div>

            <div style={keyframesListStyle}>
              {keys.length === 0 ? (
                <div style={emptyStateStyle}>
                  <p>No keyframes yet.</p>
                  <p>Move your camera to a desired position and click "Add Keyframe" to start creating an animation.</p>
                </div>
              ) : (
                <div style={keyframeTableStyle}>
                  <div style={tableHeaderStyle}>
                    <span style={indexColumnStyle}>#</span>
                    <span style={keyframeNameColumnStyle}>Keyframe</span>
                    <span style={actionsColumnStyle}>Actions</span>
                  </div>
                  {keys.map((_, index) => (
                    <div key={index} style={keyframeRowStyle}>
                      <span style={indexColumnStyle}>{index + 1}</span>
                      <span style={keyframeNameColumnStyle}>
                        Camera Position {index + 1}
                      </span>
                      <div style={actionsColumnStyle}>
                        <button
                          onClick={() => handleSnapToKey(index)}
                          style={snapButtonStyle}
                          title="Snap camera to this keyframe"
                        >
                          📍
                        </button>
                        <button
                          onClick={() => handleMoveUp(index)}
                          style={moveButtonStyle}
                          disabled={index === 0}
                          title="Move up"
                        >
                          ▲
                        </button>
                        <button
                          onClick={() => handleMoveDown(index)}
                          style={moveButtonStyle}
                          disabled={index === keys.length - 1}
                          title="Move down"
                        >
                          ▼
                        </button>
                        <button
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            console.log(`🎬 X button clicked for index ${index}`);
                            handleRemoveKeyframe(index);
                          }}
                          style={removeButtonStyle}
                          onMouseEnter={(e) => {
                            e.currentTarget.style.backgroundColor = '#dc3545';
                            e.currentTarget.style.color = 'white';
                          }}
                          onMouseLeave={(e) => {
                            e.currentTarget.style.backgroundColor = 'transparent';
                            e.currentTarget.style.color = '#dc3545';
                          }}
                          title={`Remove Camera Position ${index + 1}`}
                        >
                          ×
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {keys.length >= 2 && (
              <div style={playbackHintStyle}>
                ✓ Ready to play! Use the global controls to start animation.
              </div>
            )}
            {keys.length === 1 && (
              <div style={warningHintStyle}>
                ⚠ Add at least one more keyframe to enable playback.
              </div>
            )}
          </div>
        )}

        {activeTab === 'settings' && (
          <div>
            <h4>Animation Settings</h4>

            <div style={fieldStyle}>
              <label>Easing:</label>
              <select
                value={config.easing}
                onChange={(e) => updateConfig({ easing: e.target.value as Easing })}
                style={selectStyle}
              >
                <option value="linear">Linear</option>
                <option value="easeIn">Ease In</option>
                <option value="easeOut">Ease Out</option>
                <option value="easeInOut">Ease In-Out</option>
              </select>
            </div>

            <div style={fieldStyle}>
              <label>
                <input
                  type="checkbox"
                  checked={config.constantSpeed}
                  onChange={(e) => updateConfig({ constantSpeed: e.target.checked })}
                />
                Constant Speed
              </label>
              <div style={helpTextStyle}>
                Maintain uniform camera movement speed between keyframes
              </div>
            </div>

            <div style={fieldStyle}>
              <label>
                <input
                  type="checkbox"
                  checked={config.closed}
                  onChange={(e) => updateConfig({ closed: e.target.checked })}
                />
                Close Path
              </label>
              <div style={helpTextStyle}>
                Connect the last keyframe back to the first for seamless loops
              </div>
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
              <div style={helpTextStyle}>
                Continuously repeat the animation during playback
              </div>
            </div>

            {config.fpsPreview && (
              <div style={fieldStyle}>
                <label>Preview FPS: {config.fpsPreview}</label>
                <input
                  type="range"
                  min="15"
                  max="60"
                  step="15"
                  value={config.fpsPreview}
                  onChange={(e) => updateConfig({ fpsPreview: parseInt(e.target.value) })}
                  style={sliderStyle}
                />
                <div style={helpTextStyle}>
                  Frame rate for preview playback (affects RAF timing)
                </div>
              </div>
            )}
          </div>
        )}

        {activeTab === 'export' && (
          <div>
            <h4>Export Settings</h4>
            
            <div style={exportInfoStyle}>
              <p><strong>Real-time Recording Only</strong></p>
              <p>Records your animation in real-time as it plays. The output resolution and frame rate will match your settings below.</p>
            </div>

            <div style={fieldStyle}>
              <label>Resolution:</label>
              <select
                defaultValue="1920x1080"
                style={selectStyle}
              >
                <option value="1280x720">720p (1280×720)</option>
                <option value="1920x1080">1080p (1920×1080)</option>
                <option value="3840x2160">4K (3840×2160)</option>
              </select>
            </div>

            <div style={fieldStyle}>
              <label>Frame Rate:</label>
              <select
                defaultValue="30"
                style={selectStyle}
              >
                <option value="24">24 FPS</option>
                <option value="30">30 FPS</option>
                <option value="60">60 FPS</option>
              </select>
            </div>

            <div style={fieldStyle}>
              <label>Quality:</label>
              <select
                defaultValue="medium"
                style={selectStyle}
              >
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
                <option value="max">Maximum</option>
              </select>
            </div>

            <div style={fieldStyle}>
              <label>Duration: Use effect duration ({config.durationSec}s)</label>
              <div style={helpTextStyle}>
                Recording will automatically stop after the animation completes
              </div>
            </div>

            <div style={recordingHintStyle}>
              <p><strong>💡 Recording Tips:</strong></p>
              <ul>
                <li>Ensure your animation is ready (at least 2 keyframes)</li>
                <li>Use the global Record button to start recording</li>
                <li>The canvas will be locked to your chosen resolution during recording</li>
                <li>Files will be automatically downloaded when complete</li>
              </ul>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

// Styles
const containerStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  height: '100%',
  minHeight: '400px'
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

const buttonGroupStyle: React.CSSProperties = {
  display: 'flex',
  gap: '8px'
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

const keyframeTableStyle: React.CSSProperties = {
  border: '1px solid #ddd',
  borderRadius: '6px',
  overflow: 'hidden'
};

const tableHeaderStyle: React.CSSProperties = {
  display: 'flex',
  backgroundColor: '#f8f9fa',
  padding: '8px',
  fontWeight: 'bold',
  fontSize: '12px',
  borderBottom: '1px solid #ddd'
};

const keyframeRowStyle: React.CSSProperties = {
  display: 'flex',
  padding: '8px',
  borderBottom: '1px solid #eee',
  alignItems: 'center',
  fontSize: '12px'
};

const indexColumnStyle: React.CSSProperties = {
  width: '30px',
  textAlign: 'center'
};

const keyframeNameColumnStyle: React.CSSProperties = {
  flex: 1,
  fontSize: '14px',
  fontWeight: 500
};

const actionsColumnStyle: React.CSSProperties = {
  width: '120px',
  display: 'flex',
  gap: '4px'
};

const snapButtonStyle: React.CSSProperties = {
  background: 'none',
  border: '1px solid #ddd',
  borderRadius: '3px',
  cursor: 'pointer',
  padding: '2px 4px',
  fontSize: '10px'
};

const moveButtonStyle: React.CSSProperties = {
  background: 'none',
  border: '1px solid #ddd',
  borderRadius: '3px',
  cursor: 'pointer',
  padding: '2px 4px',
  fontSize: '10px'
};

const removeButtonStyle: React.CSSProperties = {
  background: 'white',
  border: '2px solid #dc3545',
  borderRadius: '4px',
  cursor: 'pointer',
  padding: '6px 8px',
  fontSize: '14px',
  color: '#dc3545',
  fontWeight: 'bold',
  minWidth: '24px',
  minHeight: '24px',
  transition: 'all 0.2s ease',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center'
};

const helpTextStyle: React.CSSProperties = {
  fontSize: '12px',
  color: '#666',
  marginTop: '4px'
};

const playbackHintStyle: React.CSSProperties = {
  marginTop: '16px',
  padding: '12px',
  backgroundColor: '#d4edda',
  color: '#155724',
  borderRadius: '4px',
  fontSize: '14px'
};

const warningHintStyle: React.CSSProperties = {
  marginTop: '16px',
  padding: '12px',
  backgroundColor: '#fff3cd',
  color: '#856404',
  borderRadius: '4px',
  fontSize: '14px'
};

const exportInfoStyle: React.CSSProperties = {
  padding: '12px',
  backgroundColor: '#e7f3ff',
  borderRadius: '4px',
  marginBottom: '16px'
};

const recordingHintStyle: React.CSSProperties = {
  marginTop: '16px',
  padding: '12px',
  backgroundColor: '#f8f9fa',
  borderRadius: '4px',
  fontSize: '14px'
};
