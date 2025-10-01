// Turn Table Effect State Management

export enum TurnTableState {
  IDLE = 'idle',
  PLAYING = 'playing', 
  PAUSED = 'paused',
  STOPPED = 'stopped',
  DISPOSED = 'disposed'
}

// State transition guards
export function canPlay(state: TurnTableState): boolean {
  return state === TurnTableState.IDLE || 
         state === TurnTableState.STOPPED || 
         state === TurnTableState.PAUSED;
}

export function canPause(state: TurnTableState): boolean {
  return state === TurnTableState.PLAYING;
}

export function canResume(state: TurnTableState): boolean {
  return state === TurnTableState.PAUSED;
}

export function canStop(state: TurnTableState): boolean {
  return state === TurnTableState.PLAYING || 
         state === TurnTableState.PAUSED;
}

export function canTick(state: TurnTableState): boolean {
  return state === TurnTableState.PLAYING;
}

export function isDisposed(state: TurnTableState): boolean {
  return state === TurnTableState.DISPOSED;
}
