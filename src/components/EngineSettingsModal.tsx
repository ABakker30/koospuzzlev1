// src/components/EngineSettingsModal.tsx
import React from "react";

type Props = {
  open: boolean;
  onClose: () => void;
  engineName: string;
};

export const EngineSettingsModal: React.FC<Props> = ({ open, onClose, engineName }) => {
  if (!open) return null;

  return (
    <div style={backdrop} onClick={onClose}>
      <div style={card} onClick={(e) => e.stopPropagation()}>
        <div style={head}>
          <strong>{engineName} Settings</strong>
          <button onClick={onClose} style={xbtn}>×</button>
        </div>

        <div style={{ padding: "1rem 0" }}>
          <p style={{ color: "#667", fontSize: "14px", marginBottom: "1rem" }}>
            Engine settings configuration will be implemented here.
          </p>
          
          {/* Placeholder for future settings */}
          <div style={{ border: "1px solid #eee", borderRadius: 6, padding: "1rem" }}>
            <div style={{ marginBottom: "0.75rem" }}>
              <label style={{ display: "block", marginBottom: "0.5rem", fontWeight: 500, fontSize: "14px" }}>
                Max Depth
              </label>
              <input 
                type="number" 
                defaultValue={32}
                style={inputStyle}
                disabled
              />
            </div>
            
            <div style={{ marginBottom: "0.75rem" }}>
              <label style={{ display: "block", marginBottom: "0.5rem", fontWeight: 500, fontSize: "14px" }}>
                Timeout (seconds)
              </label>
              <input 
                type="number" 
                defaultValue={300}
                style={inputStyle}
                disabled
              />
            </div>
            
            <div>
              <label style={{ display: "flex", alignItems: "center", gap: "0.5rem", fontSize: "14px" }}>
                <input type="checkbox" disabled />
                Enable pruning
              </label>
            </div>
          </div>
        </div>

        <div style={{ display: "flex", justifyContent: "flex-end", gap: "0.5rem", marginTop: "1rem" }}>
          <button className="btn" onClick={onClose}>
            Close
          </button>
          <button className="btn" disabled style={{ opacity: 0.5 }}>
            Save (Coming Soon)
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
