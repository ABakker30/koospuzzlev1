// src/game/ui/NarrationLane.tsx
// Narration queue display - Phase 2D

import React from 'react';
import type { NarrationEntry, NarrationLevel } from '../contracts/GameState';

interface NarrationLaneProps {
  entries: NarrationEntry[];
  maxVisible?: number;
}

const LEVEL_ICONS: Record<NarrationLevel, string> = {
  info: '💬',
  warn: '⚠️',
  action: '🎯',
  system: '⚙️',
};

const LEVEL_COLORS: Record<NarrationLevel, string> = {
  info: 'rgba(255, 255, 255, 0.9)',
  warn: 'rgba(251, 191, 36, 0.9)',
  action: 'rgba(52, 211, 153, 0.9)',
  system: 'rgba(139, 92, 246, 0.9)',
};

export function NarrationLane({ entries, maxVisible = 5 }: NarrationLaneProps) {
  // Show only the most recent entries (newest first)
  const visibleEntries = entries.slice(0, maxVisible);
  
  if (visibleEntries.length === 0) {
    return null;
  }

  return (
    <div style={styles.container}>
      <div style={styles.header}>Activity</div>
      <div style={styles.list}>
        {visibleEntries.map((entry, idx) => (
          <div
            key={entry.id}
            style={{
              ...styles.entry,
              opacity: 1 - (idx * 0.15), // Fade older entries
              color: LEVEL_COLORS[entry.level],
            }}
          >
            <span style={styles.icon}>{LEVEL_ICONS[entry.level]}</span>
            <span style={styles.text}>{entry.text}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ============================================================================
// STYLES
// ============================================================================

const styles: Record<string, React.CSSProperties> = {
  container: {
    background: 'rgba(0, 0, 0, 0.4)',
    borderRadius: '12px',
    padding: '12px',
    minWidth: '200px',
    maxWidth: '280px',
    backdropFilter: 'blur(8px)',
    border: '1px solid rgba(255, 255, 255, 0.1)',
  },
  header: {
    fontSize: '0.7rem',
    fontWeight: 'bold',
    color: 'rgba(255, 255, 255, 0.5)',
    textTransform: 'uppercase',
    letterSpacing: '1px',
    marginBottom: '8px',
  },
  list: {
    display: 'flex',
    flexDirection: 'column',
    gap: '4px',
  },
  entry: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    fontSize: '0.8rem',
    padding: '4px 0',
    transition: 'opacity 0.3s ease',
  },
  icon: {
    fontSize: '0.75rem',
    flexShrink: 0,
  },
  text: {
    flex: 1,
    lineHeight: 1.3,
  },
};

export default NarrationLane;
