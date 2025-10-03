// Orbit Effect State Management

export enum OrbitState {
  IDLE = 'idle',
  PLAYING = 'playing', 
  PAUSED = 'paused',
  DISPOSED = 'disposed'
}

// State transition helpers
export function canPlay(state: OrbitState): boolean {
  return state === OrbitState.IDLE || state === OrbitState.PAUSED;
}

export function canPause(state: OrbitState): boolean {
  return state === OrbitState.PLAYING;
}

export function canResume(state: OrbitState): boolean {
  return state === OrbitState.PAUSED;
}

export function canStop(state: OrbitState): boolean {
  return state === OrbitState.PLAYING || state === OrbitState.PAUSED;
}

export function canTick(state: OrbitState): boolean {
  return state === OrbitState.PLAYING;
}

export function isDisposed(state: OrbitState): boolean {
  return state === OrbitState.DISPOSED;
}
