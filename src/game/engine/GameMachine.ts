// src/game/engine/GameMachine.ts
// Pure reducer-style state machine for game logic
// Phase 2B: Real HINT action with repair-first pipeline

import type {
  GameState,
  GamePlacedPiece,
  PlayerId,
  TurnActionType,
  RepairStep,
  RepairReason,
} from '../contracts/GameState';
import type { IJK } from '../../services/FitFinder';
import type { 
  GameDependencies, 
  SolvabilityResult, 
  HintResult, 
  HintSuggestion,
  Anchor,
} from './GameDependencies';

// ============================================================================
// GAME EVENTS (Actions dispatched to the machine)
// ============================================================================

export type GameEvent =
  | { type: 'SETUP_CONFIRMED'; setup: import('../contracts/GameState').GameSetupInput }
  | { type: 'TURN_PLACE_REQUESTED'; playerId: PlayerId; payload: PlacePiecePayload }
  | { type: 'TURN_HINT_REQUESTED'; playerId: PlayerId; anchor: Anchor }
  | { type: 'TURN_HINT_RESULT'; playerId: PlayerId; result: HintResult }
  | { type: 'TURN_CHECK_REQUESTED'; playerId: PlayerId }
  | { type: 'TURN_CHECK_RESULT'; playerId: PlayerId; result: SolvabilityResult }
  | { type: 'TURN_PASS_REQUESTED'; playerId: PlayerId }
  | { type: 'TURN_TIMEOUT'; playerId: PlayerId }
  | { type: 'TURN_ADVANCE' }
  | { type: 'START_REPAIR'; reason: RepairReason; triggeredBy: PlayerId }
  | { type: 'REPAIR_STEP' }
  | { type: 'GAME_END_REQUESTED'; reason: GameEndReason };

export interface PlacePiecePayload {
  pieceId: string;
  orientationId: string;
  cells: IJK[];
}

export type GameEndReason = 'completed' | 'timeout' | 'forfeit' | 'no_moves';

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
 */
