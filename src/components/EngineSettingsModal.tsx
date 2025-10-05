// src/components/EngineSettingsModal.tsx
import React from 'react';

type Props = {
  open: boolean;
  onClose: () => void;
  engineName: string;
};

export const EngineSettingsModal: React.FC<Props> = ({ open, onClose, engineName }) => {
  if (!open) return null;

  return (
    <div style={backdrop}>
      <div style={card}>
        <div style={head}>
          <strong>{engineName} Settings</strong>
          <button onClick={onClose} style={xbtn}>×</button>
        </div>

        <div style={{ padding: '16px 0' }}>
          <p style={{ marginBottom: '16px', color: '#667' }}>
            Engine-specific settings will be configured here.
          </p>

          {/* Placeholder settings */}
          <div style={settingRow}>
            <label style={settingLabel}>Max Depth</label>
            <input 
              type="number" 
              defaultValue={32} 
              style={settingInput}
              disabled
            />
          </div>

          <div style={settingRow}>
            <label style={settingLabel}>Strategy</label>
            <select style={settingInput} disabled>
              <option>Depth First</option>
              <option>Breadth First</option>
              <option>Best First</option>
            </select>
          </div>

          <div style={settingRow}>
            <label style={settingLabel}>Timeout (seconds)</label>
            <input 
              type="number" 
              defaultValue={300} 
              style={settingInput}
              disabled
            />
          </div>

          <div style={{ 
            marginTop: '16px', 
            padding: '12px', 
            backgroundColor: '#f8f9fa', 
            borderRadius: '6px',
            fontSize: '12px',
            color: '#667'
          }}>
            💡 <strong>Coming Soon:</strong> Configure algorithm-specific parameters for {engineName}
          </div>
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '16px' }}>
          <button className="btn" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
};

const backdrop: React.CSSProperties = { 
  position: 'fixed', 
  inset: 0, 
  background: 'rgba(0,0,0,.35)', 
  display: 'grid', 
  placeItems: 'center', 
  zIndex: 200 
};

const card: React.CSSProperties = { 
  width: 480, 
  maxWidth: '95vw', 
  background: '#fff', 
  borderRadius: 10, 
  padding: 20, 
  boxShadow: '0 10px 24px rgba(0,0,0,.15)' 
};

const head: React.CSSProperties = { 
  display: 'flex', 
  justifyContent: 'space-between', 
  alignItems: 'center', 
  marginBottom: 12 
};

const xbtn: React.CSSProperties = { 
  border: '1px solid #ddd', 
  width: 28, 
  height: 28, 
  borderRadius: 6, 
  background: '#f6f7f9', 
  cursor: 'pointer', 
  display: 'flex', 
  alignItems: 'center', 
  justifyContent: 'center' 
};

const settingRow: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: '12px',
  marginBottom: '12px'
};

const settingLabel: React.CSSProperties = {
  minWidth: '140px',
  fontWeight: 500,
  fontSize: '14px'
};

const settingInput: React.CSSProperties = {
  flex: 1,
  padding: '8px 12px',
  border: '1px solid #ddd',
  borderRadius: '6px',
  fontSize: '14px'
};
