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
  const [colorResidue, setColorResidue] = useState(currentSettings.pruning?.colorResidue ?? true);
  const [neighborTouch, setNeighborTouch] = useState(currentSettings.pruning?.neighborTouch ?? true);
  
  // Engine 2 specific settings
  const [randomizeTies, setRandomizeTies] = useState(currentSettings.randomizeTies ?? true);
  const [seed, setSeed] = useState<number | string>(currentSettings.seed ?? 12345);
  
  // Stall-by-pieces settings (use string to allow free typing)
  const [nMinus1Sec, setNMinus1Sec] = useState<number | string>(Math.max(1, Math.round((currentSettings.stallByPieces?.nMinus1Ms ?? 2000)/1000)));
  const [nMinus2Sec, setNMinus2Sec] = useState<number | string>(Math.max(1, Math.round((currentSettings.stallByPieces?.nMinus2Ms ?? 4000)/1000)));
  const [nMinus3Sec, setNMinus3Sec] = useState<number | string>(Math.max(1, Math.round((currentSettings.stallByPieces?.nMinus3Ms ?? 5000)/1000)));
  const [nMinus4Sec, setNMinus4Sec] = useState<number | string>(Math.max(1, Math.round((currentSettings.stallByPieces?.nMinus4Ms ?? 6000)/1000)));
  const [nMinusOtherSec, setNMinusOtherSec] = useState<number | string>(Math.max(1, Math.round((currentSettings.stallByPieces?.nMinusOtherMs ?? 10000)/1000)));
  const [stallAction, setStallAction] = useState<"reshuffle" | "restartDepthK" | "perturb">(currentSettings.stallByPieces?.action ?? "reshuffle");
  const [stallDepthK, setStallDepthK] = useState(currentSettings.stallByPieces?.depthK ?? 2);
  const [stallMax, setStallMax] = useState(currentSettings.stallByPieces?.maxShuffles ?? 8);
  
  const [visualRevealDelayMs, setVisualRevealDelayMs] = useState<number | string>(currentSettings.visualRevealDelayMs ?? 50);
  const [solutionRevealDelayMs, setSolutionRevealDelayMs] = useState<number | string>((currentSettings as any).solutionRevealDelayMs ?? 150);
  
  // Solution handling
  const [pauseOnSolution, setPauseOnSolution] = useState(currentSettings.pauseOnSolution ?? true);
  const [saveSolutions, setSaveSolutions] = useState(currentSettings.saveSolutions ?? false);
  const [savePath, setSavePath] = useState(currentSettings.savePath ?? "");
  
  // Tail solver settings
  const [tailEnable, setTailEnable] = useState(currentSettings.tailSwitch?.enable ?? true);
  const [tailSize, setTailSize] = useState<number | string>(currentSettings.tailSwitch?.tailSize ?? 20);

  // Sync with props when modal opens
  useEffect(() => {
    if (open) {
      setMaxSolutions(currentSettings.maxSolutions ?? 1);
      setTimeoutMs((currentSettings.timeoutMs ?? 0) / 1000);
      setStatusIntervalMs(currentSettings.statusIntervalMs ?? 250);
      setMoveOrdering(currentSettings.moveOrdering ?? "mostConstrainedCell");
      setConnectivity(currentSettings.pruning?.connectivity ?? true);
      setMultipleOf4(currentSettings.pruning?.multipleOf4 ?? true);
      setColorResidue(currentSettings.pruning?.colorResidue ?? true);
      setNeighborTouch(currentSettings.pruning?.neighborTouch ?? true);
      
      // Engine 2 specific
      setRandomizeTies(currentSettings.randomizeTies ?? true);
      setSeed(currentSettings.seed ?? 12345);
      setNMinus1Sec(Math.max(1, Math.round((currentSettings.stallByPieces?.nMinus1Ms ?? 2000)/1000)));
      setNMinus2Sec(Math.max(1, Math.round((currentSettings.stallByPieces?.nMinus2Ms ?? 4000)/1000)));
      setNMinus3Sec(Math.max(1, Math.round((currentSettings.stallByPieces?.nMinus3Ms ?? 5000)/1000)));
      setNMinus4Sec(Math.max(1, Math.round((currentSettings.stallByPieces?.nMinus4Ms ?? 6000)/1000)));
      setNMinusOtherSec(Math.max(1, Math.round((currentSettings.stallByPieces?.nMinusOtherMs ?? 10000)/1000)));
      setStallAction(currentSettings.stallByPieces?.action ?? "reshuffle");
      setStallDepthK(currentSettings.stallByPieces?.depthK ?? 2);
      setStallMax(currentSettings.stallByPieces?.maxShuffles ?? 8);
      setVisualRevealDelayMs(currentSettings.visualRevealDelayMs ?? 50);
      setSolutionRevealDelayMs((currentSettings as any).solutionRevealDelayMs ?? 150);
      
      // Solution handling
      setPauseOnSolution(currentSettings.pauseOnSolution ?? true);
      setSaveSolutions(currentSettings.saveSolutions ?? false);
      setSavePath(currentSettings.savePath ?? "");
      
      // Tail solver
      setTailEnable(currentSettings.tailSwitch?.enable ?? true);
      setTailSize(currentSettings.tailSwitch?.tailSize ?? 20);
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
    const nMinus1Ms = (typeof nMinus1Sec === 'string' ? parseInt(nMinus1Sec) || 2 : nMinus1Sec) * 1000;
    const nMinus2Ms = (typeof nMinus2Sec === 'string' ? parseInt(nMinus2Sec) || 4 : nMinus2Sec) * 1000;
    const nMinus3Ms = (typeof nMinus3Sec === 'string' ? parseInt(nMinus3Sec) || 5 : nMinus3Sec) * 1000;
    const nMinus4Ms = (typeof nMinus4Sec === 'string' ? parseInt(nMinus4Sec) || 6 : nMinus4Sec) * 1000;
    const nMinusOtherMs = (typeof nMinusOtherSec === 'string' ? parseInt(nMinusOtherSec) || 10 : nMinusOtherSec) * 1000;
    const visualDelayNum = typeof visualRevealDelayMs === 'string' ? parseInt(visualRevealDelayMs) || 50 : visualRevealDelayMs;
    const solutionDelayNum = typeof solutionRevealDelayMs === 'string' ? parseInt(solutionRevealDelayMs) || 150 : solutionRevealDelayMs;
    const tailSizeNum = typeof tailSize === 'string' ? parseInt(tailSize) || 20 : tailSize;
    
    const newSettings: Engine2Settings = {
      maxSolutions: Math.max(1, maxSol),
      timeoutMs: Math.max(0, timeout) * 1000, // Convert back to ms
      moveOrdering: validOrdering,
      pruning: {
        connectivity,
        multipleOf4,
        colorResidue,
        neighborTouch,
      },
      statusIntervalMs: Math.max(50, statusInterval), // Min 50ms to avoid too frequent updates
      pauseOnSolution,
      saveSolutions,
      savePath,
      pieces: currentSettings.pieces, // Keep existing piece config
      view: currentSettings.view, // Keep existing view config
      seed: seedNum,
      randomizeTies,
      stallByPieces: {
        nMinus1Ms: Math.max(1000, nMinus1Ms),
        nMinus2Ms: Math.max(1000, nMinus2Ms),
        nMinus3Ms: Math.max(1000, nMinus3Ms),
        nMinus4Ms: Math.max(1000, nMinus4Ms),
        nMinusOtherMs: Math.max(1000, nMinusOtherMs),
        action: stallAction as "reshuffle" | "restartDepthK" | "perturb",
        depthK: stallDepthK,
        maxShuffles: stallMax,
      },
      tailSwitch: {
        enable: tailEnable,
        tailSize: Math.max(4, tailSizeNum), // Min 4 cells (1 piece)
      },
      visualRevealDelayMs: Math.max(0, visualDelayNum),
      solutionRevealDelayMs: Math.max(0, solutionDelayNum),
    } as Engine2Settings;
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
            
          </div>

          {/* Solution Handling */}
          <div style={sectionStyle}>
            <h4 style={sectionTitle}>Solution Handling</h4>
            
            <label style={{ display: "flex", alignItems: "center", gap: "0.5rem", fontSize: "14px", marginBottom: "0.75rem" }}>
              <input 
                type="checkbox" 
                checked={pauseOnSolution}
                onChange={(e) => setPauseOnSolution(e.target.checked)}
              />
              <span>Pause on solution (recommended)</span>
            </label>
            
            <label style={{ display: "flex", alignItems: "center", gap: "0.5rem", fontSize: "14px", marginBottom: "0.75rem" }}>
              <input 
                type="checkbox" 
                checked={saveSolutions}
                onChange={(e) => setSaveSolutions(e.target.checked)}
              />
              <span>Save solutions to file</span>
            </label>
            
            {saveSolutions && (
              <div style={{ marginBottom: "0.75rem", marginLeft: "1.5rem" }}>
                <label style={labelStyle}>
                  Save Directory Path
                </label>
                <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
                  <input 
                    type="text" 
                    value={savePath}
                    onChange={(e) => setSavePath(e.target.value)}
                    placeholder="e.g., C:/Solutions or /Users/name/Solutions"
                    style={{ ...inputStyle, flex: 1 }}
                    readOnly={false}
                  />
                  <button
                    type="button"
                    onClick={async () => {
                      try {
                        // @ts-ignore - File System Access API
                        if ('showDirectoryPicker' in window) {
                          // @ts-ignore
                          const dirHandle = await window.showDirectoryPicker();
                          setSavePath(dirHandle.name);
                          console.log('📁 Selected directory:', dirHandle.name);
                        } else {
                          alert('Directory picker not supported in this browser. Please enter path manually.');
                        }
                      } catch (err) {
                        // User cancelled or error occurred
                        if ((err as Error).name !== 'AbortError') {
                          console.error('Error picking directory:', err);
                        }
                      }
                    }}
                    style={{
                      padding: "0.5rem 1rem",
                      backgroundColor: "#4a5568",
                      color: "white",
                      border: "none",
                      borderRadius: "4px",
                      cursor: "pointer",
                      fontSize: "14px",
                      whiteSpace: "nowrap"
                    }}
                  >
                    Browse...
                  </button>
                </div>
                <div style={{ fontSize: "12px", color: "#999", marginTop: "0.25rem" }}>
                  Solutions will be saved as JSON files in this directory
                </div>
              </div>
            )}
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
            
            <label style={{ display: "flex", alignItems: "center", gap: "0.5rem", fontSize: "14px", marginBottom: "0.5rem" }}>
              <input 
                type="checkbox" 
                checked={multipleOf4}
                onChange={(e) => setMultipleOf4(e.target.checked)}
              />
              <span>Multiple of 4 (cells remaining % 4 === 0)</span>
            </label>
            
            <label style={{ display: "flex", alignItems: "center", gap: "0.5rem", fontSize: "14px", marginBottom: "0.5rem" }}>
              <input 
                type="checkbox" 
                checked={colorResidue}
                onChange={(e) => setColorResidue(e.target.checked)}
              />
              <span>Color residue (FCC parity check)</span>
            </label>
            
            <label style={{ display: "flex", alignItems: "center", gap: "0.5rem", fontSize: "14px" }}>
              <input 
                type="checkbox" 
                checked={neighborTouch}
                onChange={(e) => setNeighborTouch(e.target.checked)}
              />
              <span>Neighbor touch (cluster connectivity)</span>
            </label>
          </div>

          {/* Display Settings */}
          <div style={sectionStyle}>
            <h4 style={sectionTitle}>Display Settings</h4>
            
            <div style={{ marginBottom: "0.75rem" }}>
              <label style={labelStyle}>
                Status Update Delay (ms)
              </label>
              <input 
                type="number" 
                value={visualRevealDelayMs}
                onChange={(e) => setVisualRevealDelayMs(e.target.value)}
                onBlur={(e) => {
                  const val = parseInt(e.target.value);
                  if (isNaN(val) || val < 0) {
                    setVisualRevealDelayMs(50);
                  } else {
                    setVisualRevealDelayMs(val);
                  }
                }}
                style={inputStyle}
                min="0"
                step="10"
              />
              <div style={{ fontSize: "12px", color: "#999", marginTop: "0.25rem" }}>
                Delay for pieces during search status updates (default: 50ms). Set to 0 for instant.
              </div>
            </div>
            
            <div style={{ marginBottom: "0.75rem" }}>
              <label style={labelStyle}>
                Solution Reveal Delay (ms)
              </label>
              <input 
                type="number" 
                value={solutionRevealDelayMs}
                onChange={(e) => setSolutionRevealDelayMs(e.target.value)}
                onBlur={(e) => {
                  const val = parseInt(e.target.value);
                  if (isNaN(val) || val < 0) {
                    setSolutionRevealDelayMs(150);
                  } else {
                    setSolutionRevealDelayMs(val);
                  }
                }}
                style={inputStyle}
                min="0"
                step="10"
              />
              <div style={{ fontSize: "12px", color: "#999", marginTop: "0.25rem" }}>
                Delay for pieces when displaying final solutions (default: 150ms). Set to 0 for instant.
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
                    Deterministic random behavior (default: 12345)
                  </div>
                </div>
              </div>

              <div style={sectionStyle}>
                <h4 style={sectionTitle}>🔀 Stall by Pieces (Engine 2)</h4>
                <div style={{ fontSize: "12px", color: "#666", marginBottom: "0.75rem" }}>
                  Trigger recovery when stuck at specific remaining piece counts
                </div>
                
                <div style={{ marginBottom: "0.75rem" }}>
                  <label style={labelStyle}>
                    Timeout at N−1 (seconds)
                  </label>
                  <input 
                    type="number" 
                    value={nMinus1Sec}
                    onChange={(e) => setNMinus1Sec(e.target.value)}
                    onBlur={(e) => {
                      const val = parseInt(e.target.value);
                      setNMinus1Sec(isNaN(val) || val < 1 ? 2 : val);
                    }}
                    style={inputStyle}
                    min="1"
                    disabled={!randomizeTies}
                  />
                  <div style={{ fontSize: "12px", color: "#999", marginTop: "0.25rem" }}>
                    When 1 piece remains (default: 2s)
                  </div>
                </div>
                
                <div style={{ marginBottom: "0.75rem" }}>
                  <label style={labelStyle}>
                    Timeout at N−2 (seconds)
                  </label>
                  <input 
                    type="number" 
                    value={nMinus2Sec}
                    onChange={(e) => setNMinus2Sec(e.target.value)}
                    onBlur={(e) => {
                      const val = parseInt(e.target.value);
                      setNMinus2Sec(isNaN(val) || val < 1 ? 4 : val);
                    }}
                    style={inputStyle}
                    min="1"
                    disabled={!randomizeTies}
                  />
                  <div style={{ fontSize: "12px", color: "#999", marginTop: "0.25rem" }}>
                    When 2 pieces remain (default: 4s)
                  </div>
                </div>
                
                <div style={{ marginBottom: "0.75rem" }}>
                  <label style={labelStyle}>
                    Timeout at N−3 (seconds)
                  </label>
                  <input 
                    type="number" 
                    value={nMinus3Sec}
                    onChange={(e) => setNMinus3Sec(e.target.value)}
                    onBlur={(e) => {
                      const val = parseInt(e.target.value);
                      setNMinus3Sec(isNaN(val) || val < 1 ? 5 : val);
                    }}
                    style={inputStyle}
                    min="1"
                    disabled={!randomizeTies}
                  />
                  <div style={{ fontSize: "12px", color: "#999", marginTop: "0.25rem" }}>
                    When 3 pieces remain (default: 5s)
                  </div>
                </div>
                
                <div style={{ marginBottom: "0.75rem" }}>
                  <label style={labelStyle}>
                    Timeout at N−4 (seconds)
                  </label>
                  <input 
                    type="number" 
                    value={nMinus4Sec}
                    onChange={(e) => setNMinus4Sec(e.target.value)}
                    onBlur={(e) => {
                      const val = parseInt(e.target.value);
                      setNMinus4Sec(isNaN(val) || val < 1 ? 6 : val);
                    }}
                    style={inputStyle}
                    min="1"
                    disabled={!randomizeTies}
                  />
                  <div style={{ fontSize: "12px", color: "#999", marginTop: "0.25rem" }}>
                    When 4 pieces remain (default: 6s)
                  </div>
                </div>
                
                <div style={{ marginBottom: "0.75rem" }}>
                  <label style={labelStyle}>
                    Timeout at N &gt; 4 (seconds)
                  </label>
                  <input 
                    type="number" 
                    value={nMinusOtherSec}
                    onChange={(e) => setNMinusOtherSec(e.target.value)}
                    onBlur={(e) => {
                      const val = parseInt(e.target.value);
                      setNMinusOtherSec(isNaN(val) || val < 1 ? 10 : val);
                    }}
                    style={inputStyle}
                    min="1"
                    disabled={!randomizeTies}
                  />
                  <div style={{ fontSize: "12px", color: "#999", marginTop: "0.25rem" }}>
                    When more than 4 pieces remain (default: 10s, catch-all)
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
                </div>
                
                <div style={{ marginBottom: "0.75rem" }}>
                  <label style={labelStyle}>
                    Depth K
                  </label>
                  <input 
                    type="number" 
                    value={stallDepthK}
                    onChange={(e) => setStallDepthK(parseInt(e.target.value) || 2)}
                    style={inputStyle}
                    min="0"
                    disabled={!randomizeTies}
                  />
                </div>
                
                <div style={{ marginBottom: "0.75rem" }}>
                  <label style={labelStyle}>
                    Max Shuffles
                  </label>
                  <input 
                    type="number" 
                    value={stallMax}
                    onChange={(e) => setStallMax(parseInt(e.target.value) || 8)}
                    style={inputStyle}
                    min="1"
                    disabled={!randomizeTies}
                  />
                </div>
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
