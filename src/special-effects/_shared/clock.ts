/**
 * Clock utilities for special effects
 * Provides both real-time RAF and fixed-step timing for deterministic playback/recording
 */

export type FrameCallback = (dtSec: number) => void;
export type StepCallback = (frameIndex: number, dtSec: number, totalTime: number) => void;

let rafId: number | null = null;
let lastTime = 0;

/**
 * Start real-time animation frame loop with clamped delta time for stability
 * @param onFrame Callback with delta time in seconds
 */
export function startRAF(onFrame: FrameCallback): void {
  if (rafId !== null) {
    console.warn('⏰ RAF already running, stopping previous loop');
    stopRAF();
  }

  lastTime = performance.now();
  
  const tick = (currentTime: number) => {
    const rawDt = (currentTime - lastTime) / 1000; // Convert to seconds
    
    // Clamp delta time to [1/120 .. 1/15] for stability
    // This prevents huge jumps when tab is backgrounded or system lags
    const dtSec = Math.max(1/120, Math.min(1/15, rawDt));
    
    lastTime = currentTime;
    
    try {
      onFrame(dtSec);
    } catch (error) {
      console.error('⏰ Error in RAF callback:', error);
      stopRAF();
      return;
    }
    
    rafId = requestAnimationFrame(tick);
  };
  
  rafId = requestAnimationFrame(tick);
  console.log('⏰ RAF started');
}

/**
 * Stop the current RAF loop
 */
export function stopRAF(): void {
  if (rafId !== null) {
    cancelAnimationFrame(rafId);
    rafId = null;
    console.log('⏰ RAF stopped');
  }
}

/**
 * Run a fixed number of steps with consistent delta time
 * Used for offline/deterministic rendering
 * @param totalFrames Number of frames to render
 * @param dtSec Fixed delta time per frame (e.g., 1/30 for 30fps)
 * @param stepFn Callback for each frame
 */
export function runFixedSteps(
  totalFrames: number, 
  dtSec: number, 
  stepFn: StepCallback
): void {
  console.log(`⏰ Running ${totalFrames} fixed steps at ${dtSec.toFixed(4)}s per frame`);
  
  const startTime = performance.now();
  
  for (let frame = 0; frame < totalFrames; frame++) {
    const totalTime = frame * dtSec;
    
    try {
      stepFn(frame, dtSec, totalTime);
    } catch (error) {
      console.error(`⏰ Error in fixed step ${frame}:`, error);
      break;
    }
  }
  
  const endTime = performance.now();
  const elapsedMs = endTime - startTime;
  const avgFrameMs = elapsedMs / totalFrames;
  
  console.log(`⏰ Fixed steps completed: ${totalFrames} frames in ${elapsedMs.toFixed(1)}ms (avg ${avgFrameMs.toFixed(2)}ms/frame)`);
}

/**
 * Get current RAF status
 */
export function isRAFRunning(): boolean {
  return rafId !== null;
}

/**
 * Utility to calculate frame count from duration and FPS
 */
export function calculateFrameCount(durationSec: number, fps: number): number {
  return Math.ceil(durationSec * fps);
}

/**
 * Utility to calculate delta time from FPS
 */
export function calculateDeltaTime(fps: number): number {
  return 1 / fps;
}
