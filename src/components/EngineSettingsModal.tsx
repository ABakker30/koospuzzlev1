// src/components/EngineSettingsModal.tsx
import React, { useState, useEffect } from "react";
import type { Engine2Settings } from "../engines/engine2";
import { InfoModal } from "./InfoModal";
import { useDraggable } from "../hooks/useDraggable";

type Props = {
  open: boolean;
  onClose: () => void;
  engineName: string;
  currentSettings: Engine2Settings;
  onSave: (settings: Engine2Settings) => void;
};

export const EngineSettingsModal: React.FC<Props> = ({ 
  open, 
  onClose, 
  engineName, 
  currentSettings,
  onSave 
}) => {
  const draggable = useDraggable();
  const [timeoutSec, setTimeoutSec] = useState<number | string>((currentSettings.timeoutMs ?? 0) / 1000);
  const [moveOrdering, setMoveOrdering] = useState(currentSettings.moveOrdering ?? "mostConstrainedCell");
  
  // Engine 2 specific settings
  const [randomizeTies, setRandomizeTies] = useState(currentSettings.randomizeTies ?? true);
  const [seed, setSeed] = useState<number | string>(currentSettings.seed ?? 12345);
  
  // Shuffle strategy settings
  const [shuffleStrategy, setShuffleStrategy] = useState<"none" | "initial" | "periodicRestart" | "periodicRestartTime" | "adaptive">(currentSettings.shuffleStrategy ?? "none");
  const [restartInterval, setRestartInterval] = useState<number | string>(currentSettings.restartInterval ?? 50000);
  const [restartIntervalSeconds, setRestartIntervalSeconds] = useState<number | string>(currentSettings.restartIntervalSeconds ?? 300);
  const [shuffleTriggerDepth, setShuffleTriggerDepth] = useState<number | string>(currentSettings.shuffleTriggerDepth ?? 8);
  const [maxSuffixShuffles, setMaxSuffixShuffles] = useState<number | string>(currentSettings.maxSuffixShuffles ?? 5);
  
  // Info modal state
  const [showInfo, setShowInfo] = useState(false);
  
  // Tail solver settings
  const [tailEnable, setTailEnable] = useState(currentSettings.tailSwitch?.enable ?? true);
  const [tailSize, setTailSize] = useState<number | string>(currentSettings.tailSwitch?.tailSize ?? 20);

  // Sync with props when modal opens
  useEffect(() => {
    if (open) {
      setTimeoutSec((currentSettings.timeoutMs ?? 0) / 1000);
      setMoveOrdering(currentSettings.moveOrdering ?? "mostConstrainedCell");
      
      // Engine 2 specific
      setRandomizeTies(currentSettings.randomizeTies ?? true);
      
      // Always generate fresh time-based seed when modal opens
      const now = new Date();
      const timeSeed = now.getHours() * 10000 + now.getMinutes() * 100 + now.getSeconds();
      setSeed(timeSeed);
      
      // Shuffle strategy
      setShuffleStrategy(currentSettings.shuffleStrategy ?? "none");
      setRestartInterval(currentSettings.restartInterval ?? 50000);
      setRestartIntervalSeconds(currentSettings.restartIntervalSeconds ?? 300);
      setShuffleTriggerDepth(currentSettings.shuffleTriggerDepth ?? 8);
      setMaxSuffixShuffles(currentSettings.maxSuffixShuffles ?? 5);
      
      // Tail solver
      setTailEnable(currentSettings.tailSwitch?.enable ?? true);
      setTailSize(currentSettings.tailSwitch?.tailSize ?? 20);
    }
  }, [open, currentSettings]);

  if (!open) return null;

  const handleSave = () => {
    const timeout = typeof timeoutSec === 'string' ? parseInt(timeoutSec) || 0 : timeoutSec;
    
    // Filter out unsupported moveOrdering values for DFS2 (no pieceScarcity in DFS2)
    let validOrdering: "mostConstrainedCell" | "naive" = "mostConstrainedCell";
    if (moveOrdering === "naive") {
      validOrdering = "naive";
    } else if (moveOrdering === "mostConstrainedCell" || moveOrdering === "pieceScarcity") {
      validOrdering = "mostConstrainedCell";
    }
    
    const seedNum = typeof seed === 'string' ? parseInt(seed) || 12345 : seed;
    const tailSizeNum = typeof tailSize === 'string' ? parseInt(tailSize) || 20 : tailSize;
    const restartIntervalNum = typeof restartInterval === 'string' ? parseInt(restartInterval) || 50000 : restartInterval;
    const restartIntervalSecondsNum = typeof restartIntervalSeconds === 'string' ? parseInt(restartIntervalSeconds) || 300 : restartIntervalSeconds;
    const shuffleTriggerDepthNum = typeof shuffleTriggerDepth === 'string' ? parseInt(shuffleTriggerDepth) || 8 : shuffleTriggerDepth;
    const maxSuffixShufflesNum = typeof maxSuffixShuffles === 'string' ? parseInt(maxSuffixShuffles) || 5 : maxSuffixShuffles;
    
    const newSettings: Engine2Settings = {
      maxSolutions: 1, // Always find exactly 1 solution
      timeoutMs: Math.max(0, timeout) * 1000, // Convert seconds to ms
      moveOrdering: validOrdering,
      pruning: {
        connectivity: false,
        multipleOf4: true, // Only Multiple of 4 pruning enabled
        colorResidue: false,
        neighborTouch: false,
      },
      statusIntervalMs: 300, // Hardcoded to 300ms
      pauseOnSolution: true, // Always pause on solution
      saveSolutions: false, // Don't save to file - app saves to DB via onSolution callback
      savePath: "", // Not used (saving to DB instead)
      pieces: currentSettings.pieces, // Keep existing piece config
      view: currentSettings.view, // Keep existing view config
      seed: seedNum,
      randomizeTies,
      shuffleStrategy,
      restartInterval: Math.max(1000, restartIntervalNum), // Min 1000 nodes
      restartIntervalSeconds: Math.max(1, restartIntervalSecondsNum), // Min 1 second
      maxRestarts: 999999, // Unlimited restarts
      shuffleTriggerDepth: Math.max(1, shuffleTriggerDepthNum),
      maxSuffixShuffles: Math.max(1, maxSuffixShufflesNum),
      tailSwitch: {
        enable: tailEnable,
        tailSize: Math.max(4, tailSizeNum), // Min 4 cells (1 piece)
        enumerateAll: false, // Stop after first solution (respects maxSolutions: 1)
        enumerateLimit: 1, // Only find 1 solution in tail
      },
      visualRevealDelayMs: 150, // Hardcoded to 150ms
    } as Engine2Settings;
    
    // Save to localStorage for persistence
    try {
      const settingsToSave = {
        timeoutMs: newSettings.timeoutMs,
        moveOrdering: newSettings.moveOrdering,
        seed: newSettings.seed,
        randomizeTies: newSettings.randomizeTies,
        shuffleStrategy: newSettings.shuffleStrategy,
        restartInterval: newSettings.restartInterval,
        restartIntervalSeconds: newSettings.restartIntervalSeconds,
        shuffleTriggerDepth: newSettings.shuffleTriggerDepth,
        maxSuffixShuffles: newSettings.maxSuffixShuffles,
        tailSwitch: newSettings.tailSwitch,
      };
      localStorage.setItem('autosolverEngineSettings', JSON.stringify(settingsToSave));
      console.log('💾 Engine settings saved to localStorage');
    } catch (err) {
      console.error('Failed to save settings to localStorage:', err);
    }
    
    onSave(newSettings);
    onClose();
  };

  return (
    <>
      {/* Custom Scrollbar Styles */}
      <style>{`
        .engine-settings-modal-scrollable::-webkit-scrollbar {
          width: 12px;
        }
        .engine-settings-modal-scrollable::-webkit-scrollbar-track {
          background: rgba(59, 130, 246, 0.1);
          border-radius: 10px;
          margin: 20px 0;
        }
        .engine-settings-modal-scrollable::-webkit-scrollbar-thumb {
          background: linear-gradient(180deg, #f59e0b, #d97706);
          border-radius: 10px;
          border: 2px solid rgba(254, 243, 199, 0.5);
        }
        .engine-settings-modal-scrollable::-webkit-scrollbar-thumb:hover {
          background: linear-gradient(180deg, #d97706, #b45309);
        }
        .engine-settings-modal-scrollable::-webkit-scrollbar-thumb:active {
          background: #b45309;
        }
        .engine-settings-modal-scrollable {
          scrollbar-width: thin;
          scrollbar-color: #f59e0b rgba(59, 130, 246, 0.1);
        }
      `}</style>
      
      {/* Backdrop */}
      <div style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        background: 'transparent',
        backdropFilter: 'none',
        zIndex: 10000
      }} onClick={onClose} />
      
      {/* Modal - Centered and Draggable */}
      <div
        ref={draggable.ref}
        className="engine-settings-modal-scrollable"
        style={{
          position: 'fixed',
          top: '50%',
          left: '50%',
          background: 'linear-gradient(135deg, #fef3c7 0%, #fde68a 50%, #fcd34d 100%)',
          borderRadius: '20px',
          padding: '0',
          maxWidth: '600px',
          width: '90%',
          maxHeight: '85vh',
          overflowY: 'auto',
          boxShadow: '0 8px 32px rgba(0, 0, 0, 0.3)',
          border: '3px solid rgba(245,158,11,0.6)',
          zIndex: 10001,
          ...draggable.style
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header - Draggable */}
        <div
          style={{
            background: 'linear-gradient(135deg, #f59e0b, #d97706, #b45309)',
            padding: '1.25rem 1.5rem',
            borderRadius: '17px 17px 0 0',
            marginBottom: '20px',
            borderBottom: '3px solid rgba(255,255,255,0.3)',
            boxShadow: '0 4px 20px rgba(245,158,11,0.4)',
            position: 'relative',
            cursor: 'move'
          }}
        >
          <h2 style={{
            color: '#fff',
            fontSize: '20px',
            fontWeight: 700,
            margin: 0,
            textShadow: '0 2px 4px rgba(0,0,0,0.2)',
            paddingRight: '80px'
          }}>
            ⚙️ {engineName} Settings
          </h2>
          <div style={{ position: 'absolute', top: '12px', right: '12px', display: 'flex', gap: '8px' }}>
            <button
              onClick={() => setShowInfo(true)}
              title="Settings Help"
              style={{
                background: 'rgba(255,255,255,0.2)',
                border: 'none',
                borderRadius: '50%',
                width: '32px',
                height: '32px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer',
                fontSize: '18px',
                color: '#fff',
                fontWeight: 700,
                transition: 'all 0.2s'
              }}
            >
              ℹ
            </button>
            <button
              onClick={onClose}
              style={{
                background: 'rgba(255,255,255,0.2)',
                border: 'none',
                borderRadius: '50%',
                width: '32px',
                height: '32px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer',
                fontSize: '24px',
                color: '#fff',
                fontWeight: 700,
                transition: 'all 0.2s'
              }}
            >
              ×
            </button>
          </div>
        </div>

        {/* Content */}
        <div style={{ padding: "0 1.5rem 1.5rem" }}>
          {/* Move Ordering */}
          <div style={sectionStyle}>
            <h4 style={sectionTitle}>Move Ordering Strategy</h4>
            <select 
              value={moveOrdering}
              onChange={(e) => setMoveOrdering(e.target.value as any)}
              style={inputStyle}
            >
              <option value="mostConstrainedCell">Most Constrained Cell (recommended)</option>
              <option value="naive">Naive (first open)</option>
              <option value="pieceScarcity">Piece Scarcity</option>
            </select>
            <div style={{ fontSize: "12px", color: "#999", marginTop: "0.25rem" }}>
              How to choose next cell to fill
            </div>
          </div>

          {/* Timeout */}
          <div style={sectionStyle}>
            <h4 style={sectionTitle}>⏱️ Search Timeout</h4>
            <div style={{ marginBottom: "0.75rem" }}>
              <label style={labelStyle}>
                Timeout (seconds)
              </label>
              <input 
                type="number" 
                value={timeoutSec}
                onChange={(e) => setTimeoutSec(e.target.value)}
                onBlur={(e) => {
                  const val = parseInt(e.target.value);
                  if (isNaN(val) || val < 0) setTimeoutSec(0);
                  else setTimeoutSec(val);
                }}
                style={inputStyle}
                min="0"
                step="60"
                placeholder="0 = no limit"
              />
              <div style={{ fontSize: "12px", color: "#999", marginTop: "0.25rem" }}>
                0 = no timeout. Hard puzzles may need 30+ minutes (1800+ seconds)
              </div>
            </div>
          </div>

          {/* Engine 2 Specific: Stochastic Search */}
          {engineName === 'Engine 2' && (
            <>
              <div style={sectionStyle}>
                <h4 style={sectionTitle}>🎲 Stochastic Search (Engine 2)</h4>
                
                <label style={{ display: "flex", alignItems: "center", gap: "0.5rem", fontSize: "14px", marginBottom: "0.75rem" }}>
                  <input 
                    type="checkbox" 
                    checked={randomizeTies}
                    onChange={(e) => setRandomizeTies(e.target.checked)}
                  />
                  <span>Randomize tie-breaking (escape plateaus)</span>
                </label>
                
                <div style={{ marginBottom: "0.75rem" }}>
                  <label style={labelStyle}>
                    Random Seed
                  </label>
                  <input 
                    type="number" 
                    value={seed}
                    onChange={(e) => setSeed(e.target.value)}
                    onBlur={(e) => {
                      const val = parseInt(e.target.value);
                      if (isNaN(val)) setSeed(12345);
                      else setSeed(val);
                    }}
                    style={inputStyle}
                    disabled={!randomizeTies}
                  />
                  <div style={{ fontSize: "12px", color: "#999", marginTop: "0.25rem" }}>
                    Auto-generated from current time (HH:MM:SS). Different seed each time modal opens. Edit manually for reproducible results.
                  </div>
                </div>
              </div>

              <div style={sectionStyle}>
                <h4 style={sectionTitle}>🔀 Piece Ordering Strategy</h4>
                <div style={{ fontSize: "12px", color: "#666", marginBottom: "0.75rem" }}>
                  How to order pieces during search. Can dramatically affect solve time.
                </div>
                
                <div style={{ marginBottom: "0.75rem" }}>
                  <select 
                    value={shuffleStrategy}
                    onChange={(e) => setShuffleStrategy(e.target.value as any)}
                    style={inputStyle}
                  >
                    <option value="none">None (Alphabetical)</option>
                    <option value="initial">Initial Shuffle (seed-based)</option>
                    <option value="periodicRestart">Periodic Restart (node-based)</option>
                    <option value="periodicRestartTime">Periodic Restart (time-based)</option>
                    <option value="adaptive">Adaptive Suffix Shuffle</option>
                  </select>
                </div>
                
                {shuffleStrategy === "periodicRestart" && (
                  <>
                    <div style={{ marginBottom: "0.75rem" }}>
                      <label style={labelStyle}>
                        Restart Interval (nodes)
                      </label>
                      <input 
                        type="number" 
                        value={restartInterval}
                        onChange={(e) => setRestartInterval(e.target.value)}
                        onBlur={(e) => {
                          const val = parseInt(e.target.value);
                          if (isNaN(val) || val < 1000) setRestartInterval(50000);
                          else setRestartInterval(val);
                        }}
                        style={inputStyle}
                        min="1000"
                        step="10000"
                      />
                      <div style={{ fontSize: "12px", color: "#999", marginTop: "0.25rem" }}>
                        Restart every N nodes with new piece order (default: 50,000). Unlimited restarts.
                      </div>
                    </div>
                  </>
                )}
                
                {shuffleStrategy === "periodicRestartTime" && (
                  <>
                    <div style={{ marginBottom: "0.75rem" }}>
                      <label style={labelStyle}>
                        Restart Interval (seconds)
                      </label>
                      <input 
                        type="number" 
                        value={restartIntervalSeconds}
                        onChange={(e) => setRestartIntervalSeconds(e.target.value)}
                        onBlur={(e) => {
                          const val = parseInt(e.target.value);
                          if (isNaN(val) || val < 1) setRestartIntervalSeconds(300);
                          else setRestartIntervalSeconds(val);
                        }}
                        style={inputStyle}
                        min="1"
                        step="60"
                      />
                      <div style={{ fontSize: "12px", color: "#999", marginTop: "0.25rem" }}>
                        Restart every N seconds with new piece order (default: 300 = 5 min). Unlimited restarts.
                      </div>
                    </div>
                  </>
                )}
                
                {shuffleStrategy === "adaptive" && (
                  <>
                    <div style={{ marginBottom: "0.75rem" }}>
                      <label style={labelStyle}>
                        Trigger at depth &lt;
                      </label>
                      <input 
                        type="number" 
                        value={shuffleTriggerDepth}
                        onChange={(e) => setShuffleTriggerDepth(e.target.value)}
                        onBlur={(e) => {
                          const val = parseInt(e.target.value);
                          if (isNaN(val) || val < 1) setShuffleTriggerDepth(8);
                          else setShuffleTriggerDepth(val);
                        }}
                        style={inputStyle}
                        min="1"
                        step="1"
                      />
                      <div style={{ fontSize: "12px", color: "#999", marginTop: "0.25rem" }}>
                        Shuffle when backtracking below this depth (default: 8)
                      </div>
                    </div>
                    
                    <div style={{ marginBottom: "0.75rem" }}>
                      <label style={labelStyle}>
                        Max shuffles per branch
                      </label>
                      <input 
                        type="number" 
                        value={maxSuffixShuffles}
                        onChange={(e) => setMaxSuffixShuffles(e.target.value)}
                        onBlur={(e) => {
                          const val = parseInt(e.target.value);
                          if (isNaN(val) || val < 1) setMaxSuffixShuffles(5);
                          else setMaxSuffixShuffles(val);
                        }}
                        style={inputStyle}
                        min="1"
                        step="1"
                      />
                      <div style={{ fontSize: "12px", color: "#999", marginTop: "0.25rem" }}>
                        Max shuffles per search branch (default: 5)
                      </div>
                    </div>
                  </>
                )}
              </div>

              <div style={sectionStyle}>
                <h4 style={sectionTitle}>🚀 Tail Solver (Endgame Turbo)</h4>
                <div style={{ fontSize: "12px", color: "#666", marginBottom: "0.75rem" }}>
                  When remaining open cells are small, use specialized fast solver
                </div>
                
                <label style={{ display: "flex", alignItems: "center", gap: "0.5rem", fontSize: "14px", marginBottom: "0.75rem" }}>
                  <input 
                    type="checkbox" 
                    checked={tailEnable}
                    onChange={(e) => setTailEnable(e.target.checked)}
                  />
                  <span>Enable tail solver (recommended)</span>
                </label>
                
                <div style={{ marginBottom: "0.75rem" }}>
                  <label style={labelStyle}>
                    Tail Size (max open cells)
                  </label>
                  <input 
                    type="number" 
                    value={tailSize}
                    onChange={(e) => setTailSize(e.target.value)}
                    onBlur={(e) => {
                      const val = parseInt(e.target.value);
                      if (isNaN(val) || val < 4) setTailSize(20);
                      else setTailSize(val);
                    }}
                    style={inputStyle}
                    min="4"
                    step="4"
                    disabled={!tailEnable}
                  />
                  <div style={{ fontSize: "12px", color: "#999", marginTop: "0.25rem" }}>
                    Trigger when open cells ≤ this value (default: 20, range: 12-24)
                  </div>
                </div>
              </div>
            </>
          )}
        </div>

        <div style={{ display: "flex", gap: "0.5rem", justifyContent: "flex-end", paddingTop: "0.75rem", borderTop: "1px solid #f0f0f0" }}>
          <button className="btn" onClick={onClose}>
            Cancel
          </button>
          <button className="btn" onClick={handleSave} style={{ background: "#007bff", color: "#fff" }}>
            Save Settings
          </button>
        </div>
      </div>

      {/* Info Modal */}
      <InfoModal
      isOpen={showInfo}
      onClose={() => setShowInfo(false)}
      title="Auto Solver Settings Help"
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', fontSize: '0.95rem' }}>
        <div style={{ 
          padding: '0.75rem', 
          background: '#f0fdf4', 
          borderLeft: '3px solid #22c55e',
          borderRadius: '4px',
          fontSize: '0.875rem'
        }}>
          <strong>✅ Optimized for Best Performance:</strong> The solver automatically uses optimal settings: finds 1 solution, pauses and saves automatically, uses Multiple of 4 pruning, 300ms status updates, 150ms reveal delay.
        </div>

        <section>
          <h4 style={{ marginTop: 0 }}>🧭 Move Ordering Strategy</h4>
          <p><strong>Most Constrained Cell:</strong> (Recommended) Always fill the cell with fewest placement options. Dramatically reduces search space.</p>
          <p><strong>Naive:</strong> Fill cells in simple order. Slower but useful for debugging.</p>
          <p><strong>Piece Scarcity:</strong> Prioritize rare pieces. May help in some configurations.</p>
        </section>

        <section>
          <h4>⏱️ Search Timeout</h4>
          <p><strong>Timeout:</strong> Maximum time (in seconds) before stopping the search. Set to 0 for no limit.</p>
          <p><strong>For hard puzzles (hollow pyramids, large shapes):</strong> Set to 0 or very high value (3600+ seconds). Complex puzzles can take 30+ minutes to solve.</p>
        </section>

        <section>
          <h4>🎲 Stochastic Search (Engine 2)</h4>
          <p><strong>Randomize Tie-breaking:</strong> When multiple moves are equally good, pick randomly. Helps escape local plateaus and explore different solution paths.</p>
          <p><strong>Random Seed:</strong> Auto-generated from current time (HH:MM:SS format) each time you open this modal, giving different search paths every time. For reproducible/debuggable results, manually set a specific seed value.</p>
        </section>

        <section>
          <h4>🔀 Piece Ordering Strategy</h4>
          <p>The order pieces are tried can dramatically affect solve time. For hard puzzles, experimenting with different strategies is key.</p>
          
          <p><strong>None (Alphabetical):</strong> Pieces sorted A→Z. Predictable but may not be optimal for your puzzle.</p>
          
          <p><strong>Initial Shuffle:</strong> Randomize order once at start based on seed. Try different seeds (12345, 99999, 42) to explore different search paths. Same seed = same results.</p>
          
          <p><strong>Periodic Restart (node-based):</strong> Every N nodes, restart from scratch with new random piece order. Tied to search progress. Good for consistent exploration depth. Unlimited restarts.</p>
          <ul style={{ marginLeft: '1.5rem', marginTop: '0.5rem' }}>
            <li><strong>Restart Interval:</strong> Nodes between restarts (default: 50,000)</li>
          </ul>
          
          <p><strong>Periodic Restart (time-based):</strong> Every N seconds, restart with new piece order. Predictable wall-clock behavior. Best for "try for X minutes then move on" workflow. Unlimited restarts.</p>
          <ul style={{ marginLeft: '1.5rem', marginTop: '0.5rem' }}>
            <li><strong>Restart Interval:</strong> Seconds between restarts (minimum: 1, default: 300 = 5 min)</li>
          </ul>
          
          <p><strong>Adaptive Suffix Shuffle:</strong> When backtracking deeply, automatically shuffle remaining pieces. Keeps successful early placements, tries new combinations for the rest.</p>
          <ul style={{ marginLeft: '1.5rem', marginTop: '0.5rem' }}>
            <li><strong>Trigger Depth:</strong> Shuffle when backtracking below this depth (default: 8)</li>
            <li><strong>Max Shuffles:</strong> Per branch limit to avoid excessive shuffling (default: 5)</li>
          </ul>
        </section>

        <section>
          <h4>🚀 Tail Solver (Endgame Turbo)</h4>
          <p><strong>Enable Tail Solver:</strong> When few cells remain, switch to specialized fast solver. Dramatically speeds up endgame.</p>
          <p><strong>Tail Size:</strong> Trigger when open cells ≤ this value. Recommended: 20 cells (5 pieces).</p>
        </section>

        <div style={{ 
          marginTop: '1rem', 
          padding: '1rem', 
          background: '#f0f9ff', 
          borderLeft: '3px solid #2196F3',
          borderRadius: '4px',
          fontSize: '0.875rem',
          color: '#1e40af'
        }}>
          <strong>💡 Tip:</strong> For hard puzzles like hollow pyramids: (1) Set timeout to 0, (2) Try "Initial Shuffle" with seeds 12345, 99999, 42, (3) If still stuck, use "Periodic Restart (time-based)" with 5-10 min intervals.
        </div>
      </div>
    </InfoModal>
    </>
  );
};

// Updated to use modern festive design - old styles removed

const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: "0.5rem",
  border: "1px solid #ddd",
  borderRadius: 4,
  fontSize: "14px"
};

const sectionStyle: React.CSSProperties = {
  marginBottom: "1.5rem",
  paddingBottom: "1rem",
  borderBottom: "1px solid #f0f0f0"
};

const sectionTitle: React.CSSProperties = {
  fontSize: "14px",
  fontWeight: 600,
  marginBottom: "0.75rem",
  color: "#333"
};

const labelStyle: React.CSSProperties = {
  display: "block",
  marginBottom: "0.5rem",
  fontWeight: 500,
  fontSize: "14px"
};
