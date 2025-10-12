// src/components/EngineSettingsModal.tsx
import React, { useState, useEffect } from "react";
import type { Engine2Settings } from "../engines/engine2";

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
  const [maxSolutions, setMaxSolutions] = useState<number | string>(currentSettings.maxSolutions ?? 1);
  const [timeoutMs, setTimeoutMs] = useState<number | string>((currentSettings.timeoutMs ?? 0) / 1000); // Convert to seconds
  const [statusIntervalMs, setStatusIntervalMs] = useState<number | string>(currentSettings.statusIntervalMs ?? 250);
  const [moveOrdering, setMoveOrdering] = useState(currentSettings.moveOrdering ?? "mostConstrainedCell");
  const [connectivity, setConnectivity] = useState(currentSettings.pruning?.connectivity ?? true);
  const [multipleOf4, setMultipleOf4] = useState(currentSettings.pruning?.multipleOf4 ?? true);
  
  // Engine 2 specific settings
  const [randomizeTies, setRandomizeTies] = useState(currentSettings.randomizeTies ?? false);
  const [seed, setSeed] = useState<number | string>(currentSettings.seed ?? 12345);
  const [stallTimeout, setStallTimeout] = useState<number | string>((currentSettings.stall?.timeoutMs ?? 3000) / 1000);
  const [stallAction, setStallAction] = useState<"reshuffle" | "restartDepthK" | "perturb">(currentSettings.stall?.action ?? "reshuffle");
  const [depthK, setDepthK] = useState<number | string>(currentSettings.stall?.depthK ?? 2);
  const [maxShuffles, setMaxShuffles] = useState<number | string>(currentSettings.stall?.maxShuffles ?? 8);

  // Sync with props when modal opens
  useEffect(() => {
    if (open) {
      setMaxSolutions(currentSettings.maxSolutions ?? 1);
      setTimeoutMs((currentSettings.timeoutMs ?? 0) / 1000);
      setStatusIntervalMs(currentSettings.statusIntervalMs ?? 250);
      setMoveOrdering(currentSettings.moveOrdering ?? "mostConstrainedCell");
      setConnectivity(currentSettings.pruning?.connectivity ?? true);
      setMultipleOf4(currentSettings.pruning?.multipleOf4 ?? true);
      
      // Engine 2 specific
      setRandomizeTies(currentSettings.randomizeTies ?? false);
      setSeed(currentSettings.seed ?? 12345);
      setStallTimeout((currentSettings.stall?.timeoutMs ?? 3000) / 1000);
      setStallAction(currentSettings.stall?.action ?? "reshuffle");
      setDepthK(currentSettings.stall?.depthK ?? 2);
      setMaxShuffles(currentSettings.stall?.maxShuffles ?? 8);
    }
  }, [open, currentSettings]);

  if (!open) return null;

  const handleSave = () => {
    const maxSol = typeof maxSolutions === 'string' ? parseInt(maxSolutions) || 1 : maxSolutions;
    const timeout = typeof timeoutMs === 'string' ? parseInt(timeoutMs) || 0 : timeoutMs;
    const statusInterval = typeof statusIntervalMs === 'string' ? parseInt(statusIntervalMs) || 250 : statusIntervalMs;
    
    // Filter out unsupported moveOrdering values for DFS2 (no pieceScarcity in DFS2)
    let validOrdering: "mostConstrainedCell" | "naive" = "mostConstrainedCell";
    if (moveOrdering === "naive") {
      validOrdering = "naive";
    } else if (moveOrdering === "mostConstrainedCell" || moveOrdering === "pieceScarcity") {
      validOrdering = "mostConstrainedCell";
    }
    
    const seedNum = typeof seed === 'string' ? parseInt(seed) || 12345 : seed;
    const stallTimeoutNum = typeof stallTimeout === 'string' ? parseInt(stallTimeout) || 3 : stallTimeout;
    const depthKNum = typeof depthK === 'string' ? parseInt(depthK) || 2 : depthK;
    const maxShufflesNum = typeof maxShuffles === 'string' ? parseInt(maxShuffles) || 8 : maxShuffles;
    
    const newSettings: Engine2Settings = {
      maxSolutions: Math.max(1, maxSol),
      timeoutMs: Math.max(0, timeout) * 1000, // Convert back to ms
      moveOrdering: validOrdering,
      pruning: {
        connectivity,
        multipleOf4,
      },
      statusIntervalMs: Math.max(50, statusInterval), // Min 50ms to avoid too frequent updates
      pieces: currentSettings.pieces, // Keep existing piece config
      view: currentSettings.view, // Keep existing view config
      // Engine 2 specific
      seed: seedNum,
      randomizeTies,
      stall: {
        timeoutMs: Math.max(1000, stallTimeoutNum * 1000), // Convert back to ms, min 1s
        action: stallAction as "reshuffle" | "restartDepthK" | "perturb",
        depthK: Math.max(0, depthKNum),
        maxShuffles: Math.max(1, maxShufflesNum),
      },
    };
    onSave(newSettings);
    onClose();
  };

  return (
    <div style={backdrop} onClick={onClose}>
      <div style={card} onClick={(e) => e.stopPropagation()}>
        <div style={head}>
          <strong>{engineName} Settings</strong>
          <button onClick={onClose} style={xbtn}>×</button>
        </div>

        <div style={{ padding: "1rem 0", maxHeight: "60vh", overflowY: "auto" }}>
          {/* Search Limits */}
          <div style={sectionStyle}>
            <h4 style={sectionTitle}>Search Limits</h4>
            
            <div style={{ marginBottom: "0.75rem" }}>
              <label style={labelStyle}>
                Max Solutions
              </label>
              <input 
                type="number" 
                value={maxSolutions}
                onChange={(e) => setMaxSolutions(e.target.value)}
                onBlur={(e) => {
                  const val = parseInt(e.target.value);
                  if (isNaN(val) || val < 1) {
                    setMaxSolutions(1);
                  } else {
                    setMaxSolutions(val);
                  }
                }}
                style={inputStyle}
                min="1"
                step="1"
              />
              <div style={{ fontSize: "12px", color: "#999", marginTop: "0.25rem" }}>
                Stop after finding this many solutions
              </div>
            </div>
            
            <div style={{ marginBottom: "0.75rem" }}>
              <label style={labelStyle}>
                Timeout (seconds, 0 = no limit)
              </label>
              <input 
                type="number" 
                value={timeoutMs}
                onChange={(e) => setTimeoutMs(e.target.value)}
                onBlur={(e) => {
                  const val = parseInt(e.target.value);
                  if (isNaN(val) || val < 0) {
                    setTimeoutMs(0);
                  } else {
                    setTimeoutMs(val);
                  }
                }}
                style={inputStyle}
                min="0"
              />
              <div style={{ fontSize: "12px", color: "#999", marginTop: "0.25rem" }}>
                Maximum search time in seconds
              </div>
            </div>
            
            <div style={{ marginBottom: "0.75rem" }}>
              <label style={labelStyle}>
                Status Update Frequency (ms)
              </label>
              <input 
                type="number" 
                value={statusIntervalMs}
                onChange={(e) => setStatusIntervalMs(e.target.value)}
                onBlur={(e) => {
                  const val = parseInt(e.target.value);
                  if (isNaN(val) || val < 50) {
                    setStatusIntervalMs(250);
                  } else {
                    setStatusIntervalMs(val);
                  }
                }}
                style={inputStyle}
                min="50"
                step="50"
              />
              <div style={{ fontSize: "12px", color: "#999", marginTop: "0.25rem" }}>
                How often to update status and render (minimum 50ms)
              </div>
            </div>
          </div>

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

          {/* Pruning */}
          <div style={sectionStyle}>
            <h4 style={sectionTitle}>Pruning (Cut Search Space)</h4>
            
            <label style={{ display: "flex", alignItems: "center", gap: "0.5rem", fontSize: "14px", marginBottom: "0.5rem" }}>
              <input 
                type="checkbox" 
                checked={connectivity}
                onChange={(e) => setConnectivity(e.target.checked)}
              />
              <span>Connectivity check (flood-fill)</span>
            </label>
            
            <label style={{ display: "flex", alignItems: "center", gap: "0.5rem", fontSize: "14px" }}>
              <input 
                type="checkbox" 
                checked={multipleOf4}
                onChange={(e) => setMultipleOf4(e.target.checked)}
              />
              <span>Multiple of 4 (cells remaining % 4 === 0)</span>
            </label>
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
                    Deterministic random behavior (default: 12345)
                  </div>
                </div>
              </div>

              <div style={sectionStyle}>
                <h4 style={sectionTitle}>🔀 Stall Recovery (Engine 2)</h4>
                <div style={{ fontSize: "12px", color: "#666", marginBottom: "0.75rem" }}>
                  When search stalls (no progress), automatically try a different path
                </div>
                
                <div style={{ marginBottom: "0.75rem" }}>
                  <label style={labelStyle}>
                    Stall Timeout (seconds)
                  </label>
                  <input 
                    type="number" 
                    value={stallTimeout}
                    onChange={(e) => setStallTimeout(e.target.value)}
                    onBlur={(e) => {
                      const val = parseInt(e.target.value);
                      if (isNaN(val) || val < 1) setStallTimeout(3);
                      else setStallTimeout(val);
                    }}
                    style={inputStyle}
                    min="1"
                    disabled={!randomizeTies}
                  />
                  <div style={{ fontSize: "12px", color: "#999", marginTop: "0.25rem" }}>
                    Time without progress before triggering recovery (default: 3s)
                  </div>
                </div>
                
                <div style={{ marginBottom: "0.75rem" }}>
                  <label style={labelStyle}>
                    Recovery Action
                  </label>
                  <select 
                    value={stallAction}
                    onChange={(e) => setStallAction(e.target.value as "reshuffle" | "restartDepthK" | "perturb")}
                    style={inputStyle}
                    disabled={!randomizeTies}
                  >
                    <option value="reshuffle">Reshuffle piece order</option>
                    <option value="restartDepthK">Restart at depth K</option>
                    <option value="perturb">Perturb shallow frames</option>
                  </select>
                  <div style={{ fontSize: "12px", color: "#999", marginTop: "0.25rem" }}>
                    How to escape when stuck (default: reshuffle)
                  </div>
                </div>
                
                <div style={{ marginBottom: "0.75rem" }}>
                  <label style={labelStyle}>
                    Depth K (shallow modification)
                  </label>
                  <input 
                    type="number" 
                    value={depthK}
                    onChange={(e) => setDepthK(e.target.value)}
                    onBlur={(e) => {
                      const val = parseInt(e.target.value);
                      if (isNaN(val) || val < 0) setDepthK(2);
                      else setDepthK(val);
                    }}
                    style={inputStyle}
                    min="0"
                    disabled={!randomizeTies}
                  />
                  <div style={{ fontSize: "12px", color: "#999", marginTop: "0.25rem" }}>
                    How many levels deep to modify (default: 2)
                  </div>
                </div>
                
                <div style={{ marginBottom: "0.75rem" }}>
                  <label style={labelStyle}>
                    Max Recovery Attempts
                  </label>
                  <input 
                    type="number" 
                    value={maxShuffles}
                    onChange={(e) => setMaxShuffles(e.target.value)}
                    onBlur={(e) => {
                      const val = parseInt(e.target.value);
                      if (isNaN(val) || val < 1) setMaxShuffles(8);
                      else setMaxShuffles(val);
                    }}
                    style={inputStyle}
                    min="1"
                    disabled={!randomizeTies}
                  />
                  <div style={{ fontSize: "12px", color: "#999", marginTop: "0.25rem" }}>
                    Max times to try recovery before giving up (default: 8)
                  </div>
                </div>
              </div>
            </>
          )}
        </div>

        <div style={{ display: "flex", justifyContent: "flex-end", gap: "0.5rem", marginTop: "1rem", paddingTop: "1rem", borderTop: "1px solid #eee" }}>
          <button className="btn" onClick={onClose}>
            Cancel
          </button>
          <button className="btn" onClick={handleSave} style={{ background: "#007bff", color: "#fff" }}>
            Save Settings
          </button>
        </div>
      </div>
    </div>
  );
};

const backdrop: React.CSSProperties = { 
  position: "fixed", 
  inset: 0, 
  background: "rgba(0,0,0,.35)", 
  display: "grid", 
  placeItems: "center", 
  zIndex: 50 
};

const card: React.CSSProperties = { 
  width: 520, 
  maxWidth: "95vw", 
  background: "#fff", 
  borderRadius: 10, 
  padding: 12, 
  boxShadow: "0 10px 24px rgba(0,0,0,.15)" 
};

const head: React.CSSProperties = { 
  display: "flex", 
  justifyContent: "space-between", 
  alignItems: "center", 
  marginBottom: 8 
};

const xbtn: React.CSSProperties = { 
  border: "1px solid #ddd", 
  width: 28, 
  height: 28, 
  borderRadius: 6, 
  background: "#f6f7f9", 
  cursor: "pointer", 
  display: "flex", 
  alignItems: "center", 
  justifyContent: "center" 
};

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
