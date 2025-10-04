import React from 'react';

interface ViewControlsProps {
  onResetView: () => void;
  onToggleBonds?: () => void;
  bondsVisible?: boolean;
}

export const ViewControls: React.FC<ViewControlsProps> = ({ 
  onResetView, 
  onToggleBonds, 
  bondsVisible = true 
}) => {
  return (
    <div style={{
      position: "absolute",
      bottom: "1rem",
      left: "1rem",
      backgroundColor: "white",
      border: "1px solid #dee2e6",
      borderRadius: "4px",
      boxShadow: "0 2px 8px rgba(0,0,0,0.15)",
      padding: "0.75rem",
      zIndex: 10
    }}>
      <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
        <button
          onClick={onResetView}
          className="btn primary"
          style={{ fontSize: "0.875rem" }}
        >
          Reset View
        </button>
        
        {onToggleBonds && (
          <button
            onClick={onToggleBonds}
            className="btn"
            style={{
              fontSize: "0.875rem",
              backgroundColor: bondsVisible ? "#059669" : "#f3f4f6",
              color: bondsVisible ? "white" : "#374151",
              borderColor: bondsVisible ? "#059669" : "#d1d5db"
            }}
          >
            {bondsVisible ? 'Hide Bonds' : 'Show Bonds'}
          </button>
        )}
      </div>
      
      <div style={{
        marginTop: "0.75rem",
        paddingTop: "0.75rem",
        borderTop: "1px solid #e5e7eb",
        fontSize: "0.75rem",
        color: "#6b7280"
      }}>
        <div>• Drag to orbit</div>
        <div>• Scroll to zoom</div>
        <div>• Use reveal slider</div>
      </div>
    </div>
  );
};