export function checkInventory(
  state: GameState,
  pieceId: string
): InventoryCheckResult {
  const available = state.inventoryState[pieceId] ?? 0;
  const placed = state.placedCountByPieceId[pieceId] ?? 0;
  
  // 99 = unlimited
  if (available === 99) {
    return { ok: true };
  }
  
  const remaining = available - placed;
  
  if (remaining <= 0) {
    return {
      ok: false,
      reason: `Piece "${pieceId}" not available (${available} total, ${placed} already placed)`,
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
        // Inventory check failed - turn lost, no piece placed
        return dispatch(
          {
            ...state,
            updatedAt: now,
            uiMessage: `Piece not available. Turn lost.`,
            lastAction: {
              type: 'place',
              by: event.playerId,
              at: now,
              payload: { pieceId, success: false, reason: inventoryResult.reason },
            },
          },
          { type: 'TURN_ADVANCE' }
        );
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
      
      // Place successful - advance turn
      return dispatch(
        {
          ...state,
          updatedAt: now,
          boardState: newBoardState,
          placedCountByPieceId: newPlacedCount,
          players: newPlayers,
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
      
      // Check if hints remaining - if none, end turn immediately
      if (activePlayer.hintsRemaining <= 0) {
        return dispatch(
          {
            ...state,
            uiMessage: `No hints remaining. Turn ends.`,
          },
          { type: 'TURN_ADVANCE' }
        );
      }
      
      // Decrement hint counter INITIALLY (before we know the result)
      const newPlayers = state.players.map((p, idx) =>
        idx === state.activePlayerIndex
          ? { ...p, hintsRemaining: p.hintsRemaining - 1 }
          : p
      );
      
      // Set phase to resolving and store pending hint context
      // GamePage will run async solvability check + hint generation
      return {
        ...state,
        updatedAt: now,
        phase: 'resolving',
        players: newPlayers,
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
    
    case 'TURN_CHECK_REQUESTED': {
      // Block if repair in progress
      if (state.subphase === 'repairing') {
        return {
          ...state,
          uiMessage: 'Repair in progress...',
        };
      }
      
      // Only allow during in_turn phase
      if (state.phase !== 'in_turn') {
        return {
          ...state,
          uiMessage: 'Cannot check solvability right now.',
        };
      }
      
      const activePlayer = state.players[state.activePlayerIndex];
      if (activePlayer.id !== event.playerId) {
        return {
          ...state,
          uiMessage: `Not your turn.`,
        };
      }
      
      // Check if checks remaining
      if (activePlayer.checksRemaining <= 0) {
        return {
          ...state,
          uiMessage: `No solvability checks remaining.`,
        };
      }
      
      // Decrement check counter INITIALLY (before we know the result)
      const newPlayers = state.players.map((p, idx) =>
        idx === state.activePlayerIndex
          ? { ...p, checksRemaining: p.checksRemaining - 1 }
          : p
      );
      
      // Set phase to resolving while we wait for solvability result
      // The caller (GamePage) will run the async solvability check
      // and dispatch TURN_CHECK_RESULT with the result
      return {
        ...state,
        updatedAt: now,
        phase: 'resolving',
        players: newPlayers,
        uiMessage: `Checking solvability...`,
        lastAction: {
          type: 'check',
          by: event.playerId,
          at: now,
        },
      };
    }
    
    case 'TURN_CHECK_RESULT': {
      // Process the result of the solvability check
      if (state.phase !== 'resolving') {
        return state; // Ignore if not in resolving phase
      }
      
      const activePlayer = state.players[state.activePlayerIndex];
      const { result } = event;
      
      // Case A: Solvable (wasted check)
      if (result.status === 'solvable') {
        let newPlayers = [...state.players];
        let message: string;
        
        if (state.settings.ruleToggles.checkTransferOnWaste && state.players.length > 1) {
          // Transfer check to next player
          const nextIndex = (state.activePlayerIndex + 1) % state.players.length;
          newPlayers = newPlayers.map((p, idx) =>
            idx === nextIndex
              ? { ...p, checksRemaining: p.checksRemaining + 1 }
              : p
          );
          message = `✅ Puzzle is solvable! Check transfers to ${newPlayers[nextIndex].name}.`;
        } else {
          message = `✅ Puzzle is solvable! Check consumed.`;
        }
        
        // End turn
        return dispatch(
          {
            ...state,
            updatedAt: now,
            phase: 'in_turn',
            players: newPlayers,
            uiMessage: message,
          },
          { type: 'TURN_ADVANCE' }
        );
      }
      
      // Case B: Unsolvable - start repair
      if (result.status === 'unsolvable') {
        // Import deps to compute repair plan
        // Note: In production, deps should be injected, not imported inline
        const { createDefaultDependencies } = require('./GameDependencies');
        const deps = createDefaultDependencies();
        const repairSteps = deps.computeRepairPlan(state);
        
        return {
          ...state,
          updatedAt: now,
          phase: 'in_turn',
          subphase: 'repairing',
          uiMessage: '❌ Puzzle not solvable. Repairing...',
          repair: {
            reason: 'check',
            steps: repairSteps,
            index: 0,
            triggeredBy: event.playerId,
          },
        };
      }
      
      // Case C: Unknown (timeout) - treat as solvable for now
      // Apply wasted logic but still counts as used check
      let newPlayers = [...state.players];
      let message = `⏱️ Check timed out. Treating as solvable.`;
      
      if (state.settings.ruleToggles.checkTransferOnWaste && state.players.length > 1) {
        const nextIndex = (state.activePlayerIndex + 1) % state.players.length;
        newPlayers = newPlayers.map((p, idx) =>
          idx === nextIndex
            ? { ...p, checksRemaining: p.checksRemaining + 1 }
            : p
        );
        message = `⏱️ Check timed out. Treating as solvable. Check transfers to ${newPlayers[nextIndex].name}.`;
      }
      
      return dispatch(
        {
          ...state,
          updatedAt: now,
          phase: 'in_turn',
          players: newPlayers,
          uiMessage: message,
        },
        { type: 'TURN_ADVANCE' }
      );
    }
    
    case 'START_REPAIR': {
      // Start repair procedure (called when solvability check returns unsolvable)
      // Note: In production, deps should be injected, not imported inline
      const { createDefaultDependencies } = require('./GameDependencies');
      const deps = createDefaultDependencies();
      const repairSteps = deps.computeRepairPlan(state);
      
      return {
        ...state,
        updatedAt: now,
        phase: 'in_turn',
        subphase: 'repairing',
        uiMessage: '❌ Puzzle not solvable. Repairing...',
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
      if (result.status === 'no_hints') {
        return dispatch(
          {
            ...state,
            updatedAt: now,
            phase: 'in_turn',
            pendingHint: undefined,
            uiMessage: 'No hints remaining.',
          },
          { type: 'TURN_ADVANCE' }
        );
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
      if (result.status === 'no_suggestion') {
        return dispatch(
          {
            ...state,
            updatedAt: now,
            phase: 'in_turn',
            pendingHint: undefined,
            uiMessage: '❌ No valid hint found for that anchor.',
          },
          { type: 'TURN_ADVANCE' }
        );
      }
      
      // Case: Error
      if (result.status === 'error') {
        return dispatch(
          {
            ...state,
            updatedAt: now,
            phase: 'in_turn',
            pendingHint: undefined,
            uiMessage: `❌ Hint error: ${result.message}`,
          },
          { type: 'TURN_ADVANCE' }
        );
      }
      
      // Case: Suggestion - validate inventory and place piece
      if (result.status === 'suggestion') {
        const { suggestion } = result;
        const { pieceId, placement } = suggestion;
        
        // Validate inventory
        const inventoryResult = checkInventory(state, pieceId);
        if (!inventoryResult.ok) {
          return dispatch(
            {
              ...state,
              updatedAt: now,
              phase: 'in_turn',
              pendingHint: undefined,
              uiMessage: `❌ Hint suggested unavailable piece. Turn lost.`,
            },
            { type: 'TURN_ADVANCE' }
          );
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
        
        // Update player score (+1)
        const newPlayers = state.players.map((p, idx) =>
          idx === state.activePlayerIndex
            ? { ...p, score: p.score + 1 }
            : p
        );
        
        const reasonText = suggestion.reasonText ?? `Hint placed piece ${pieceId}.`;
        
        return dispatch(
          {
            ...state,
            updatedAt: now,
            phase: 'in_turn',
            boardState: newBoardState,
            placedCountByPieceId: newPlacedCount,
            players: newPlayers,
            pendingHint: undefined,
            uiMessage: `💡 ${reasonText} (+1 point)`,
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
          
          return {
            ...state,
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
          
          if (reason === 'hint') {
            // For hint: don't advance turn yet, go back to resolving
            // so GamePage can generate and place the hint piece
            return {
              ...state,
              updatedAt: now,
              subphase: 'normal',
              repair: undefined,
              phase: 'resolving',
              uiMessage: '✅ Repair complete. Generating hint...',
            };
          }
          
          // For check/endgame: advance turn immediately
          return dispatch(
            {
              ...state,
              updatedAt: now,
              subphase: 'normal',
              repair: undefined,
              pendingHint: undefined,
              uiMessage: '✅ Repair complete. Puzzle is now solvable.',
            },
            { type: 'TURN_ADVANCE' }
          );
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
      // Rotate to next player
      const nextPlayerIndex = (state.activePlayerIndex + 1) % state.players.length;
      const nextPlayer = state.players[nextPlayerIndex];
      
      return {
        ...state,
        updatedAt: now,
        activePlayerIndex: nextPlayerIndex,
        turnNumber: state.turnNumber + 1,
        phase: 'in_turn',
        uiMessage: state.uiMessage 
          ? `${state.uiMessage} ${nextPlayer.name}'s turn.`
          : `${nextPlayer.name}'s turn.`,
      };
    }
    
    case 'GAME_END_REQUESTED': {
      // Find winner (highest score)
      let winnerId: PlayerId | undefined;
      let highestScore = -1;
      
      for (const player of state.players) {
        if (player.score > highestScore) {
          highestScore = player.score;
          winnerId = player.id;
        }
      }
      
      const winner = state.players.find(p => p.id === winnerId);
      
      return {
        ...state,
        updatedAt: now,
        phase: 'ended',
        uiMessage: winner
          ? `Game over! ${winner.name} wins with ${highestScore} points!`
          : 'Game over!',
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
