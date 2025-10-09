// src/components/EngineSettingsModal.tsx
import React, { useState, useEffect } from "react";
import type { DFSSettings } from "../engines/dfs";

type Props = {
  open: boolean;
  onClose: () => void;
  engineName: string;
  currentSettings: DFSSettings;
  onSave: (settings: DFSSettings) => void;
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
  const [moveOrdering, setMoveOrdering] = useState(currentSettings.moveOrdering ?? "mostConstrainedCell");
  const [connectivity, setConnectivity] = useState(currentSettings.pruning?.connectivity ?? true);
  const [multipleOf4, setMultipleOf4] = useState(currentSettings.pruning?.multipleOf4 ?? true);
  const [boundaryReject, setBoundaryReject] = useState(currentSettings.pruning?.boundaryReject ?? true);

  // Sync with props when modal opens
  useEffect(() => {
    if (open) {
      setMaxSolutions(currentSettings.maxSolutions ?? 1);
      setTimeoutMs((currentSettings.timeoutMs ?? 0) / 1000);
      setMoveOrdering(currentSettings.moveOrdering ?? "mostConstrainedCell");
      setConnectivity(currentSettings.pruning?.connectivity ?? true);
      setMultipleOf4(currentSettings.pruning?.multipleOf4 ?? true);
      setBoundaryReject(currentSettings.pruning?.boundaryReject ?? true);
    }
  }, [open, currentSettings]);

  if (!open) return null;

  const handleSave = () => {
    const maxSol = typeof maxSolutions === 'string' ? parseInt(maxSolutions) || 1 : maxSolutions;
    const timeout = typeof timeoutMs === 'string' ? parseInt(timeoutMs) || 0 : timeoutMs;
    
    const newSettings: DFSSettings = {
      maxSolutions: Math.max(1, maxSol),
      timeoutMs: Math.max(0, timeout) * 1000, // Convert back to ms
      moveOrdering,
      pruning: {
        connectivity,
        multipleOf4,
        boundaryReject,
      },
      statusIntervalMs: currentSettings.statusIntervalMs ?? 250,
      pieces: currentSettings.pieces, // Keep existing piece config
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
            
            <label style={{ display: "flex", alignItems: "center", gap: "0.5rem", fontSize: "14px" }}>
              <input 
                type="checkbox" 
                checked={boundaryReject}
                onChange={(e) => setBoundaryReject(e.target.checked)}
              />
              <span>Boundary reject (fast bounds check)</span>
            </label>
          </div>
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
