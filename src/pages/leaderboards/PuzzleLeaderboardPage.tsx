import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  getFastestSolutionsForPuzzle,
  LeaderboardEntry,
} from '../../services/leaderboardService';
import { supabase } from '../../lib/supabase';
import { ThreeDotMenu } from '../../components/ThreeDotMenu';

type PuzzleMeta = {
  id: string;
  name: string;
};

// Format duration as M:SS (e.g., 3:07, 0:42)
function formatDuration(durationMs: number | null): string {
  if (durationMs == null) return '-';
  const totalSeconds = Math.round(durationMs / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  const padded = seconds.toString().padStart(2, '0');
  return `${minutes}:${padded}`;
}

export const PuzzleLeaderboardPage: React.FC = () => {
  const { puzzleId } = useParams<{ puzzleId: string }>();
  const navigate = useNavigate();
  const [entries, setEntries] = useState<LeaderboardEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [puzzleMeta, setPuzzleMeta] = useState<PuzzleMeta | null>(null);

  // Add responsive CSS
  React.useEffect(() => {
    const style = document.createElement('style');
    style.textContent = `
      @media (max-width: 768px) {
        .desktop-leaderboard {
          display: none !important;
        }
        .mobile-leaderboard {
          display: block !important;
        }
      }
      @media (min-width: 769px) {
        .mobile-leaderboard {
          display: none !important;
        }
      }
    `;
    document.head.appendChild(style);
    return () => {
      document.head.removeChild(style);
    };
  }, []);

  useEffect(() => {
    if (!puzzleId) {
      setLoading(false);
      return;
    }

    let cancelled = false;

    async function load() {
      setLoading(true);
      const data = await getFastestSolutionsForPuzzle(puzzleId!);
      if (!cancelled) {
        setEntries(data);
        setLoading(false);
      }
    }

    load();

    return () => {
      cancelled = true;
    };
  }, [puzzleId]);

  // Load puzzle metadata for displaying name
  useEffect(() => {
    if (!puzzleId) return;

    let cancelled = false;

    async function loadPuzzle() {
      const { data, error } = await supabase
        .from('puzzles')
        .select('id, name')
        .eq('id', puzzleId)
        .single();

      if (!cancelled && !error && data) {
        setPuzzleMeta(data);
      }
    }

    loadPuzzle();

    return () => {
      cancelled = true;
    };
  }, [puzzleId]);

  if (!puzzleId) {
    return (
      <div className="page-container" style={{ padding: '2rem' }}>
        <p>No puzzle selected.</p>
      </div>
    );
  }

  return (
    <div style={{ 
      minHeight: '100vh', 
      background: 'linear-gradient(135deg, #1e3a8a 0%, #3b82f6 100%)',
      padding: 'clamp(1rem, 5vw, 2rem)'
    }}>
      <div style={{
        maxWidth: '900px',
        margin: '0 auto'
      }}>
        {/* Header */}
        <div style={{
          marginBottom: '2rem',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: '1rem',
          flexWrap: 'wrap'
        }}>
          <div style={{ flex: '1 1 auto', minWidth: '200px' }}>
            <h1 style={{ 
              fontSize: 'clamp(1.5rem, 5vw, 2.5rem)', 
              fontWeight: 700,
              color: '#fff',
              marginBottom: '0.5rem',
              textShadow: '0 2px 10px rgba(0,0,0,0.3)'
            }}>
              🏆 Leaderboard
            </h1>
            <p style={{ 
              fontSize: 'clamp(0.9rem, 3vw, 1.2rem)', 
              color: 'rgba(255,255,255,0.9)',
              margin: 0,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap'
            }}>
              {puzzleMeta?.name ?? puzzleId}
            </p>
          </div>
          <ThreeDotMenu
            items={[
              { icon: '←', label: 'Back', onClick: () => navigate(-1) },
            ]}
          />
        </div>

        {loading ? (
          <div style={{
            background: 'rgba(255,255,255,0.1)',
            backdropFilter: 'blur(20px)',
            borderRadius: '16px',
            padding: '3rem',
            textAlign: 'center',
            color: '#fff',
            fontSize: '1.2rem'
          }}>
            Loading leaderboard...
          </div>
        ) : entries.length === 0 ? (
          <div style={{
            background: 'rgba(255,255,255,0.1)',
            backdropFilter: 'blur(20px)',
            borderRadius: '16px',
            padding: '3rem',
            textAlign: 'center',
            color: '#fff',
            fontSize: '1.2rem'
          }}>
            No solves recorded yet for this puzzle.
            <br />
            <span style={{ fontSize: '0.9rem', opacity: 0.8 }}>Be the first to solve it!</span>
          </div>
        ) : (
          <div style={{
            background: 'rgba(255,255,255,0.95)',
            borderRadius: '16px',
            overflow: 'hidden',
            boxShadow: '0 20px 60px rgba(0,0,0,0.3)'
          }}>
            {entries.map((e, index) => {
              const rankEmoji = index === 0 ? '🥇' : index === 1 ? '🥈' : index === 2 ? '🥉' : '';
              const isTopThree = index < 3;
              const bgColor = index === 0 
                ? 'linear-gradient(135deg, #ffd700 0%, #ffed4e 100%)'
                : index === 1
                ? 'linear-gradient(135deg, #c0c0c0 0%, #e8e8e8 100%)'
                : index === 2
                ? 'linear-gradient(135deg, #cd7f32 0%, #e8a87c 100%)'
                : index % 2 === 0 ? '#f9fafb' : '#fff';

              return (
                <div
                  key={e.id}
                  style={{
                    padding: 'clamp(0.75rem, 3vw, 1.5rem)',
                    background: bgColor,
                    borderBottom: '1px solid rgba(0,0,0,0.05)',
                    fontWeight: isTopThree ? 600 : 400,
                    transition: 'all 0.2s'
                  }}
                  onMouseOver={(e) => {
                    if (!isTopThree) {
                      e.currentTarget.style.background = '#e0f2fe';
                    }
                  }}
                  onMouseOut={(e) => {
                    if (!isTopThree) {
                      e.currentTarget.style.background = index % 2 === 0 ? '#f9fafb' : '#fff';
                    }
                  }}
                >
                  {/* Desktop Layout */}
                  <div style={{
                    display: 'grid',
                    gridTemplateColumns: '60px 2fr 1fr 80px 80px 80px 1.5fr',
                    gap: '1rem',
                    alignItems: 'center',
                  }}
                  className="desktop-leaderboard"
                  >
                    <div style={{ fontSize: '1.5rem', textAlign: 'center' }}>
                      {rankEmoji || `#${index + 1}`}
                    </div>
                    <div style={{ 
                      overflow: 'hidden', 
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                      color: '#1f2937',
                      fontSize: '0.95rem'
                    }}>
                      {e.solver_name?.split('@')[0] ?? 'Unknown'}
                    </div>
                    <div style={{ 
                      fontSize: '1.1rem', 
                      fontWeight: 700,
                      color: '#3b82f6'
                    }}>
                      ⏱️ {formatDuration(e.duration_ms)}
                    </div>
                    <div style={{ textAlign: 'center', color: '#6b7280' }}>
                      💡 {e.hints_used ?? 0}
                    </div>
                    <div style={{ textAlign: 'center', color: '#6b7280' }}>
                      ↩️ {e.undo_count ?? 0}
                    </div>
                    <div style={{ textAlign: 'center', color: '#6b7280' }}>
                      🎯 {e.total_moves ?? 0}
                    </div>
                    <div style={{ 
                      fontSize: '0.85rem', 
                      color: '#9ca3af',
                      textAlign: 'right'
                    }}>
                      {new Date(e.created_at).toLocaleDateString()}
                    </div>
                  </div>
                  
                  {/* Mobile Layout */}
                  <div className="mobile-leaderboard" style={{ display: 'none' }}>
                    <div style={{ 
                      display: 'flex', 
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      marginBottom: '0.5rem'
                    }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                        <span style={{ fontSize: '1.5rem' }}>
                          {rankEmoji || `#${index + 1}`}
                        </span>
                        <span style={{ 
                          color: '#1f2937',
                          fontSize: '1rem',
                          fontWeight: 600
                        }}>
                          {e.solver_name?.split('@')[0] ?? 'Unknown'}
                        </span>
                      </div>
                      <div style={{ 
                        fontSize: '1.2rem', 
                        fontWeight: 700,
                        color: '#3b82f6'
                      }}>
                        ⏱️ {formatDuration(e.duration_ms)}
                      </div>
                    </div>
                    <div style={{ 
                      display: 'flex', 
                      gap: '1rem',
                      fontSize: '0.9rem',
                      color: '#6b7280'
                    }}>
                      <span>💡 {e.hints_used ?? 0}</span>
                      <span>↩️ {e.undo_count ?? 0}</span>
                      <span>🎯 {e.total_moves ?? 0}</span>
                      <span style={{ marginLeft: 'auto', fontSize: '0.8rem', color: '#9ca3af' }}>
                        {new Date(e.created_at).toLocaleDateString()}
                      </span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};

export default PuzzleLeaderboardPage;
