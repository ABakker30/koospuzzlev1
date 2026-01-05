import { useEffect, useRef } from 'react';

/**
 * Hook to enable auto-rotate on orbit controls when puzzle is solved
 * and user hasn't interacted with controls for a specified timeout.
 * 
 * Auto-rotate only activates when:
 * 1. Puzzle is in solved state (isSolved = true)
 * 2. User hasn't interacted with orbit controls for 2 seconds
 * 
 * @param isSolved - Whether the puzzle is currently in a solved state
 * @param autoRotateSpeed - Speed of rotation (default: 2.0, positive = counter-clockwise)
 */
export function useAutoRotate(
  isSolved: boolean,
  autoRotateSpeed: number = 2.0
) {
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isUserInteractingRef = useRef(false);
  const listenersSetupRef = useRef(false);
  
  // 2 second inactivity timeout
  const INACTIVITY_TIMEOUT_MS = 2000;

  // Single effect that handles everything based on isSolved
  useEffect(() => {
    let pollInterval: ReturnType<typeof setInterval> | null = null;
    let controlsInstance: any = null;

    const getControls = () => (window as any).getOrbitControls?.();

    const clearTimer = () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
    };

    const enableAutoRotate = () => {
      const ctrl = getControls();
      if (ctrl) {
        ctrl.autoRotate = true;
        ctrl.autoRotateSpeed = autoRotateSpeed;
        console.log('🔄 Auto-rotate STARTED after 2s timeout');
      }
    };

    const disableAutoRotate = () => {
      const ctrl = getControls();
      if (ctrl) {
        ctrl.autoRotate = false;
      }
    };

    const scheduleAutoRotate = () => {
      // Only schedule if puzzle is solved and user is not interacting
      if (!isSolved || isUserInteractingRef.current) {
        return;
      }
      
      clearTimer();
      console.log('⏰ Scheduling auto-rotate in 2 seconds...');
      timeoutRef.current = setTimeout(() => {
        // Double-check conditions before enabling
        if (isSolved && !isUserInteractingRef.current) {
          enableAutoRotate();
        }
      }, INACTIVITY_TIMEOUT_MS);
    };

    const onStart = () => {
      // User started interacting
      isUserInteractingRef.current = true;
      clearTimer();
      disableAutoRotate();
      console.log('👆 User interaction started - auto-rotate disabled');
    };

    const onEnd = () => {
      // User stopped interacting
      isUserInteractingRef.current = false;
      console.log('👆 User interaction ended');
      
      // Schedule auto-rotate if puzzle is solved
      if (isSolved) {
        scheduleAutoRotate();
      }
    };

    const setupListeners = (controls: any) => {
      if (listenersSetupRef.current) return;
      
      controls.addEventListener('start', onStart);
      controls.addEventListener('end', onEnd);
      controlsInstance = controls;
      listenersSetupRef.current = true;
      console.log('✅ OrbitControls listeners attached');
    };

    const trySetup = () => {
      const controls = getControls();
      if (!controls) return false;
      
      setupListeners(controls);
      
      // If puzzle is already solved and user is not interacting, schedule auto-rotate
      if (isSolved && !isUserInteractingRef.current) {
        scheduleAutoRotate();
      }
      
      return true;
    };

    // If puzzle is solved, set up listeners and schedule rotation
    if (isSolved) {
      console.log('🎯 Puzzle is SOLVED - setting up auto-rotate');
      
      // Try immediately
      if (!trySetup()) {
        // Poll until controls available
        pollInterval = setInterval(() => {
          if (trySetup()) {
            clearInterval(pollInterval!);
            pollInterval = null;
          }
        }, 200);
      }
    } else {
      // Puzzle not solved - disable auto-rotate
      console.log('🎯 Puzzle is NOT SOLVED - disabling auto-rotate');
      clearTimer();
      disableAutoRotate();
    }

    // Cleanup
    return () => {
      if (pollInterval) clearInterval(pollInterval);
      clearTimer();
      
      if (controlsInstance && listenersSetupRef.current) {
        controlsInstance.removeEventListener('start', onStart);
        controlsInstance.removeEventListener('end', onEnd);
        listenersSetupRef.current = false;
      }
      
      disableAutoRotate();
    };
  }, [isSolved, autoRotateSpeed]);
}
