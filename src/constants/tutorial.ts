// Tutorial ladder — three seeded, solver-verified puzzles (scripts/
// verify-tutorial.ts + scratchpad single-piece search), now mapped onto the
// piece-mode curriculum: learn the PIECE → learn the PALETTE → learn SCARCITY.
//
//   1. One Piece  — flat 8, piece Y twice (4 covers). One shape to think
//      about; teaches the draw-4-connected-spheres gesture.
//   2. Free Pieces — flat 12, any pieces (superset of 8 distinct covers).
//      Choosing among shapes without being punished for spending one.
//   3. Classic    — solid 16, one of each piece (1938 covers). The real
//      puzzle: scarcity + 3D rotation.

import type { PieceMode } from '../game/contracts/GameState';

export interface TutorialStep {
  step: number;
  puzzleId: string;
  pieceMode: PieceMode;
  /** The repeating piece in 'single' mode. */
  singlePieceId: string | null;
  /** i18n keys (common namespace) — resolve with t() at render time. */
  titleKey: string;
  instructionKey: string;
  praiseKey: string;
}

export const TUTORIAL_STEPS: TutorialStep[] = [
  {
    step: 1,
    puzzleId: 'df66f90d-cd92-458e-ac93-801a6fdd7aa7',
    pieceMode: 'single',
    singlePieceId: 'Y',
    titleKey: 'tutorial.step1.title',
    instructionKey: 'tutorial.step1.instruction',
    praiseKey: 'tutorial.step1.praise',
  },
  {
    step: 2,
    puzzleId: 'd8562c3e-1c97-4d96-92e8-59ff65b2db76',
    pieceMode: 'duplicates',
    singlePieceId: null,
    titleKey: 'tutorial.step2.title',
    instructionKey: 'tutorial.step2.instruction',
    praiseKey: 'tutorial.step2.praise',
  },
  {
    step: 3,
    puzzleId: 'cafa6ecb-a7ad-4027-9371-6b4de0065a6d',
    pieceMode: 'unique',
    singlePieceId: null,
    titleKey: 'tutorial.step3.title',
    instructionKey: 'tutorial.step3.instruction',
    praiseKey: 'tutorial.step3.praise',
  },
];

// tutorialUrl moved to src/services/tutorialService.ts so it reads the
// admin-configurable, cache-backed ladder (constants/tutorial.ts stays the
// pure fallback + i18n-key source). Import it from the service.
