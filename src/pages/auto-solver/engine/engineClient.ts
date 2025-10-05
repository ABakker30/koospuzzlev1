// src/pages/auto-solver/engine/engineClient.ts
import { EngineEvent, EngineState } from './engineTypes';

export interface EngineClient {
  state(): EngineState;
  start(): void;      // start or resume
  pause(): void;      // pause
  onEvent(cb: (e: EngineEvent) => void): void;
  dispose(): void;
}

// v0 stub that replays initial JSON events - will be replaced by real engine bridge
export function createMockEngineClient(initial: EngineEvent[]): EngineClient {
  let currentState: EngineState = 'idle';
  let listeners: Array<(e: EngineEvent) => void> = [];
  let timer: NodeJS.Timeout | null = null;
  let eventIndex = 0;
  let isPaused = false;

  const fireEvent = (e: EngineEvent) => {
    listeners.forEach(cb => cb(e));
  };

  const playNextEvent = () => {
    if (eventIndex >= initial.length) {
      currentState = 'solved';
      return;
    }

    const event = initial[eventIndex];
    eventIndex++;

    // Update state based on event
    if (event.type === 'started') {
      currentState = 'running';
    } else if (event.type === 'solved') {
      currentState = 'solved';
    } else if (event.type === 'error') {
      currentState = 'error';
    }

    fireEvent(event);

    // Schedule next event if still running
    if (!isPaused && currentState === 'running' && eventIndex < initial.length) {
      timer = setTimeout(playNextEvent, 500); // 500ms between events
    }
  };

  return {
    state: () => currentState,
    
    start: () => {
      console.log('🚀 EngineClient: Starting/Resuming');
      if (currentState === 'idle') {
        currentState = 'running';
        isPaused = false;
        eventIndex = 0;
        playNextEvent();
      } else if (currentState === 'paused') {
        currentState = 'running';
        isPaused = false;
        playNextEvent();
      }
    },
    
    pause: () => {
      console.log('⏸️  EngineClient: Pausing');
      isPaused = true;
      currentState = 'paused';
      if (timer) {
        clearTimeout(timer);
        timer = null;
      }
    },
    
    onEvent: (cb: (e: EngineEvent) => void) => {
      listeners.push(cb);
    },
    
    dispose: () => {
      if (timer) {
        clearTimeout(timer);
        timer = null;
      }
      listeners = [];
      currentState = 'idle';
    }
  };
}
