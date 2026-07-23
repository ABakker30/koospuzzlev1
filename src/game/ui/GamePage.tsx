// src/game/ui/GamePage.tsx
// Unified Game Page - Replaces Solve and VsComputer pages
// Phase 3A-2: Real puzzle loading and completion check

import React, { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useSearchParams, useNavigate, useParams } from 'react-router-dom';
import { GameSetupModal, type PvPMatchType } from './GameSetupModal';
import { GameHUD } from './GameHUD';
import { GameEndModal } from './GameEndModal';
import { ShareClipModal } from '../../pages/solve/components/ShareClipModal';
import { ModalBase } from '../../components/ModalBase';
import { DevTools } from './DevTools';
import { GameBoard3D, type InteractionMode } from '../three/GameBoard3D';
import type { PlacementInfo } from '../engine/GameDependencies';
import { loadPuzzleById, loadDefaultPuzzle, PuzzleNotFoundError } from '../puzzle/PuzzleRepo';
import type { PuzzleData } from '../puzzle/PuzzleTypes';
import { cellToKey } from '../puzzle/PuzzleTypes';
import type { GameState, GameSetupInput, InventoryState, PlayerId, PieceMode } from '../contracts/GameState';
import { createInitialGameState, createSoloPreset } from '../contracts/GameState';
import { dispatch, getActivePlayer, checkInventory } from '../engine/GameMachine';
import { createDefaultDependencies, type Anchor } from '../engine/GameDependencies';
import { saveGameSolution } from '../persistence/GameRepo';
import { mapDbModerationError } from '../../services/moderationService';
import { getDiscoveryStatus, type DiscoveryStatus } from '../../services/discoveryService';
import { getContest, isContestLive } from '../../services/contestService';
import { setPostLoginRedirect } from '../../utils/postLoginRedirect';
import { captureCanvasScreenshot } from '../../services/thumbnailService';
import { offerInstallAtPeak } from '../../services/installService';
import { sounds } from '../../utils/audio';
import { useGhostReplay } from '../pvp/useGhostReplay';
import { track } from '../../lib/observability';
import { TUTORIAL_STEPS, tutorialUrl } from '../../constants/tutorial';
import { supabase } from '../../lib/supabase';
import {
  fetchChallengeTarget,
  formatChallengeTime,
  formatChallengeScore,
  judgeChallenge,
  type ChallengeTarget,
} from '../../services/challengeService';
import { PresetSelectorModal } from '../../components/PresetSelectorModal';
import { StudioSettings, DEFAULT_STUDIO_SETTINGS } from '../../types/studio';
import { PieceBrowserModal } from '../../pages/solve/components/PieceBrowserModal';
import { useAuth, type User } from '../../context/AuthContext';
import { ThreeDotMenu } from '../../components/ThreeDotMenu';
import {
  createPvPSession,
  createLocalSimulatedSession,
  submitMove,
  subscribeToSession,
  sendHeartbeat,
  updatePlayerStats,
  joinPvPSession,
  endPvPGame,
  isOpponentDisconnected,
  getPvPSession,
  getPvPSessionByInviteCode,
  cancelPvPSession,
  countSessionMoves,
  restartPvPClock,
  resumePvPClock,
  getSessionMoves,
  subscribeToMoves,
  PvPGameCapError,
} from '../pvp/pvpApi';
import {
  buildPvPBaseState,
  applyPvPMoveToState,
  rebuildGameState,
} from '../pvp/replaySession';
import {
  saveHostSessionPointer,
  readHostSessionPointer,
  clearHostSessionPointer,
} from '../pvp/hostSessionPointer';
import { recordMySession, removeMySession } from '../pvp/mySessionsStore';
import {
  subscribeForming,
  sendFormingCells,
  type FormingChannel,
} from '../pvp/formingBroadcast';
import { clearChatSeen } from '../pvp/gameMessages';
import { ReportModal } from '../../components/ReportModal';
import { ensurePvPGuest, getExistingPvPGuest } from '../pvp/guestAuth';
import { carriedPresetSettings, loadCarriedPreset, saveCarriedPreset } from '../../utils/environmentCarry';
import { PieceViewerModal } from '../../pages/analyze/PieceViewerModal';
import { splitPieceSelection, joinPieceSelection, parsePaletteParam } from '../../utils/piecePalette';
import { getSolveRank, type SolveRank } from '../../services/solveRankService';
import type { PlacedPiece as ViewerPlacedPiece } from '../../pages/solve/types/manualSolve';
import type { PvPGameSession, PvPGameMove, PvPPlacedPiece } from '../pvp/types';
import { PvPHUD } from '../pvp/PvPHUD';
import { ChatDrawer } from '../../components/ChatDrawer';
import { ManualGameChatPanel } from '../../pages/solve/components/ManualGameChatPanel';
import { useGameChat } from '../../pages/solve/hooks/useGameChat';
import { usePvPHumanChat } from '../pvp/usePvPHumanChat';
import { tokens } from '../../styles/tokens';

// Default inventory: one of each piece A-Y
const DEFAULT_PIECES = 'ABCDEFGHIJKLMNOPQRSTUVWXY'.split('');

// "Host present" window: a player1 heartbeat within this many ms of now means
// the host is at the table and an invitee can start the match immediately.
const HOST_PRESENCE_MS = 45_000;

function isHeartbeatFresh(heartbeat: string | null | undefined): boolean {
  if (!heartbeat) return false;
  const ts = new Date(heartbeat).getTime();
  if (Number.isNaN(ts)) return false;
  return Date.now() - ts < HOST_PRESENCE_MS;
}

function createDefaultInventory(setsNeeded: number = 1): InventoryState {
  const inventory: InventoryState = {};
  for (const piece of DEFAULT_PIECES) {
    inventory[piece] = setsNeeded; // setsNeeded copies of each piece
  }
  if (setsNeeded > 1) {
    console.log(`📦 Multi-set puzzle: ${setsNeeded} sets, ${DEFAULT_PIECES.length * setsNeeded} total pieces`);
  }
  return inventory;
}

// Inventory per piece mode. 99 = effectively unlimited (a 100-sphere puzzle
// needs 25 pieces total). The engine's checkInventory does the rest — the
// mode IS the inventory.
function buildInventory(mode: PieceMode, singlePieceId: string | null, setsNeeded: number): InventoryState {
  if (mode === 'duplicates') {
    const inv: InventoryState = {};
    for (const piece of DEFAULT_PIECES) inv[piece] = 99;
    return inv;
  }
  if (mode === 'single' && singlePieceId) {
    // Choose Pieces: unlimited copies of the selected set ('D' or 'D+Y').
    const chosen = new Set(splitPieceSelection(singlePieceId));
    const inv: InventoryState = {};
    for (const piece of DEFAULT_PIECES) inv[piece] = chosen.has(piece) ? 99 : 0;
    return inv;
  }
  return createDefaultInventory(setsNeeded);
}


