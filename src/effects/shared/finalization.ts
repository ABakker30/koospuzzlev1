// Finalization policy handlers
export type Finalize = 'leaveAsEnded' | 'returnToStart' | 'snapToPose';

export function finalizeTurntable(
  policy: Finalize,
  restoreStart: () => void,
  snapToHero: () => void
) {
  switch (policy) {
    case 'returnToStart': restoreStart(); break;
    case 'snapToPose':    snapToHero();   break;
    default:              /* leaveAsEnded */ break;
  }
}
