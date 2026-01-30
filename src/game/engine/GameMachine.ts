// src/game/engine/GameMachine.ts
// Pure reducer-style state machine for game logic
// Phase 2D: Narration queue + event-driven messages

import type {
  GameState,
  GamePlacedPiece,
  PlayerId,
  TurnActionType,
  RepairStep,
  RepairReason,
  EndReason,
  GameEndState,
  NarrationLevel,
} from '../contracts/GameState';
import { computeWinners, pushNarration } from '../contracts/GameState';
import type { IJK } from '../../services/FitFinder';
import { 
  createDefaultDependencies,
  type GameDependencies, 
  type SolvabilityResult, 
  type HintResult, 
  type HintSuggestion,
  type Anchor,
} from './GameDependencies';

// ============================================================================
// GAME EVENTS (Actions dispatched to the machine)
// ============================================================================

export type GameEvent =
  | { type: 'SETUP_CONFIRMED'; setup: import('../contracts/GameState').GameSetupInput }
  | { type: 'TURN_PLACE_REQUESTED'; playerId: PlayerId; payload: PlacePiecePayload }
  | { type: 'TURN_HINT_REQUESTED'; playerId: PlayerId; anchor: Anchor }
  | { type: 'TURN_HINT_RESULT'; playerId: PlayerId; result: HintResult }
  | { type: 'TURN_PASS_REQUESTED'; playerId: PlayerId }
  | { type: 'TURN_TIMEOUT'; playerId: PlayerId }
  | { type: 'TURN_ADVANCE' }
  | { type: 'START_REPAIR'; reason: RepairReason; triggeredBy: PlayerId | 'system' }
  | { type: 'REPAIR_STEP' }
  | { type: 'TIMER_TICK'; playerId: PlayerId; deltaSeconds: number }
  | { type: 'GAME_END'; reason: EndReason };

export interface PlacePiecePayload {
  pieceId: string;
  orientationId: string;
  cells: IJK[];
}

// ============================================================================
// INVENTORY CHECK (uses existing mode-based validation)
// ============================================================================

export interface InventoryCheckResult {
  ok: boolean;
  reason?: string;
}

/**
 * Check if a piece can be placed based on inventory rules
 * This is a pure function - no side effects
 * NOTE: Only unique pieces allowed - each piece can only be placed once
 */
export function checkInventory(
  state: GameState,
  pieceId: string
): InventoryCheckResult {
  const placed = state.placedCountByPieceId[pieceId] ?? 0;
  
  // Only unique pieces allowed - reject if already placed
  if (placed > 0) {
    return {
      ok: false,
      reason: `Piece "${pieceId}" already placed (only unique pieces allowed)`,
    };
  }
  
  return { ok: true };
}

// ============================================================================
// STATE MACHINE DISPATCH (Pure Reducer)
// ============================================================================

/**
 * Pure reducer: dispatch an event to produce a new state
 * Does NOT mutate the input state
 */