export function GamePage() {
  const { puzzleId } = useParams<{ puzzleId?: string }>();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { t } = useTranslation();
  
  // Get preset from URL query param
  const presetMode = searchParams.get('mode') as 'solo' | 'vs' | 'multiplayer' | 'pvp' | null;
  const joinCode = searchParams.get('join');
  // Direct session routing (Phase 2b): ?session=<id> opens ONE specific game
  // this player is part of — the games inbox links here so multiple
  // concurrent games never collide on the single host pointer.
  const sessionParam = searchParams.get('session');
  // Tutorial ladder step (1..3) — lesson banner + step-complete overlay.
  const tutorialStep = Number(searchParams.get('tutorial')) || 0;
  const tutorial = TUTORIAL_STEPS.find((t) => t.step === tutorialStep) ?? null;
  // Challenge mode: ?challenge=<solutionId> — the target result to beat.
  const challengeId = searchParams.get('challenge');
  const [challengeTarget, setChallengeTarget] = useState<ChallengeTarget | null>(null);
  const [challengeFetchDone, setChallengeFetchDone] = useState(false);
  const [pvpLinkCopied, setPvpLinkCopied] = useState(false);

  // Piece mode: Classic (one of each) / Free Pieces / One Piece. Challenge
  // runs lock to the target solution's mode so ghost races stay fair;
  // tutorial lessons start in their curriculum mode (piece → palette →
  // scarcity, constants/tutorial.ts). ?palette=only:E preselects a board
  // (open-throne links, reclaim hooks) — tutorial/challenge still win.
  const palettePreset = parsePaletteParam(searchParams.get('palette'));
  const [pieceMode, setPieceMode] = useState<PieceMode>(
    tutorial?.pieceMode ?? palettePreset?.pieceMode ?? 'unique'
  );
  const [singlePieceId, setSinglePieceId] = useState<string | null>(
    tutorial?.singlePieceId ?? palettePreset?.singlePieceId ?? null
  );
  // Per-piece solvability for the One Piece picker: pieceId -> yes/no/checking
  
  // Puzzle loading state (Phase 3A-2)
  const [puzzle, setPuzzle] = useState<PuzzleData | null>(null);
  const [puzzleLoading, setPuzzleLoading] = useState(true);
  const [puzzleError, setPuzzleError] = useState<string | null>(null);
  
  // Game state
  const [gameState, setGameState] = useState<GameState | null>(null);
  const gameStateRef = useRef<GameState | null>(null);
  gameStateRef.current = gameState;
  const [showSetupModal, setShowSetupModal] = useState(true);
  
  // Interaction mode for board - defaults to 'placing' for human turns
  const [interactionMode, setInteractionMode] = useState<InteractionMode>('placing');
  
  // Drawing cells from GameBoard3D (for hint with 1 cell drawn)
  const [drawingCells, setDrawingCells] = useState<Anchor[]>([]);

  // ---- PvP opponent forming preview ----
  // The OPPONENT's in-progress selection (their local white-glow highlight),
  // mirrored here as hollow ghost spheres. Real (non-simulated) PvP only.
  const [opponentFormingCells, setOpponentFormingCells] = useState<Anchor[]>([]);
  const formingChannelRef = useRef<FormingChannel | null>(null);
  const formingMyNumRef = useRef<1 | 2>(1);
  const formingSendTimerRef = useRef<number | null>(null);
  // Presence audio: soft tick when the opponent's forming ghost appears or
  // grows (count of currently SHOWN ghost cells + last-tick throttle stamp).
  const formingShownCountRef = useRef(0);
  const formingTickAtRef = useRef(0);
  const drawingCellsRef = useRef<Anchor[]>([]);
  drawingCellsRef.current = drawingCells;
  
  // Pending anchor for hint (Phase 3A-4) - set when user clicks a cell in pickingAnchor mode
  const [pendingAnchor, setPendingAnchor] = useState<Anchor | null>(null);
  
  // Placement rejection message
  const [placementError, setPlacementError] = useState<string | null>(null);

  // Environment settings and presets — start from the latest preset chosen
  // anywhere in the app (carried across pages), falling back to defaults.
  const [envSettings, setEnvSettings] = useState<StudioSettings>(
    () => carriedPresetSettings() ?? DEFAULT_STUDIO_SETTINGS
  );
  const [showSettings, setShowSettings] = useState(false);
  const [currentPreset, setCurrentPreset] = useState<string>(
    () => loadCarriedPreset() || 'metallic-light'
  );
  
  // Hide placed pieces toggle
  const [hidePlacedPieces, setHidePlacedPieces] = useState(false);
  
  // Selected piece for removal (Quick Play mode)
  const [selectedPieceUid, setSelectedPieceUid] = useState<string | null>(null);
  
  // Info modal
  const [showInfoModal, setShowInfoModal] = useState(false);
  const [selectedMode, setSelectedMode] = useState<'solo' | 'vs' | 'quickplay' | 'vsplayer'>('solo');
  const [timerInfo, setTimerInfo] = useState<{ timed: boolean; minutes: number }>({ timed: false, minutes: 5 });
  
  // Inventory modal
  const [showInventory, setShowInventory] = useState(false);
  
  // End modal dismissed (allows viewing the completed board after closing modal)
  const [endModalDismissed, setEndModalDismissed] = useState(false);
  const [showEndModal, setShowEndModal] = useState(false);

  // PvP state
  const [pvpSession, setPvpSession] = useState<PvPGameSession | null>(null);
  const [pvpWaiting, setPvpWaiting] = useState(false);
  // Invitee joined but the host's tab is closed (stale player1 heartbeat):
  // the match is NOT live yet — we hold in a pending overlay until the host's
  // heartbeat turns fresh. Gates the disconnect-forfeit logic and the chess
  // clocks so an absent host is never insta-forfeited.
  const [pvpPendingStart, setPvpPendingStart] = useState(false);
  const [pvpInviteCode, setPvpInviteCode] = useState<string | null>(null);
  const [pvpError, setPvpError] = useState<string | null>(null);
  const [showAuthPrompt, setShowAuthPrompt] = useState(false);
  // Invite-link guests: play without an account via an anonymous Supabase
  // session (see game/pvp/guestAuth.ts). Only ever set on the ?join= path.
  const [pvpGuestUser, setPvpGuestUser] = useState<User | null>(null);
  const [guestName, setGuestName] = useState(
    () => localStorage.getItem('user_preferences_username') || ''
  );
  const [guestJoinBusy, setGuestJoinBusy] = useState(false);
  const [guestJoinError, setGuestJoinError] = useState<string | null>(null);
  // PvP move-stream dedupe (Phase 2a): highest move_number already reflected
  // in the local engine (via replay or realtime application) + move ids seen.
  // Guards against re-applying replayed moves when the realtime channel
  // (re)connects and against INSERT echoes of our own submissions.
  const lastAppliedMoveNumberRef = useRef(0);
  const appliedMoveIdsRef = useRef<Set<string>>(new Set());
  // Physical build mode: end-of-game buildability verdict (solo only).
  // One Piece mode: piece tapped in the picker, shown in a confirm modal.
  const [previewPiece, setPreviewPiece] = useState<ViewerPlacedPiece | null>(null);
  const orientationSvcRef = useRef<any>(null);
  const handlePreviewPiece = useCallback(async (pieceId: string) => {
    try {
      if (!orientationSvcRef.current) {
        const { GoldOrientationService } = await import('../../services/GoldOrientationService');
        const svc = new GoldOrientationService();
        await svc.load();
        orientationSvcRef.current = svc;
      }
      const orientation = orientationSvcRef.current.getOrientations(pieceId)?.[0];
      if (!orientation) return;
      setPreviewPiece({
        uid: `preview-${pieceId}`,
        pieceId,
        orientationId: orientation.orientationId,
        cells: orientation.ijkOffsets,
        placedAt: Date.now(),
      } as ViewerPlacedPiece);
    } catch (err) {
      console.error('Failed to load piece preview:', err);
    }
  }, []);
  // Share-clip: live scene handles + modal toggle for recording a turntable clip.
  const [sceneObjects, setSceneObjects] = useState<any>(null);
  const [showShareClip, setShowShareClip] = useState(false);
  // Saved solution id of the completed solve — used for the shareable /c/ link.
  const [savedSolutionId, setSavedSolutionId] = useState<string | null>(null);
  const [discovery, setDiscovery] = useState<(DiscoveryStatus & { contestTarget?: boolean }) | null>(null);
  // Board rank of the saved solve (first-ever / top-3) — end-modal celebration.
  const [solveRank, setSolveRank] = useState<SolveRank | null>(null);
  const [pvpCoinFlipResult, setPvpCoinFlipResult] = useState<{ first: 1 | 2; myNumber: 1 | 2 } | null>(null);
  const [showCoinFlip, setShowCoinFlip] = useState(false);
  
  // Auth context for PvP
  const { user: authUser, isLoading: authLoading } = useAuth();
  // Vs-computer is a guest-friendly local game: when nobody is logged in and a
  // local simulated session is active, act as player 1 ("You") so the PvP turn
  // logic works without an account. Real auth always takes precedence.
  const guestUser = useMemo(() => ({ id: 'local-you', email: '', username: 'You' } as User), []);
  const user = authUser ?? pvpGuestUser ?? (pvpSession?.is_simulated ? guestUser : null);

  // PvP opponent action notification
  const [opponentNotification, setOpponentNotification] = useState<string | null>(null);
  const opponentNotificationTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const showOpponentNotification = useCallback((msg: string) => {
    setOpponentNotification(msg);
    if (opponentNotificationTimerRef.current) clearTimeout(opponentNotificationTimerRef.current);
    opponentNotificationTimerRef.current = setTimeout(() => setOpponentNotification(null), 3000);
  }, []);

  // PvP AI Chat state
  const [chatOpen, setChatOpen] = useState(false);
  const [pvpChatEnabled] = useState(() => {
    const saved = localStorage.getItem('user_preferences_pvp_chat');
    return saved !== 'false'; // default true
  });

  const getPvpChatContext = useCallback(() => {
    if (!pvpSession || !gameState) return {};
    const myNum = pvpSession.player1_id === user?.id ? 1 : 2;
    return {
      myName: myNum === 1 ? pvpSession.player1_name : pvpSession.player2_name,
      opponentName: myNum === 1 ? pvpSession.player2_name : pvpSession.player1_name,
      myScore: myNum === 1 ? pvpSession.player1_score : pvpSession.player2_score,
      opponentScore: myNum === 1 ? pvpSession.player2_score : pvpSession.player1_score,
      isMyTurn: pvpSession.current_turn === myNum,
      piecesPlaced: gameState.boardState.size,
      totalCells: puzzle?.spec?.sphereCount ?? 0,
      status: pvpSession.status,
    };
  }, [pvpSession, gameState, user?.id, puzzle?.spec?.sphereCount]);

  const {
    messages: chatMessages,
    isSending: chatIsSending,
    sendUserMessage,
    sendEmoji,
  } = useGameChat({
    getGameContext: getPvpChatContext,
    mode: 'versus',
    initialMessage: t('pvp.chat.aiOpener'),
  });

  // Real opponent (invite/join match) → chat connects the two PLAYERS over a
  // Realtime channel; the AI companion only backs simulated matches.
  const isHumanPvP = !!pvpSession && !pvpSession.is_simulated;
  const pvpOpponentName =
    (pvpSession
      ? pvpSession.player1_id === user?.id
        ? pvpSession.player2_name
        : pvpSession.player1_name
      : null) || t('pvp.chat.yourOpponent');
  // Persistent-chat trigger rejections land as toasts on the existing
  // opponent-notification strip (disallowed content / rate limit).
  const handleChatNotice = useCallback(
    (key: 'pvp.chat.blocked' | 'pvp.chat.slowDown') => showOpponentNotification(t(key)),
    [showOpponentNotification, t]
  );
  const humanChat = usePvPHumanChat(
    isHumanPvP ? pvpSession!.id : null,
    user?.id ?? null,
    user?.username || 'Player',
    pvpOpponentName,
    handleChatNotice
  );
  const chat = isHumanPvP
    ? humanChat
    : { messages: chatMessages, isSending: chatIsSending, sendUserMessage, sendEmoji };
  // Report-conversation affordance (human PvP only): flags the OPPONENT via
  // the shared reports flow.
  const [showChatReport, setShowChatReport] = useState(false);
  const pvpOpponentId =
    pvpSession && user
      ? pvpSession.player1_id === user.id
        ? pvpSession.player2_id
        : pvpSession.player1_id
      : null;

  // Calculate piece sets needed based on puzzle size (1 set = 25 pieces × 4 spheres = 100 cells)
  const setsNeeded = useMemo(() => {
    // PuzzleSpec uses targetCells (or sphereCount) not cells
    const cellCount = puzzle?.spec?.sphereCount ?? puzzle?.spec?.targetCells?.length ?? 0;
    if (cellCount === 0) return 1;
    return Math.ceil(cellCount / 100);
  }, [puzzle?.spec?.sphereCount, puzzle?.spec?.targetCells?.length]);

  // PvP Check state
  const [checkInProgress, setCheckInProgress] = useState(false);

  // UI-only effects state (Phase 2D-2)
  const [highlightPieceId, setHighlightPieceId] = useState<string | null>(null);
  const [scorePulse, setScorePulse] = useState<Record<PlayerId, number>>({});
  const lastNarrationIdRef = useRef<string | null>(null);

  // Game dependencies (solvability check, repair plan, hint generation)
  const depsRef = useRef(createDefaultDependencies());

  // Choose Pieces: can the SELECTED COMBINATION tile this shape? Checked
  // on-demand once pieces are chosen — nothing is precomputed. Three-stage
  // pipeline (chosenSetSolvability): parity math proves many sets impossible
  // instantly; an engine2 witness hunt gives a fast 'yes' on most puzzles;
  // DLX exhaustion is the only trusted 'no' proof. Budget gone → 'unknown'
  // (play allowed, with a warning). Debounced so rapid letter-toggling
  // doesn't stack overlapping search runs.
  const [comboViability, setComboViability] = useState<'checking' | 'yes' | 'unknown' | 'no' | null>(null);
  useEffect(() => {
    if (pieceMode !== 'single' || !singlePieceId || !puzzle || !showSetupModal) {
      setComboViability(null);
      return;
    }
    const targetCells = puzzle.spec?.targetCells ?? [];
    if (targetCells.length === 0) {
      setComboViability(null);
      return;
    }
    let cancelled = false;
    setComboViability('checking');
    const timer = setTimeout(async () => {
      try {
        const { checkChosenSetSolvable } = await import('../engine/chosenSetSolvability');
        const result = await checkChosenSetSolvable(targetCells, splitPieceSelection(singlePieceId));
        if (!cancelled) {
          console.log(`🧩 [ChoosePieces] ${singlePieceId}: ${result.verdict} (${result.decidedBy}${result.reason ? ': ' + result.reason : ''})`);
          setComboViability(result.verdict);
        }
      } catch {
        if (!cancelled) setComboViability(null);
      }
    }, 400);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [pieceMode, singlePieceId, puzzle?.spec?.id, showSetupModal]);

  // Load puzzle on mount or when puzzleId changes (Phase 3A-2)
  useEffect(() => {
    let cancelled = false;
    
    async function loadPuzzle() {
      setPuzzleLoading(true);
      setPuzzleError(null);
      
      try {
        let loadedPuzzle: PuzzleData;
        
        if (puzzleId) {
          console.log('🧩 [GamePage] Loading puzzle by ID:', puzzleId);
          loadedPuzzle = await loadPuzzleById(puzzleId);
        } else {
          console.log('🧩 [GamePage] Loading default puzzle for mode:', presetMode);
          loadedPuzzle = await loadDefaultPuzzle(presetMode === 'solo' ? 'solo' : 'vs');
        }
        
        if (!cancelled) {
          setPuzzle(loadedPuzzle);
          console.log('✅ [GamePage] Puzzle loaded:', loadedPuzzle.spec.title);
        }
      } catch (err) {
        if (!cancelled) {
          if (err instanceof PuzzleNotFoundError) {
            setPuzzleError(`Puzzle not found: ${puzzleId}`);
          } else {
            setPuzzleError(err instanceof Error ? err.message : 'Failed to load puzzle');
          }
          console.error('❌ [GamePage] Failed to load puzzle:', err);
        }
      } finally {
        if (!cancelled) {
          setPuzzleLoading(false);
        }
      }
    }
    
    loadPuzzle();

    return () => { cancelled = true; };
  }, [puzzleId, presetMode]);

  // Load the challenge target (the result to beat) when ?challenge= is present.
  useEffect(() => {
    if (!challengeId) {
      setChallengeTarget(null);
      return;
    }
    let cancelled = false;
    fetchChallengeTarget(challengeId).then((t) => {
      if (!cancelled) {
        setChallengeTarget(t);
        setChallengeFetchDone(true);
        // Race under the SAME piece rules the target solved with.
        if (t) {
          setPieceMode((t.piece_mode as PieceMode) ?? 'unique');
          setSinglePieceId(t.single_piece_id ?? null);
        }
      }
    });
    return () => {
      cancelled = true;
    };
  }, [challengeId]);

  // Founder/rank celebration: once the solve is saved, fetch where it landed
  // on its (puzzle × palette) board for the end modal. Rank is a bonus —
  // getSolveRank returns null when no slice clears the bar.
  useEffect(() => {
    if (!savedSolutionId) {
      setSolveRank(null);
      return;
    }
    let cancelled = false;
    getSolveRank(savedSolutionId).then((r) => {
      if (!cancelled) {
        setSolveRank(r);
        if (r) track('solve_rank_end_modal', { slice: r.firstEver ? 'first_ever' : 'top3', rank: r.rank });
      }
    });
    return () => {
      cancelled = true;
    };
  }, [savedSolutionId]);

  // Challenge verdict — computed when a challenge run ends. Player result
  // (X/N + honest first-placement->solve time) judged against the target.
  const challengeVerdict = useMemo(() => {
    if (!challengeTarget || !gameState || gameState.phase !== 'ended') return null;
    const pieces = Array.from(gameState.boardState.values());
    const playerPlacements = pieces.filter((p) => p.source === 'user').length;
    const totalPieces = gameState.boardState.size;
    const endedAt = gameState.endState?.endedAt
      ? new Date(gameState.endState.endedAt).getTime()
      : Date.now();
    const firstAt = pieces.length
      ? Math.min(...pieces.map((p) => p.placedAt))
      : endedAt;
    const playerDurationMs = Math.max(0, endedAt - firstAt);
    const outcome = judgeChallenge(
      { placements: playerPlacements, durationMs: playerDurationMs },
      { placements: challengeTarget.placements_by_you, durationMs: challengeTarget.duration_ms }
    );
    const playerName =
      authUser?.username ||
      (typeof localStorage !== 'undefined' && localStorage.getItem('user_preferences_username')) ||
      'You';
    return {
      outcome,
      playerName,
      targetName: challengeTarget.display_name || 'them',
      playerScore: formatChallengeScore(playerPlacements, totalPieces),
      playerTime: formatChallengeTime(playerDurationMs),
      targetScore: formatChallengeScore(challengeTarget.placements_by_you, challengeTarget.total_pieces),
      targetTime: formatChallengeTime(challengeTarget.duration_ms),
    };
  }, [challengeTarget, gameState, authUser]);

  // Ghost race (challenge runs): replay the challenger's recorded solve as a
  // live opponent. Anchored to the player's first placement so both racers
  // are measured "first move → now"; display-only, verdict math unchanged.
  const firstPlacementAt = useMemo(() => {
    if (!gameState || gameState.boardState.size === 0) return null;
    return Math.min(...Array.from(gameState.boardState.values()).map((p) => p.placedAt));
  }, [gameState]);
  const ghost = useGhostReplay(
    challengeTarget ? challengeId : null,
    firstPlacementAt,
    gameState?.phase !== 'ended'
  );
  const playerSelfCount = useMemo(() => {
    if (!gameState) return 0;
    return Array.from(gameState.boardState.values()).filter((p) => p.source === 'user').length;
  }, [gameState]);

  // Funnel: record how challenge races end (the k-factor loop's key step).
  useEffect(() => {
    if (challengeVerdict) {
      track('challenge_race_finished', {
        outcome: challengeVerdict.outcome,
        ghost_race: ghost.ready,
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [challengeVerdict?.outcome]);

  // Funnel: tutorial ladder progress.
  useEffect(() => {
    if (tutorial && gameState?.phase === 'ended' && gameState.endState?.reason === 'completed') {
      track('tutorial_step_completed', { step: tutorial.step });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tutorial?.step, gameState?.phase]);


  // Reset game when puzzle changes. Joiners arriving via an invite link
  // (?join=CODE) skip mode selection entirely — a game is already waiting for
  // them; the join overlay below covers the sign-in/joining states.
  useEffect(() => {
    if (puzzle) {
      setGameState(null);
      setShowSetupModal(!joinCode && !sessionParam);
    }
  }, [puzzle?.spec.id, joinCode, sessionParam]);

  // Returning guests: restore identity from a persisted anonymous session so
  // the invite auto-joins (and ?session= routing resolves) without asking
  // for a name again.
  useEffect(() => {
    if ((!joinCode && !sessionParam) || authUser || pvpGuestUser) return;
    getExistingPvPGuest()
      .then((guest) => {
        if (guest) {
          setPvpGuestUser(guest);
          setGuestName(guest.username);
        }
      })
      .catch(() => {});
  }, [joinCode, sessionParam, authUser, pvpGuestUser]);

  // Invitee chose to play as a guest: anonymous sign-in + guest users row.
  // Setting pvpGuestUser makes `user` truthy, which lets auto-join proceed.
  const handleGuestJoin = useCallback(async () => {
    const name = guestName.trim();
    if (name.length < 2) return;
    setGuestJoinBusy(true);
    setGuestJoinError(null);
    try {
      const guest = await ensurePvPGuest(name);
      setPvpGuestUser(guest);
    } catch (err: any) {
      console.error('🎮 [PvP] Guest join failed:', err);
      setGuestJoinError(err?.message || 'guest sign-in failed');
    } finally {
      setGuestJoinBusy(false);
    }
  }, [guestName]);

  // ---- Shared match start: both sides (and both timings) go through here ----
  // Used by: invitee joining with the host present, invitee flipping out of
  // the pending-start hold, host's waiting room seeing the join, and host
  // resuming a just-joined session. The session's stored inventory_state IS
  // the piece mode — both players must deal the same pieces.
  const startPvPMatch = useCallback((session: PvPGameSession) => {
    if (!puzzle || !user) return;

    setPvpSession(session);
    setPvpWaiting(false);
    setPvpPendingStart(false);
    setPvpInviteCode(null);

    // Determine my player number and show coin flip
    const myNum = (session.player1_id === user.id ? 1 : 2) as 1 | 2;

    // Multi-game store (Phase 2b): every started match is findable from the
    // Home inbox, in either role.
    if (!session.is_simulated) {
      recordMySession({
        sessionId: session.id,
        puzzleId: session.puzzle_id,
        role: myNum === 1 ? 'host' : 'guest',
        createdAt: session.created_at ?? new Date().toISOString(),
      });
    }
    setPvpCoinFlipResult({ first: session.first_player, myNumber: myNum });
    setShowCoinFlip(true);
    setTimeout(() => setShowCoinFlip(false), 3000);

    // Shared construction with mid-game replay (replaySession.ts) — one
    // implementation, so a rebuilt board can never diverge from a fresh one.
    const state = buildPvPBaseState(session, puzzle.spec, createDefaultInventory(setsNeeded));
    lastAppliedMoveNumberRef.current = 0;
    appliedMoveIdsRef.current = new Set();
    setGameState(state);
    setShowSetupModal(false);
  }, [puzzle, user, setsNeeded]);

  // Host returning to a session the invitee joined while we were away: the
  // clocks were stamped at join time, so reset them (DB write also freshens
  // our heartbeat — the same row update releases the waiting invitee), then
  // start through the shared path. Falls back to a local patch on error.
  const startAfterHostReturn = useCallback(async (session: PvPGameSession) => {
    const fresh = await restartPvPClock(session.id);
    if (fresh) {
      startPvPMatch(fresh);
    } else {
      const now = new Date().toISOString();
      startPvPMatch({
        ...session,
        turn_started_at: now,
        started_at: now,
        player1_last_heartbeat: now,
      });
    }
  }, [startPvPMatch]);

  // ---- Mid-game resume (Phase 2a): rebuild the board by replaying moves ----
  // Works for either player at any point of an active match (host pointer,
  // ?join= link revisit, or plain refresh — guests included, their identity is
  // restored by getExistingPvPGuest). The replayed engine state is
  // authoritative for the board; the session row for whose turn it is and the
  // clocks. Returns false when reconstruction isn't possible so callers can
  // fall back to their previous behavior (clear pointer / error state).
  const resumePvPMatch = useCallback(async (session: PvPGameSession): Promise<boolean> => {
    if (!puzzle || !user) return false;
    try {
      const myNum = (session.player1_id === user.id ? 1 : 2) as 1 | 2;
      const moves = await getSessionMoves(session.id);
      if (!moves) return false;

      const rebuilt = rebuildGameState(
        session, moves, puzzle.spec, myNum, createDefaultInventory(setsNeeded)
      );
      if (!rebuilt) return false;

      // Clock semantics on a mid-game resume: NEVER touch started_at (this is
      // not a match restart). Refresh my heartbeat; restamp turn_started_at
      // only when the turn is mine, so my away time doesn't burn my clock —
      // if it's the opponent's turn their clock is left strictly alone.
      const myTurn = session.current_turn === myNum;
      const fresh = await resumePvPClock(session.id, myNum, myTurn);
      const now = new Date().toISOString();
      const effective: PvPGameSession = fresh ?? {
        ...session,
        ...(myNum === 1
          ? { player1_last_heartbeat: now }
          : { player2_last_heartbeat: now }),
        ...(myTurn ? { turn_started_at: now } : {}),
      };

      // Dedupe floor: the realtime backlog must not re-apply replayed moves.
      lastAppliedMoveNumberRef.current = rebuilt.lastMoveNumber;
      appliedMoveIdsRef.current = new Set(moves.map((m) => m.id));
      // Replay is silent: pre-seed the audio watcher so restoring N pieces
      // doesn't fire a placement pop.
      prevBoardSizeRef.current = rebuilt.state.boardState.size;

      console.log(
        `🎮 [PvP] Resumed mid-game session ${session.id} at move ${rebuilt.lastMoveNumber}`
      );
      // Multi-game store (Phase 2b): resumed matches stay findable from Home.
      recordMySession({
        sessionId: session.id,
        puzzleId: session.puzzle_id,
        role: myNum === 1 ? 'host' : 'guest',
        createdAt: session.created_at ?? new Date().toISOString(),
      });
      setPvpSession(effective);
      setPvpWaiting(false);
      setPvpPendingStart(false);
      setPvpInviteCode(null);
      setGameState(rebuilt.state);
      setShowSetupModal(false);
      return true;
    } catch (err) {
      console.warn('🎮 [PvP] Mid-game resume failed:', err);
      return false;
    }
  }, [puzzle, user, setsNeeded]);

  // ---- Auto-join PvP session via ?join=CODE ----
  useEffect(() => {
    if (!joinCode || !puzzle || !user || pvpSession) return;

    const doJoin = async () => {
      console.log('🎮 [PvP] Auto-joining via invite code:', joinCode);
      setPvpWaiting(true);
      setPvpError(null);

      const session = await joinPvPSession(joinCode, user.id, user.username, null);
      if (!session) {
        // Join rejected — but this may be OUR session already: the host
        // following the invitee's WhatsApp nudge (their own invite link),
        // or the invitee refreshing the page after joining. Reattach
        // instead of erroring.
        try {
          const existing = await getPvPSessionByInviteCode(joinCode);
          if (existing && !existing.is_simulated) {
            const amHost = existing.player1_id === user.id;
            const amInvitee = existing.player2_id === user.id;
            const expired =
              existing.invite_expires_at && new Date(existing.invite_expires_at) < new Date();

            if (amHost && existing.status === 'waiting' && !expired) {
              // Host opened their own link, nobody joined yet → waiting room.
              recordMySession({
                sessionId: existing.id,
                puzzleId: existing.puzzle_id,
                role: 'host',
                createdAt: existing.created_at ?? new Date().toISOString(),
              });
              setPvpSession(existing);
              setPvpInviteCode(existing.invite_code);
              return; // pvpWaiting already true
            }
            if (existing.status === 'active' && (amHost || amInvitee)) {
              const moves = await countSessionMoves(existing.id);
              if (moves !== null && moves > 0) {
                // Mid-game return/refresh (either player): rebuild the board
                // by replaying the move history. On failure fall through to
                // the normal error state.
                if (await resumePvPMatch(existing)) return;
              } else if (moves === 0) {
                if (amHost) {
                  // Nudge link: invitee is holding for us. Start if untouched.
                  await startAfterHostReturn(existing);
                  return;
                }
                if (
                  isHeartbeatFresh(existing.player1_last_heartbeat) ||
                  existing.timer_seconds === 0 // untimed: no clock to protect
                ) {
                  startPvPMatch(existing);
                  return;
                }
                setPvpSession(existing);
                setPvpWaiting(false);
                setPvpPendingStart(true);
                setShowSetupModal(false);
                return;
              }
            }

            // Session ended while we were away (completed / abandoned /
            // expired): show the graceful ended overlay instead of an error.
            if (
              (amHost || amInvitee) &&
              (existing.status === 'completed' ||
                existing.status === 'abandoned' ||
                existing.status === 'expired')
            ) {
              setPvpSession(existing);
              setPvpWaiting(false);
              setPvpPendingStart(true); // renders the pending overlay's "ended" branch
              setShowSetupModal(false);
              return;
            }
          }
        } catch {
          // Fall through to the normal error state.
        }
        setPvpError(t('pvp.errors.sessionNotFound'));
        setPvpWaiting(false);
        return;
      }

      // Forgiving invites: the host may have closed their tab long ago. Start
      // the live match when the host is actually present (fresh player1
      // heartbeat) — or when the game is UNTIMED (Phase 2b): with no chess
      // clock there is nothing to protect by holding, the game simply waits
      // for whoever shows up next. Timed games without the host hold in the
      // pending-start overlay — our own heartbeat keeps flowing so the host
      // sees US when they return.
      if (isHeartbeatFresh(session.player1_last_heartbeat) || session.timer_seconds === 0) {
        startPvPMatch(session);
      } else {
        console.log('🎮 [PvP] Joined but host is away — holding in pending start');
        recordMySession({
          sessionId: session.id,
          puzzleId: session.puzzle_id,
          role: 'guest',
          createdAt: session.created_at ?? new Date().toISOString(),
        });
        setPvpSession(session);
        setPvpWaiting(false);
        setPvpPendingStart(true);
        setShowSetupModal(false);
      }
    };

    doJoin().catch(err => {
      console.error('🎮 [PvP] Join failed:', err);
      setPvpError(err.message || 'Failed to join game');
      setPvpWaiting(false);
    });
  }, [joinCode, puzzle, user, pvpSession, setsNeeded, startPvPMatch, startAfterHostReturn, resumePvPMatch]);

  // ---- Direct session routing: ?session=<id> (Phase 2b) ----
  // The games inbox links each open game here so several concurrent matches
  // never collide on one localStorage pointer. Works for signed-in players
  // AND guests whose anonymous identity was restored (pvpGuestUser).
  // Participant check is defensive on top of RLS: game_sessions SELECT is
  // scoped to players — except 'waiting' rows, which are world-readable for
  // the join flow, so a non-participant could fetch one; we refuse it here.
  const sessionRouteAttemptedRef = useRef(false);
  useEffect(() => {
    if (!sessionParam || joinCode) return;
    if (!puzzle || pvpSession || gameState) return;
    if (authLoading || !user) return; // sign-in overlay handles the rest
    if (sessionRouteAttemptedRef.current) return;
    sessionRouteAttemptedRef.current = true;

    (async () => {
      setPvpWaiting(false);
      setPvpError(null);
      try {
        const session = await getPvPSession(sessionParam);
        if (!session || session.is_simulated) {
          setPvpError(t('pvp.errors.sessionNotFound'));
          return;
        }
        const amHost = session.player1_id === user.id;
        const amInvitee = session.player2_id === user.id;
        if (!amHost && !amInvitee) {
          // Not our game (only reachable for world-readable 'waiting' rows).
          setPvpError(t('pvp.errors.notYourGame'));
          return;
        }
        if (session.puzzle_id !== puzzle.spec.id) {
          // Stale/hand-edited link — the session knows its real puzzle.
          navigate(`/game/${session.puzzle_id}?session=${session.id}`, { replace: true });
          sessionRouteAttemptedRef.current = false;
          return;
        }

        if (session.status === 'waiting') {
          const expired =
            session.invite_expires_at && new Date(session.invite_expires_at) < new Date();
          if (!amHost || expired) {
            setPvpError(t('pvp.errors.sessionNotFound'));
            return;
          }
          // Host → back to the waiting room.
          recordMySession({
            sessionId: session.id,
            puzzleId: session.puzzle_id,
            role: 'host',
            createdAt: session.created_at ?? new Date().toISOString(),
          });
          setPvpSession(session);
          setPvpInviteCode(session.invite_code);
          setPvpWaiting(true);
          setShowSetupModal(false);
          return;
        }

        if (session.status === 'active') {
          const moves = await countSessionMoves(session.id);
          if (moves !== null && moves > 0) {
            // Mid-game: rebuild the board by replaying moves (Phase 2a path).
            if (await resumePvPMatch(session)) return;
            setPvpError(t('pvp.errors.sessionNotFound'));
            return;
          }
          if (moves === 0) {
            if (amHost) {
              // Invitee joined while we were away — reset clocks and start.
              await startAfterHostReturn(session);
              return;
            }
            if (
              isHeartbeatFresh(session.player1_last_heartbeat) ||
              session.timer_seconds === 0 // untimed: the game just waits
            ) {
              startPvPMatch(session);
              return;
            }
            // Timed game, host away → the pending-start hold.
            recordMySession({
              sessionId: session.id,
              puzzleId: session.puzzle_id,
              role: 'guest',
              createdAt: session.created_at ?? new Date().toISOString(),
            });
            setPvpSession(session);
            setPvpPendingStart(true);
            setShowSetupModal(false);
            return;
          }
          setPvpError(t('pvp.errors.sessionNotFound'));
          return;
        }

        // Terminal (completed / abandoned / expired): graceful ended overlay
        // (same branch the ?join= flow uses) + local cleanup.
        removeMySession(session.id);
        clearChatSeen(session.id);
        setPvpSession(session);
        setPvpPendingStart(true); // renders the pending overlay's "ended" branch
        setShowSetupModal(false);
      } catch (err) {
        console.warn('🎮 [PvP] Session routing failed:', err);
        setPvpError(t('pvp.errors.sessionNotFound'));
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    sessionParam,
    joinCode,
    puzzle?.spec.id,
    !!pvpSession,
    !!gameState,
    authLoading,
    user?.id,
    startPvPMatch,
    startAfterHostReturn,
    resumePvPMatch,
  ]);

  // ---- Pending start (invitee): watch for the host coming back ----
  // Realtime streams the session row (host heartbeats update it), with a 10s
  // poll as fallback. The moment player1's heartbeat is fresh, flip into the
  // normal match-start path. Status changes (host cancelled / expired) land
  // in pvpSession so the overlay can show a graceful ended state.
  useEffect(() => {
    if (!pvpPendingStart || !pvpSession || gameState) return;
    const sessionId = pvpSession.id;

    const onSessionUpdate = (s: PvPGameSession) => {
      if (s.status === 'active' && isHeartbeatFresh(s.player1_last_heartbeat)) {
        console.log('🎮 [PvP] Host is back — starting the match');
        startPvPMatch(s);
      } else {
        setPvpSession(s);
      }
    };

    const unsub = subscribeToSession(sessionId, onSessionUpdate);
    const poll = setInterval(async () => {
      try {
        const s = await getPvPSession(sessionId);
        if (s) onSessionUpdate(s);
      } catch {
        // Transient fetch failure — keep waiting; realtime may still deliver.
      }
    }, 10000);

    return () => {
      unsub();
      clearInterval(poll);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pvpPendingStart, pvpSession?.id, !!gameState, startPvPMatch]);

  // ---- Host waiting room: keep the host "present" + detect the join ----
  // player1's heartbeat stays fresh while the waiting room is open, so an
  // invitee who joins right now starts immediately. When the session flips to
  // 'active' (invitee joined), the host starts through the same shared path.
  useEffect(() => {
    if (!pvpSession || pvpSession.status !== 'waiting' || gameState) return;
    if (!user || pvpSession.player1_id !== user.id) return;
    const sessionId = pvpSession.id;

    const beat = () => sendHeartbeat(sessionId, 1).catch(() => {});
    beat();
    const heartbeat = setInterval(beat, 20000);

    const onSessionUpdate = (s: PvPGameSession) => {
      if (s.status === 'active') {
        console.log('🎮 [PvP] Opponent joined — starting the match (host)');
        startPvPMatch(s);
      } else if (s.status !== 'waiting') {
        setPvpSession(s);
      }
    };

    const unsub = subscribeToSession(sessionId, onSessionUpdate);
    const poll = setInterval(async () => {
      try {
        const s = await getPvPSession(sessionId);
        if (s) onSessionUpdate(s);
      } catch {
        // Transient fetch failure — realtime may still deliver.
      }
    }, 10000);

    return () => {
      clearInterval(heartbeat);
      unsub();
      clearInterval(poll);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pvpSession?.id, pvpSession?.status, !!gameState, user?.id, startPvPMatch]);

  // ---- Host resume: reattach to a session this device created ----
  // Pointer saved at session creation (localStorage 'pvp.hostSession').
  // waiting → reopen the waiting room; active with no moves yet → the invitee
  // arrived while we were away: start the live match; active WITH moves →
  // mid-game resume via move replay (Phase 2a); anything else (ended,
  // expired, unreconstructable) → clear the pointer and proceed normally.
  const hostResumeAttemptedRef = useRef(false);
  useEffect(() => {
    if (hostResumeAttemptedRef.current) return;
    // Explicit routing (?join= / ?session=) always wins over the breadcrumb.
    if (!puzzle || !authUser || gameState || pvpSession || joinCode || sessionParam) return;

    const pointer = readHostSessionPointer();
    if (!pointer || pointer.puzzleId !== puzzle.spec.id) return;
    hostResumeAttemptedRef.current = true;

    (async () => {
      try {
        const session = await getPvPSession(pointer.sessionId);
        if (!session || session.is_simulated || session.player1_id !== authUser.id) {
          clearHostSessionPointer(pointer.sessionId);
          return;
        }

        if (session.status === 'waiting') {
          const expired =
            session.invite_expires_at && new Date(session.invite_expires_at) < new Date();
          if (expired) {
            clearHostSessionPointer(pointer.sessionId);
            return;
          }
          console.log('🎮 [PvP] Resuming waiting room for session', session.id);
          setPvpSession(session);
          setPvpInviteCode(session.invite_code);
          setPvpWaiting(true);
          return;
        }

        if (session.status === 'active') {
          const moves = await countSessionMoves(session.id);
          if (moves === 0) {
            // Invitee joined while we were away and is holding in the
            // pending overlay — reset the clocks and start; the same row
            // update (fresh host heartbeat) releases them.
            console.log('🎮 [PvP] Resuming just-joined session', session.id);
            await startAfterHostReturn(session);
            return;
          }
          if (moves !== null && moves > 0) {
            // Mid-game resume (Phase 2a): rebuild the board by replaying the
            // move history. On failure fall through and clear the pointer.
            console.log('🎮 [PvP] Resuming mid-game session', session.id);
            if (await resumePvPMatch(session)) return;
          }
        }

        // Ended / expired / unreconstructable — proceed with normal setup.
        clearHostSessionPointer(pointer.sessionId);
      } catch (err) {
        console.warn('🎮 [PvP] Host resume check failed (ignored):', err);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [puzzle?.spec.id, authUser?.id, !!gameState, !!pvpSession, joinCode, startAfterHostReturn, resumePvPMatch]);

  // ---- Host resume pointer lifecycle: drop it on any terminal status ----
  // Every end path (completed / abandoned / expired, local or via realtime)
  // funnels through a pvpSession status change, so this single effect covers
  // timeout, disconnect, resign, stall, completion and cancellation.
  useEffect(() => {
    if (!pvpSession || pvpSession.is_simulated) return;
    if (
      pvpSession.status === 'completed' ||
      pvpSession.status === 'abandoned' ||
      pvpSession.status === 'expired'
    ) {
      clearHostSessionPointer(pvpSession.id);
      // Multi-game store + chat watermark follow the same lifecycle.
      removeMySession(pvpSession.id);
      clearChatSeen(pvpSession.id);
    }
  }, [pvpSession?.status, pvpSession?.id, pvpSession?.is_simulated]);

  // Handle setup confirmation
  const handleSetupConfirm = useCallback((setup: GameSetupInput) => {
    if (!puzzle) return;

    const initialInventory = buildInventory(pieceMode, singlePieceId, setsNeeded);
    const state = createInitialGameState(setup, puzzle.spec, initialInventory);
    setGameState(state);
    setShowSetupModal(false);
    console.log('🎮 Game started:', state, 'mode:', pieceMode, singlePieceId ?? '');
  }, [puzzle, setsNeeded, pieceMode, singlePieceId]);

  // When the user explicitly chose solo (e.g. from a challenge "Start"), skip
  // the mode-selection setup screen and drop straight into the solo game.
  useEffect(() => {
    if (presetMode === 'solo' && puzzle && !gameState && showSetupModal) {
      // Challenge run: wait until the target loads so the game starts in the
      // target's piece mode (ghost races must be like-for-like). If the
      // fetch finished with no target (deleted solve), start normally.
      if (challengeId && !challengeFetchDone) return;
      handleSetupConfirm(createSoloPreset());
    }
  }, [presetMode, puzzle, gameState, showSetupModal, handleSetupConfirm, challengeId, challengeFetchDone]);

  // Handle PvP start
  const handleStartPvP = useCallback(async (setup: GameSetupInput, matchType: PvPMatchType) => {
    console.log('🎮 [PvP] handleStartPvP called, matchType:', matchType, 'user:', user?.id, 'puzzle:', puzzle?.spec.id);
    const isSimulated = matchType === 'random';

    if (!puzzle) {
      setPvpError('Puzzle not loaded');
      return;
    }
    // Only real player-vs-player needs an account; vs-computer is guest-friendly.
    if (!isSimulated && !authUser) {
      setShowAuthPrompt(true);
      return;
    }

    setPvpError(null);
    const initialInventory = buildInventory(pieceMode, singlePieceId, setsNeeded);
    const timerSeconds = setup.timerMode === 'none' ? 0 : (setup.players[0]?.timerSeconds || 300);

    try {
      const sessionInput = {
        puzzleId: puzzle.spec.id,
        puzzleName: puzzle.spec.title,
        timerSeconds,
        inventoryState: initialInventory,
        isSimulated,
        hintLimit: setup.pvpHintLimit ?? 0,
        checkLimit: setup.pvpCheckLimit ?? 0,
      };
      console.log('🎮 [PvP] Starting session, isSimulated:', isSimulated);

      if (isSimulated) {
        // Vs computer = local guest game. No Supabase, no login required.
        const localSession = createLocalSimulatedSession(
          sessionInput,
          user?.id ?? 'local-you',
          user?.username ?? 'You',
          Math.random()
        );
        setPvpSession(localSession);

        // Show coin flip, then start the game.
        setShowCoinFlip(true);
        setPvpCoinFlipResult({ first: localSession.first_player, myNumber: 1 });
        setTimeout(() => {
          setShowCoinFlip(false);
          setShowSetupModal(false);
          const state = createInitialGameState(setup, puzzle.spec, initialInventory);
          setGameState(state);
        }, 3000);
        return;
      }

      // Real vs-player match (requires login) — create a backend session.
      const session = await createPvPSession(
        sessionInput,
        user!.id,
        user!.username,
        null // avatar URL
      );

      setPvpSession(session);

      // Host resume breadcrumb — lets the host come back to this session
      // after closing the waiting room or the whole tab.
      saveHostSessionPointer({
        sessionId: session.id,
        puzzleId: puzzle.spec.id,
        code: session.invite_code ?? '',
        createdAt: new Date().toISOString(),
      });
      // Multi-game store (Phase 2b): the new invite shows in the Home inbox
      // alongside any other open games.
      recordMySession({
        sessionId: session.id,
        puzzleId: puzzle.spec.id,
        role: 'host',
        createdAt: new Date().toISOString(),
      });

      // Invite link mode: show waiting room
      setPvpInviteCode(session.invite_code);
      setPvpWaiting(true);
    } catch (err: any) {
      console.error('🎮 [PvP] handleStartPvP error:', err);
      // Server-side open-games cap (20260809 trigger) — friendly message,
      // not a raw DB failure.
      const msg = (err instanceof PvPGameCapError || err?.code === 'too_many_games')
        ? t('pvp.errors.tooManyGames')
        : (err.message || 'Failed to create game session');
      setPvpError(msg);
      alert(msg); // Visible feedback
    }
  }, [puzzle, user, setsNeeded, pieceMode, singlePieceId]);

  // Handle setup cancel
  const handleSetupCancel = useCallback(() => {
    navigate('/gallery');
  }, [navigate]);

  // Match is truly live: session active AND we're not holding for an away
  // host AND the local engine is running. Gates disconnect-forfeit + clocks.
  const pvpMatchLive =
    !!pvpSession && pvpSession.status === 'active' && !pvpPendingStart && !!gameState;

  // ---- PvP resync on tab wake ----
  // Realtime is push-only with no replay: a backgrounded tab's websocket can
  // die silently (sleep, throttling, network blips) and everything missed is
  // simply gone — the "board needs a refresh" reports. Bumping this tick
  // remounts both subscriptions below; their setup paths refetch the session
  // row (on SUBSCRIBED) and the move backlog, pulling in whatever was missed.
  const [pvpResyncTick, setPvpResyncTick] = useState(0);
  useEffect(() => {
    if (!pvpSession || pvpSession.is_simulated) return;
    const resync = () => {
      if (document.visibilityState === 'visible') {
        pvpDebugRef.current.resyncs += 1;
        setPvpResyncTick((n) => n + 1);
      }
    };
    document.addEventListener('visibilitychange', resync);
    window.addEventListener('online', resync);
    return () => {
      document.removeEventListener('visibilitychange', resync);
      window.removeEventListener('online', resync);
    };
  }, [pvpSession?.id, pvpSession?.is_simulated]);

  // ---- PvP field diagnostics (?pvpdebug=1) ----
  // Prod strips console.log, so field debugging happens on screen (same
  // pattern as the ?mem=1 quota overlay). Counters are cheap refs updated
  // inside the existing callbacks; the overlay polls them once a second and
  // only renders when the flag is on.
  const pvpDebugOn = React.useMemo(
    () => new URLSearchParams(window.location.search).get('pvpdebug') === '1',
    []
  );
  const pvpDebugRef = useRef({
    sessionCh: '—',
    movesCh: '—',
    formingCh: '—',
    sessionEvents: 0,
    moveEvents: 0,
    formingEvents: 0,
    lastEventAt: 0,
    resyncs: 0,
  });
  const [, pvpDebugTick] = useState(0);
  useEffect(() => {
    if (!pvpDebugOn) return;
    const id = setInterval(() => pvpDebugTick((n) => n + 1), 1000);
    return () => clearInterval(id);
  }, [pvpDebugOn]);

  // ---- PvP Realtime subscription: sync session state from DB ----
  // (The pending-start watcher owns the subscription while holding for the
  // host — skip here to avoid two channels with the same topic.)
  useEffect(() => {
    if (!pvpSession || pvpSession.status !== 'active' || pvpPendingStart) return;

    const unsub = subscribeToSession(pvpSession.id, (updated) => {
      pvpDebugRef.current.sessionEvents += 1;
      pvpDebugRef.current.lastEventAt = Date.now();
      setPvpSession(updated);
      if (updated.status === 'completed' || updated.status === 'abandoned') {
        console.log('🎮 [PvP] Game ended via realtime:', updated.end_reason);
        // Update player stats
        if (user) {
          const myNum = updated.player1_id === user.id ? 1 : 2;
          const myScore = myNum === 1 ? updated.player1_score : updated.player2_score;
          const result = updated.winner === myNum ? 'win'
            : updated.winner === null ? 'draw'
            : updated.status === 'abandoned' ? 'abandoned'
            : 'loss';
          updatePlayerStats(user.id, result, myScore).catch(err =>
            console.error('🎮 [PvP] Failed to update stats:', err)
          );
        }
      }
    }, (status) => {
      pvpDebugRef.current.sessionCh = status;
    });

    return unsub;
  }, [pvpSession?.id, pvpSession?.status, pvpResyncTick]);

  // ---- PvP Realtime moves: apply the opponent's moves to the local engine ----
  // (Phase 2a) One shared application path — applyPvPMoveToState — serves both
  // this live stream and mid-game replay (rebuildGameState), so live
  // application and reconstruction can never diverge. Our own submissions
  // come back as INSERT echoes; the id/move_number guards skip them (they were
  // applied locally at dispatch time) while still advancing the dedupe floor.
  useEffect(() => {
    if (!pvpMatchLive || !pvpSession || pvpSession.is_simulated || !user) return;
    if (pvpSession.id.startsWith('local-')) return;
    const sessionId = pvpSession.id;
    const myNum = (pvpSession.player1_id === user.id ? 1 : 2) as 1 | 2;
    const opponentName =
      (myNum === 1 ? pvpSession.player2_name : pvpSession.player1_name) ?? '';

    const handleMove = (move: PvPGameMove) => {
      pvpDebugRef.current.moveEvents += 1;
      pvpDebugRef.current.lastEventAt = Date.now();
      if (appliedMoveIdsRef.current.has(move.id)) return;
      if (move.move_number && move.move_number <= lastAppliedMoveNumberRef.current) return;
      appliedMoveIdsRef.current.add(move.id);
      if (move.move_number) {
        lastAppliedMoveNumberRef.current = Math.max(
          lastAppliedMoveNumberRef.current,
          move.move_number
        );
      }
      if (move.player_number === myNum) return; // self-echo — already applied locally
      // Opponent committed a move — their forming preview is over.
      setOpponentFormingCells([]);
      formingShownCountRef.current = 0;
      if (move.move_type === 'resign' || move.move_type === 'timeout') return; // session update carries the end

      // Live-only side effects stay here (the shared apply path is pure).
      if (move.move_type === 'hint') {
        showOpponentNotification(t('pvp.toast.usedHint', { name: opponentName }));
      } else if (move.move_type === 'check') {
        showOpponentNotification(t('pvp.toast.usedCheck', { name: opponentName }));
      }

      setGameState((prev) => {
        if (!prev) return prev;
        const next = applyPvPMoveToState(prev, move, myNum);
        if (!next) {
          console.warn(
            '🎮 [PvP] Could not apply remote move to local engine:',
            move.move_number, move.move_type
          );
          return prev;
        }
        return next;
      });
    };

    // Catch-up: a move can land between a resume's history fetch and this
    // channel attaching (realtime INSERTs are not backfilled). Buffer live
    // events until the one-shot backlog fetch is applied so moves are never
    // applied out of order; the dedupe guards make the overlap idempotent.
    let cancelled = false;
    let ready = false;
    const buffered: PvPGameMove[] = [];
    const onMove = (move: PvPGameMove) => {
      if (!ready) {
        buffered.push(move);
        return;
      }
      handleMove(move);
    };
    const unsub = subscribeToMoves(sessionId, onMove, (status) => {
      pvpDebugRef.current.movesCh = status;
    });
    (async () => {
      try {
        const backlog = await getSessionMoves(sessionId);
        if (cancelled) return;
        if (backlog) for (const move of backlog) handleMove(move);
      } catch {
        // Best-effort — realtime still flows.
      } finally {
        if (!cancelled) {
          ready = true;
          for (const move of buffered.splice(0)) handleMove(move);
        }
      }
    })();

    return () => {
      cancelled = true;
      unsub();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pvpMatchLive, pvpSession?.id, pvpSession?.is_simulated, user?.id, pvpResyncTick]);

  // ---- PvP opponent forming preview: broadcast channel ----
  // Ephemeral Supabase broadcast (game-forming-<id>): the active player's
  // in-progress sphere selection streams to the opponent as hollow ghosts.
  // Real (non-simulated) PvP only; no DB writes. Every message is the FULL
  // current selection, so a missed event self-heals on the next one.
  useEffect(() => {
    if (!pvpMatchLive || !pvpSession || pvpSession.is_simulated || !user) return;
    if (pvpSession.id.startsWith('local-')) return;
    const myNum = (pvpSession.player1_id === user.id ? 1 : 2) as 1 | 2;
    formingMyNumRef.current = myNum;

    // Ghosts with no fresh update for 30s are stale (opponent's tab died
    // mid-selection and never broadcast the clearing empty array).
    let staleTimer: number | null = null;
    const clearStaleTimer = () => {
      if (staleTimer !== null) {
        window.clearTimeout(staleTimer);
        staleTimer = null;
      }
    };

    const { channel, unsubscribe } = subscribeForming(pvpSession.id, (update) => {
      pvpDebugRef.current.formingEvents += 1;
      pvpDebugRef.current.lastEventAt = Date.now();
      if (update.player === myNum) return; // self-echo
      // Presence audio: a soft, quiet tick when the ghost selection APPEARS
      // or GROWS (shrink/clear stays silent), at most one tick per ~300ms.
      // Clearly lighter than the placement pop.
      if (update.cells.length > formingShownCountRef.current) {
        const now = Date.now();
        if (now - formingTickAtRef.current >= 300) {
          formingTickAtRef.current = now;
          sounds.formingTick();
        }
      }
      formingShownCountRef.current = update.cells.length;
      // The broadcast's player field is authoritative for whose forming this
      // is — render regardless of whose turn the local client thinks it is.
      setOpponentFormingCells(update.cells);
      clearStaleTimer();
      if (update.cells.length > 0) {
        staleTimer = window.setTimeout(() => {
          setOpponentFormingCells([]);
          formingShownCountRef.current = 0;
        }, 30_000);
      }
    }, (status) => {
      pvpDebugRef.current.formingCh = status;
    });
    formingChannelRef.current = channel;

    return () => {
      formingChannelRef.current = null;
      clearStaleTimer();
      if (formingSendTimerRef.current !== null) {
        window.clearTimeout(formingSendTimerRef.current);
        formingSendTimerRef.current = null;
      }
      unsubscribe();
      setOpponentFormingCells([]); // session over / resync — drop any ghosts
      formingShownCountRef.current = 0;
    };
  }, [pvpMatchLive, pvpSession?.id, pvpSession?.is_simulated, user?.id, pvpResyncTick]);

  // Broadcast MY selection whenever it changes (trailing throttle ~150ms so
  // per-click spam coalesces). drawingCells reaching [] — commit, rejection,
  // or manual deselect — broadcasts the clearing empty array.
  useEffect(() => {
    if (!formingChannelRef.current) return; // not in a live real-PvP match
    if (formingSendTimerRef.current !== null) return; // trailing send already queued
    formingSendTimerRef.current = window.setTimeout(() => {
      formingSendTimerRef.current = null;
      const channel = formingChannelRef.current;
      if (!channel) return;
      sendFormingCells(channel, formingMyNumRef.current, drawingCellsRef.current);
    }, 150);
  }, [drawingCells]);

  // ---- PvP Heartbeat: send every 5s while game is active ----
  useEffect(() => {
    if (!pvpSession || pvpSession.status !== 'active' || !user) return;
    const myNum = pvpSession.player1_id === user.id ? 1 : 2;

    const beat = () => sendHeartbeat(pvpSession.id, myNum as 1 | 2);
    beat();
    const interval = setInterval(beat, 5000);
    return () => clearInterval(interval);
  }, [pvpSession?.id, pvpSession?.status, user?.id]);

  // ---- PvP Timer timeout: check every second if a player's clock hit zero ----
  // Gated on pvpMatchLive: while an invitee holds for an away host the chess
  // clocks must not run (turn_started_at was stamped at join time).
  useEffect(() => {
    if (!pvpMatchLive || !pvpSession || pvpSession.status !== 'active' || !user) return;
    if (pvpSession.timer_seconds === 0) return; // No timer mode — skip timeout check

    const interval = setInterval(() => {
      if (!pvpSession || pvpSession.status !== 'active') return;

      const turnStarted = pvpSession.turn_started_at
        ? new Date(pvpSession.turn_started_at).getTime()
        : Date.now();
      const elapsed = Date.now() - turnStarted;
      const activePlayerTime = pvpSession.current_turn === 1
        ? pvpSession.player1_time_remaining_ms
        : pvpSession.player2_time_remaining_ms;
      const remaining = activePlayerTime - elapsed;

      if (remaining <= 0) {
        clearInterval(interval);
        const timedOutPlayer = pvpSession.current_turn;
        const winner = (timedOutPlayer === 1 ? 2 : 1) as 1 | 2;
        console.log('🎮 [PvP] Timer expired for player', timedOutPlayer);

        // Use local engine scores (source of truth)
        const currentGS = gameStateRef.current;
        const p1Score = currentGS?.players[0]?.score ?? 0;
        const p2Score = currentGS?.players[1]?.score ?? 0;

        // Update local PvP session immediately so timers stop and overlay shows
        setPvpSession(prev => prev ? {
          ...prev,
          status: 'completed' as const,
          winner,
          end_reason: 'timeout' as const,
          player1_score: p1Score,
          player2_score: p2Score,
          ended_at: new Date().toISOString(),
        } : prev);

        // End local game engine
        dispatchEvent({ type: 'GAME_END', reason: 'timeout' });

        // Update backend (best-effort)
        endPvPGame(pvpSession.id, winner, 'timeout', {
          player1: p1Score,
          player2: p2Score,
        }).catch(err => console.error('🎮 [PvP] Failed to end game on timeout:', err));
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [pvpMatchLive, pvpSession?.id, pvpSession?.status, pvpSession?.current_turn, pvpSession?.turn_started_at]);

  // ---- PvP Disconnect detection: check opponent heartbeat every 5s ----
  // Gated on pvpMatchLive: in the pending-start hold the "opponent" (the away
  // host) is EXPECTED to be silent — running the forfeit clock there would
  // end the match the moment it starts.
  // UNTIMED sessions (Phase 2b) skip this entirely: turn-at-your-leisure play
  // means presence is irrelevant — the opponent being away is the normal
  // state, not a forfeit condition. Only blitz (timered) matches keep the
  // heartbeat-based disconnect UI + auto-win.
  const [opponentDisconnected, setOpponentDisconnected] = useState(false);
  const [disconnectCountdown, setDisconnectCountdown] = useState<number | null>(null);

  useEffect(() => {
    if (
      !pvpMatchLive ||
      !pvpSession ||
      pvpSession.status !== 'active' ||
      pvpSession.is_simulated ||
      pvpSession.timer_seconds === 0 || // async game — no disconnect concept
      !user
    ) {
      setOpponentDisconnected(false);
      setDisconnectCountdown(null);
      return;
    }

    const myNum = (pvpSession.player1_id === user.id ? 1 : 2) as 1 | 2;
    const interval = setInterval(() => {
      const disconnected = isOpponentDisconnected(pvpSession, myNum);
      setOpponentDisconnected(disconnected);
    }, 5000);

    return () => clearInterval(interval);
  }, [pvpMatchLive, pvpSession?.id, pvpSession?.status, pvpSession?.is_simulated, user?.id]);

  // Disconnect countdown: 30s → auto-win
  useEffect(() => {
    if (!opponentDisconnected || !pvpMatchLive || !pvpSession || pvpSession.status !== 'active') {
      setDisconnectCountdown(null);
      return;
    }

    let remaining = 30;
    setDisconnectCountdown(remaining);

    const countdownInterval = setInterval(() => {
      remaining--;
      setDisconnectCountdown(remaining);

      if (remaining <= 0) {
        clearInterval(countdownInterval);
        const myNum = (pvpSession.player1_id === user?.id ? 1 : 2) as 1 | 2;
        endPvPGame(pvpSession.id, myNum, 'disconnect', {
          player1: pvpSession.player1_score,
          player2: pvpSession.player2_score,
        }).catch(err => console.error('🎮 [PvP] Failed to end game on disconnect:', err));
      }
    }, 1000);

    return () => clearInterval(countdownInterval);
  }, [opponentDisconnected, pvpMatchLive, pvpSession?.status]);

  // ---- PvP Simulated opponent: trigger AI move when it's opponent's turn ----
  const simulatedMoveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastSimulatedTurnStartRef = useRef<string | null>(null);
  useEffect(() => {
    if (!pvpSession || !pvpSession.is_simulated || pvpSession.status !== 'active') return;
    if (!gameState || !puzzle || !user) return;

    const myNum = pvpSession.player1_id === user.id ? 1 : 2;
    const opponentNum = myNum === 1 ? 2 : 1;
    const opponentName = opponentNum === 1 ? pvpSession.player1_name : pvpSession.player2_name;
    const isOpponentTurn = pvpSession.current_turn === opponentNum;

    if (!isOpponentTurn) return;
    // Dedup: don't fire again for the same turn_started_at (prevents race condition re-triggers)
    const turnKey = `${pvpSession.current_turn}-${pvpSession.turn_started_at}`;
    if (lastSimulatedTurnStartRef.current === turnKey) return;
    lastSimulatedTurnStartRef.current = turnKey;

    // Dynamically import and run simulated move
    const runSimulatedMove = async () => {
      const { generateSimulatedMove } = await import('../pvp/simulatedOpponent');
      const containerCellKeys = puzzle.spec.targetCellKeys
        ? new Set(puzzle.spec.targetCellKeys)
        : new Set(puzzle.spec.targetCells?.map((c: any) => `${c.i},${c.j},${c.k}`) ?? []);
      const containerCells = puzzle.spec.targetCells ?? [];

      // Use local engine's board state (source of truth) instead of pvpSession
      const currentGS = gameStateRef.current;
      const localBoardPieces: PvPPlacedPiece[] = currentGS
        ? Array.from(currentGS.boardState.values()).map(p => ({
            uid: p.uid,
            pieceId: p.pieceId,
            orientationId: p.orientationId,
            cells: p.cells,
            placedAt: p.placedAt,
            placedBy: 1 as 1 | 2,
            source: 'manual' as const,
          }))
        : pvpSession.board_state || [];
      const localPlacedCount = currentGS?.placedCountByPieceId ?? pvpSession.placed_count ?? {};

      const result = await generateSimulatedMove(
        containerCellKeys,
        containerCells,
        localBoardPieces,
        pvpSession.inventory_state || {},
        localPlacedCount
      );

      simulatedMoveTimeoutRef.current = setTimeout(async () => {
        if (!pvpSession || pvpSession.status !== 'active') return;

        const turnStarted = pvpSession.turn_started_at
          ? new Date(pvpSession.turn_started_at).getTime()
          : Date.now();
        const timeSpent = Date.now() - turnStarted;
        const oppTimeRemaining = opponentNum === 1
          ? pvpSession.player1_time_remaining_ms
          : pvpSession.player2_time_remaining_ms;
        const newTimeRemaining = Math.max(0, oppTimeRemaining - timeSpent);

        if (result.type === 'place' && result.pieceId && result.cells) {
          const newPiece: PvPPlacedPiece = {
            uid: `pp-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
            pieceId: result.pieceId,
            orientationId: result.orientationId!,
            cells: result.cells,
            placedAt: Date.now(),
            placedBy: opponentNum as 1 | 2,
            source: 'manual',
          };
          const newBoardState = [...(pvpSession.board_state || []), newPiece];

          await submitMove({
            sessionId: pvpSession.id,
            playerNumber: opponentNum as 1 | 2,
            moveType: 'place',
            pieceId: result.pieceId,
            orientationId: result.orientationId,
            cells: result.cells,
            scoreDelta: 1,
            boardStateAfter: newBoardState,
            timeSpentMs: timeSpent,
            playerTimeRemainingMs: newTimeRemaining,
          });

          // Optimistically switch turn back to player
          const oppScoreUpdate = opponentNum === 1
            ? { player1_score: pvpSession.player1_score + 1 }
            : { player2_score: pvpSession.player2_score + 1 };
          const oppTimeUpdate = opponentNum === 1
            ? { player1_time_remaining_ms: newTimeRemaining }
            : { player2_time_remaining_ms: newTimeRemaining };

          setPvpSession(prev => prev ? {
            ...prev,
            current_turn: myNum as 1 | 2,
            ...oppScoreUpdate,
            ...oppTimeUpdate,
            board_state: newBoardState,
            turn_started_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          } : prev);

          // Also dispatch to local game engine so the board updates
          // Force-sync local engine to opponent's turn before dispatching
          const currentGameState = gameStateRef.current;
          if (currentGameState && currentGameState.players[1]) {
            dispatchEvent({ type: 'FORCE_ACTIVE_PLAYER', playerIndex: 1 });
            const opponentPlayerId = currentGameState.players[1].id;
            console.log('🎮 [PvP] Simulated opponent dispatching as player[1]:', currentGameState.players[1].name);
            dispatchEvent({
              type: 'TURN_PLACE_REQUESTED',
              playerId: opponentPlayerId,
              payload: {
                pieceId: result.pieceId,
                orientationId: result.orientationId!,
                cells: result.cells,
              },
            });
          }
        } else if (result.type === 'check') {
          // Opponent uses Check — run solvability check + full repair loop
          console.log('🔍 [PvP] Simulated opponent using Check...');
          showOpponentNotification(t('pvp.toast.usedCheck', { name: opponentName }));
          // Increment opponent checks used
          const checksKey = opponentNum === 1 ? 'player1_checks_used' : 'player2_checks_used';
          setPvpSession(prev => prev ? { ...prev, [checksKey]: (prev[checksKey] ?? 0) + 1 } : prev);
          dispatchEvent({ type: 'FORCE_ACTIVE_PLAYER', playerIndex: 1 });
          const currentGameState = gameStateRef.current;
          if (currentGameState) {
            const solvResult = await depsRef.current.solvabilityCheck(currentGameState);
            console.log('🔍 [PvP] Simulated opponent Check result:', solvResult.status);

            const oppTimeUpdate = opponentNum === 1
              ? { player1_time_remaining_ms: newTimeRemaining }
              : { player2_time_remaining_ms: newTimeRemaining };

            if (solvResult.status === 'unsolvable') {
              // Correct! Full repair loop until solvable, opponent keeps turn
              console.log('🔍 [PvP] Simulated opponent Check correct — repairing until solvable...');
              const removedCount = await runRepairLoop(currentGameState);
              console.log(`🔍 [PvP] Simulated opponent repair complete — removed ${removedCount} piece(s)`);

              const freshState = gameStateRef.current;
              await submitMove({
                sessionId: pvpSession.id,
                playerNumber: opponentNum as 1 | 2,
                moveType: 'check',
                scoreDelta: 0,
                boardStateAfter: freshState ? boardStateToPvPArray(freshState.boardState) : [],
                timeSpentMs: timeSpent,
                playerTimeRemainingMs: newTimeRemaining,
                keepTurn: true,
              });

              // Keep turn on opponent — don't switch
              setPvpSession(prev => prev ? {
                ...prev,
                ...oppTimeUpdate,
                turn_started_at: new Date().toISOString(),
              } : prev);
            } else {
              // Wrong — opponent loses turn
              console.log('🔍 [PvP] Simulated opponent Check wrong — losing turn');
              await submitMove({
                sessionId: pvpSession.id,
                playerNumber: opponentNum as 1 | 2,
                moveType: 'check',
                scoreDelta: 0,
                boardStateAfter: pvpSession.board_state || [],
                timeSpentMs: timeSpent,
                playerTimeRemainingMs: newTimeRemaining,
              });

              const opponentPlayerId = currentGameState.players[1]?.id;
              if (opponentPlayerId) dispatchEvent({ type: 'TURN_PASS_REQUESTED', playerId: opponentPlayerId });
              setPvpSession(prev => prev ? {
                ...prev,
                current_turn: myNum as 1 | 2,
                ...oppTimeUpdate,
                turn_started_at: new Date().toISOString(),
                updated_at: new Date().toISOString(),
              } : prev);
            }
          }
        } else if (result.type === 'hint') {
          // Opponent uses hint — trigger actual hint placement via game engine
          console.log('💡 [PvP] Simulated opponent using hint...');
          showOpponentNotification(t('pvp.toast.usedHint', { name: opponentName }));
          // Increment opponent hints used
          const hintsKey = opponentNum === 1 ? 'player1_hints_used' : 'player2_hints_used';
          setPvpSession(prev => prev ? { ...prev, [hintsKey]: (prev[hintsKey] ?? 0) + 1 } : prev);
          dispatchEvent({ type: 'FORCE_ACTIVE_PLAYER', playerIndex: 1 });
          const currentGameState = gameStateRef.current;
          if (currentGameState) {
            // Pick a random empty cell as anchor for the hint
            const occupiedKeys = new Set<string>();
            for (const p of currentGameState.boardState.values()) {
              for (const c of p.cells) occupiedKeys.add(cellToKey(c));
            }
            const emptyAnchors = Array.from(currentGameState.puzzleSpec.targetCellKeys)
              .filter(k => !occupiedKeys.has(k));

            if (emptyAnchors.length > 0) {
              const anchorKey = emptyAnchors[Math.floor(Math.random() * emptyAnchors.length)];
              const [ai, aj, ak] = anchorKey.split(',').map(Number);
              const anchor = { i: ai, j: aj, k: ak };

              const opponentPlayerId = currentGameState.players[1]?.id;
              if (opponentPlayerId) {
                dispatchEvent({
                  type: 'TURN_HINT_REQUESTED',
                  playerId: opponentPlayerId,
                  anchor,
                });
              }

              // The hint orchestration effect will handle the rest:
              // - solvability check + repair if needed
              // - hint placement
              // - PvP turn switch (via the hint result handler)
            } else {
              // No empty cells — just pass turn
              const oppTimeUpdate = opponentNum === 1
                ? { player1_time_remaining_ms: newTimeRemaining }
                : { player2_time_remaining_ms: newTimeRemaining };
              setPvpSession(prev => prev ? {
                ...prev,
                current_turn: myNum as 1 | 2,
                ...oppTimeUpdate,
                turn_started_at: new Date().toISOString(),
                updated_at: new Date().toISOString(),
              } : prev);
            }
          }
        } else {
          // Pass — just advance turn
          const oppTimeUpdate = opponentNum === 1
            ? { player1_time_remaining_ms: newTimeRemaining }
            : { player2_time_remaining_ms: newTimeRemaining };
          setPvpSession(prev => prev ? {
            ...prev,
            current_turn: myNum as 1 | 2,
            ...oppTimeUpdate,
            turn_started_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          } : prev);
        }
      }, result.thinkingDelayMs);
    };

    runSimulatedMove().catch(err => console.error('🎮 [PvP] Simulated move error:', err));

    return () => {
      if (simulatedMoveTimeoutRef.current) clearTimeout(simulatedMoveTimeoutRef.current);
    };
  }, [pvpSession?.current_turn, pvpSession?.status, pvpSession?.is_simulated, pvpSession?.turn_started_at, !!gameState]);

  // Helper: convert local boardState Map to PvP board state array.
  // Engine seating is viewer-relative: player-0 is always me, player-1 the
  // opponent — map each piece's placer to the right session player number so
  // snapshots stay truthful now that remote moves land on the local board.
  const boardStateToPvPArray = useCallback((boardState: Map<string, any>): PvPPlacedPiece[] => {
    const myNum = (pvpSession?.player1_id === user?.id ? 1 : 2) as 1 | 2;
    const oppNum = (myNum === 1 ? 2 : 1) as 1 | 2;
    return Array.from(boardState.values()).map(p => ({
      uid: p.uid,
      pieceId: p.pieceId,
      orientationId: p.orientationId,
      cells: p.cells,
      placedAt: p.placedAt,
      placedBy: p.placedBy === 'player-1' ? oppNum : myNum,
      source: p.source === 'ai' ? 'hint' as const : 'manual' as const,
    }));
  }, [pvpSession?.player1_id, user?.id]);

  // Dispatch helper that updates state
  const dispatchEvent = useCallback((event: Parameters<typeof dispatch>[1]) => {
    setGameState(prev => {
      if (!prev) return prev;
      const newState = dispatch(prev, event);
      // Skip noisy timer tick logs
      if (event.type !== 'TIMER_TICK') {
        console.log('🎮 Dispatch:', event.type);
      }
      return newState;
    });
  }, []);

  // Action handlers
  
  // Enter anchor-picking mode for hint, or use drawn cell if exactly 1 cell drawn
  const handleEnterHintMode = useCallback(() => {
    if (!gameState) return;
    if (gameState.phase !== 'in_turn' || gameState.subphase === 'repairing') return;

    const activePlayer = getActivePlayer(gameState);
    if (activePlayer.type !== 'human') return;

    // If exactly 1 cell is drawn, use it as anchor and trigger hint immediately
    if (drawingCells.length === 1) {
      const anchor = drawingCells[0];
      dispatchEvent({
        type: 'TURN_HINT_REQUESTED',
        playerId: activePlayer.id,
        anchor,
      });
      // Increment PvP hint counter (simulated matches only — real PvP
      // consumes at successful placement inside the hint flow, so a
      // no_suggestion result never burns a hint).
      if (pvpSession && pvpSession.is_simulated && user) {
        const myNum = pvpSession.player1_id === user.id ? 1 : 2;
        setPvpSession(prev => prev ? {
          ...prev,
          ...(myNum === 1
            ? { player1_hints_used: (prev.player1_hints_used || 0) + 1 }
            : { player2_hints_used: (prev.player2_hints_used || 0) + 1 }),
        } : prev);
      }
      return;
    }
    
    // Otherwise, enter anchor-picking mode
    setInteractionMode('pickingAnchor');
    setPendingAnchor(null);
    setSelectedPieceUid(null); // Clear piece selection when entering hint mode
  }, [gameState, drawingCells, dispatchEvent]);

  // Tutorial "watch one" demo: place a correct piece via the hint engine so
  // the newcomer SEES the gesture's result before trying it (lesson 1 only,
  // while the board is still empty).
  const handleWatchDemo = useCallback(() => {
    if (!gameState || !puzzle) return;
    if (gameState.phase !== 'in_turn' || gameState.subphase === 'repairing') return;
    const active = getActivePlayer(gameState);
    if (active.type !== 'human') return;
    const cellKeyAny = (c: any) =>
      Array.isArray(c) ? `${c[0]},${c[1]},${c[2]}` : `${c.i},${c.j},${c.k}`;
    const covered = new Set<string>();
    gameState.boardState.forEach((p: any) => p.cells?.forEach((c: any) => covered.add(cellKeyAny(c))));
    const target = (puzzle.spec as any)?.targetCells?.find((c: any) => !covered.has(cellKeyAny(c)));
    if (!target) return;
    dispatchEvent({ type: 'TURN_HINT_REQUESTED', playerId: active.id, anchor: target });
    track('tutorial_demo_watched', { step: tutorialStep });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gameState, puzzle, dispatchEvent, tutorialStep]);
  
  // Handle anchor selected from 3D board (Phase 3A-4)
  const handleAnchorSelected = useCallback((anchor: Anchor) => {
    if (interactionMode !== 'pickingAnchor') return;
    setPendingAnchor(anchor);
    setSelectedPieceUid(null); // Clear piece selection when anchor is picked
    console.log('🧭 [GamePage] Anchor selected:', anchor);
  }, [interactionMode]);
  
  // Confirm hint with selected anchor (Phase 3A-4)
  const handleConfirmHint = useCallback(() => {
    if (!gameState || !pendingAnchor) return;
    if (interactionMode !== 'pickingAnchor') return;
    
    const activePlayer = getActivePlayer(gameState);
    console.log('🧭 [GamePage] Confirming hint at anchor:', pendingAnchor);
    
    dispatchEvent({
      type: 'TURN_HINT_REQUESTED',
      playerId: activePlayer.id,
      anchor: pendingAnchor,
    });
    // Increment PvP hint counter (simulated matches only — real PvP
    // consumes at successful placement inside the hint flow, so a
    // no_suggestion result never burns a hint).
    if (pvpSession && pvpSession.is_simulated && user) {
      const myNum = pvpSession.player1_id === user.id ? 1 : 2;
      setPvpSession(prev => prev ? {
        ...prev,
        ...(myNum === 1
          ? { player1_hints_used: (prev.player1_hints_used || 0) + 1 }
          : { player2_hints_used: (prev.player2_hints_used || 0) + 1 }),
      } : prev);
    }
    
    setInteractionMode('none');
    setPendingAnchor(null);
  }, [gameState, pendingAnchor, interactionMode, dispatchEvent, pvpSession, user]);
  
  // Cancel anchor picking mode
  const handleCancelHintMode = useCallback(() => {
    setInteractionMode('none');
    setPendingAnchor(null);
  }, []);
  
  // Handle placement commit from GameBoard3D (Phase 3A-3)
  const handlePlacementCommitted = useCallback((placement: PlacementInfo) => {
    if (!gameState) return;
    
    // Guards: only allow placement when it's the player's turn and not busy
    const activePlayer = getActivePlayer(gameState);
    
    // PvP mode: use PvP turn state instead of local engine's active player
    if (pvpSession && pvpSession.status === 'active' && user) {
      const myNum = pvpSession.player1_id === user.id ? 1 : 2;
      if (pvpSession.current_turn !== myNum) {
        console.log('🎮 [GamePage] Ignoring placement - not my PvP turn');
        return;
      }
    } else if (activePlayer.type !== 'human') {
      console.log('🎮 [GamePage] Ignoring placement - not human turn');
      return;
    }
    
    if (gameState.phase !== 'in_turn' || gameState.subphase === 'repairing') {
      console.log('🎮 [GamePage] Ignoring placement - busy/ended');
      return;
    }
    
    console.log('🎮 [GamePage] Placement committed:', placement.pieceId);
    
    // PvP: force-sync local engine to player[0] (human) before dispatching
    if (pvpSession) {
      dispatchEvent({ type: 'FORCE_ACTIVE_PLAYER', playerIndex: 0 });
    }

    // Check inventory BEFORE dispatching — if piece is unavailable, don't lose turn
    const inventoryCheck = checkInventory(gameState, placement.pieceId);
    if (!inventoryCheck.ok) {
      console.log('🎮 [GamePage] Inventory check failed:', inventoryCheck.reason);
      const invMsg =
        inventoryCheck.reasonCode === 'not_in_set'
          ? t('game.pieceNotInSet', { piece: placement.pieceId })
          : inventoryCheck.reasonCode === 'limit_reached'
            ? t('game.pieceLimitReached', { piece: placement.pieceId })
            : inventoryCheck.reasonCode === 'already_placed'
              ? t('game.pieceAlreadyPlaced', { piece: placement.pieceId })
              : inventoryCheck.reason || 'Piece not available';
      setPlacementError(invMsg);
      setTimeout(() => setPlacementError(null), 3000);
      return; // Don't dispatch, don't submit to PvP — let player try another piece
    }

    // Dispatch TURN_PLACE_REQUESTED to local game engine
    // In PvP, always dispatch as the current active player in the local engine
    dispatchEvent({
      type: 'TURN_PLACE_REQUESTED',
      playerId: activePlayer.id,
      payload: placement,
    });
    
    // PvP: also submit move to backend
    if (pvpSession && pvpSession.status === 'active' && user) {
      const myNum = (pvpSession.player1_id === user.id ? 1 : 2) as 1 | 2;
      const turnStarted = pvpSession.turn_started_at
        ? new Date(pvpSession.turn_started_at).getTime()
        : Date.now();
      const timeSpent = Date.now() - turnStarted;
      const currentTimeRemaining = myNum === 1
        ? pvpSession.player1_time_remaining_ms
        : pvpSession.player2_time_remaining_ms;
      const newTimeRemaining = Math.max(0, currentTimeRemaining - timeSpent);

      // Build updated board state after this placement
      const newBoardState = boardStateToPvPArray(gameState.boardState);
      // Add the new piece
      newBoardState.push({
        uid: `pp-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        pieceId: placement.pieceId,
        orientationId: placement.orientationId,
        cells: placement.cells,
        placedAt: Date.now(),
        placedBy: myNum,
        source: 'manual',
      });

      // Optimistically update local PvP session state (don't wait for realtime)
      const nextTurn = (myNum === 1 ? 2 : 1) as 1 | 2;
      const scoreUpdate = myNum === 1
        ? { player1_score: pvpSession.player1_score + 1 }
        : { player2_score: pvpSession.player2_score + 1 };
      const timeUpdate = myNum === 1
        ? { player1_time_remaining_ms: newTimeRemaining }
        : { player2_time_remaining_ms: newTimeRemaining };

      setPvpSession(prev => prev ? {
        ...prev,
        current_turn: nextTurn,
        ...scoreUpdate,
        ...timeUpdate,
        board_state: newBoardState,
        turn_started_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      } : prev);

      submitMove({
        sessionId: pvpSession.id,
        playerNumber: myNum,
        moveType: 'place',
        pieceId: placement.pieceId,
        orientationId: placement.orientationId,
        cells: placement.cells,
        scoreDelta: 1,
        boardStateAfter: newBoardState,
        timeSpentMs: timeSpent,
        playerTimeRemainingMs: newTimeRemaining,
      }).catch(err => console.error('🎮 [PvP] Failed to submit move:', err));
    }
    
    // Exit placing mode
    setInteractionMode('none');
    setPlacementError(null);
  }, [gameState, dispatchEvent, pvpSession, user, boardStateToPvPArray]);
  
  // Handle placement rejection from GameBoard3D
  const handlePlacementRejected = useCallback((reason: string) => {
    setPlacementError(reason);
    // Clear error after 3 seconds
    setTimeout(() => setPlacementError(null), 3000);
  }, []);
  
  // Toggle placing mode
  const handleTogglePlacing = useCallback(() => {
    if (!gameState) return;
    
    // Guards
    const activePlayer = getActivePlayer(gameState);
    if (activePlayer.type !== 'human') return;
    if (gameState.phase !== 'in_turn' || gameState.subphase === 'repairing') return;
    
    setInteractionMode(prev => prev === 'placing' ? 'none' : 'placing');
    setPlacementError(null);
  }, [gameState]);
  
  // Cancel interaction (from board background click)
  const handleCancelInteraction = useCallback(() => {
    setInteractionMode('none');
    setPlacementError(null);
    setPendingAnchor(null);
    setSelectedPieceUid(null); // Clear piece selection on cancel
  }, []);

  const handlePassClick = useCallback(() => {
    if (!gameState) return;
    const activePlayer = getActivePlayer(gameState);
    dispatchEvent({ type: 'TURN_PASS_REQUESTED', playerId: activePlayer.id });

    // PvP: switch turn to opponent on pass
    if (pvpSession && pvpSession.status === 'active' && user) {
      const myNum = pvpSession.player1_id === user.id ? 1 : 2;
      const hintsLeft = pvpSession.hint_limit === 0 ? Infinity :
        pvpSession.hint_limit - (myNum === 1 ? pvpSession.player1_hints_used : pvpSession.player2_hints_used);
      const checksLeft = pvpSession.check_limit === 0 ? Infinity :
        pvpSession.check_limit - (myNum === 1 ? pvpSession.player1_checks_used : pvpSession.player2_checks_used);

      if (hintsLeft <= 0 && checksLeft <= 0) {
        // No hints, no checks, and player passed (no valid moves) → end game
        console.log('🏁 [PvP] Player passed with no hints/checks remaining — ending game');
        const scores = gameState.players.map(p => p.score);
        const winner = scores[0] > scores[1] ? 1 : scores[1] > scores[0] ? 2 : null;
        setPvpSession(prev => prev ? {
          ...prev,
          status: 'completed' as const,
          winner: winner as 1 | 2 | null,
          end_reason: 'stalled' as const,
          ended_at: new Date().toISOString(),
        } : prev);
        dispatchEvent({
          type: 'GAME_END',
          reason: 'stalled',
          scores: Object.fromEntries(gameState.players.map(p => [p.id, p.score])),
        });
        endPvPGame(pvpSession.id, winner as 1 | 2 | null, 'stalled', scores[0], scores[1])
          .catch(err => console.error('🏁 [PvP] Failed to end game:', err));
      } else {
        // Normal pass — switch PvP turn to opponent
        const nextTurn = (myNum === 1 ? 2 : 1) as 1 | 2;
        const turnStarted = pvpSession.turn_started_at
          ? new Date(pvpSession.turn_started_at).getTime()
          : Date.now();
        const timeSpent = Date.now() - turnStarted;
        const currentTimeRemaining = myNum === 1
          ? pvpSession.player1_time_remaining_ms
          : pvpSession.player2_time_remaining_ms;
        const newTimeRemaining = Math.max(0, currentTimeRemaining - timeSpent);
        const timeUpdate = myNum === 1
          ? { player1_time_remaining_ms: newTimeRemaining }
          : { player2_time_remaining_ms: newTimeRemaining };

        setPvpSession(prev => prev ? {
          ...prev,
          current_turn: nextTurn,
          ...timeUpdate,
          turn_started_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        } : prev);

        submitMove({
          sessionId: pvpSession.id,
          playerNumber: myNum as 1 | 2,
          moveType: 'pass',
          scoreDelta: 0,
          boardStateAfter: pvpSession.board_state || [],
          timeSpentMs: timeSpent,
          playerTimeRemainingMs: newTimeRemaining,
        }).catch(err => console.error('🎮 [PvP] Failed to submit pass:', err));
      }
    }
  }, [gameState, dispatchEvent, pvpSession, user]);

  // Handle drawing cells change - also clear piece selection
  const handleDrawingCellsChange = useCallback((cells: Anchor[]) => {
    setDrawingCells(cells);
    if (cells.length > 0) {
      setSelectedPieceUid(null); // Clear piece selection when user clicks a cell
    }
  }, []);

  // Handle piece removal (Quick Play mode)
  const handleRemovePiece = useCallback(() => {
    if (!gameState || !selectedPieceUid) return;
    const activePlayer = getActivePlayer(gameState);
    dispatchEvent({ type: 'TURN_REMOVE_REQUESTED', playerId: activePlayer.id, pieceUid: selectedPieceUid });
    setSelectedPieceUid(null); // Clear selection after removal
  }, [gameState, selectedPieceUid, dispatchEvent]);

  // PvP Check: run solvability check, if unsolvable remove pieces until solvable.
  // Accounts for remaining piece inventory. Checker keeps turn if correct, loses turn if wrong.
  const runRepairLoop = useCallback(async (currentState: GameState): Promise<number> => {
    // Remove pieces newest-first, re-check solvability after each, stop when solvable.
    // Uses REPAIR_REMOVE_PIECE which bypasses allowRemoval guard and scores -1 to the placer.
    // Returns number of pieces removed.
    let state = currentState;
    let removed = 0;
    const MAX_REMOVALS = 15; // Safety limit

    while (removed < MAX_REMOVALS && state.boardState.size > 0) {
      // Get newest piece
      const pieces = Array.from(state.boardState.entries())
        .sort((a, b) => b[1].placedAt - a[1].placedAt);
      const [uid, piece] = pieces[0];

      // Force-remove via REPAIR_REMOVE_PIECE (bypasses allowRemoval)
      console.log(`🔧 [Repair] Removing piece ${piece.pieceId} (${removed + 1})...`);
      dispatchEvent({
        type: 'REPAIR_REMOVE_PIECE',
        pieceUid: uid,
      });
      removed++;

      // Wait a tick for state to update, then get fresh state from ref
      await new Promise(r => setTimeout(r, 150));
      const freshState = gameStateRef.current;
      if (!freshState || freshState.boardState.size === 0) break;
      state = freshState;

      // Check solvability with updated state (accounts for remaining inventory)
      const result = await depsRef.current.solvabilityCheck(state);
      console.log(`🔧 [Repair] After removing ${removed} piece(s): ${result.status}`);
      if (result.status !== 'unsolvable') {
        break; // Solvable again
      }
    }
    return removed;
  }, [dispatchEvent]);

  // PvP Check: run solvability check on current board
  // If solvable → lose turn (false accusation). If unsolvable → repair loop + keep turn.
  const handleCheck = useCallback(async () => {
    if (!gameState || !pvpSession || !user) return;
    if (gameState.phase !== 'in_turn') return;
    if (checkInProgress) return;
    if (gameState.boardState.size === 0) return; // Nothing to check

    const myNum = pvpSession.player1_id === user.id ? 1 : 2;
    if (pvpSession.current_turn !== myNum) return; // Not my turn

    setCheckInProgress(true);
    console.log('🔍 [PvP Check] Running solvability check...');

    try {
      const solvResult = await depsRef.current.solvabilityCheck(gameState);
      console.log('🔍 [PvP Check] Result:', solvResult.status);

      const turnStarted = pvpSession.turn_started_at
        ? new Date(pvpSession.turn_started_at).getTime()
        : Date.now();
      const timeSpent = Date.now() - turnStarted;
      const currentTimeRemaining = myNum === 1
        ? pvpSession.player1_time_remaining_ms
        : pvpSession.player2_time_remaining_ms;
      const newTimeRemaining = Math.max(0, currentTimeRemaining - timeSpent);

      if (solvResult.status === 'unsolvable') {
        // Correct! Puzzle is broken → repair loop until solvable, keep turn
        console.log('🔍 [PvP Check] Puzzle IS unsolvable — repairing until solvable...');
        const removedCount = await runRepairLoop(gameState);
        console.log(`🔍 [PvP Check] Repair complete — removed ${removedCount} piece(s)`);

        // Submit check move to backend. Repair removed scored pieces, so the
        // session row gets the engine's ABSOLUTE scores (incremental deltas
        // would never learn about the -1s).
        const freshBoardState = gameStateRef.current;
        const scoreSource = freshBoardState ?? gameState;
        const myScore = scoreSource.players[0]?.score ?? 0;
        const oppScore = scoreSource.players[1]?.score ?? 0;
        submitMove({
          sessionId: pvpSession.id,
          playerNumber: myNum as 1 | 2,
          moveType: 'check',
          scoreDelta: 0,
          boardStateAfter: freshBoardState ? boardStateToPvPArray(freshBoardState.boardState) : [],
          timeSpentMs: timeSpent,
          playerTimeRemainingMs: newTimeRemaining,
          absoluteScores: myNum === 1
            ? { player1: myScore, player2: oppScore }
            : { player1: oppScore, player2: myScore },
          // Correct check keeps the turn — the session row must agree with
          // the local state below (which doesn't flip current_turn).
          keepTurn: true,
        }).catch(err => console.error('🔍 [PvP Check] Failed to submit:', err));

        // Update time remaining optimistically (but keep turn)
        const timeUpdate = myNum === 1
          ? { player1_time_remaining_ms: newTimeRemaining }
          : { player2_time_remaining_ms: newTimeRemaining };
        // Legit check — do NOT consume a check (puzzle was indeed unsolvable)
        setPvpSession(prev => prev ? {
          ...prev,
          ...timeUpdate,
          turn_started_at: new Date().toISOString(),
        } : prev);
      } else {
        // Wrong! Puzzle is solvable → lose turn as penalty
        console.log('🔍 [PvP Check] Puzzle IS solvable — losing turn as penalty');
        const activePlayer = getActivePlayer(gameState);
        dispatchEvent({ type: 'TURN_PASS_REQUESTED', playerId: activePlayer.id });

        // Advance PvP turn
        const nextTurn = (myNum === 1 ? 2 : 1) as 1 | 2;

        submitMove({
          sessionId: pvpSession.id,
          playerNumber: myNum as 1 | 2,
          moveType: 'check',
          scoreDelta: 0,
          boardStateAfter: pvpSession.board_state || [],
          timeSpentMs: timeSpent,
          playerTimeRemainingMs: newTimeRemaining,
          // Board unchanged on a wrong check, but writing the engine's
          // absolute scores keeps the session row self-correcting.
          absoluteScores: myNum === 1
            ? { player1: gameState.players[0]?.score ?? 0, player2: gameState.players[1]?.score ?? 0 }
            : { player1: gameState.players[1]?.score ?? 0, player2: gameState.players[0]?.score ?? 0 },
          // Wrong check consumes one — persist the counter with the turn
          // flip (real matches; simulated stay local-only). A correct check
          // is free by design and never consumes.
          consumeCheck: !pvpSession.is_simulated,
        }).catch(err => console.error('🔍 [PvP Check] Failed to submit:', err));

        const timeUpdate = myNum === 1
          ? { player1_time_remaining_ms: newTimeRemaining }
          : { player2_time_remaining_ms: newTimeRemaining };
        const checkIncrement2 = myNum === 1
          ? { player1_checks_used: (pvpSession.player1_checks_used || 0) + 1 }
          : { player2_checks_used: (pvpSession.player2_checks_used || 0) + 1 };
        setPvpSession(prev => prev ? {
          ...prev,
          current_turn: nextTurn,
          ...timeUpdate,
          ...checkIncrement2,
          turn_started_at: new Date().toISOString(),
        } : prev);
      }
    } catch (err) {
      console.error('🔍 [PvP Check] Error:', err);
    } finally {
      setCheckInProgress(false);
    }
  }, [gameState, pvpSession, user, checkInProgress, dispatchEvent, runRepairLoop, boardStateToPvPArray]);

  // Hint orchestration effect - handle async solvability check + hint generation
  // This runs when phase === 'resolving' and pendingHint is set
  useEffect(() => {
    if (!gameState) return;
    if (gameState.phase !== 'resolving') return;
    if (!gameState.pendingHint) return;
    if (gameState.subphase === 'repairing') return; // Wait for repair to complete
    
    const { playerId, anchor } = gameState.pendingHint;

    // Real (non-simulated) live PvP: hint repairs ARE allowed again (owner
    // decision 2026-07-22, reversing Phase 1's skip-repair gate) — a hint on
    // an unsolvable board behaves like solo: repair (LIFO removals) until
    // solvable, then place. What makes it SAFE now is that the resulting
    // `hint` move row carries the POST-repair + post-placement board and
    // absolute scores, and applyPvPMoveToState reconciles the opponent's
    // full board from that snapshot — nothing is local-only anymore. The
    // flag still gates the counter-consumption semantics below.
    const realPvPLive =
      !!pvpSession && pvpSession.status === 'active' && !pvpSession.is_simulated;

    // Run async hint flow
    const runHintFlow = async () => {
      console.log('💡 [GamePage] Running hint flow for anchor:', anchor);

      try {
        {
          // Step 1: Solvability check (all modes — solo, vs-computer, PvP)
          const solvResult = await depsRef.current.solvabilityCheck(gameState);
          console.log('💡 [GamePage] Solvability result:', solvResult);

          // Step 2: If unsolvable, start repair (will re-enter this effect after repair)
          if (solvResult.status === 'unsolvable') {
            console.log('� [REPAIR TRIGGERED] Puzzle declared unsolvable!', {
              definiteFailure: solvResult.definiteFailure,
              solutionCount: solvResult.solutionCount,
              reason: solvResult.reason,
              computeTimeMs: solvResult.computeTimeMs,
              boardStatePieces: gameState.boardState.size,
              emptyCount: gameState.puzzleSpec.targetCellKeys.size -
                Array.from(gameState.boardState.values()).reduce((sum, p) => sum + p.cells.length, 0),
            });
            console.log('🔧 [REPAIR] Placed pieces:', Array.from(gameState.boardState.values()).map(p => p.pieceId));
            dispatchEvent({
              type: 'START_REPAIR',
              reason: 'hint',
              triggeredBy: playerId
            });
            return; // Repair will run, then this effect re-triggers
          }
        }

        // Step 3: Generate hint (puzzle is solvable or unknown)
        console.log('💡 [GamePage] Generating hint...');
        let hintSuggestion = await depsRef.current.generateHint(gameState, anchor);

        // The tapped cell may simply be the wrong spot — a hint should never
        // fail while the puzzle is continuable. Fan out to nearby anchors.
        if (!hintSuggestion) {
          const occupied = new Set<string>();
          for (const piece of gameState.boardState.values()) {
            for (const cell of piece.cells) occupied.add(`${cell.i},${cell.j},${cell.k}`);
          }
          const empties = (puzzle?.spec?.targetCells ?? []).filter(
            (c: any) =>
              !occupied.has(`${c.i},${c.j},${c.k}`) &&
              !(c.i === anchor.i && c.j === anchor.j && c.k === anchor.k)
          );
          const d2 = (c: any) => {
            const di = c.i - anchor.i, dj = c.j - anchor.j, dk = c.k - anchor.k;
            // squared distance in the standard embedding
            const dx = 0.5 * (di + dj), dy = 0.5 * (di + dk), dz = 0.5 * (dj + dk);
            return dx * dx + dy * dy + dz * dz;
          };
          const ranked = [...empties].sort((a, b) => d2(a) - d2(b));
          const MAX_FALLBACK_ANCHORS = 16;
          for (const alt of ranked.slice(0, MAX_FALLBACK_ANCHORS)) {
            hintSuggestion = await depsRef.current.generateHint(gameState, alt);
            if (hintSuggestion) {
              console.log('💡 [GamePage] Fallback anchor produced a hint:', alt);
              break;
            }
          }
        }

        if (hintSuggestion) {
          dispatchEvent({
            type: 'TURN_HINT_RESULT',
            playerId,
            result: { status: 'suggestion', suggestion: hintSuggestion },
          });

          // PvP: switch turn after hint placement (hint = 0 points, counts as turn)
          // Use current_turn (not hardcoded myNum) so this works for both human and simulated hints
          if (pvpSession && pvpSession.status === 'active' && user) {
            const hintPlayerNum = pvpSession.current_turn; // whoever just used the hint
            const nextTurn = (hintPlayerNum === 1 ? 2 : 1) as 1 | 2;
            const turnStarted = pvpSession.turn_started_at
              ? new Date(pvpSession.turn_started_at).getTime()
              : Date.now();
            const timeSpent = Date.now() - turnStarted;
            const currentTimeRemaining = hintPlayerNum === 1
              ? pvpSession.player1_time_remaining_ms
              : pvpSession.player2_time_remaining_ms;
            const newTimeRemaining = Math.max(0, currentTimeRemaining - timeSpent);
            const timeUpdate = hintPlayerNum === 1
              ? { player1_time_remaining_ms: newTimeRemaining }
              : { player2_time_remaining_ms: newTimeRemaining };

            // Real PvP consumes the hint HERE, at successful placement —
            // never at request time (a no_suggestion result must not burn a
            // hint). Simulated matches keep their request-time increments.
            const hintCounterUpdate = realPvPLive
              ? (hintPlayerNum === 1
                  ? { player1_hints_used: (pvpSession.player1_hints_used || 0) + 1 }
                  : { player2_hints_used: (pvpSession.player2_hints_used || 0) + 1 })
              : {};

            setPvpSession(prev => prev ? {
              ...prev,
              current_turn: nextTurn,
              ...timeUpdate,
              ...hintCounterUpdate,
              turn_started_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            } : prev);

            // Submit hint move to backend (best-effort). The move must carry
            // the POST-repair + post-placement board (a hint that triggered
            // repair removed pieces first!) plus ABSOLUTE scores, because
            // repair's -1s make incremental session-row score math drift.
            // `gameState` here is a pre-placement closure — read the fresh
            // engine state via the ref after the placement dispatch settles.
            try {
              const { submitMove } = await import('../pvp/pvpApi');
              await new Promise((r) => setTimeout(r, 150));
              const freshState = gameStateRef.current;
              const placementLanded =
                !!freshState &&
                freshState.boardState.size === gameState.boardState.size + 1;
              const hintPlaced: PvPPlacedPiece = {
                uid: `pp-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
                pieceId: hintSuggestion.pieceId,
                orientationId: hintSuggestion.placement.orientationId,
                cells: hintSuggestion.placement.cells,
                placedAt: Date.now(),
                placedBy: hintPlayerNum as 1 | 2,
                source: 'hint',
              };
              const boardStateAfter = placementLanded
                ? boardStateToPvPArray(freshState!.boardState)
                : [...boardStateToPvPArray(gameState.boardState), hintPlaced];
              // Local engine seats the viewer at index 0 — map back to the
              // session's player1/player2 via my player number.
              const myNum = (pvpSession.player1_id === user.id ? 1 : 2) as 1 | 2;
              const scoreSource = freshState ?? gameState;
              const myScore = scoreSource.players[0]?.score ?? 0;
              const oppScore = scoreSource.players[1]?.score ?? 0;
              const absoluteScores = myNum === 1
                ? { player1: myScore, player2: oppScore }
                : { player1: oppScore, player2: myScore };
              await submitMove({
                sessionId: pvpSession.id,
                playerNumber: hintPlayerNum as 1 | 2,
                moveType: 'hint',
                pieceId: hintSuggestion.pieceId,
                orientationId: hintSuggestion.placement.orientationId,
                cells: hintSuggestion.placement.cells,
                scoreDelta: 0,
                boardStateAfter,
                timeSpentMs: timeSpent,
                playerTimeRemainingMs: newTimeRemaining,
                // Repair removals change BOTH players' totals — overwrite the
                // session row with the engine's absolute scores.
                absoluteScores,
                // Persist the hints-used counter in the same session UPDATE
                // (real matches only) so reloads can't refresh the allowance
                // and the opponent's HUD sees the true count. A hint that
                // triggered repair and then placed IS a successful hint —
                // it consumes.
                consumeHint: realPvPLive,
              });
            } catch (err) {
              console.warn('💡 [Hint] Backend move submit failed:', err);
            }
          }
        } else {
          dispatchEvent({
            type: 'TURN_HINT_RESULT',
            playerId,
            result: { status: 'no_suggestion' },
          });
        }
      } catch (err) {
        console.error('❌ [GamePage] Hint flow failed:', err);
        dispatchEvent({
          type: 'TURN_HINT_RESULT',
          playerId,
          result: { status: 'error', message: String(err) },
        });
      }
    };
    
    runHintFlow();
  }, [gameState?.phase, gameState?.pendingHint, gameState?.subphase, dispatchEvent]);

  // Repair playback effect - auto-step through repair steps (Phase 3A-5: glow before remove)
  useEffect(() => {
    if (!gameState) return;
    if (gameState.subphase !== 'repairing') return;
    if (!gameState.repair) return;
    
    const { repair } = gameState;
    const currentStep = repair.steps[repair.index];
    
    console.log('🔧 [REPAIR STEP]', {
      index: repair.index,
      totalSteps: repair.steps.length,
      currentStep: currentStep,
      reason: repair.reason,
    });
    
    // Phase 3A-5: For REMOVE_PIECE steps, highlight the piece BEFORE removal
    if (currentStep?.type === 'REMOVE_PIECE' && currentStep.pieceInstanceId) {
      // Set highlight immediately
      setHighlightPieceId(currentStep.pieceInstanceId);
      
      // Wait for glow animation (400ms), then dispatch removal
      const timeout = setTimeout(() => {
        dispatchEvent({ type: 'REPAIR_STEP' });
      }, 500); // 500ms to see glow before removal
      
      return () => clearTimeout(timeout);
    }
    
    // For other steps (ADD_PIECE), proceed normally
    const timeout = setTimeout(() => {
      dispatchEvent({ type: 'REPAIR_STEP' });
    }, 600); // 600ms between steps for visibility
    
    return () => clearTimeout(timeout);
  }, [gameState?.subphase, gameState?.repair?.index, dispatchEvent]);

  // AI turn simulation - finds and places a piece
  useEffect(() => {
    if (!gameState || gameState.phase !== 'in_turn') return;
    if (gameState.subphase === 'repairing') return; // Don't act during repair
    
    const activePlayer = getActivePlayer(gameState);
    if (activePlayer.type !== 'ai') return;
    
    console.log('🤖 [GamePage] AI turn started, thinking...');
    
    let cancelled = false;
    
    const runAiTurn = async () => {
      // Simulate thinking delay
      await new Promise(resolve => setTimeout(resolve, 1000));
      if (cancelled) return;
      
      // Find an empty cell to use as anchor
      const occupiedKeys = new Set<string>();
      for (const piece of gameState.boardState.values()) {
        for (const cell of piece.cells) {
          occupiedKeys.add(`${cell.i},${cell.j},${cell.k}`);
        }
      }
      
      // Find first empty cell in puzzle
      let anchor: { i: number; j: number; k: number } | null = null;
      for (const key of gameState.puzzleSpec.targetCellKeys) {
        if (!occupiedKeys.has(key)) {
          const [i, j, k] = key.split(',').map(Number);
          anchor = { i, j, k };
          break;
        }
      }
      
      if (!anchor) {
        console.log('🤖 [GamePage] AI: No empty cells, passing');
        dispatchEvent({ type: 'TURN_PASS_REQUESTED', playerId: activePlayer.id });
        return;
      }
      
      // Use generateHint to find a valid placement at this anchor
      console.log('🤖 [GamePage] AI: Finding piece for anchor', anchor);
      const hint = await depsRef.current.generateHint(gameState, anchor);
      
      if (cancelled) return;
      
      if (hint) {
        console.log('🤖 [GamePage] AI: Placing piece', hint.pieceId);
        dispatchEvent({
          type: 'TURN_PLACE_REQUESTED',
          playerId: activePlayer.id,
          payload: {
            pieceId: hint.placement.pieceId,
            orientationId: hint.placement.orientationId,
            cells: hint.placement.cells,
          },
        });
      } else {
        console.log('🤖 [GamePage] AI: No valid placement found, passing');
        dispatchEvent({ type: 'TURN_PASS_REQUESTED', playerId: activePlayer.id });
      }
    };
    
    runAiTurn();
    
    return () => { cancelled = true; };
  }, [
    gameState?.phase,
    gameState?.subphase,
    gameState?.activePlayerIndex,
    dispatchEvent,
  ]);

  // Puzzle completion check effect (Phase 2C)
  // Check after every turn advance if puzzle is complete
  useEffect(() => {
    if (!gameState) return;
    if (gameState.phase === 'ended') return; // Already ended
    if (gameState.phase !== 'in_turn') return; // Only check during normal play
    if (gameState.subphase === 'repairing') return; // Don't check during repair
    
    // Check if puzzle is complete
    const isComplete = depsRef.current.isPuzzleComplete(gameState);
    if (isComplete) {
      console.log('🏁 [GamePage] Puzzle complete! Ending game...');
      dispatchEvent({ type: 'GAME_END', reason: 'completed' });
    }
  }, [gameState?.phase, gameState?.subphase, gameState?.boardState.size, dispatchEvent]);

  // Auto-save solution when game ends with 'completed' reason
  const hasSavedSolutionRef = useRef(false);
  useEffect(() => {
    if (!gameState) return;
    if (gameState.phase !== 'ended') {
      hasSavedSolutionRef.current = false; // Reset for new games
      return;
    }
    if (gameState.endState?.reason !== 'completed') return; // Only save completed puzzles
    if (hasSavedSolutionRef.current) return; // Already saved
    // Saving requires an account. Guests play freely and see their result; the
    // end modal nudges them to sign in (and their solve is claimed on sign-in,
    // see AuthContext). No anonymous solves on the leaderboard.
    if (!authUser) {
      console.log('🔒 [GamePage] Guest solve — not saved; sign-in claims it.');
      return;
    }

    hasSavedSolutionRef.current = true;
    console.log('💾 [GamePage] Game completed, saving solution...');

    // PvP: end the game session when puzzle is completed
    if (pvpSession && pvpSession.status === 'active' && user) {
      // Use local engine scores (authoritative after fix)
      const p1Score = gameState.players[0]?.score ?? 0;
      const p2Score = gameState.players[1]?.score ?? 0;
      const winner = p1Score > p2Score ? 1 : p2Score > p1Score ? 2 : null;

      // Update local PvP session immediately so timers stop and overlay shows
      setPvpSession(prev => prev ? {
        ...prev,
        status: 'completed' as const,
        winner: winner as 1 | 2 | null,
        end_reason: 'completed' as const,
        player1_score: p1Score,
        player2_score: p2Score,
        ended_at: new Date().toISOString(),
      } : prev);

      // Update backend (best-effort)
      endPvPGame(pvpSession.id, winner as 1 | 2 | null, 'completed', {
        player1: p1Score,
        player2: p2Score,
      }).catch(err => console.error('🎮 [PvP] Failed to end game:', err));
    }
    
    // Async function to capture thumbnail and save solution
    const saveSolutionWithThumbnail = async () => {
      setDiscovery(null); // clear any stale discovery from a previous game
      setSolveRank(null); // ditto for the previous solve's board rank
      let thumbnailUrl: string | null = null;
      
      // Wait for piece animations to complete before capturing screenshot
      const pieceCount = gameState.boardState.size;
      const animationDelay = (pieceCount * 200) + 500;
      console.log(`⏱️ [GamePage] Waiting ${animationDelay}ms for ${pieceCount} pieces to settle...`);
      await new Promise(resolve => setTimeout(resolve, animationDelay));
      
      // Capture screenshot from canvas
      try {
        const canvas = document.querySelector('canvas') as HTMLCanvasElement;
        if (canvas) {
          console.log('📸 [GamePage] Capturing solution screenshot...');
          const screenshotBlob = await captureCanvasScreenshot(canvas);
          console.log('✅ [GamePage] Screenshot captured:', (screenshotBlob.size / 1024).toFixed(2), 'KB');
          
          // Get user session for upload path (use 'anon' for anonymous users)
          const { data: { session } } = await supabase.auth.getSession();
          const userIdPart = session?.user?.id || 'anon';
          
          // Upload thumbnail to solution-thumbnails bucket
          const fileName = `${gameState.puzzleRef.id}-${userIdPart}-${Date.now()}.png`;
          const filePath = `thumbnails/${fileName}`;
          
          const { error: uploadError } = await supabase.storage
            .from('solution-thumbnails')
            .upload(filePath, screenshotBlob, {
              contentType: 'image/png',
              upsert: false
            });
          
          if (uploadError) {
            console.error('❌ [GamePage] Failed to upload thumbnail:', uploadError);
          } else {
            const { data: publicUrlData } = supabase.storage
              .from('solution-thumbnails')
              .getPublicUrl(filePath);
            thumbnailUrl = publicUrlData.publicUrl;
            console.log('✅ [GamePage] Thumbnail uploaded:', thumbnailUrl);
          }
        }
      } catch (err) {
        console.error('⚠️ [GamePage] Screenshot capture failed:', err);
        // Continue saving solution even if screenshot fails
      }
      
      // Save solution with thumbnail URL
      const result = await saveGameSolution(gameState, {
        thumbnailUrl,
        pieceMode,
        singlePieceId: pieceMode === 'single' ? singlePieceId : null,
      });
      if (result.success) {
        console.log('✅ [GamePage] Solution saved:', result.solutionId);
        setSavedSolutionId(result.solutionId ?? null);
        // Discovery moment: was this exact solution ever found before?
        if (result.solutionId && result.signature) {
          getDiscoveryStatus(result.solutionId, gameState.puzzleRef.id, result.signature)
            .then(async (d) => {
              if (d) {
                // Known-vs-new nudge only matters on the live contest puzzle.
                const c = await getContest();
                const contestTarget = isContestLive(c) && c.puzzleId === gameState.puzzleRef.id;
                setDiscovery({ ...d, contestTarget });
                if (d.isNew) track('solution_discovery', { puzzle_id: gameState.puzzleRef.id, distinct: d.distinctSolutions });
              }
            });
        }
      } else {
        console.error('❌ [GamePage] Failed to save solution:', result.error);
        // Moderation trigger rejections (20260805) — surface a friendly toast
        // (reuses the opponent-notification strip) instead of failing silently.
        const modCode = mapDbModerationError(result.error);
        if (modCode === 'rate_limited') {
          showOpponentNotification(t('moderation.solutionRateLimited'));
        } else if (modCode === 'disallowed_content') {
          showOpponentNotification(t('moderation.solutionRejected'));
        }
      }
    };

    saveSolutionWithThumbnail();
  }, [gameState?.phase, gameState?.endState?.reason]);

  // Audio: pop on every piece placed (any source — user, hint, AI, opponent),
  // quieter pop on removal. Watching board size catches every path in one
  // place. Removal sound only mid-game so a new-game reset stays silent.
  const prevBoardSizeRef = useRef(0);
  useEffect(() => {
    if (!gameState) return;
    const size = gameState.boardState.size;
    const prev = prevBoardSizeRef.current;
    prevBoardSizeRef.current = size;
    if (size > prev) sounds.place();
    else if (size < prev && gameState.phase === 'active') sounds.remove();
  }, [gameState?.boardState.size, gameState?.phase]);

  // UI effects: watch narration for piece highlight and score pulse (Phase 2D-2)
  useEffect(() => {
    if (!gameState) return;
    if (gameState.narration.length === 0) return;
    
    // Get the latest narration entry
    const latestEntry = gameState.narration[0];
    if (!latestEntry) return;
    
    // Skip if we've already processed this entry
    if (latestEntry.id === lastNarrationIdRef.current) return;
    lastNarrationIdRef.current = latestEntry.id;
    
    // Process meta for effects
    const meta = latestEntry.meta;
    if (!meta) return;
    
    // Piece highlight effect
    if (meta.pieceInstanceId) {
      setHighlightPieceId(meta.pieceInstanceId);
      // Clear after 400ms
      setTimeout(() => {
        setHighlightPieceId(prev => prev === meta.pieceInstanceId ? null : prev);
      }, 400);
    }
    
    // Score pulse effect
    if (meta.playerId && meta.scoreDelta !== undefined) {
      setScorePulse(prev => ({
        ...prev,
        [meta.playerId!]: (prev[meta.playerId!] ?? 0) + 1,
      }));
    }
  }, [gameState?.narration]);

  // Timer tick effect (Phase 2D-3)
  // Clock ticks only during active player's turn, pauses during resolving/repairing
  // Timer only starts after first piece is placed
  useEffect(() => {
    if (!gameState) return;
    if (gameState.settings.timerMode !== 'timed') return;
    if (gameState.phase === 'ended') return;
    if (gameState.phase === 'resolving' || gameState.subphase === 'repairing') return;
    // Don't start timer until first piece is placed
    if (gameState.boardState.size === 0) return;
    // In PvP mode, PvP chess clocks handle timing — skip local engine timer
    if (pvpSession) return;
    
    const activePlayer = getActivePlayer(gameState);
    
    const interval = setInterval(() => {
      dispatchEvent({ 
        type: 'TIMER_TICK', 
        playerId: activePlayer.id, 
        deltaSeconds: 1 
      });
    }, 1000);
    
    return () => clearInterval(interval);
  }, [
    gameState?.settings.timerMode,
    gameState?.phase,
    gameState?.subphase,
    gameState?.activePlayerIndex,
    gameState?.boardState.size,
    dispatchEvent,
  ]);

  // Manage interaction mode based on game state
  // PvP: also lock board when it's opponent's turn
  const isPvPOpponentTurn = pvpSession?.status === 'active' && user
    ? pvpSession.current_turn !== (pvpSession.player1_id === user.id ? 1 : 2)
    : false;

  useEffect(() => {
    if (!gameState) return;
    
    const activePlayer = getActivePlayer(gameState);
    const isBusyOrEnded = gameState.phase === 'ended' || 
                          gameState.phase === 'resolving' || 
                          gameState.subphase === 'repairing';
    
    if (isBusyOrEnded || isPvPOpponentTurn) {
      setInteractionMode('none');
      setPendingAnchor(null);
    } else if (activePlayer.type === 'human' && gameState.phase === 'in_turn' && interactionMode === 'none') {
      // Auto-enable placing mode for human turns
      setInteractionMode('placing');
    } else if (activePlayer.type === 'ai') {
      setInteractionMode('none');
    }
  }, [gameState?.phase, gameState?.subphase, gameState?.activePlayerIndex, interactionMode, isPvPOpponentTurn]);

  // Handle new game from end modal (must be before early return to maintain hook order)
  const handleNewGame = useCallback(() => {
    setGameState(null);
    setShowSetupModal(true);
    setInteractionMode('none');
    setPendingAnchor(null);
    setEndModalDismissed(false);
    // Reset PvP state
    lastAppliedMoveNumberRef.current = 0;
    appliedMoveIdsRef.current = new Set();
    setPvpSession(null);
    setPvpWaiting(false);
    setPvpPendingStart(false);
    setPvpInviteCode(null);
    setPvpError(null);
    setPvpCoinFlipResult(null);
    setShowCoinFlip(false);
  }, []);

  // Delay showing end modal by 2s so player sees the last piece placed
  useEffect(() => {
    if (gameState?.phase === 'ended' && gameState.endState && !endModalDismissed) {
      const timer = setTimeout(() => setShowEndModal(true), 2000);
      return () => clearTimeout(timer);
    } else {
      setShowEndModal(false);
    }
  }, [gameState?.phase, gameState?.endState, endModalDismissed]);

  // Show loading state while puzzle loads
  if (puzzleLoading) {
    return (
      <div style={styles.container}>
        <div style={styles.loadingPanel}>
          <div style={styles.spinner}>⏳</div>
          <span>Loading puzzle...</span>
        </div>
      </div>
    );
  }
  
  // Show error state if puzzle failed to load
  if (puzzleError || !puzzle) {
    return (
      <div style={styles.container}>
        <div style={styles.errorPanel}>
          <div style={styles.errorIcon}>❌</div>
          <div style={styles.errorTitle}>Failed to load puzzle</div>
          <div style={styles.errorMessage}>{puzzleError ?? 'Unknown error'}</div>
          <button style={styles.errorButton} onClick={() => navigate('/gallery')}>
            Back to Gallery
          </button>
        </div>
      </div>
    );
  }
  
  // Show setup modal if no game state
  if (!gameState) {
    return (
      <div style={styles.container}>
        <GameSetupModal
          isOpen={showSetupModal && !pvpWaiting && !showCoinFlip}
          onConfirm={handleSetupConfirm}
          onCancel={handleSetupCancel}
          onStartPvP={handleStartPvP}
          onShowHowToPlay={(mode, timer) => {
            setSelectedMode(mode);
            setTimerInfo(timer);
            setShowInfoModal(true);
          }}
          preset={presetMode ?? undefined}
          puzzlePieceCount={puzzle?.spec?.sphereCount ?? 25}
          pieceMode={pieceMode}
          singlePieceId={singlePieceId}
          onPieceModeChange={(mode, pieceId) => {
            setPieceMode(mode);
            setSinglePieceId(pieceId);
          }}
          pieceModeLocked={!!challengeTarget}
          onPreviewPiece={handlePreviewPiece}
          comboViability={comboViability}
        />

        {/* One Piece confirm — shows the tapped piece in 3D before selecting */}
        <PieceViewerModal
          isOpen={!!previewPiece}
          piece={previewPiece}
          settings={envSettings}
          onClose={() => setPreviewPiece(null)}
          confirmLabel="✓ Use this piece"
          onConfirm={() => {
            if (previewPiece) {
              setPieceMode('single');
              // Multi-select: confirming ADDS the piece to the chosen set.
              setSinglePieceId(
                joinPieceSelection([...splitPieceSelection(singlePieceId), previewPiece.pieceId])
              );
            }
            setPreviewPiece(null);
          }}
        />

        {/* PvP field diagnostics (?pvpdebug=1) — on-screen because prod
            strips console.log. Read-only, poll-rendered, no interaction. */}
        {pvpDebugOn && pvpSession && (
          <div
            style={{
              position: 'fixed',
              left: 6,
              bottom: 6,
              zIndex: 10500,
              background: 'rgba(0,0,0,0.78)',
              color: '#7dd3fc',
              fontFamily: 'monospace',
              fontSize: 10,
              lineHeight: 1.5,
              padding: '6px 8px',
              borderRadius: 6,
              pointerEvents: 'none',
              whiteSpace: 'pre',
            }}
          >
            {[
              `bundle ${(document.querySelector('script[src*="assets/index-"]') as HTMLScriptElement | null)?.src.match(/index-([A-Za-z0-9_-]+)\.js/)?.[1] ?? '?'}`,
              `sess ${pvpSession.id.slice(0, 8)} ${pvpSession.status} turn:${pvpSession.current_turn}`,
              `ch sess:${pvpDebugRef.current.sessionCh} moves:${pvpDebugRef.current.movesCh} form:${pvpDebugRef.current.formingCh}`,
              `ev sess:${pvpDebugRef.current.sessionEvents} moves:${pvpDebugRef.current.moveEvents} form:${pvpDebugRef.current.formingEvents}`,
              `last ${pvpDebugRef.current.lastEventAt ? Math.round((Date.now() - pvpDebugRef.current.lastEventAt) / 1000) + 's ago' : 'never'} · resyncs ${pvpDebugRef.current.resyncs} · vis ${document.visibilityState}`,
            ].join('\n')}
          </div>
        )}

        {/* Invite-link joiner / session-routing overlay — covers the gap
            before auto-join or ?session= resolution completes (auth
            resolving, network) and the signed-out case, so the player never
            sees or interacts with mode selection. */}
        {(joinCode || sessionParam) && !pvpSession && !pvpWaiting && (
          <div style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0, 0, 0, 0.9)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 10200,
          }}>
            <div style={{
              background: 'linear-gradient(145deg, #2d3748, #1a202c)',
              borderRadius: '20px',
              padding: '40px',
              maxWidth: '420px',
              width: '90%',
              textAlign: 'center',
              border: '1px solid rgba(255, 255, 255, 0.15)',
              boxShadow: '0 20px 60px rgba(0, 0, 0, 0.5)',
              color: '#fff',
            }}>
              {pvpError ? (
                <>
                  <div style={{ fontSize: '3rem', marginBottom: '16px' }}>😕</div>
                  <h2 style={{ margin: '0 0 12px 0' }}>{t('pvp.join.couldntJoin')}</h2>
                  <p style={{ color: 'rgba(255,255,255,0.7)', margin: '0 0 20px 0', fontSize: '0.9rem' }}>
                    {pvpError} {t('pvp.join.expiredHint')}
                  </p>
                  <button onClick={() => navigate('/gallery')} style={{
                    background: tokens.gradient.brand, color: '#fff', border: 'none',
                    borderRadius: '10px', padding: '12px 24px', fontSize: '15px',
                    fontWeight: 700, cursor: 'pointer',
                  }}>
                    {t('pvp.join.browsePuzzles')}
                  </button>
                </>
              ) : !user && !authLoading && !joinCode ? (
                <>
                  {/* ?session= while signed out (and no restorable guest):
                      only the original identity can reopen this game. */}
                  <div style={{ fontSize: '3rem', marginBottom: '16px' }}>🔒</div>
                  <h2 style={{ margin: '0 0 12px 0' }}>{t('pvp.errors.signInToResume')}</h2>
                  <button
                    onClick={() => {
                      setPostLoginRedirect(window.location.pathname + window.location.search);
                      navigate('/login');
                    }}
                    style={{
                      background: tokens.gradient.brand, color: '#fff', border: 'none',
                      borderRadius: '10px', padding: '12px 24px', fontSize: '15px',
                      fontWeight: 700, cursor: 'pointer',
                    }}
                  >
                    {t('pvp.auth.signIn')}
                  </button>
                  <button onClick={() => navigate('/gallery')} style={{
                    background: 'none', color: 'rgba(255,255,255,0.6)', border: 'none',
                    marginTop: '14px', fontSize: '0.85rem', cursor: 'pointer',
                    textDecoration: 'underline',
                  }}>
                    {t('pvp.join.browsePuzzles')}
                  </button>
                </>
              ) : !user && !authLoading ? (
                <>
                  <div style={{ fontSize: '3rem', marginBottom: '16px' }}>🎮</div>
                  <h2 style={{ margin: '0 0 12px 0' }}>{t('pvp.join.challenged')}</h2>
                  <p style={{ color: 'rgba(255,255,255,0.7)', margin: '0 0 20px 0', fontSize: '0.9rem' }}>
                    {t('pvp.join.guestPrompt')}
                  </p>
                  <input
                    value={guestName}
                    onChange={(e) => setGuestName(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') handleGuestJoin(); }}
                    placeholder={t('pvp.join.namePlaceholder')}
                    maxLength={50}
                    autoFocus
                    style={{
                      width: '100%', boxSizing: 'border-box', padding: '12px 14px',
                      borderRadius: '10px', border: '1px solid rgba(255,255,255,0.25)',
                      background: 'rgba(0,0,0,0.3)', color: '#fff', fontSize: '15px',
                      marginBottom: '12px', outline: 'none', textAlign: 'center',
                    }}
                  />
                  {guestJoinError && (
                    <p style={{ color: '#feb2b2', margin: '0 0 12px 0', fontSize: '0.85rem' }}>
                      {t('pvp.join.guestError')}
                    </p>
                  )}
                  <button
                    onClick={handleGuestJoin}
                    disabled={guestJoinBusy || guestName.trim().length < 2}
                    style={{
                      background: tokens.gradient.success, color: '#fff', border: 'none',
                      borderRadius: '10px', padding: '12px 24px', fontSize: '15px',
                      fontWeight: 700, cursor: 'pointer', width: '100%',
                      opacity: guestJoinBusy || guestName.trim().length < 2 ? 0.6 : 1,
                    }}
                  >
                    {guestJoinBusy ? t('pvp.join.joining') : t('pvp.join.playNow')}
                  </button>
                  <button onClick={() => {
                    // Come straight back to this invite after signing in.
                    setPostLoginRedirect(window.location.pathname + window.location.search);
                    navigate('/login');
                  }} style={{
                    background: 'none', color: 'rgba(255,255,255,0.6)', border: 'none',
                    marginTop: '14px', fontSize: '0.85rem', cursor: 'pointer',
                    textDecoration: 'underline',
                  }}>
                    {t('pvp.join.haveAccount')}
                  </button>
                </>
              ) : (
                <>
                  <div style={{ fontSize: '3rem', marginBottom: '16px' }}>🔗</div>
                  <h2 style={{ margin: '0 0 12px 0' }}>{t('pvp.join.joining')}</h2>
                  <p style={{ color: 'rgba(255,255,255,0.7)', margin: 0, fontSize: '0.9rem' }}>
                    {t('pvp.join.connecting')}
                  </p>
                </>
              )}
            </div>
          </div>
        )}

        {/* PvP Waiting Room */}
        {pvpWaiting && (
          <div style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0, 0, 0, 0.9)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 10200,
          }}>
            <div style={{
              background: 'linear-gradient(145deg, #2d3748, #1a202c)',
              borderRadius: '20px',
              padding: '40px',
              maxWidth: '420px',
              width: '90%',
              textAlign: 'center',
              border: '1px solid rgba(255, 255, 255, 0.15)',
              boxShadow: '0 20px 60px rgba(0, 0, 0, 0.5)',
            }}>
              {pvpInviteCode ? (
                <>
                  <div style={{ fontSize: '3rem', marginBottom: '16px' }}>🔗</div>
                  <h2 style={{ color: '#fff', margin: '0 0 12px 0' }}>{t('pvp.invite.title')}</h2>
                  <p style={{ color: 'rgba(255,255,255,0.7)', margin: '0 0 20px 0', fontSize: '0.9rem' }}>
                    {t('pvp.invite.shareCode')}
                  </p>
                  <div style={{
                    background: 'rgba(255,255,255,0.1)',
                    borderRadius: '12px',
                    padding: '16px',
                    fontSize: '2rem',
                    fontWeight: 900,
                    letterSpacing: '0.3em',
                    color: '#60a5fa',
                    fontFamily: 'monospace',
                    marginBottom: '16px',
                  }}>
                    {pvpInviteCode}
                  </div>
                  {/* Desktop: direct copy with visible feedback + WhatsApp
                      deep link. Mobile: the OS share sheet. The old
                      share-with-clipboard-fallback silently failed on
                      desktop (gesture expired after the share dialog),
                      leaving the old clipboard content. */}
                  {(() => {
                    const shareUrl = `${window.location.origin}/game/${puzzle?.spec.id}?join=${pvpInviteCode}`;
                    const shareText = t('pvp.join.shareMessage', { code: pvpInviteCode });
                    const isMobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
                    return (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, alignItems: 'center', marginBottom: 12 }}>
                        <div style={{ display: 'flex', gap: 10, justifyContent: 'center', flexWrap: 'wrap' }}>
                          <button
                            onClick={async () => {
                              try {
                                await navigator.clipboard.writeText(shareUrl);
                                setPvpLinkCopied(true);
                                setTimeout(() => setPvpLinkCopied(false), 2500);
                              } catch {
                                // Clipboard blocked — the selectable URL below still works.
                              }
                            }}
                            style={{
                              background: pvpLinkCopied ? '#22c55e' : '#3b82f6',
                              color: '#fff', border: 'none', borderRadius: '10px',
                              padding: '10px 20px', fontSize: '0.9rem', cursor: 'pointer',
                            }}
                          >
                            {pvpLinkCopied ? `✓ ${t('pvp.invite.copied')}` : `📋 ${t('pvp.invite.copyLink')}`}
                          </button>
                          <a
                            href={`https://wa.me/?text=${encodeURIComponent(`${shareText} ${shareUrl}`)}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            style={{
                              background: '#25D366', color: '#fff', borderRadius: '10px',
                              padding: '10px 20px', fontSize: '0.9rem', textDecoration: 'none',
                              display: 'inline-flex', alignItems: 'center', gap: 6,
                            }}
                          >
                            🟢 WhatsApp
                          </a>
                          {isMobile && !!navigator.share && (
                            <button
                              onClick={async () => {
                                try {
                                  await navigator.share({ title: 'Koos Puzzle Challenge', text: shareText, url: shareUrl });
                                } catch { /* user cancelled the sheet */ }
                              }}
                              style={{
                                background: 'rgba(255,255,255,0.15)', color: '#fff',
                                border: '1px solid rgba(255,255,255,0.25)', borderRadius: '10px',
                                padding: '10px 20px', fontSize: '0.9rem', cursor: 'pointer',
                              }}
                            >
                              {t('pvp.join.shareButton')}
                            </button>
                          )}
                        </div>
                        <input
                          readOnly
                          value={shareUrl}
                          onFocus={(e) => e.currentTarget.select()}
                          style={{
                            width: '100%', boxSizing: 'border-box', textAlign: 'center',
                            background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.2)',
                            borderRadius: '8px', color: 'rgba(255,255,255,0.8)',
                            padding: '8px 10px', fontSize: '0.78rem',
                          }}
                        />
                      </div>
                    );
                  })()}
                  <p style={{ color: 'rgba(255,255,255,0.5)', fontSize: '0.8rem', margin: '8px 0 4px 0' }}>
                    {t('pvp.invite.waitingForOpponent')}
                  </p>
                  <p style={{ color: 'rgba(255,255,255,0.45)', fontSize: '0.75rem', margin: '0 0 16px 0' }}>
                    {t('pvp.invite.validFor')}
                  </p>
                  <div style={{ animation: 'pulse 2s ease-in-out infinite', fontSize: '1.5rem' }}>⏳</div>
                  {/* Async-first: the host does NOT have to babysit this room.
                      Primary exit keeps the invite alive (inbox brings them
                      back); killing the match is the explicit secondary. */}
                  <button
                    onClick={() => {
                      setPvpWaiting(false);
                      setPvpInviteCode(null);
                      navigate('/');
                    }}
                    style={{
                      background: '#3b82f6',
                      color: '#fff',
                      border: 'none',
                      borderRadius: '10px',
                      padding: '10px 24px',
                      fontSize: '0.9rem',
                      fontWeight: 700,
                      cursor: 'pointer',
                      marginTop: '16px',
                    }}
                  >
                    {t('pvp.invite.leaveOpen')}
                  </button>
                  <button
                    onClick={() => {
                      // Host changed their mind: kill the session so the link
                      // stops resolving, and drop the resume breadcrumb.
                      if (pvpSession) {
                        cancelPvPSession(pvpSession.id).catch(() => {});
                        clearHostSessionPointer(pvpSession.id);
                        removeMySession(pvpSession.id);
                        clearChatSeen(pvpSession.id);
                      }
                      setPvpSession(null);
                      setPvpWaiting(false);
                      setPvpInviteCode(null);
                    }}
                    style={{
                      background: 'transparent',
                      color: 'rgba(255,255,255,0.5)',
                      border: '1px solid rgba(255,255,255,0.2)',
                      borderRadius: '8px',
                      padding: '8px 20px',
                      fontSize: '0.85rem',
                      cursor: 'pointer',
                      marginTop: '16px',
                    }}
                  >
                    {t('pvp.invite.cancel')}
                  </button>
                </>
              ) : (
                <>
                  <div style={{ fontSize: '3rem', marginBottom: '16px', animation: 'pulse 1.5s ease-in-out infinite' }}>🔍</div>
                  <h2 style={{ color: '#fff', margin: '0 0 12px 0' }}>{t('pvp.matchmaking.findingOpponent')}</h2>
                  <p style={{ color: tokens.text.onGradientMuted, margin: '0', fontSize: '0.9rem' }}>
                    {t('pvp.matchmaking.searchingChallenger')}
                  </p>
                  {pvpError && (
                    <p style={{ color: '#f87171', margin: '12px 0 0 0', fontSize: '0.85rem' }}>
                      {pvpError}
                    </p>
                  )}
                </>
              )}
            </div>
          </div>
        )}

        {/* Pending start — the invitee is IN, but the host's tab is closed.
            No clocks, no forfeit: we hold here (own heartbeat still flowing)
            until player1's heartbeat turns fresh, then flip into the normal
            match start. If the host cancels meanwhile, show a graceful end. */}
        {pvpPendingStart && pvpSession && (
          <div style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0, 0, 0, 0.9)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 10200,
          }}>
            <div style={{
              background: 'linear-gradient(145deg, #2d3748, #1a202c)',
              borderRadius: '20px',
              padding: '40px',
              maxWidth: '420px',
              width: '90%',
              textAlign: 'center',
              border: '1px solid rgba(255, 255, 255, 0.15)',
              boxShadow: '0 20px 60px rgba(0, 0, 0, 0.5)',
              color: '#fff',
            }}>
              {pvpSession.status === 'active' ? (
                <>
                  <div style={{ fontSize: '3rem', marginBottom: '16px' }}>🤝</div>
                  <h2 style={{ margin: '0 0 12px 0' }}>{t('pvp.pending.title')}</h2>
                  <p style={{ color: 'rgba(255,255,255,0.7)', margin: '0 0 20px 0', fontSize: '0.9rem' }}>
                    {t('pvp.pending.hostAway', { name: pvpSession.player1_name })}
                  </p>
                  {(() => {
                    const code = pvpSession.invite_code ?? joinCode ?? '';
                    const link = `${window.location.origin}/game/${puzzle?.spec.id}?join=${code}`;
                    return (
                      <a
                        href={`https://wa.me/?text=${encodeURIComponent(t('pvp.pending.nudgeMessage', { link }))}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{
                          background: '#25D366', color: '#fff', borderRadius: '10px',
                          padding: '10px 20px', fontSize: '0.9rem', textDecoration: 'none',
                          display: 'inline-flex', alignItems: 'center', gap: 6,
                        }}
                      >
                        🟢 {t('pvp.pending.nudge')}
                      </a>
                    );
                  })()}
                  <div style={{ animation: 'pulse 2s ease-in-out infinite', fontSize: '1.5rem', margin: '18px 0 0 0' }}>⏳</div>
                  <button
                    onClick={() => {
                      // Backing out: abandon the session so the host's resume
                      // pointer (and both inboxes) clean themselves up.
                      cancelPvPSession(pvpSession.id).catch(() => {});
                      removeMySession(pvpSession.id);
                      clearChatSeen(pvpSession.id);
                      navigate('/gallery');
                    }}
                    style={{
                      background: 'transparent',
                      color: 'rgba(255,255,255,0.5)',
                      border: '1px solid rgba(255,255,255,0.2)',
                      borderRadius: '8px',
                      padding: '8px 20px',
                      fontSize: '0.85rem',
                      cursor: 'pointer',
                      marginTop: '16px',
                    }}
                  >
                    {t('pvp.pending.leave')}
                  </button>
                </>
              ) : (
                <>
                  <div style={{ fontSize: '3rem', marginBottom: '16px' }}>😕</div>
                  <h2 style={{ margin: '0 0 12px 0' }}>{t('pvp.pending.ended')}</h2>
                  <p style={{ color: 'rgba(255,255,255,0.7)', margin: '0 0 20px 0', fontSize: '0.9rem' }}>
                    {t('pvp.pending.endedHint')}
                  </p>
                  <button onClick={() => navigate('/gallery')} style={{
                    background: tokens.gradient.brand, color: '#fff', border: 'none',
                    borderRadius: '10px', padding: '12px 24px', fontSize: '15px',
                    fontWeight: 700, cursor: 'pointer',
                  }}>
                    {t('pvp.join.browsePuzzles')}
                  </button>
                </>
              )}
            </div>
          </div>
        )}

        {/* Coin Flip Animation */}
        {showCoinFlip && pvpCoinFlipResult && pvpSession && (
          <div style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0, 0, 0, 0.95)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 10300,
          }}>
            <div style={{
              textAlign: 'center',
              animation: 'fadeIn 0.5s ease-out',
            }}>
              <div style={{ fontSize: '4rem', marginBottom: '20px' }}>🪙</div>
              <h2 style={{ color: '#fff', margin: '0 0 8px 0', fontSize: '1.5rem' }}>
                vs {pvpSession.player2_name}
              </h2>
              <div style={{
                fontSize: '1.2rem',
                color: pvpCoinFlipResult.first === pvpCoinFlipResult.myNumber ? '#4ade80' : '#f87171',
                fontWeight: 700,
                marginTop: '16px',
              }}>
                {pvpCoinFlipResult.first === pvpCoinFlipResult.myNumber
                  ? `🟢 ${t('pvp.coinFlip.youGoFirst')}`
                  : `🔴 ${t('pvp.coinFlip.opponentGoesFirst', { name: pvpSession.player2_name })}`}
              </div>
            </div>
          </div>
        )}
        
        {/* How to Play Info Modal */}
        {showInfoModal && (
          <div style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0, 0, 0, 0.8)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 10100,
          }} onClick={() => setShowInfoModal(false)}>
            <div style={{
              background: 'linear-gradient(145deg, #2d3748, #1a202c)',
              borderRadius: '16px',
              padding: '24px',
              maxWidth: '500px',
              width: '90%',
              maxHeight: '80vh',
              overflow: 'auto',
              border: '1px solid rgba(255, 255, 255, 0.1)',
              boxShadow: '0 20px 60px rgba(0, 0, 0, 0.5)',
            }} onClick={e => e.stopPropagation()}>
              <h2 style={{ color: '#fff', margin: '0 0 16px 0', fontSize: '1.5rem' }}>
                🎮 {selectedMode === 'vsplayer'
                    ? 'vs Player'
                    : selectedMode === 'vs' 
                      ? 'vs Computer' 
                      : 'Solo Mode'}
              </h2>
              
              <div style={{ color: 'rgba(255, 255, 255, 0.9)', lineHeight: 1.6, fontSize: '0.9rem' }}>
                <h3 style={{ color: '#60a5fa', margin: '12px 0 6px 0', fontSize: '1rem' }}>
                  🧩 Puzzle Info
                </h3>
                <p style={{ margin: '0 0 10px 0' }}>
                  <strong>{puzzle?.spec?.sphereCount ?? 0} cells</strong> • Using <strong>{setsNeeded} set{setsNeeded > 1 ? 's' : ''}</strong> ({setsNeeded * 25} pieces available)
                  {timerInfo.timed && <><br/>⏱️ <strong>Chess Clock:</strong> {timerInfo.minutes} minutes per player</>}
                </p>

                <h3 style={{ color: '#60a5fa', margin: '12px 0 6px 0', fontSize: '1rem' }}>
                  🎯 Goal
                </h3>
                <p style={{ margin: '0 0 10px 0' }}>
                  {selectedMode === 'vsplayer'
                    ? 'Take turns placing Koos pieces on a shared board. Each piece covers 4 cells. Highest score wins!'
                    : 'Fill the puzzle by placing Koos pieces. Each piece covers exactly 4 cells. Highest score wins!'}
                </p>

                {selectedMode === 'vsplayer' && (
                  <>
                    <h3 style={{ color: '#60a5fa', margin: '12px 0 6px 0', fontSize: '1rem' }}>
                      🔄 Turns
                    </h3>
                    <p style={{ margin: '0 0 10px 0' }}>
                      Players alternate turns. Your clock only ticks during your turn.<br/>
                      A coin flip decides who goes first. The board is locked during your opponent's turn.
                    </p>
                  </>
                )}

                <h3 style={{ color: '#60a5fa', margin: '12px 0 6px 0', fontSize: '1rem' }}>
                  📊 Scoring
                </h3>
                <p style={{ margin: '0 0 10px 0' }}>
                  <strong>+1 point</strong> for each piece you place manually<br/>
                  <strong>0 points</strong> for pieces placed via hint (counts as your turn)<br/>
                  <strong>-1 point</strong> for each piece removed during repair (to whoever placed it)
                </p>

                <h3 style={{ color: '#60a5fa', margin: '12px 0 6px 0', fontSize: '1rem' }}>
                  ✏️ Placing Pieces
                </h3>
                <p style={{ margin: '0 0 10px 0' }}>
                  Click 4 adjacent cells to draw a piece. The shape must match one of the 25 Koos pieces (A-Y).
                  {selectedMode === 'vsplayer' && <><br/><strong>Shared inventory</strong> — each piece can only be placed once by either player.</>}
                </p>

                {selectedMode === 'solo' && (
                  <>
                    <h3 style={{ color: '#60a5fa', margin: '12px 0 6px 0', fontSize: '1rem' }}>
                      🗑️ Remove Piece (Optional)
                    </h3>
                    <p style={{ margin: '0 0 10px 0' }}>
                      Enable "Allow Remove Piece" in game setup to freely remove placed pieces. Tap a placed piece to select it, then tap Remove to take it off the board. Great for experimenting and learning!
                    </p>
                  </>
                )}

                <h3 style={{ color: '#60a5fa', margin: '12px 0 6px 0', fontSize: '1rem' }}>
                  💡 Hint & Repair
                </h3>
                <p style={{ margin: '0 0 10px 0' }}>
                  Click one cell, then tap Hint to place a valid piece.
                  <br/>If the puzzle is unsolvable, the hint will first remove pieces until it's solvable again (-1 point to whoever placed each removed piece), then place the piece.
                  {' '}Hint pieces give 0 points.
                  {selectedMode === 'vsplayer' && <><br/><strong>Limited hints:</strong> Each player has a set number of hints (configurable in setup). Use them wisely!</>}
                </p>

                {selectedMode === 'vsplayer' && (
                  <>
                    <h3 style={{ color: '#60a5fa', margin: '12px 0 6px 0', fontSize: '1rem' }}>
                      🔍 Check (Solvability)
                    </h3>
                    <p style={{ margin: '0 0 10px 0' }}>
                      Suspect your opponent broke the puzzle? Use Check to verify solvability.<br/>
                      <strong>If correct</strong> (puzzle is unsolvable): bad pieces are repaired and you keep your turn. The check is <strong>not consumed</strong>.<br/>
                      <strong>If wrong</strong> (puzzle is still solvable): you lose your turn as a penalty and the check <strong>is consumed</strong>.<br/>
                      Each player has a limited number of checks (configurable in setup).
                    </p>
                  </>
                )}

                <h3 style={{ color: '#60a5fa', margin: '12px 0 6px 0', fontSize: '1rem' }}>
                  🎛️ Action Buttons
                </h3>
                <div style={{ margin: '0 0 10px 0', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <span>📦 <strong>Inventory</strong> — Browse available pieces</span>
                  <span>💡 <strong>Hint</strong> — Select a cell, then tap to auto-place a valid piece{selectedMode === 'vsplayer' && ' (counter shown)'}</span>
                  <span>🙈 <strong>Hide/Show</strong> — Toggle placed pieces visibility</span>
                  {selectedMode === 'vsplayer' && (
                    <span>🔍 <strong>Check</strong> — Verify solvability (counter shown)</span>
                  )}
                  {selectedMode === 'vsplayer' && (
                    <span>🏳️ <strong>Resign</strong> — Forfeit the game (opponent wins)</span>
                  )}
                  {selectedMode === 'solo' && (
                    <span>🗑️ <strong>Remove</strong> — Remove a selected piece (if enabled)</span>
                  )}
                </div>

                <h3 style={{ color: '#60a5fa', margin: '12px 0 6px 0', fontSize: '1rem' }}>
                  ⋮ Menu (Top-Right)
                </h3>
                <div style={{ margin: '0 0 10px 0', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <span>ℹ️ <strong>How to Play</strong> — This help screen</span>
                  <span>⚙️ <strong>Settings</strong> — Visual settings (colors, rendering)</span>
                  <span>✕ <strong>Exit Game</strong> — Return to gallery</span>
                </div>

                <h3 style={{ color: '#60a5fa', margin: '12px 0 6px 0', fontSize: '1rem' }}>
                  🏁 Game End
                </h3>
                <p style={{ margin: '0 0 10px 0' }}>
                  {selectedMode === 'vsplayer'
                    ? 'Game ends when: puzzle completed, a player resigns, a player\'s clock runs out, both players stall, or a player has no hints, no checks, and no valid moves left. Highest score wins!'
                    : selectedMode === 'vs' 
                      ? 'Game ends when: puzzle completed, all players stalled, or timer runs out. Highest score wins!'
                      : timerInfo.timed
                        ? 'Complete the puzzle by filling all cells, or when time runs out!'
                        : 'Complete the puzzle by filling all cells!'}
                </p>
              </div>

              <button
                onClick={() => setShowInfoModal(false)}
                style={{
                  marginTop: '20px',
                  width: '100%',
                  padding: '12px',
                  background: tokens.gradient.info,
                  color: '#fff',
                  border: 'none',
                  borderRadius: '8px',
                  fontSize: '1rem',
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                Got it!
              </button>
            </div>
          </div>
        )}
      </div>
    );
  }

  // UI-derived status model (Phase 2D-3)
  const isEnded = gameState.phase === 'ended';
  const isBusy = gameState.phase === 'resolving' || gameState.subphase === 'repairing';
  const activePlayer = getActivePlayer(gameState);
  const isAITurn = activePlayer.type === 'ai' && !isBusy && !isEnded;
  
  // Banner text precedence
  // In single player mode, don't show "Your turn" - it's always your turn
  const isSinglePlayer = gameState.players.length === 1;
  const bannerText = isEnded
    ? 'Game Over'
    : gameState.subphase === 'repairing'
    ? 'Repairing…'
    : gameState.phase === 'resolving'
    ? 'Resolving…'
    : activePlayer.type === 'ai'
    ? `${activePlayer.name} is thinking…`
    : isSinglePlayer
    ? '' // No turn indicator needed in single player
    : activePlayer.name === 'You' ? t('pvp.turn.yours') : t('pvp.turn.named', { name: activePlayer.name });

  return (
    <div style={styles.container}>
      {/* Game HUD */}
      <GameHUD
        gameState={gameState}
        onHintClick={handleEnterHintMode}
        onPassClick={handlePassClick}
        onInventoryClick={() => setShowInventory(true)}
        hidePlacedPieces={hidePlacedPieces}
        onToggleHidePlaced={() => setHidePlacedPieces(prev => !prev)}
        scorePulse={scorePulse}
        selectedPieceUid={selectedPieceUid}
        onRemoveClick={handleRemovePiece}
        setsNeeded={setsNeeded}
        cellCount={puzzle?.spec?.sphereCount}
        isPvP={!!pvpSession}
        onCheckClick={pvpSession ? handleCheck : undefined}
        checkInProgress={checkInProgress}
        pvpHintsRemaining={pvpSession ? (
          pvpSession.hint_limit === 0 ? null : // unlimited
          pvpSession.hint_limit - (pvpSession.player1_id === user?.id
            ? pvpSession.player1_hints_used
            : pvpSession.player2_hints_used)
        ) : null}
        pvpChecksRemaining={pvpSession ? (
          pvpSession.check_limit === 0 ? null : // unlimited
          pvpSession.check_limit - (pvpSession.player1_id === user?.id
            ? pvpSession.player1_checks_used
            : pvpSession.player2_checks_used)
        ) : null}
        onResignClick={pvpSession ? async () => {
          const myNum = pvpSession.player1_id === user?.id ? 1 : 2;
          const winner = myNum === 1 ? 2 : 1;

          // Update local PvP session immediately
          setPvpSession(prev => prev ? {
            ...prev,
            status: 'completed' as const,
            winner: winner as 1 | 2,
            end_reason: 'resign' as const,
            ended_at: new Date().toISOString(),
          } : prev);

          // End local game engine — pass resigning player (me = index 0) so opponent wins
          const myPlayerId = gameState?.players[0]?.id;
          dispatchEvent({ type: 'GAME_END', reason: 'resign', resigningPlayerId: myPlayerId });

          // Try to update backend (may fail for simulated games)
          try {
            const { resignPvPGame } = await import('../pvp/pvpApi');
            await resignPvPGame(pvpSession.id, myNum as 1 | 2);
          } catch (err) {
            console.warn('🏳️ [Resign] Backend update failed (simulated game?):', err);
          }
        } : undefined}
      />

      {/* PvP HUD overlay */}
      {pvpSession && (pvpSession.status === 'active' || pvpSession.status === 'completed') && (
        <PvPHUD
          session={pvpSession}
          myPlayerNumber={pvpSession.player1_id === user?.id ? 1 : 2}
          isMyTurn={pvpSession.current_turn === (pvpSession.player1_id === user?.id ? 1 : 2)}
          gameOver={pvpSession.status !== 'active'}
          opponentDisconnected={opponentDisconnected}
          disconnectCountdown={disconnectCountdown}
          engineScores={gameState ? {
            myScore: gameState.players[0]?.score ?? 0,
            opponentScore: gameState.players[1]?.score ?? 0,
          } : undefined}
          opponentNotification={opponentNotification}
          onResign={async () => {
            const myNum = pvpSession.player1_id === user?.id ? 1 : 2;
            const winner = myNum === 1 ? 2 : 1;
            setPvpSession(prev => prev ? {
              ...prev,
              status: 'completed' as const,
              winner: winner as 1 | 2,
              end_reason: 'resign' as const,
              ended_at: new Date().toISOString(),
            } : prev);
            const myPlayerId = gameState?.players[0]?.id;
            dispatchEvent({ type: 'GAME_END', reason: 'resign', resigningPlayerId: myPlayerId });
            try {
              const { resignPvPGame } = await import('../pvp/pvpApi');
              await resignPvPGame(pvpSession.id, myNum as 1 | 2);
            } catch (err) {
              console.warn('🏳️ [Resign] Backend update failed:', err);
            }
          }}
        />
      )}

      {/* End-of-game modal (Phase 2C) — delayed 2s so player sees last piece.
          Tutorial lessons use their own compact overlay instead. */}
      {!tutorial && gameState.phase === 'ended' && gameState.endState && !endModalDismissed && showEndModal && !showShareClip && (
        <GameEndModal
          endState={gameState.endState}
          players={gameState.players}
          onNewGame={handleNewGame}
          onClose={() => {
            setEndModalDismissed(true);
            // Peak moment: puzzle completed — best time to offer the app.
            if (gameState.endState?.reason === 'completed') {
              offerInstallAtPeak('game_end');
            }
          }}
          scoringEnabled={gameState.settings.ruleToggles.scoringEnabled}
          onSignIn={!authUser ? () => navigate('/login') : undefined}
          onShareClip={
            gameState.endState.reason === 'completed' && sceneObjects
              ? () => setShowShareClip(true)
              : undefined
          }
          onViewLeaderboard={
            gameState.endState.reason === 'completed' && puzzle
              ? () => navigate(`/leaderboards/${puzzle.spec.id}`)
              : undefined
          }
          challenge={
            gameState.endState.reason === 'completed' && challengeVerdict
              ? challengeVerdict
              : undefined
          }
          discovery={
            gameState.endState.reason === 'completed' && discovery
              ? discovery
              : undefined
          }
          solveRank={
            gameState.endState.reason === 'completed' && !pvpSession
              ? solveRank
              : undefined
          }
          playerNameOverrides={pvpSession ? (() => {
            const myName = pvpSession.player1_id === user?.id
              ? pvpSession.player1_name
              : pvpSession.player2_name;
            const oppName = pvpSession.player1_id === user?.id
              ? pvpSession.player2_name
              : pvpSession.player1_name;
            const overrides: Record<string, string> = {};
            // player index 0 = "You" in local engine = me
            if (gameState.players[0]) overrides[gameState.players[0].id] = myName;
            // player index 1 = "Opponent" in local engine = opponent
            if (gameState.players[1]) overrides[gameState.players[1].id] = oppName;
            return overrides;
          })() : (() => {
            // Solo: show the player's display name (not the engine "You").
            const name =
              authUser?.username ||
              (typeof localStorage !== 'undefined' && localStorage.getItem('user_preferences_username'));
            const human = gameState.players[0];
            return name && human ? { [human.id]: name } : undefined;
          })()}
        />
      )}

      {showShareClip && (
        <ShareClipModal
          isOpen={showShareClip}
          onClose={() => setShowShareClip(false)}
          sceneObjects={sceneObjects}
          puzzleName={puzzle?.geometry?.name}
          puzzleId={gameState.puzzleRef.id}
          solverName={
            authUser?.username ||
            localStorage.getItem('user_preferences_username') ||
            gameState.players[0]?.name
          }
          placementsByYou={
            Array.from(gameState.boardState.values()).filter(
              (p) => p.source === 'user'
            ).length
          }
          totalPieces={gameState.boardState.size}
          placementOrder={
            Array.from(gameState.boardState.values())
              .sort((a, b) => a.placedAt - b.placedAt)
              .map((p) => p.uid)
          }
          solutionId={savedSolutionId}
          pieceMode={pieceMode}
          singlePieceId={singlePieceId}
        />
      )}

      {/* Sign-in prompt for logged-out users choosing vs Player */}
      <ModalBase
        isOpen={showAuthPrompt}
        onClose={() => setShowAuthPrompt(false)}
        maxWidth={400}
        headerIcon="🔒"
        title={t('pvp.auth.signInToPlay')}
        subtitle={t('pvp.auth.needsAccount')}
        footer={
          <>
            <button
              onClick={() => setShowAuthPrompt(false)}
              style={{
                padding: '10px 20px', fontSize: '0.95rem', fontWeight: 600,
                background: 'rgba(255,255,255,0.12)', border: '1px solid rgba(255,255,255,0.25)',
                borderRadius: '10px', color: '#fff', cursor: 'pointer',
              }}
            >
              {t('pvp.auth.maybeLater')}
            </button>
            <button
              onClick={() => {
                setShowAuthPrompt(false);
                setPostLoginRedirect(window.location.pathname + window.location.search);
                navigate('/login');
              }}
              style={{
                padding: '10px 24px', fontSize: '0.95rem', fontWeight: 700,
                background: tokens.gradient.brand, border: 'none',
                borderRadius: '10px', color: '#fff', cursor: 'pointer',
              }}
            >
              {t('pvp.auth.signIn')}
            </button>
          </>
        }
      >
        <p style={{ margin: 0, textAlign: 'center', color: tokens.text.onGradientMuted, fontSize: '0.95rem', lineHeight: 1.5 }}>
          {t('pvp.auth.keepPlaying')}
        </p>
      </ModalBase>

      {/* Tutorial lesson banner + step-complete overlay */}
      {tutorial && gameState && (
        <>
          {gameState.phase !== 'ended' && (
            <div style={{
              position: 'fixed',
              top: '12px',
              left: '12px',
              zIndex: 200,
              background: 'rgba(11,11,30,0.85)',
              color: '#fff',
              borderRadius: 10,
              padding: '10px 14px',
              fontSize: 13,
              maxWidth: 'calc(100vw - 90px)',
              boxShadow: '0 4px 14px rgba(0,0,0,0.35)',
            }}>
              <div style={{ color: '#9fb4ff', fontWeight: 700, marginBottom: 2 }}>🎓 {t(tutorial.titleKey)}</div>
              <div style={{ lineHeight: 1.45 }}>{t(tutorial.instructionKey)}</div>
              {tutorial.step === 1 && gameState.boardState.size === 0 && (
                <button
                  onClick={handleWatchDemo}
                  style={{
                    marginTop: 8,
                    background: tokens.gradient.success,
                    border: 'none',
                    borderRadius: 8,
                    color: '#fff',
                    fontSize: 13,
                    fontWeight: 700,
                    padding: '8px 14px',
                    cursor: 'pointer',
                  }}
                >
                  {t('tutorial.watchDemo')}
                </button>
              )}
            </div>
          )}
          {gameState.phase === 'ended' && gameState.endState?.reason === 'completed' && (
            <div style={{
              position: 'fixed',
              inset: 0,
              zIndex: 10100,
              background: 'rgba(0,0,0,0.55)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}>
              <div style={{
                background: tokens.gradient.brand,
                color: '#fff',
                borderRadius: 16,
                padding: '28px 32px',
                maxWidth: 360,
                width: '90%',
                textAlign: 'center',
                boxShadow: '0 12px 40px rgba(0,0,0,0.5)',
              }}>
                <div style={{ fontSize: 40, marginBottom: 8 }}>🎉</div>
                <div style={{ fontSize: 20, fontWeight: 800, marginBottom: 6 }}>
                  {t('tutorial.lessonComplete', { step: tutorial.step })}
                </div>
                <div style={{ fontSize: 14, opacity: 0.95, marginBottom: 20 }}>{t(tutorial.praiseKey)}</div>
                {tutorial.step < TUTORIAL_STEPS.length ? (
                  <button
                    onClick={() => { window.location.href = tutorialUrl(tutorial.step + 1); }}
                    style={{
                      background: tokens.gradient.success, color: '#fff', border: 'none',
                      borderRadius: 10, padding: '13px 22px', fontSize: 16, fontWeight: 700,
                      cursor: 'pointer', width: '100%',
                    }}
                  >
                    {t('tutorial.nextLesson')}
                  </button>
                ) : (
                  <button
                    onClick={() => navigate('/gallery')}
                    style={{
                      background: tokens.gradient.success, color: '#fff', border: 'none',
                      borderRadius: 10, padding: '13px 22px', fontSize: 16, fontWeight: 700,
                      cursor: 'pointer', width: '100%',
                    }}
                  >
                    {t('tutorial.ready')}
                  </button>
                )}
              </div>
            </div>
          )}
        </>
      )}

      {/* Challenge target — during-play reference. With ghost data this is a
          live two-lane race (the challenger's recorded run replays in real
          time); otherwise the plain stat banner. Hidden once the game ends. */}
      {challengeTarget && gameState?.phase !== 'ended' && (
        <div
          style={{
            position: 'fixed',
            top: '12px',
            left: '12px',
            zIndex: 200,
            background: 'rgba(11,11,30,0.85)',
            color: '#fff',
            borderRadius: 10,
            padding: '8px 12px',
            fontSize: 13,
            boxShadow: '0 4px 14px rgba(0,0,0,0.35)',
            maxWidth: 'calc(100vw - 90px)',
          }}
        >
          {ghost.ready ? (
            (() => {
              const laneTotal = challengeTarget.total_pieces || ghost.total;
              const ghostName = challengeTarget.display_name || t('ghost.ghost');
              const lane = (
                label: string,
                count: number,
                color: string,
                trailing?: React.ReactNode
              ) => (
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 190 }}>
                  <span
                    style={{
                      width: 52,
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                      color: 'rgba(255,255,255,0.85)',
                    }}
                  >
                    {label}
                  </span>
                  <div
                    style={{
                      flex: 1,
                      height: 6,
                      borderRadius: 3,
                      background: 'rgba(255,255,255,0.15)',
                      overflow: 'hidden',
                    }}
                  >
                    <div
                      style={{
                        width: `${laneTotal ? Math.min(100, (count / laneTotal) * 100) : 0}%`,
                        height: '100%',
                        background: color,
                        borderRadius: 3,
                        transition: 'width 0.25s linear',
                      }}
                    />
                  </div>
                  <span style={{ fontWeight: 700, whiteSpace: 'nowrap', minWidth: 34, textAlign: 'right' }}>
                    {count}/{laneTotal}
                  </span>
                  {trailing}
                </div>
              );
              return (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                  {lane(t('ghost.you'), playerSelfCount, tokens.color.success)}
                  {lane(
                    ghostName,
                    ghost.count,
                    tokens.color.accent,
                    ghost.finished ? (
                      <span style={{ color: '#ffd24d', whiteSpace: 'nowrap' }} title={t('ghost.finishedTitle')}>
                        🏁 {formatChallengeTime(challengeTarget.duration_ms) ?? ''}
                      </span>
                    ) : !ghost.running ? (
                      <span style={{ color: 'rgba(255,255,255,0.5)', whiteSpace: 'nowrap' }}>
                        {t('ghost.startsWithMove')}
                      </span>
                    ) : undefined
                  )}
                </div>
              );
            })()
          ) : (
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
              <span style={{ color: '#9fb4ff', whiteSpace: 'nowrap' }}>
                {t('ghost.beat', { name: challengeTarget.solver_name?.split('@')[0] || t('ghost.them') })}
              </span>
              {formatChallengeScore(challengeTarget.placements_by_you, challengeTarget.total_pieces) && (
                <span style={{ color: '#10b981', fontWeight: 700 }}>
                  {formatChallengeScore(challengeTarget.placements_by_you, challengeTarget.total_pieces)}
                </span>
              )}
              {formatChallengeTime(challengeTarget.duration_ms) && (
                <span style={{ color: '#ffd24d', whiteSpace: 'nowrap' }}>
                  ⏱ {formatChallengeTime(challengeTarget.duration_ms)}
                </span>
              )}
            </div>
          )}
        </div>
      )}

      {/* 3-dot menu — top right */}
      <div style={{ position: 'fixed', top: '12px', right: '12px', zIndex: 200 }}>
        <ThreeDotMenu
          size={28}
          iconSize={18}
          backgroundColor={envSettings.lights.backgroundColor}
          items={[
            { icon: 'ℹ️', label: 'How to Play', onClick: () => setShowInfoModal(true) },
            { icon: '🎓', label: t('menu.showMeHow'), onClick: () => { window.location.href = tutorialUrl(1); }, hidden: !!tutorial },
            { icon: '⚙️', label: 'Settings', onClick: () => setShowSettings(true) },
            { icon: '💬', label: chatOpen ? 'Close Chat' : 'Open Chat', onClick: () => setChatOpen(o => !o), hidden: !pvpSession || !pvpChatEnabled },
            { icon: '✕', label: 'Exit Game', onClick: () => navigate('/gallery') },
          ]}
        />
      </div>

      {/* Three.js 3D Board (Phase 3A-3/3A-4) */}
      <GameBoard3D
        puzzle={puzzle}
        boardState={gameState.boardState}
        interactionMode={interactionMode}
        isHumanTurn={pvpSession ? true : activePlayer.type === 'human'}
        highlightPieceId={highlightPieceId}
        selectedAnchor={pendingAnchor}
        selectedPieceUid={selectedPieceUid}
        envSettings={envSettings}
        hidePlacedPieces={hidePlacedPieces}
        allowPieceSelection={gameState.settings.ruleToggles.allowRemoval}
        pieceMode={pieceMode}
        opponentFormingCells={opponentFormingCells}
        onPlacementCommitted={handlePlacementCommitted}
        onPlacementRejected={handlePlacementRejected}
        onAnchorPicked={handleAnchorSelected}
        onCancelInteraction={handleCancelInteraction}
        onDrawingCellsChange={handleDrawingCellsChange}
        onPieceSelected={setSelectedPieceUid}
        onSceneReady={setSceneObjects}
      />
      
      
      {/* Anchor Picking Mode Panel (Phase 3A-4) */}
      {interactionMode === 'pickingAnchor' && (
        <div style={styles.anchorPickPanel}>
          <div style={styles.anchorPickTitle}>
            {pendingAnchor 
              ? `Anchor: (${pendingAnchor.i}, ${pendingAnchor.j}, ${pendingAnchor.k})`
              : 'Click a cell to select anchor'
            }
          </div>
          <div style={styles.anchorPickButtons}>
            <button 
              style={styles.anchorPickConfirm}
              onClick={handleConfirmHint}
              disabled={!pendingAnchor}
            >
              ✓ Use Hint
            </button>
            <button 
              style={styles.anchorPickCancel}
              onClick={handleCancelHintMode}
            >
              ✕ Cancel
            </button>
          </div>
        </div>
      )}
      
      {/* Placement Error Toast */}
      {placementError && (
        <div style={styles.placeError}>{placementError}</div>
      )}

      {/* Debug Panel - HIDDEN */}
      {false && <div style={styles.debugPanel}>
        <div style={styles.debugTitle}>Puzzle: {puzzle.spec.title}</div>
        <div style={styles.debugSubtitle}>ID: {puzzle.spec.id.substring(0, 20)}...</div>
        <div style={styles.debugSubtitle}>Cells: {puzzle.spec.sphereCount}</div>
        <pre style={styles.stateDebug}>
          {JSON.stringify({
            phase: gameState.phase,
            subphase: gameState.subphase,
            piecesPlaced: gameState.boardState.size,
            cellsCovered: Array.from(gameState.boardState.values()).reduce((sum, p) => sum + p.cells.length, 0),
            targetCells: gameState.puzzleSpec.sphereCount,
            stallCounter: `${gameState.roundNoPlacementCount}/${gameState.players.length}`,
            repairReason: gameState.repair?.reason,
            endReason: gameState.endState?.reason,
          }, null, 2)}
        </pre>

        {/* Placed Pieces List (Phase 2D-2) */}
        {gameState.boardState.size > 0 && (
          <div style={styles.pieceListContainer}>
            <div style={styles.pieceListTitle}>Placed Pieces:</div>
            <div style={styles.pieceList}>
              {Array.from(gameState.boardState.entries()).map(([uid, piece]) => {
                const owner = gameState.players.find(p => p.id === piece.placedBy);
                const isHighlighted = uid === highlightPieceId;
                return (
                  <div 
                    key={uid} 
                    style={{
                      ...styles.pieceItem,
                      ...(isHighlighted ? styles.pieceItemHighlight : {}),
                    }}
                  >
                    <span style={styles.pieceId}>{piece.pieceId}</span>
                    <span style={styles.pieceOwner}>by {owner?.name ?? 'Unknown'}</span>
                  </div>
                );
              })}
            </div>
          </div>
        )}

          {/* Repair Progress Indicator */}
          {gameState.subphase === 'repairing' && gameState.repair && (
            <div style={styles.repairProgress}>
              <div style={styles.repairProgressBar}>
                <div 
                  style={{
                    ...styles.repairProgressFill,
                    width: `${(gameState.repair.index / gameState.repair.steps.length) * 100}%`,
                  }}
                />
              </div>
              <span style={styles.repairProgressText}>
                Repair: {gameState.repair.index}/{gameState.repair.steps.length}
              </span>
            </div>
          )}
          
          {/* Test Controls (Repair testing only - placement via draw UI) */}
          <div style={styles.testControls}>
            <button
              style={{
                ...styles.testButton,
                background: 'rgba(234, 179, 8, 0.3)',
                borderColor: 'rgba(234, 179, 8, 0.5)',
              }}
              disabled={gameState.subphase === 'repairing' || gameState.boardState.size < 3 || interactionMode === 'pickingAnchor'}
              onClick={() => {
                // Force hint with repair: place 3+ pieces first
                const activePlayer = getActivePlayer(gameState);
                dispatchEvent({ 
                  type: 'TURN_HINT_REQUESTED', 
                  playerId: activePlayer.id,
                  anchor: { i: 10, j: 0, k: 0 },
                });
              }}
            >
              Test: Force Repair (Hint)
            </button>
            <button
              style={{
                ...styles.testButton,
                background: 'rgba(34, 197, 94, 0.3)',
                borderColor: 'rgba(34, 197, 94, 0.5)',
              }}
              disabled={gameState.phase === 'ended'}
              onClick={() => {
                dispatchEvent({ type: 'GAME_END', reason: 'completed' });
              }}
            >
              Test: Complete Game
            </button>
            <button
              style={{
                ...styles.testButton,
                background: 'rgba(239, 68, 68, 0.3)',
                borderColor: 'rgba(239, 68, 68, 0.5)',
              }}
              disabled={gameState.phase === 'ended' || gameState.subphase === 'repairing'}
              onClick={() => {
                // Force stall by setting roundNoPlacementCount high enough
                // Then trigger TURN_ADVANCE to detect the stall
                setGameState(prev => {
                  if (!prev) return prev;
                  return {
                    ...prev,
                    roundNoPlacementCount: prev.players.length - 1,
                    turnPlacementFlag: false,
                  };
                });
                // After state update, next pass will trigger stall detection
                const activePlayer = getActivePlayer(gameState);
                dispatchEvent({ type: 'TURN_PASS_REQUESTED', playerId: activePlayer.id });
              }}
            >
              Test: Force Stall
            </button>
            <button
              style={{
                ...styles.testButton,
                background: 'rgba(168, 85, 247, 0.3)',
                borderColor: 'rgba(168, 85, 247, 0.5)',
              }}
              disabled={gameState.phase === 'ended' || gameState.subphase === 'repairing' || gameState.boardState.size === 0}
              onClick={() => {
                dispatchEvent({ type: 'START_REPAIR', reason: 'endgame', triggeredBy: 'system' });
              }}
            >
              Test: Endgame Repair
            </button>
          </div>
      </div>}

      {/* DEV TOOLS - HIDDEN */}
      {false && <DevTools
        gameState={gameState}
        onStateChange={(updater) => setGameState(prev => prev ? updater(prev) : prev)}
        onDispatch={dispatchEvent}
      />}


      {/* Environment Preset Selector Modal */}
      <PresetSelectorModal
        isOpen={showSettings}
        currentPreset={currentPreset}
        onClose={() => setShowSettings(false)}
        onSelectPreset={(settings, presetKey) => {
          setEnvSettings(settings);
          setCurrentPreset(presetKey);
          saveCarriedPreset(presetKey);
        }}
      />

      {/* Piece Browser / Inventory Modal */}
      <PieceBrowserModal
        isOpen={showInventory}
        onClose={() => setShowInventory(false)}
        pieces={DEFAULT_PIECES}
        activePiece={DEFAULT_PIECES[0]}
        settings={envSettings}
        mode="oneOfEach"
        setsNeeded={setsNeeded}
        placedCountByPieceId={
          gameState 
            ? Object.fromEntries(
                Array.from(gameState.boardState.values())
                  .reduce((acc, p) => {
                    acc.set(p.pieceId, (acc.get(p.pieceId) ?? 0) + 1);
                    return acc;
                  }, new Map<string, number>())
              )
            : {}
        }
        customInventory={gameState?.inventory ?? {}}
        onSelectPiece={() => {}}
      />

      {/* How to Play Info Modal */}
      {showInfoModal && (
        <div style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(0, 0, 0, 0.8)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 10100,
        }} onClick={() => setShowInfoModal(false)}>
          <div style={{
            background: 'linear-gradient(145deg, #2d3748, #1a202c)',
            borderRadius: '16px',
            padding: '24px',
            maxWidth: '500px',
            width: '90%',
            maxHeight: '80vh',
            overflow: 'auto',
            border: '1px solid rgba(255, 255, 255, 0.1)',
            boxShadow: '0 20px 60px rgba(0, 0, 0, 0.5)',
          }} onClick={e => e.stopPropagation()}>
            <h2 style={{ color: '#fff', margin: '0 0 16px 0', fontSize: '1.5rem' }}>
              🎮 {pvpSession
                ? 'vs Player'
                : gameState.players.length > 1 
                  ? 'vs Computer' 
                  : 'Solo Mode'}
            </h2>
            
            <div style={{ color: 'rgba(255, 255, 255, 0.9)', lineHeight: 1.6, fontSize: '0.9rem' }}>
              <h3 style={{ color: '#60a5fa', margin: '12px 0 6px 0', fontSize: '1rem' }}>
                🧩 Puzzle Info
              </h3>
              <p style={{ margin: '0 0 10px 0' }}>
                <strong>{puzzle?.spec?.sphereCount ?? 0} cells</strong> • Using <strong>{setsNeeded} set{setsNeeded > 1 ? 's' : ''}</strong> ({setsNeeded * 25} pieces available)
              </p>

              <h3 style={{ color: '#60a5fa', margin: '12px 0 6px 0', fontSize: '1rem' }}>
                🎯 Goal
              </h3>
              <p style={{ margin: '0 0 10px 0' }}>
                {pvpSession
                  ? 'Take turns placing Koos pieces on a shared board. Each piece covers 4 cells. Highest score wins!'
                  : 'Fill the puzzle by placing Koos pieces. Each piece covers exactly 4 cells. Highest score wins!'}
              </p>

              <h3 style={{ color: '#60a5fa', margin: '12px 0 6px 0', fontSize: '1rem' }}>
                📊 Scoring
              </h3>
              <p style={{ margin: '0 0 10px 0' }}>
                <strong>+1 point</strong> for each piece you place manually<br/>
                <strong>0 points</strong> for pieces placed via hint<br/>
                <strong>-1 point</strong> for each piece removed during repair
              </p>

              <h3 style={{ color: '#60a5fa', margin: '12px 0 6px 0', fontSize: '1rem' }}>
                ✏️ Placing Pieces
              </h3>
              <p style={{ margin: '0 0 10px 0' }}>
                Click 4 adjacent cells to draw a piece. The shape must match one of the 25 Koos pieces (A-Y).
                {pvpSession && <><br/><strong>Shared inventory</strong> — each piece can only be placed once by either player.</>}
              </p>

              {gameState.settings.ruleToggles.allowRemoval && !pvpSession && (
                <>
                  <h3 style={{ color: '#60a5fa', margin: '12px 0 6px 0', fontSize: '1rem' }}>
                    🗑️ Remove Piece
                  </h3>
                  <p style={{ margin: '0 0 10px 0' }}>
                    Tap a placed piece to select it, then tap Remove to take it off the board. Great for experimenting and learning!
                  </p>
                </>
              )}

              <h3 style={{ color: '#60a5fa', margin: '12px 0 6px 0', fontSize: '1rem' }}>
                💡 Hint & Repair
              </h3>
              <p style={{ margin: '0 0 10px 0' }}>
                Click one cell, then tap Hint to place a valid piece. Hints give 0 points.
                <br/>If the puzzle is unsolvable, pieces are auto-removed until it's solvable again (-1 point each).
                {pvpSession && <><br/><strong>Limited hints:</strong> Each player has a set number of hints. Use them wisely!</>}
              </p>

              {pvpSession && (
                <>
                  <h3 style={{ color: '#60a5fa', margin: '12px 0 6px 0', fontSize: '1rem' }}>
                    🔍 Check (Solvability)
                  </h3>
                  <p style={{ margin: '0 0 10px 0' }}>
                    Suspect your opponent broke the puzzle? Use Check to verify.<br/>
                    <strong>If correct</strong>: bad pieces are repaired, you keep your turn. Check is <strong>not consumed</strong>.<br/>
                    <strong>If wrong</strong>: you lose your turn and the check <strong>is consumed</strong>.
                  </p>
                </>
              )}

              <h3 style={{ color: '#60a5fa', margin: '12px 0 6px 0', fontSize: '1rem' }}>
                🏁 Game End
              </h3>
              <p style={{ margin: '0 0 10px 0' }}>
                {pvpSession
                  ? 'Game ends when: puzzle completed, a player resigns, clock runs out, both stall, or a player has no hints, no checks, and no valid moves. Highest score wins!'
                  : gameState.players.length > 1 
                    ? 'Game ends when: puzzle completed, all players stalled, or timer runs out. Highest score wins!'
                    : 'Complete the puzzle by filling all cells!'}
              </p>
            </div>

            <button
              onClick={() => setShowInfoModal(false)}
              style={{
                marginTop: '20px',
                width: '100%',
                padding: '12px',
                background: tokens.gradient.info,
                color: '#fff',
                border: 'none',
                borderRadius: '8px',
                fontSize: '1rem',
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              Got it!
            </button>
          </div>
        </div>
      )}

      {/* PvP Chat Drawer — player-to-player in real matches, AI in simulated */}
      {pvpSession && pvpChatEnabled && (
        <ChatDrawer isOpen={chatOpen} onToggle={setChatOpen}>
          <ManualGameChatPanel
            messages={chat.messages}
            isSending={chat.isSending}
            onSendMessage={chat.sendUserMessage}
            onSendEmoji={chat.sendEmoji}
            subtitle={
              isHumanPvP
                ? t('pvp.chat.subtitleHuman', { name: pvpOpponentName })
                : t('pvp.chat.subtitleAI')
            }
            onReport={
              isHumanPvP && pvpOpponentId ? () => setShowChatReport(true) : undefined
            }
            reportLabel={t('pvp.chat.report')}
          />
        </ChatDrawer>
      )}

      {/* Report the conversation → flags the opponent (reports flow) */}
      {isHumanPvP && pvpOpponentId && (
        <ReportModal
          isOpen={showChatReport}
          onClose={() => setShowChatReport(false)}
          targetType="user"
          targetId={pvpOpponentId}
          targetLabel={pvpOpponentName}
          defaultReason="inappropriate"
        />
      )}
    </div>
  );
}

// ============================================================================
// STYLES
// ============================================================================

const styles: Record<string, React.CSSProperties> = {
  container: {
    width: '100%',
    height: '100dvh',
    background: 'transparent', // Let 3D board show through
    position: 'relative',
    overflow: 'hidden',
  },
  topBar: {
    position: 'fixed',
    top: '12px',
    right: '12px',
    display: 'flex',
    gap: '8px',
    zIndex: 200,
  },
  closeButton: {
    width: '40px',
    height: '40px',
    borderRadius: '50%',
    background: 'rgba(239, 68, 68, 0.9)',
    border: '1px solid rgba(255,255,255,0.2)',
    color: '#fff',
    fontSize: '1.2rem',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    transition: 'all 0.2s',
  },
  settingsButton: {
    width: '40px',
    height: '40px',
    borderRadius: '50%',
    background: 'rgba(75, 85, 99, 0.9)',
    border: '1px solid rgba(255,255,255,0.2)',
    color: '#fff',
    fontSize: '1.2rem',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    transition: 'all 0.2s',
  },
  bottomControls: {
    position: 'fixed',
    bottom: '20px',
    left: '50%',
    transform: 'translateX(-50%)',
    display: 'flex',
    gap: '12px',
    zIndex: 200,
  },
  bottomButton: {
    width: '48px',
    height: '48px',
    borderRadius: '12px',
    border: '1px solid rgba(255,255,255,0.2)',
    color: '#fff',
    fontSize: '1.4rem',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    transition: 'all 0.2s',
    boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
  },
  debugPanel: {
    position: 'fixed',
    bottom: '20px',
    left: '20px',
    background: 'rgba(30, 30, 40, 0.95)',
    borderRadius: '12px',
    padding: '16px',
    maxWidth: '350px',
    maxHeight: '400px',
    overflow: 'auto',
    zIndex: 150,
    border: '1px solid rgba(255,255,255,0.1)',
    backdropFilter: 'blur(8px)',
  },
  debugTitle: {
    fontSize: '0.9rem',
    fontWeight: 'bold',
    color: '#fff',
    marginBottom: '4px',
  },
  debugSubtitle: {
    fontSize: '0.75rem',
    color: 'rgba(255, 255, 255, 0.5)',
    marginBottom: '2px',
  },
  loadingPanel: {
    position: 'fixed',
    top: '50%',
    left: '50%',
    transform: 'translate(-50%, -50%)',
    background: 'rgba(30, 30, 40, 0.95)',
    borderRadius: '16px',
    padding: '40px 60px',
    textAlign: 'center',
    color: '#fff',
    fontSize: '1.2rem',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '16px',
    border: '1px solid rgba(255,255,255,0.1)',
    boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
  },
  errorPanel: {
    position: 'fixed',
    top: '50%',
    left: '50%',
    transform: 'translate(-50%, -50%)',
    background: 'rgba(40, 30, 30, 0.95)',
    borderRadius: '16px',
    padding: '40px',
    textAlign: 'center',
    color: '#fff',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '16px',
    border: '1px solid rgba(239, 68, 68, 0.3)',
    boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
    maxWidth: '400px',
  },
  errorIcon: {
    fontSize: '3rem',
  },
  errorTitle: {
    fontSize: '1.4rem',
    fontWeight: 'bold',
    color: '#ef4444',
  },
  errorMessage: {
    fontSize: '0.9rem',
    color: 'rgba(255,255,255,0.7)',
    marginBottom: '8px',
  },
  errorButton: {
    background: 'rgba(59, 130, 246, 0.8)',
    color: '#fff',
    border: 'none',
    borderRadius: '8px',
    padding: '12px 24px',
    fontSize: '1rem',
    fontWeight: 600,
    cursor: 'pointer',
  },
  placeButtonContainer: {
    position: 'fixed',
    bottom: '20px',
    left: '50%',
    transform: 'translateX(-50%)',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '8px',
    zIndex: 180,
  },
  placeButton: {
    background: 'rgba(34, 197, 94, 0.9)',
    color: '#fff',
    border: 'none',
    borderRadius: '12px',
    padding: '14px 28px',
    fontSize: '1.1rem',
    fontWeight: 700,
    cursor: 'pointer',
    boxShadow: '0 4px 16px rgba(0,0,0,0.3)',
    transition: 'all 0.2s ease',
  },
  placeButtonActive: {
    background: 'rgba(59, 130, 246, 0.9)',
    boxShadow: '0 4px 20px rgba(59, 130, 246, 0.4)',
  },
  placeHint: {
    background: 'rgba(0,0,0,0.7)',
    color: 'rgba(255,255,255,0.8)',
    padding: '6px 12px',
    borderRadius: '6px',
    fontSize: '0.85rem',
  },
  placeError: {
    position: 'fixed',
    bottom: '100px',
    left: '50%',
    transform: 'translateX(-50%)',
    background: 'rgba(239, 68, 68, 0.9)',
    color: '#fff',
    padding: '8px 16px',
    borderRadius: '8px',
    fontSize: '0.9rem',
    fontWeight: 600,
    zIndex: 190,
  },
  actionButtonContainer: {
    position: 'fixed',
    bottom: '20px',
    left: '50%',
    transform: 'translateX(-50%)',
    display: 'flex',
    gap: '12px',
    zIndex: 180,
  },
  actionButton: {
    background: 'rgba(34, 197, 94, 0.9)',
    color: '#fff',
    border: 'none',
    borderRadius: '12px',
    padding: '12px 20px',
    fontSize: '1rem',
    fontWeight: 700,
    cursor: 'pointer',
    boxShadow: '0 4px 16px rgba(0,0,0,0.3)',
    transition: 'all 0.2s ease',
  },
  actionButtonHint: {
    background: 'rgba(168, 85, 247, 0.9)',
  },
  actionButtonActive: {
    background: 'rgba(59, 130, 246, 0.9)',
    boxShadow: '0 4px 20px rgba(59, 130, 246, 0.4)',
  },
  modeHintPanel: {
    position: 'fixed',
    bottom: '80px',
    left: '50%',
    transform: 'translateX(-50%)',
    background: 'rgba(0,0,0,0.8)',
    color: '#fff',
    padding: '10px 16px',
    borderRadius: '8px',
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    fontSize: '0.9rem',
    zIndex: 180,
  },
  modeHintCancel: {
    background: 'rgba(239, 68, 68, 0.8)',
    color: '#fff',
    border: 'none',
    borderRadius: '6px',
    padding: '6px 12px',
    fontSize: '0.8rem',
    cursor: 'pointer',
  },
  anchorPickPanel: {
    position: 'fixed',
    bottom: '80px',
    left: '50%',
    transform: 'translateX(-50%)',
    background: 'rgba(30, 20, 40, 0.95)',
    border: '2px solid rgba(168, 85, 247, 0.5)',
    borderRadius: '12px',
    padding: '16px 20px',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '12px',
    zIndex: 180,
  },
  anchorPickTitle: {
    color: '#fff',
    fontSize: '1rem',
    fontWeight: 600,
  },
  anchorPickButtons: {
    display: 'flex',
    gap: '12px',
  },
  anchorPickConfirm: {
    background: 'rgba(34, 197, 94, 0.9)',
    color: '#fff',
    border: 'none',
    borderRadius: '8px',
    padding: '10px 20px',
    fontSize: '0.95rem',
    fontWeight: 600,
    cursor: 'pointer',
  },
  anchorPickCancel: {
    background: 'rgba(107, 114, 128, 0.8)',
    color: '#fff',
    border: 'none',
    borderRadius: '8px',
    padding: '10px 20px',
    fontSize: '0.95rem',
    fontWeight: 600,
    cursor: 'pointer',
  },
  turnBanner: {
    position: 'fixed',
    top: '12px',
    left: '50%',
    transform: 'translateX(-50%)',
    background: 'rgba(52, 211, 153, 0.9)',
    color: '#fff',
    padding: '8px 20px',
    borderRadius: '20px',
    fontSize: '0.9rem',
    fontWeight: 600,
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    zIndex: 200,
    boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
  },
  turnBannerEnded: {
    background: 'rgba(139, 92, 246, 0.9)',
  },
  turnBannerBusy: {
    background: 'rgba(251, 191, 36, 0.9)',
  },
  turnBannerAI: {
    background: 'rgba(59, 130, 246, 0.9)',
  },
  spinner: {
    animation: 'spin 1s linear infinite',
  },
  boardPlaceholder: {
    position: 'absolute',
    top: '50%',
    left: '50%',
    transform: 'translate(-50%, -50%)',
    textAlign: 'center',
    padding: '40px',
    background: 'rgba(30, 30, 40, 0.9)',
    borderRadius: '20px',
    border: '1px solid rgba(255,255,255,0.1)',
    maxWidth: '500px',
    width: '90%',
  },
  placeholderContent: {
    color: '#fff',
  },
  placeholderTitle: {
    margin: '0 0 16px',
    fontSize: '1.5rem',
  },
  placeholderText: {
    margin: '8px 0',
    color: 'rgba(255,255,255,0.7)',
  },
  boardStateInfo: {
    marginTop: '20px',
    textAlign: 'left',
  },
  stateDebug: {
    background: 'rgba(0,0,0,0.3)',
    padding: '12px',
    borderRadius: '8px',
    fontSize: '0.8rem',
    overflow: 'auto',
    maxHeight: '200px',
    color: 'rgba(255,255,255,0.8)',
    fontFamily: 'monospace',
  },
  pieceListContainer: {
    marginTop: '16px',
    padding: '12px',
    background: 'rgba(0,0,0,0.3)',
    borderRadius: '8px',
  },
  pieceListTitle: {
    fontSize: '0.8rem',
    color: tokens.text.onGradientMuted,
    marginBottom: '8px',
    textTransform: 'uppercase',
    letterSpacing: '1px',
  },
  pieceList: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: '6px',
  },
  pieceItem: {
    display: 'flex',
    alignItems: 'center',
    gap: '4px',
    padding: '4px 8px',
    background: 'rgba(255,255,255,0.1)',
    borderRadius: '4px',
    fontSize: '0.75rem',
    transition: 'all 0.2s ease',
  },
  pieceItemHighlight: {
    background: 'rgba(251, 191, 36, 0.5)',
    boxShadow: '0 0 12px rgba(251, 191, 36, 0.6)',
    transform: 'scale(1.1)',
  },
  pieceId: {
    fontWeight: 'bold',
    color: '#fff',
  },
  pieceOwner: {
    color: tokens.text.onGradientMuted,
  },
  testControls: {
    marginTop: '20px',
    display: 'flex',
    gap: '10px',
    justifyContent: 'center',
    flexWrap: 'wrap',
  },
  testButton: {
    padding: '10px 16px',
    background: 'rgba(102, 126, 234, 0.3)',
    border: '1px solid rgba(102, 126, 234, 0.5)',
    borderRadius: '8px',
    color: '#fff',
    cursor: 'pointer',
    fontSize: '0.85rem',
  },
  repairProgress: {
    marginTop: '16px',
    marginBottom: '16px',
  },
  repairProgressBar: {
    height: '8px',
    background: 'rgba(255,255,255,0.1)',
    borderRadius: '4px',
    overflow: 'hidden',
  },
  repairProgressFill: {
    height: '100%',
    background: 'linear-gradient(90deg, #f97316, #ef4444)',
    borderRadius: '4px',
    transition: 'width 0.3s ease',
  },
  repairProgressText: {
    display: 'block',
    marginTop: '4px',
    fontSize: '0.75rem',
    color: tokens.text.onGradientMuted,
    textAlign: 'center',
  },
  anchorSelectPanel: {
    marginTop: '16px',
    marginBottom: '16px',
    padding: '16px',
    background: 'rgba(102, 126, 234, 0.2)',
    border: '1px solid rgba(102, 126, 234, 0.4)',
    borderRadius: '12px',
  },
  anchorSelectTitle: {
    fontSize: '1rem',
    fontWeight: 'bold',
    marginBottom: '12px',
    color: '#fff',
  },
  anchorInputRow: {
    display: 'flex',
    gap: '16px',
    justifyContent: 'center',
    marginBottom: '12px',
  },
  anchorLabel: {
    display: 'flex',
    alignItems: 'center',
    gap: '4px',
    color: 'rgba(255,255,255,0.8)',
    fontSize: '0.9rem',
  },
  anchorInput: {
    width: '60px',
    padding: '6px 8px',
    borderRadius: '4px',
    border: '1px solid rgba(255,255,255,0.3)',
    background: 'rgba(0,0,0,0.3)',
    color: '#fff',
    fontSize: '0.9rem',
    textAlign: 'center',
  },
  anchorButtonRow: {
    display: 'flex',
    gap: '10px',
    justifyContent: 'center',
  },
  anchorConfirmButton: {
    padding: '10px 20px',
    background: tokens.gradient.brand,
    border: 'none',
    borderRadius: '8px',
    color: '#fff',
    cursor: 'pointer',
    fontSize: '0.9rem',
    fontWeight: 'bold',
  },
  anchorCancelButton: {
    padding: '10px 20px',
    background: 'rgba(255,255,255,0.1)',
    border: '1px solid rgba(255,255,255,0.3)',
    borderRadius: '8px',
    color: '#fff',
    cursor: 'pointer',
    fontSize: '0.9rem',
  },
};

export default GamePage;
