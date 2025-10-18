// Explosion Effect State Management

export enum ExplosionState {
  IDLE = 'idle',
  PLAYING = 'playing', 
  PAUSED = 'paused',
  STOPPED = 'stopped',
  DISPOSED = 'disposed'
}

// State transition guards
export function canPlay(state: ExplosionState): boolean {
  return state === ExplosionState.IDLE || 
         state === ExplosionState.STOPPED || 
         state === ExplosionState.PAUSED;
}

export function canPause(state: ExplosionState): boolean {
  return state === ExplosionState.PLAYING;
}

export function canResume(state: ExplosionState): boolean {
  return state === ExplosionState.PAUSED;
}

export function canStop(state: ExplosionState): boolean {
  return state === ExplosionState.PLAYING || 
         state === ExplosionState.PAUSED;
}

export function canTick(state: ExplosionState): boolean {
  return state === ExplosionState.PLAYING;
}

export function isDisposed(state: ExplosionState): boolean {
  return state === ExplosionState.DISPOSED;
}
