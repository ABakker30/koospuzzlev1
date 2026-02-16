// src/game/pvp/PlayerStatsCard.tsx
// Displays player PvP statistics

import React, { useState, useEffect } from 'react';
import { getPlayerStats } from './pvpApi';
import type { PlayerStats } from './types';

interface PlayerStatsCardProps {
  userId: string;
  compact?: boolean;
}

export function PlayerStatsCard({ userId, compact = false }: PlayerStatsCardProps) {
  const [stats, setStats] = useState<PlayerStats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);

    getPlayerStats(userId).then(data => {
      if (!cancelled) {
        setStats(data);
        setLoading(false);
      }
    });

    return () => { cancelled = true; };
  }, [userId]);

  if (loading) {
    return <div style={styles.loading}>...</div>;
  }

  if (!stats) {
    return compact ? null : (
      <div style={styles.empty}>No games played yet</div>
    );
  }

  const winRate = stats.games_played > 0
    ? Math.round((stats.games_won / stats.games_played) * 100)
    : 0;

  if (compact) {
    return (
      <div style={styles.compactRow}>
        <span style={styles.compactStat}>
          <strong>{stats.games_won}</strong>W
        </span>
        <span style={styles.compactStat}>
          <strong>{stats.games_lost}</strong>L
        </span>
        <span style={styles.compactStat}>
          <strong>{winRate}%</strong>
        </span>
      </div>
    );
  }

  return (
    <div style={styles.card}>
      <div style={styles.title}>PvP Stats</div>
      <div style={styles.grid}>
        <div style={styles.statBox}>
          <div style={styles.statValue}>{stats.games_played}</div>
          <div style={styles.statLabel}>Played</div>
        </div>
        <div style={styles.statBox}>
          <div style={{ ...styles.statValue, color: '#4ade80' }}>{stats.games_won}</div>
          <div style={styles.statLabel}>Won</div>
        </div>
        <div style={styles.statBox}>
          <div style={{ ...styles.statValue, color: '#f87171' }}>{stats.games_lost}</div>
          <div style={styles.statLabel}>Lost</div>
        </div>
        <div style={styles.statBox}>
          <div style={{ ...styles.statValue, color: '#60a5fa' }}>{winRate}%</div>
          <div style={styles.statLabel}>Win Rate</div>
        </div>
      </div>
      {stats.highest_score > 0 && (
        <div style={styles.extraRow}>
          Best score: <strong>{stats.highest_score}</strong>
        </div>
      )}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  card: {
    background: 'rgba(255,255,255,0.05)',
    borderRadius: '12px',
    padding: '16px',
    border: '1px solid rgba(255,255,255,0.1)',
  },
  title: {
    color: '#fff',
    fontWeight: 700,
    fontSize: '0.9rem',
    marginBottom: '12px',
  },
  grid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(4, 1fr)',
    gap: '8px',
  },
  statBox: {
    textAlign: 'center' as const,
  },
  statValue: {
    color: '#fff',
    fontWeight: 700,
    fontSize: '1.3rem',
  },
  statLabel: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: '0.7rem',
    marginTop: '2px',
  },
  extraRow: {
    color: 'rgba(255,255,255,0.6)',
    fontSize: '0.8rem',
    marginTop: '10px',
    textAlign: 'center' as const,
  },
  loading: {
    color: 'rgba(255,255,255,0.4)',
    fontSize: '0.8rem',
    textAlign: 'center' as const,
    padding: '8px',
  },
  empty: {
    color: 'rgba(255,255,255,0.4)',
    fontSize: '0.8rem',
    textAlign: 'center' as const,
    padding: '12px',
  },
  compactRow: {
    display: 'flex',
    gap: '8px',
    alignItems: 'center',
  },
  compactStat: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: '0.75rem',
  },
};
