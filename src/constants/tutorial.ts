// Tutorial ladder — three seeded, solver-verified puzzles (scripts/
// verify-tutorial.ts): flat 8 (2 pieces, 7 solutions) → flat 12 (3 pieces,
// 8 solutions) → solid 16 (4 pieces, 1938 solutions). Flat boards teach the
// draw-4-connected-spheres gesture without 3D depth; step 3 adds rotation.

export interface TutorialStep {
  step: number;
  puzzleId: string;
  /** i18n keys (common namespace) — resolve with t() at render time. */
  titleKey: string;
  instructionKey: string;
  praiseKey: string;
}

export const TUTORIAL_STEPS: TutorialStep[] = [
  {
    step: 1,
    puzzleId: '364b9078-dcd6-44d9-baa7-01abe33d390a',
    titleKey: 'tutorial.step1.title',
    instructionKey: 'tutorial.step1.instruction',
    praiseKey: 'tutorial.step1.praise',
  },
  {
    step: 2,
    puzzleId: 'd8562c3e-1c97-4d96-92e8-59ff65b2db76',
    titleKey: 'tutorial.step2.title',
    instructionKey: 'tutorial.step2.instruction',
    praiseKey: 'tutorial.step2.praise',
  },
  {
    step: 3,
    puzzleId: 'cafa6ecb-a7ad-4027-9371-6b4de0065a6d',
    titleKey: 'tutorial.step3.title',
    instructionKey: 'tutorial.step3.instruction',
    praiseKey: 'tutorial.step3.praise',
  },
];

export const tutorialUrl = (step: number): string => {
  const s = TUTORIAL_STEPS.find((t) => t.step === step);
  return s ? `/game/${s.puzzleId}?mode=solo&tutorial=${s.step}` : '/gallery';
};
