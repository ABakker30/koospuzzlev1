// Tutorial ladder — three seeded, solver-verified puzzles (scripts/
// verify-tutorial.ts): flat 8 (2 pieces, 7 solutions) → flat 12 (3 pieces,
// 8 solutions) → solid 16 (4 pieces, 1938 solutions). Flat boards teach the
// draw-4-connected-spheres gesture without 3D depth; step 3 adds rotation.

export interface TutorialStep {
  step: number;
  puzzleId: string;
  title: string;
  instruction: string;
  /** Shown on the completion overlay. */
  praise: string;
}

export const TUTORIAL_STEPS: TutorialStep[] = [
  {
    step: 1,
    puzzleId: '364b9078-dcd6-44d9-baa7-01abe33d390a',
    title: 'Lesson 1 · First Pieces',
    instruction: 'Tap 4 connected spheres to draw a piece. Fill the board with 2 pieces — stuck? tap 💡 for a hint.',
    praise: 'You just drew your first pieces!',
  },
  {
    step: 2,
    puzzleId: 'd8562c3e-1c97-4d96-92e8-59ff65b2db76',
    title: 'Lesson 2 · Three Shapes',
    instruction: 'Pieces come in different shapes. Fill this board with 3 of them.',
    praise: 'Three shapes, one solve — you’re getting it.',
  },
  {
    step: 3,
    puzzleId: 'cafa6ecb-a7ad-4027-9371-6b4de0065a6d',
    title: 'Lesson 3 · Into 3D',
    instruction: 'Now in 3D: drag to rotate the board. Fill it with 4 pieces.',
    praise: 'That was a real 3D solve. You’re ready.',
  },
];

export const tutorialUrl = (step: number): string => {
  const s = TUTORIAL_STEPS.find((t) => t.step === step);
  return s ? `/game/${s.puzzleId}?mode=solo&tutorial=${s.step}` : '/gallery';
};