export function dispatch(state: GameState, event: GameEvent): GameState {
  const now = new Date().toISOString();
  
  // Global guard: freeze when game has ended (Phase 2C)
  // Only GAME_END itself can still be processed to avoid double-end
  if (state.phase === 'ended' && event.type !== 'GAME_END') {
    console.log('🔒 [GameMachine] Game ended, ignoring event:', event.type);
    return state;
  }
  
  switch (event.type) {
    case 'SETUP_CONFIRMED': {
      // Phase 1: Setup is handled by createInitialGameState before dispatch
      // This event is mainly for future event logging
      return {
        ...state,
        phase: 'in_turn',
        updatedAt: now,
      };
    }
    
    case 'TURN_PLACE_REQUESTED': {
      // Only allow actions during in_turn phase
      if (state.phase !== 'in_turn') {
        return {
          ...state,
          uiMessage: 'Cannot place piece right now.',
        };
      }
      
      // Verify it's the correct player's turn
      const activePlayer = state.players[state.activePlayerIndex];
      if (activePlayer.id !== event.playerId) {
        return {
          ...state,
          uiMessage: `Not your turn. Waiting for ${activePlayer.name}.`,
        };
      }
      
      const { pieceId, orientationId, cells } = event.payload;
      
      // INVENTORY CHECK ONLY (no solvability check per spec)
      const inventoryResult = checkInventory(state, pieceId);
      
      if (!inventoryResult.ok) {
        // Add narration for inventory fail
        const stateWithNarration = pushNarration(state, {
          level: 'warn',
          text: `Piece ${pieceId} not available: ${inventoryResult.reason}`,
          meta: { playerId: activePlayer.id },
        });
        
        // Inventory check failed - DON'T advance turn, let player try another piece
        // This prevents spurious stall detection when user tries to place unavailable piece
        return {
          ...stateWithNarration,
          updatedAt: now,
          uiMessage: `❌ Piece ${pieceId} not available. Try a different piece.`,
          lastAction: {
            type: 'place',
            by: event.playerId,
            at: now,
            payload: { pieceId, success: false, reason: inventoryResult.reason },
          },
        };
      }
      
      // Inventory OK - place the piece and award +1 score
      const uid = `pp-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      const newPiece: GamePlacedPiece = {
        uid,
        pieceId,
        orientationId,
        cells,
        placedAt: Date.now(),
        placedBy: event.playerId,
        source: activePlayer.type === 'ai' ? 'ai' : 'user',
      };
      
      // Update board state (immutable)
      const newBoardState = new Map(state.boardState);
      newBoardState.set(uid, newPiece);
      
      // Update placed count
      const newPlacedCount = {
        ...state.placedCountByPieceId,
        [pieceId]: (state.placedCountByPieceId[pieceId] ?? 0) + 1,
      };
      
      // Update player score (+1)
      const newPlayers = state.players.map((p, idx) =>
        idx === state.activePlayerIndex
          ? { ...p, score: p.score + 1 }
          : p
      );
      
      // Add narration for piece placement (Phase 2D-2)
      const stateWithNarration = pushNarration(state, {
        level: 'action',
        text: `${activePlayer.name} placed piece (+1)`,
        meta: { 
          playerId: activePlayer.id, 
          pieceInstanceId: uid,
          scoreDelta: 1,
        },
      });
      
      // Place successful - mark placement for stall tracking, advance turn
      return dispatch(
        {
          ...stateWithNarration,
          updatedAt: now,
          boardState: newBoardState,
          placedCountByPieceId: newPlacedCount,
          players: newPlayers,
          turnPlacementFlag: true, // Mark that a placement happened this turn (Phase 2C-2)
          uiMessage: `${activePlayer.name} placed piece ${pieceId}. +1 point!`,
          lastAction: {
            type: 'place',
            by: event.playerId,
            at: now,
            payload: { pieceId, uid, success: true },
          },
        },
        { type: 'TURN_ADVANCE' }
      );
    }
    
    case 'TURN_HINT_REQUESTED': {
      // Block if repair in progress
      if (state.subphase === 'repairing') {
        return {
          ...state,
          uiMessage: 'Repair in progress...',
        };
      }
      
      // Block if already resolving
      if (state.phase === 'resolving') {
        return {
          ...state,
          uiMessage: 'Action in progress...',
        };
      }
      
      // Only allow during in_turn phase
      if (state.phase !== 'in_turn') {
        return {
          ...state,
          uiMessage: 'Cannot request hint right now.',
        };
      }
      
      const activePlayer = state.players[state.activePlayerIndex];
      if (activePlayer.id !== event.playerId) {
        return {
          ...state,
          uiMessage: `Not your turn.`,
        };
      }
      
      // Add narration for hint action
      const stateWithNarration = pushNarration(state, {
        level: 'action',
        text: `${activePlayer.name} used Hint`,
        meta: { playerId: activePlayer.id },
      });
      
      // Set phase to resolving and store pending hint context
      // GamePage will run async solvability check + hint generation
      return {
        ...stateWithNarration,
        updatedAt: now,
        phase: 'resolving',
        pendingHint: {
          playerId: event.playerId,
          anchor: event.anchor,
        },
        uiMessage: `Checking solvability before hint...`,
        lastAction: {
          type: 'hint',
          by: event.playerId,
          at: now,
        },
      };
    }
    
    case 'START_REPAIR': {
      // Start repair procedure (called when solvability check returns unsolvable)
      const deps = createDefaultDependencies();
      const repairSteps = deps.computeRepairPlan(state);
      
      // Message and narration vary by reason
      const repairMessage = event.reason === 'endgame'
        ? '🛑 Final repair: removing pieces until solvable...'
        : '❌ Puzzle not solvable. Repairing...';
      
      const narrationText = event.reason === 'endgame'
        ? 'No more moves. Final repair...'
        : 'Repairing...';
      
      // Add narration for repair start
      const stateWithNarration = pushNarration(state, {
        level: 'system',
        text: narrationText,
        meta: { reason: event.reason },
      });
      
      return {
        ...stateWithNarration,
        updatedAt: now,
        phase: 'in_turn',
        subphase: 'repairing',
        uiMessage: repairMessage,
        repair: {
          reason: event.reason,
          steps: repairSteps,
          index: 0,
          triggeredBy: event.triggeredBy,
        },
      };
    }
    
    case 'TURN_HINT_RESULT': {
      // Process the result of hint generation
      if (state.phase !== 'resolving') {
        return state; // Ignore if not in resolving phase
      }
      
      // Verify the pending hint matches
      if (!state.pendingHint || state.pendingHint.playerId !== event.playerId) {
        return state;
      }
      
      const { result } = event;
      
      // Case: No hints remaining (should not happen, but handle gracefully)
      // Don't advance turn - let player try manually or different anchor
      if (result.status === 'no_hints') {
        return {
          ...state,
          updatedAt: now,
          phase: 'in_turn',
          pendingHint: undefined,
          uiMessage: 'No hints remaining. Try placing manually.',
        };
      }
      
      // Case: Invalid turn
      if (result.status === 'invalid_turn') {
        return {
          ...state,
          phase: 'in_turn',
          pendingHint: undefined,
          uiMessage: 'Invalid turn for hint.',
        };
      }
      
      // Case: No suggestion found
      // Don't advance turn - let player try different anchor or place manually
      if (result.status === 'no_suggestion') {
        return {
          ...state,
          updatedAt: now,
          phase: 'in_turn',
          pendingHint: undefined,
          uiMessage: '❌ No valid hint for that anchor. Try another cell.',
        };
      }
      
      // Case: Error
      // Don't advance turn - let player try again
      if (result.status === 'error') {
        return {
          ...state,
          updatedAt: now,
          phase: 'in_turn',
          pendingHint: undefined,
          uiMessage: `❌ Hint error: ${result.message}`,
        };
      }
      
      // Case: Suggestion - validate inventory and place piece
      if (result.status === 'suggestion') {
        const { suggestion } = result;
        const { pieceId, placement } = suggestion;
        
        // Validate inventory
        const inventoryResult = checkInventory(state, pieceId);
        if (!inventoryResult.ok) {
          // Don't advance turn - let player try different anchor
          return {
            ...state,
            updatedAt: now,
            phase: 'in_turn',
            pendingHint: undefined,
            uiMessage: `❌ Piece ${pieceId} unavailable. Try another cell.`,
          };
        }
        
        // Place the hint piece
        const uid = `hint-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
        const newPiece: GamePlacedPiece = {
          uid,
          pieceId,
          orientationId: placement.orientationId,
          cells: placement.cells,
          placedAt: Date.now(),
          placedBy: event.playerId,
          source: 'hint',
        };
        
        // Update board state
        const newBoardState = new Map(state.boardState);
        newBoardState.set(uid, newPiece);
        
        // Update placed count
        const newPlacedCount = {
          ...state.placedCountByPieceId,
          [pieceId]: (state.placedCountByPieceId[pieceId] ?? 0) + 1,
        };
        
        // No score awarded for hint placements
        
        const reasonText = suggestion.reasonText ?? `Hint placed piece ${pieceId}.`;
        
        // Add narration for hint placement (Phase 2D-2: include pieceInstanceId)
        const stateWithNarration = pushNarration(state, {
          level: 'action',
          text: `Hint placed (no points)`,
          meta: { 
            playerId: state.pendingHint!.playerId, 
            pieceInstanceId: uid,
            scoreDelta: 0,
          },
        });
        
        // Hint placement counts for stall tracking (Phase 2C-2)
        return dispatch(
          {
            ...stateWithNarration,
            updatedAt: now,
            phase: 'in_turn',
            boardState: newBoardState,
            placedCountByPieceId: newPlacedCount,
            pendingHint: undefined,
            turnPlacementFlag: true, // Mark that a placement happened this turn
            uiMessage: `💡 ${reasonText}`,
          },
          { type: 'TURN_ADVANCE' }
        );
      }
      
      return state;
    }
    
    case 'REPAIR_STEP': {
      // Process one repair step
      if (state.subphase !== 'repairing' || !state.repair) {
        return state; // Ignore if not repairing
      }
      
      const { steps, index, triggeredBy } = state.repair;
      
      // Check if we've processed all steps
      if (index >= steps.length) {
        // Should not happen, but handle gracefully
        return {
          ...state,
          subphase: 'normal',
          repair: undefined,
          uiMessage: 'Repair complete.',
        };
      }
      
      const step = steps[index];
      
      switch (step.type) {
        case 'MESSAGE': {
          // Just update the message and advance index
          return {
            ...state,
            updatedAt: now,
            uiMessage: step.text,
            repair: {
              ...state.repair,
              index: index + 1,
            },
          };
        }
        
        case 'REMOVE_PIECE': {
          // Remove the piece from board state
          const newBoardState = new Map(state.boardState);
          const removedPiece = newBoardState.get(step.pieceUid);
          newBoardState.delete(step.pieceUid);
          
          // Update placed count
          const newPlacedCount = { ...state.placedCountByPieceId };
          if (removedPiece && newPlacedCount[removedPiece.pieceId]) {
            newPlacedCount[removedPiece.pieceId] = Math.max(0, newPlacedCount[removedPiece.pieceId] - 1);
          }
          
          // Apply score delta to the player who placed it
          const newPlayers = state.players.map(p =>
            p.id === step.placedByPlayerId
              ? { ...p, score: Math.max(0, p.score + step.scoreDelta) }
              : p
          );
          
          const ownerPlayer = state.players.find(p => p.id === step.placedByPlayerId);
          const ownerName = ownerPlayer?.name ?? 'Unknown';
          
          // Add narration for piece removal
          const stateWithNarration = pushNarration(state, {
            level: 'system',
            text: `Removed piece by ${ownerName} (-1)`,
            meta: { 
              playerId: step.placedByPlayerId, 
              pieceInstanceId: step.pieceUid,
              scoreDelta: -1,
            },
          });
          
          return {
            ...stateWithNarration,
            updatedAt: now,
            boardState: newBoardState,
            placedCountByPieceId: newPlacedCount,
            players: newPlayers,
            uiMessage: `Removed piece ${step.pieceId} (${ownerName} -1 point)`,
            repair: {
              ...state.repair,
              index: index + 1,
            },
          };
        }
        
        case 'DONE': {
          // Repair complete - behavior depends on what triggered it
          const reason = state.repair.reason;
          const needsRecheck = step.solvable === false;
          
          // Add narration for repair complete
          const stateWithNarration = pushNarration(state, {
            level: 'system',
            text: needsRecheck ? 'Repair step complete. Re-checking...' : 'Repair complete',
          });
          
          if (reason === 'hint') {
            // For hint: clear pendingHint and return to in_turn
            // This BREAKS THE INFINITE LOOP where:
            //   1. Same anchor generates same hint
            //   2. Hint makes puzzle unsolvable (DLX data mismatch)
            //   3. Repair removes piece
            //   4. Loop back to same hint
            // By clearing pendingHint, user must click a NEW anchor
            console.log('🔄 [GameMachine] Hint repair complete - clearing pendingHint to break loop');
            return {
              ...stateWithNarration,
              updatedAt: now,
              phase: 'in_turn',
              subphase: 'normal',
              repair: undefined,
              pendingHint: undefined, // CRITICAL: Clear to break infinite loop
              uiMessage: '🔄 Removed piece due to solvability issue. Try a different cell.',
            };
          }
          
          if (reason === 'endgame') {
            // For endgame: end the game with stalled reason (Phase 2C-2)
            // Even if solvable=false, we end the game - can't keep removing forever
            console.log('🏁 [GameMachine] Endgame repair complete. Ending game...');
            return dispatch(
              {
                ...stateWithNarration,
                updatedAt: now,
                subphase: 'normal',
                repair: undefined,
                pendingHint: undefined,
                uiMessage: '✅ Final repair complete.',
              },
              { type: 'GAME_END', reason: 'stalled' }
            );
          }
          
          // For check: go back to in_turn and let user continue
          // Don't advance turn - repair is a corrective action, not a player turn
          return {
            ...stateWithNarration,
            updatedAt: now,
            phase: 'in_turn',
            subphase: 'normal',
            repair: undefined,
            pendingHint: undefined,
            uiMessage: needsRecheck 
              ? '🔄 Removed 1 piece. Use Check to verify solvability.'
              : '✅ Repair complete. Puzzle is now solvable.',
          };
        }
        
        default:
          return state;
      }
    }
    
    case 'TURN_PASS_REQUESTED': {
      if (state.phase !== 'in_turn') {
        return { ...state, uiMessage: 'Cannot pass right now.' };
      }
      
      const activePlayer = state.players[state.activePlayerIndex];
      if (activePlayer.id !== event.playerId) {
        return { ...state, uiMessage: `Not your turn.` };
      }
      
      return dispatch(
        {
          ...state,
          updatedAt: now,
          uiMessage: `${activePlayer.name} passed.`,
          lastAction: {
            type: 'pass',
            by: event.playerId,
            at: now,
          },
        },
        { type: 'TURN_ADVANCE' }
      );
    }
    
    case 'TURN_TIMEOUT': {
      const activePlayer = state.players[state.activePlayerIndex];
      
      return dispatch(
        {
          ...state,
          updatedAt: now,
          uiMessage: `${activePlayer.name}'s time ran out!`,
          lastAction: {
            type: 'pass',
            by: event.playerId,
            at: now,
            payload: { reason: 'timeout' },
          },
        },
        { type: 'TURN_ADVANCE' }
      );
    }
    
    case 'TURN_ADVANCE': {
      // Update stall tracking (Phase 2C-2)
      // If placement happened this turn, reset counter; otherwise increment
      const newRoundNoPlacementCount = state.turnPlacementFlag 
        ? 0 
        : state.roundNoPlacementCount + 1;
      
      console.log('🔄 [TURN_ADVANCE] Stall tracking:', {
        turnPlacementFlag: state.turnPlacementFlag,
        previousCounter: state.roundNoPlacementCount,
        newCounter: newRoundNoPlacementCount,
        playersLength: state.players.length,
        wouldStall: newRoundNoPlacementCount >= state.players.length,
      });
      
      // Check for stall condition BEFORE advancing
      // Stall = no placements for a full rotation (players.length consecutive turns)
      if (newRoundNoPlacementCount >= state.players.length) {
        console.log('🛑 [GameMachine] Stall detected! Starting endgame repair...');
        // Trigger endgame repair
        return dispatch(
          {
            ...state,
            updatedAt: now,
            phase: 'resolving',
            turnPlacementFlag: false,
            roundNoPlacementCount: newRoundNoPlacementCount,
            uiMessage: '🛑 No more moves possible. Running final solvability check...',
          },
          { type: 'START_REPAIR', reason: 'endgame', triggeredBy: 'system' }
        );
      }
      
      // Normal turn advance
      const nextPlayerIndex = (state.activePlayerIndex + 1) % state.players.length;
      const nextPlayer = state.players[nextPlayerIndex];
      const newTurnNumber = state.turnNumber + 1;
      
      // Add narration for turn start
      const stateWithNarration = pushNarration(state, {
        level: 'info',
        text: `Turn ${newTurnNumber}: ${nextPlayer.name}`,
        meta: { playerId: nextPlayer.id },
      });
      
      return {
        ...stateWithNarration,
        updatedAt: now,
        activePlayerIndex: nextPlayerIndex,
        turnNumber: newTurnNumber,
        phase: 'in_turn',
        // Reset placement flag for next turn, update stall counter
        turnPlacementFlag: false,
        roundNoPlacementCount: newRoundNoPlacementCount,
        // In single player mode, don't show turn message - it's always your turn
        uiMessage: state.players.length === 1 ? '' : (nextPlayer.name === 'You' ? 'Your turn.' : `${nextPlayer.name}'s turn.`),
      };
    }
    
    case 'GAME_END': {
      // Already ended - ignore
      if (state.phase === 'ended') {
        return state;
      }
      
      // Compute winners (supports ties)
      const winnerPlayerIds = computeWinners(state.players);
      
      // Build final scores sorted descending
      const finalScores = [...state.players]
        .sort((a, b) => b.score - a.score)
        .map(p => ({ playerId: p.id, playerName: p.name, score: p.score }));
      
      // Build end state
      const endState: GameEndState = {
        endedAt: now,
        reason: event.reason,
        winnerPlayerIds,
        finalScores,
        turnNumberAtEnd: state.turnNumber,
      };
      
      // Build winner message
      const winners = state.players.filter(p => winnerPlayerIds.includes(p.id));
      let winnerMessage: string;
      let winnerNarration: string;
      
      if (winners.length === 0) {
        winnerMessage = 'Game over!';
        winnerNarration = 'Game over';
      } else if (winners.length === 1) {
        winnerMessage = `🏆 ${winners[0].name} wins with ${winners[0].score} points!`;
        winnerNarration = `Winner: ${winners[0].name}`;
      } else {
        const names = winners.map(w => w.name).join(' & ');
        winnerMessage = `🏆 Tie! ${names} win with ${winners[0].score} points each!`;
        winnerNarration = `Tie: ${names}`;
      }
      
      // Add narration for game end
      const reasonText = event.reason === 'completed' 
        ? 'Game over: puzzle completed' 
        : event.reason === 'stalled'
        ? 'Game over: no more moves'
        : 'Game over';
      
      let stateWithNarration = pushNarration(state, {
        level: 'system',
        text: reasonText,
        meta: { reason: event.reason },
      });
      
      stateWithNarration = pushNarration(stateWithNarration, {
        level: 'info',
        text: winnerNarration,
      });
      
      return {
        ...stateWithNarration,
        updatedAt: now,
        phase: 'ended',
        subphase: 'normal',
        endState,
        // Clear transient state
        pendingHint: undefined,
        repair: undefined,
        uiMessage: winnerMessage,
      };
    }
    
    case 'TIMER_TICK': {
      // Timer tick - decrement clock for active player (Phase 2D-3)
      // Guard: ignore if ended or busy
      if (state.phase === 'ended') return state;
      if (state.phase === 'resolving' || state.subphase === 'repairing') return state;
      
      // Guard: only tick for timed mode
      if (state.settings.timerMode !== 'timed') return state;
      
      // Guard: only tick for current active player
      const activePlayer = state.players[state.activePlayerIndex];
      if (activePlayer.id !== event.playerId) return state;
      
      // Guard: no clock to tick
      if (activePlayer.clockSecondsRemaining === null) return state;
      
      const newClock = Math.max(0, activePlayer.clockSecondsRemaining - event.deltaSeconds);
      
      // Update player clock
      const newPlayers = state.players.map((p, idx) =>
        idx === state.activePlayerIndex
          ? { ...p, clockSecondsRemaining: newClock }
          : p
      );
      
      // If clock reaches 0, end game with timeout
      if (newClock <= 0) {
        // Add narration for timeout
        const stateWithNarration = pushNarration(state, {
          level: 'warn',
          text: `Time out: ${activePlayer.name}`,
          meta: { playerId: activePlayer.id },
        });
        
        return dispatch(
          {
            ...stateWithNarration,
            updatedAt: now,
            players: newPlayers,
          },
          { type: 'GAME_END', reason: 'timeout' }
        );
      }
      
      return {
        ...state,
        updatedAt: now,
        players: newPlayers,
      };
    }
    
    default:
      return state;
  }
}

// ============================================================================
// HELPER: Get active player
// ============================================================================

export function getActivePlayer(state: GameState) {
  return state.players[state.activePlayerIndex];
}

// ============================================================================
// HELPER: Check if it's a human's turn
// ============================================================================

export function isHumanTurn(state: GameState): boolean {
  const activePlayer = getActivePlayer(state);
  return activePlayer.type === 'human';
}

// ============================================================================
// HELPER: Get player by ID
// ============================================================================

export function getPlayerById(state: GameState, playerId: PlayerId) {
  return state.players.find(p => p.id === playerId);
}
