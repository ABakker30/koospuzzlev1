import React from 'react';
import type { PieceOrderEntry } from '../types';

interface PieceInfoProps {
  pieces: PieceOrderEntry[];
  revealK: number;
}

export const PieceInfo: React.FC<PieceInfoProps> = ({ pieces, revealK }) => {
  if (pieces.length === 0) return null;

  const visiblePieces = pieces.slice(0, revealK);
  const hiddenPieces = pieces.slice(revealK);

  return (
    <div style={{
      position: "absolute",
      top: "1rem",
      right: "1rem",
      backgroundColor: "white",
      border: "1px solid #dee2e6",
      borderRadius: "4px",
      boxShadow: "0 2px 8px rgba(0,0,0,0.15)",
      padding: "1rem",
      maxWidth: "16rem",
      zIndex: 10
    }}>
      <h3 style={{ margin: "0 0 0.5rem 0", fontSize: "0.875rem", fontWeight: "600" }}>Piece Information</h3>
      
      <div style={{ fontSize: "0.875rem" }}>
        <div style={{ marginBottom: "0.25rem" }}>
          <span style={{ fontWeight: "500", color: "#059669" }}>Visible:</span> {visiblePieces.length}
        </div>
        <div style={{ marginBottom: "0.25rem" }}>
          <span style={{ fontWeight: "500", color: "#6b7280" }}>Hidden:</span> {hiddenPieces.length}
        </div>
        <div style={{ marginBottom: "0.25rem" }}>
          <span style={{ fontWeight: "500", color: "#374151" }}>Total:</span> {pieces.length}
        </div>
      </div>

      {visiblePieces.length > 0 && (
        <div style={{ marginTop: "0.75rem", paddingTop: "0.75rem", borderTop: "1px solid #e5e7eb" }}>
          <div style={{ fontSize: "0.75rem", color: "#6b7280", marginBottom: "0.25rem" }}>Visible pieces (by reveal order):</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "0.25rem" }}>
            {visiblePieces.map((piece, index) => (
              <span
                key={piece.id}
                style={{
                  display: "inline-block",
                  padding: "0.125rem 0.375rem",
                  backgroundColor: "#dcfce7",
                  color: "#166534",
                  borderRadius: "4px",
                  fontSize: "0.75rem",
                  fontFamily: "monospace"
                }}
                title={`Y: ${piece.minY.toFixed(2)}`}
              >
                {index + 1}. {piece.id}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
