// How to Puzzle content component
import React from 'react';

export const HowToPuzzleContent: React.FC = () => (
  <div style={{ fontSize: '14px', lineHeight: '1.6', color: '#4b5563' }}>
    <p>
      In manual mode you <strong>draw</strong> each Koos piece directly on
      the lattice.
    </p>

    <p style={{ marginTop: '0.5rem' }}>
      <strong>Basic controls</strong>
    </p>
    <ul style={{ marginTop: '0.25rem', paddingLeft: '1.5rem' }}>
      <li>Double-click adjacent empty cells to draw up to 4 spheres.</li>
      <li>Single-click on a cell to cancel the current drawing.</li>
      <li>Click a placed piece to select it.</li>
      <li>
        Double-click or long-press a selected piece to delete it.
      </li>
      <li>Use Ctrl+Z / ⌘Z to undo and Shift+Ctrl+Z / Shift+⌘Z to redo.</li>
    </ul>

    <p style={{ marginTop: '0.5rem' }}>
      <strong>Modes</strong>
    </p>
    <ul style={{ marginTop: '0.25rem', paddingLeft: '1.5rem' }}>
      <li>
        <strong>One of each:</strong> Place each piece at most once.
      </li>
      <li>
        <strong>Unlimited:</strong> Use any piece as many times as you like.
      </li>
      <li>
        <strong>Single piece:</strong> The first piece you place becomes
        the only allowed piece.
      </li>
    </ul>

    <p
      style={{
        marginTop: '1rem',
        padding: '0.75rem',
        background: '#f3f4f6',
        borderRadius: '6px',
      }}
    >
      💡 <strong>Tip:</strong> Use the gear icon (⚙️) to tune lighting and
      materials so the structure is easier to read while you explore.
    </p>
  </div>
);
