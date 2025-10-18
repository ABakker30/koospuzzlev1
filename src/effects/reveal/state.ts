// Reveal Effect State Management

export enum RevealState {
  IDLE = 'idle',
  PLAYING = 'playing', 
  PAUSED = 'paused',
  STOPPED = 'stopped',
  DISPOSED = 'disposed'
}

// State transition guards
export function canPlay(state: RevealState): boolean {
  return state === RevealState.IDLE || 
         state === RevealState.STOPPED || 
         state === RevealState.PAUSED;
}

export function canPause(state: RevealState): boolean {
  return state === RevealState.PLAYING;
}

export function canResume(state: RevealState): boolean {
  return state === RevealState.PAUSED;
}

export function canStop(state: RevealState): boolean {
  return state === RevealState.PLAYING || 
         state === RevealState.PAUSED;
}

export function canTick(state: RevealState): boolean {
  return state === RevealState.PLAYING;
}

export function isDisposed(state: RevealState): boolean {
  return state === RevealState.DISPOSED;
}
