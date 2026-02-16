// src/game/ui/GameSetupModal.tsx
// Game Setup Modal - Configure players, timers, and rules before starting

import React, { useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import type {
  GameSetupInput,
  PlayerSetupInput,
  PlayerType,
  TimerMode,
  RuleToggles,
} from '../contracts/GameState';
import { getDefaultPlayerColor, createSoloPreset, createVsPlayerPreset, createQuickPlayPreset } from '../contracts/GameState';

export type PvPMatchType = 'invite' | 'random' | null;

interface GameSetupModalProps {
  isOpen: boolean;
  onConfirm: (setup: GameSetupInput) => void;
  onCancel: () => void;
  onShowHowToPlay?: (mode: 'solo' | 'vs' | 'quickplay' | 'vsplayer', timerInfo: { timed: boolean; minutes: number }) => void;
  onStartPvP?: (setup: GameSetupInput, matchType: PvPMatchType) => void;
  /** Preset mode from URL query param */
  preset?: 'solo' | 'vs' | 'multiplayer' | 'pvp';
}

const MAX_PLAYERS = 5;
const DEFAULT_TIMER_MINUTES = 5;
const DEFAULT_TIMER_SECONDS = DEFAULT_TIMER_MINUTES * 60;

export function GameSetupModal({ isOpen, onConfirm, onCancel, onShowHowToPlay, onStartPvP, preset }: GameSetupModalProps) {
  const { t } = useTranslation();
  // Initialize with preset or default
  const getInitialSetup = (): GameSetupInput => {
    if (preset === 'solo') return createSoloPreset();
    if (preset === 'vs' || preset === 'pvp') return createVsPlayerPreset();
    // Default to solo
    return createSoloPreset();
  };

  const [setup, setSetup] = useState<GameSetupInput>(getInitialSetup);
  const [pvpMatchType, setPvpMatchType] = useState<PvPMatchType>(preset === 'pvp' ? 'random' : null);
  const isVsPlayerMode = pvpMatchType !== null;

  // Update player count
  const handlePlayerCountChange = useCallback((count: number) => {
    const newCount = Math.max(1, Math.min(MAX_PLAYERS, count));
    
    setSetup(prev => {
      const newPlayers: PlayerSetupInput[] = [];
      
      for (let i = 0; i < newCount; i++) {
        if (i < prev.players.length) {
          // Keep existing player
          newPlayers.push(prev.players[i]);
        } else {
          // Add new player
          newPlayers.push({
            name: i === 0 ? 'You' : `Player ${i + 1}`,
            type: i === 0 ? 'human' : 'ai',
            hints: 99999,
            checks: 99999,
            timerSeconds: DEFAULT_TIMER_SECONDS,
            color: getDefaultPlayerColor(i),
          });
        }
      }
      
      return {
        ...prev,
        playerCount: newCount,
        players: newPlayers,
      };
    });
  }, []);

  // Update individual player
  const handlePlayerChange = useCallback((index: number, updates: Partial<PlayerSetupInput>) => {
    setSetup(prev => ({
      ...prev,
      players: prev.players.map((p, i) => 
        i === index ? { ...p, ...updates } : p
      ),
    }));
  }, []);

  // Update timer mode
  const handleTimerModeChange = useCallback((mode: TimerMode) => {
    setSetup(prev => {
      // When switching to timed, ensure all players have valid timerSeconds
      if (mode === 'timed') {
        const updatedPlayers = prev.players.map(p => ({
          ...p,
          timerSeconds: p.timerSeconds > 0 ? p.timerSeconds : DEFAULT_TIMER_SECONDS,
        }));
        return { ...prev, timerMode: mode, players: updatedPlayers };
      }
      return { ...prev, timerMode: mode };
    });
  }, []);

  // Update rule toggles
  const handleRuleToggle = useCallback((key: keyof RuleToggles) => {
    setSetup(prev => ({
      ...prev,
      ruleToggles: {
        ...prev.ruleToggles,
        [key]: !prev.ruleToggles[key],
      },
    }));
  }, []);

  // Update starting player
  const handleStartingPlayerChange = useCallback((value: 'random' | number) => {
    setSetup(prev => ({ ...prev, startingPlayer: value }));
  }, []);

  if (!isOpen) return null;

  return (
    <div style={styles.overlay}>
      <div style={styles.modal}>
        {/* Header */}
        <div style={styles.header}>
          <h2 style={styles.title}>Select Play Mode</h2>
          <button onClick={onCancel} style={styles.closeButton}>✕</button>
        </div>

        {/* Content */}
        <div style={styles.content}>
          {/* Play Mode Selection */}
          <div style={styles.section}>
            <div style={styles.presetButtons}>
              <button
                style={{
                  ...styles.presetButton,
                  ...(setup.playerCount === 1 && setup.ruleToggles.scoringEnabled ? styles.presetButtonActive : {}),
                }}
                onClick={() => { setSetup(createSoloPreset()); setPvpMatchType(null); }}
              >
                Solo
              </button>
              <button
                style={{
                  ...styles.presetButton,
                  ...(isVsPlayerMode ? styles.presetButtonActive : {}),
                }}
                onClick={() => { setSetup(createVsPlayerPreset()); setPvpMatchType('random'); }}
              >
                {t('pvp.mode.vsPlayer')}
              </button>
              <button
                style={{
                  ...styles.presetButton,
                  ...(setup.ruleToggles.allowRemoval && !setup.ruleToggles.scoringEnabled ? styles.presetButtonActive : {}),
                }}
                onClick={() => { setSetup(createQuickPlayPreset()); setPvpMatchType(null); }}
                title="Unrated mode: remove pieces freely, no scoring"
              >
                Quick Play
              </button>
            </div>
          </div>

          {/* PvP Match Type - only show for vs Player mode */}
          {isVsPlayerMode && (
            <div style={styles.section}>
              <div style={styles.sectionTitle}>{t('pvp.mode.matchType')}</div>
              <div style={styles.toggleRow}>
                <label style={styles.toggleLabel}>
                  <input
                    type="radio"
                    checked={pvpMatchType === 'random'}
                    onChange={() => setPvpMatchType('random')}
                  />
                  <span>{t('pvp.mode.findOpponent')}</span>
                </label>
                <label style={styles.toggleLabel}>
                  <input
                    type="radio"
                    checked={pvpMatchType === 'invite'}
                    onChange={() => setPvpMatchType('invite')}
                  />
                  <span>{t('pvp.mode.inviteLink')}</span>
                </label>
              </div>
              {pvpMatchType === 'random' && (
                <div style={{ fontSize: '0.8rem', color: 'rgba(255,255,255,0.6)', marginTop: '6px' }}>
                  {t('pvp.matchmaking.randomDescription')}
                </div>
              )}
              {pvpMatchType === 'invite' && (
                <div style={{ fontSize: '0.8rem', color: 'rgba(255,255,255,0.6)', marginTop: '6px' }}>
                  {t('pvp.matchmaking.inviteDescription')}
                </div>
              )}
            </div>
          )}

          {/* Player Count - only show for multiplayer (vs Computer), not vs Player */}
          {setup.playerCount > 1 && !isVsPlayerMode && (
            <div style={styles.section}>
              <div style={styles.sectionTitle}>Players</div>
              <div style={styles.playerCountRow}>
                <span>Number of players:</span>
                <div style={styles.numberStepper}>
                  <button
                    style={styles.stepperButton}
                    onClick={() => handlePlayerCountChange(setup.playerCount - 1)}
                    disabled={setup.playerCount <= 1}
                  >
                    −
                  </button>
                  <span style={styles.stepperValue}>{setup.playerCount}</span>
                  <button
                    style={styles.stepperButton}
                    onClick={() => handlePlayerCountChange(setup.playerCount + 1)}
                    disabled={setup.playerCount >= MAX_PLAYERS}
                  >
                    +
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Player List - only show for multiplayer (vs Computer), not vs Player */}
          {setup.playerCount > 1 && !isVsPlayerMode && (
            <div style={styles.playerList}>
              {setup.players.map((player, idx) => (
                <div key={idx} style={styles.playerRow}>
                  <div
                    style={{
                      ...styles.playerColorDot,
                      backgroundColor: player.color,
                    }}
                  />
                  <input
                    type="text"
                    value={player.name}
                    onChange={(e) => handlePlayerChange(idx, { name: e.target.value })}
                    style={styles.playerNameInput}
                    placeholder={`Player ${idx + 1}`}
                  />
                  <select
                    value={player.type}
                    onChange={(e) => handlePlayerChange(idx, { type: e.target.value as PlayerType })}
                    style={styles.playerTypeSelect}
                  >
                    <option value="human">Human</option>
                    <option value="ai">AI</option>
                  </select>
                </div>
              ))}
            </div>
          )}


          {/* Timer Mode - hide for Quick Play (non-competitive) */}
          {!setup.ruleToggles.allowRemoval && (
            <div style={styles.section}>
              <div style={styles.sectionTitle}>Timer</div>
              <div style={styles.toggleRow}>
                <label style={styles.toggleLabel}>
                  <input
                    type="radio"
                    checked={setup.timerMode === 'none'}
                    onChange={() => handleTimerModeChange('none')}
                  />
                  <span>No Timer</span>
                </label>
                <label style={styles.toggleLabel}>
                  <input
                    type="radio"
                    checked={setup.timerMode === 'timed'}
                    onChange={() => handleTimerModeChange('timed')}
                  />
                  <span>Timed</span>
                </label>
              </div>
              {setup.timerMode === 'timed' && (
                <div style={styles.timerConfig}>
                  <span>Minutes per player:</span>
                  <input
                    type="number"
                    min={1}
                    max={60}
                    value={Math.round((setup.players[0]?.timerSeconds || DEFAULT_TIMER_SECONDS) / 60)}
                    onChange={(e) => {
                      const minutes = parseInt(e.target.value) || DEFAULT_TIMER_MINUTES;
                      const seconds = minutes * 60;
                      setup.players.forEach((_, idx) => {
                        handlePlayerChange(idx, { timerSeconds: seconds });
                      });
                    }}
                    style={styles.timerInput}
                  />
                </div>
              )}
            </div>
          )}

          {/* Starting Player - only show for multiplayer, not vs Player (coin flip) */}
          {setup.playerCount > 1 && !isVsPlayerMode && (
            <div style={styles.section}>
              <div style={styles.sectionTitle}>Starting Player</div>
              <select
                value={typeof setup.startingPlayer === 'number' ? setup.startingPlayer : 'random'}
                onChange={(e) => {
                  const val = e.target.value;
                  handleStartingPlayerChange(val === 'random' ? 'random' : parseInt(val));
                }}
                style={styles.select}
              >
                <option value="random">Random</option>
                {setup.players.map((p, idx) => (
                  <option key={idx} value={idx}>{p.name}</option>
                ))}
              </select>
            </div>
          )}

        </div>

        {/* Footer */}
        <div style={styles.footer}>
          {onShowHowToPlay && (
            <button onClick={() => {
              const mode = setup.ruleToggles.allowRemoval 
                ? 'quickplay' 
                : isVsPlayerMode
                  ? 'vsplayer'
                  : setup.playerCount > 1 
                    ? 'vs' 
                    : 'solo';
              const timerInfo = {
                timed: setup.timerMode === 'timed',
                minutes: Math.round((setup.players[0]?.timerSeconds || DEFAULT_TIMER_SECONDS) / 60)
              };
              onShowHowToPlay(mode, timerInfo);
            }} style={styles.howToPlayButton}>
              ℹ️ How to Play
            </button>
          )}
          <div style={{ flex: 1 }} />
          <button onClick={onCancel} style={styles.cancelButton}>
            Cancel
          </button>
          {isVsPlayerMode && onStartPvP ? (
            <button onClick={() => onStartPvP(setup, pvpMatchType)} style={styles.confirmButton}>
              {pvpMatchType === 'invite' ? t('pvp.mode.inviteLink') : t('pvp.mode.findOpponent')}
            </button>
          ) : (
            <button onClick={() => onConfirm(setup)} style={styles.confirmButton}>
              Start Game
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// STYLES
// ============================================================================

const styles: Record<string, React.CSSProperties> = {
  overlay: {
    position: 'fixed',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    background: 'rgba(0, 0, 0, 0.8)',
    backdropFilter: 'blur(4px)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 10000,
    padding: '20px',
  },
  modal: {
    background: 'linear-gradient(145deg, #4a5568, #2d3748)',
    borderRadius: '16px',
    border: '1px solid rgba(255, 255, 255, 0.2)',
    boxShadow: '0 20px 60px rgba(0, 0, 0, 0.4)',
    width: '100%',
    maxWidth: '480px',
    maxHeight: '90vh',
    overflow: 'hidden',
    display: 'flex',
    flexDirection: 'column',
  },
  header: {
    padding: '20px 24px',
    borderBottom: '1px solid rgba(255, 255, 255, 0.1)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  title: {
    margin: 0,
    color: '#fff',
    fontSize: '1.25rem',
    fontWeight: 600,
  },
  closeButton: {
    background: 'rgba(255,255,255,0.1)',
    border: 'none',
    borderRadius: '8px',
    width: '32px',
    height: '32px',
    color: '#fff',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: '1.2rem',
  },
  content: {
    padding: '20px 24px',
    overflowY: 'auto',
    flex: 1,
  },
  section: {
    marginBottom: '20px',
  },
  sectionTitle: {
    fontSize: '0.75rem',
    color: 'rgba(255,255,255,0.5)',
    textTransform: 'uppercase',
    letterSpacing: '1px',
    marginBottom: '10px',
    fontWeight: 600,
  },
  presetButtons: {
    display: 'flex',
    gap: '10px',
  },
  presetButton: {
    flex: 1,
    padding: '10px 16px',
    background: 'rgba(255,255,255,0.1)',
    border: '1px solid rgba(255,255,255,0.2)',
    borderRadius: '8px',
    color: '#fff',
    cursor: 'pointer',
    fontSize: '0.9rem',
    transition: 'all 0.2s',
  },
  presetButtonActive: {
    background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
    border: '1px solid transparent',
  },
  playerCountRow: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    color: '#fff',
  },
  numberStepper: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
  },
  stepperButton: {
    width: '32px',
    height: '32px',
    background: 'rgba(255,255,255,0.1)',
    border: '1px solid rgba(255,255,255,0.2)',
    borderRadius: '8px',
    color: '#fff',
    cursor: 'pointer',
    fontSize: '1.2rem',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepperValue: {
    width: '32px',
    textAlign: 'center',
    fontSize: '1.1rem',
    fontWeight: 600,
    color: '#fff',
  },
  playerList: {
    display: 'flex',
    flexDirection: 'column',
    gap: '10px',
    marginTop: '10px',
  },
  playerRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    padding: '10px 12px',
    background: 'rgba(255,255,255,0.05)',
    borderRadius: '8px',
  },
  playerColorDot: {
    width: '12px',
    height: '12px',
    borderRadius: '50%',
    flexShrink: 0,
  },
  playerNameInput: {
    flex: 1,
    minWidth: '80px',
    padding: '6px 10px',
    background: 'rgba(255,255,255,0.1)',
    border: '1px solid rgba(255,255,255,0.2)',
    borderRadius: '6px',
    color: '#fff',
    fontSize: '0.9rem',
  },
  playerTypeSelect: {
    padding: '6px 10px',
    background: 'rgba(255,255,255,0.1)',
    border: '1px solid rgba(255,255,255,0.2)',
    borderRadius: '6px',
    color: '#fff',
    fontSize: '0.85rem',
  },
  playerCounters: {
    display: 'flex',
    gap: '8px',
  },
  counterGroup: {
    display: 'flex',
    alignItems: 'center',
    gap: '4px',
  },
  counterIcon: {
    fontSize: '0.9rem',
  },
  counterInput: {
    width: '40px',
    padding: '4px 6px',
    background: 'rgba(255,255,255,0.1)',
    border: '1px solid rgba(255,255,255,0.2)',
    borderRadius: '4px',
    color: '#fff',
    fontSize: '0.85rem',
    textAlign: 'center',
  },
  toggleRow: {
    display: 'flex',
    gap: '20px',
    color: '#fff',
  },
  toggleLabel: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    cursor: 'pointer',
    color: '#fff',
  },
  timerConfig: {
    marginTop: '10px',
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    color: '#fff',
  },
  timerInput: {
    width: '80px',
    padding: '6px 10px',
    background: 'rgba(255,255,255,0.1)',
    border: '1px solid rgba(255,255,255,0.2)',
    borderRadius: '6px',
    color: '#fff',
    fontSize: '0.9rem',
    textAlign: 'center',
  },
  select: {
    width: '100%',
    padding: '10px 12px',
    background: '#374151',
    border: '1px solid rgba(255,255,255,0.3)',
    borderRadius: '8px',
    color: '#fff',
    fontSize: '0.9rem',
  },
  checkboxLabel: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    color: '#fff',
    cursor: 'pointer',
  },
  checkbox: {
    width: '18px',
    height: '18px',
    accentColor: '#667eea',
  },
  ruleHint: {
    marginTop: '6px',
    fontSize: '0.75rem',
    color: 'rgba(255,255,255,0.4)',
    lineHeight: 1.4,
  },
  unlimitedInfo: {
    padding: '12px 16px',
    background: 'rgba(34, 197, 94, 0.15)',
    border: '1px solid rgba(34, 197, 94, 0.3)',
    borderRadius: '8px',
    color: '#22c55e',
    fontSize: '0.9rem',
    textAlign: 'center',
    marginBottom: '20px',
  },
  footer: {
    padding: '16px 24px',
    borderTop: '1px solid rgba(255, 255, 255, 0.1)',
    display: 'flex',
    gap: '12px',
    justifyContent: 'flex-end',
  },
  howToPlayButton: {
    padding: '10px 16px',
    background: 'linear-gradient(135deg, #3b82f6, #2563eb)',
    border: 'none',
    borderRadius: '8px',
    color: '#fff',
    cursor: 'pointer',
    fontSize: '0.9rem',
    fontWeight: 600,
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
  },
  cancelButton: {
    padding: '10px 20px',
    background: 'rgba(255,255,255,0.1)',
    border: '1px solid rgba(255,255,255,0.2)',
    borderRadius: '8px',
    color: '#fff',
    cursor: 'pointer',
    fontSize: '0.9rem',
  },
  confirmButton: {
    padding: '10px 24px',
    background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
    border: 'none',
    borderRadius: '8px',
    color: '#fff',
    cursor: 'pointer',
    fontSize: '0.9rem',
    fontWeight: 600,
  },
};
