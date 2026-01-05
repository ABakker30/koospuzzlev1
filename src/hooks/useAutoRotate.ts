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
  const isSolvedRef = useRef(isSolved);
  
  // Keep ref in sync
  isSolvedRef.current = isSolved;
  
  // 2 second inactivity timeout
  const INACTIVITY_TIMEOUT_MS = 2000;

  // Main effect - runs once on mount to set up polling and listeners
  useEffect(() => {
    let pollInterval: ReturnType<typeof setInterval> | null = null;
    let controls: any = null;
    let onStartHandler: (() => void) | null = null;
    let onEndHandler: (() => void) | null = null;

    const getControls = () => (window as any).getOrbitControls?.();

    const clearTimer = () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
    };

    const startAutoRotateTimer = () => {
      clearTimer();
      if (!isSolvedRef.current) return;
      
      timeoutRef.current = setTimeout(() => {
        const ctrl = getControls();
        if (ctrl && isSolvedRef.current) {
          ctrl.autoRotate = true;
          ctrl.autoRotateSpeed = autoRotateSpeed;
          console.log('🔄 Auto-rotate STARTED');
        }
      }, INACTIVITY_TIMEOUT_MS);
    };

    const stopAutoRotate = () => {
      clearTimer();
      const ctrl = getControls();
      if (ctrl) {
        ctrl.autoRotate = false;
      }
    };

    const setup = () => {
      controls = getControls();
      if (!controls) return false;

      console.log('✅ OrbitControls found');

      onStartHandler = () => {
        // User interaction started - stop auto-rotate
        stopAutoRotate();
      };

      onEndHandler = () => {
        // User interaction ended - start timer if solved
        if (isSolvedRef.current) {
          startAutoRotateTimer();
        }
      };

      controls.addEventListener('start', onStartHandler);
      controls.addEventListener('end', onEndHandler);

      // If already solved, start the timer
      if (isSolvedRef.current) {
        console.log('🎯 Puzzle already solved - starting auto-rotate timer');
        startAutoRotateTimer();
      }

      return true;
    };

    // Poll for controls to become available
    pollInterval = setInterval(() => {
      if (setup()) {
        clearInterval(pollInterval!);
        pollInterval = null;
      }
    }, 200);

    // Try immediately too
    if (setup()) {
      if (pollInterval) {
        clearInterval(pollInterval);
        pollInterval = null;
      }
    }

    return () => {
      if (pollInterval) clearInterval(pollInterval);
      clearTimer();
      if (controls && onStartHandler && onEndHandler) {
        controls.removeEventListener('start', onStartHandler);
        controls.removeEventListener('end', onEndHandler);
      }
      const ctrl = getControls();
      if (ctrl) ctrl.autoRotate = false;
    };
  }, [autoRotateSpeed]);

  // Effect to react to isSolved changes
  useEffect(() => {
    console.log('🎯 isSolved changed:', isSolved);
    
    const getControls = () => (window as any).getOrbitControls?.();
    const controls = getControls();
    
    if (isSolved) {
      // Puzzle became solved - start timer
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      
      timeoutRef.current = setTimeout(() => {
        const ctrl = getControls();
        if (ctrl && isSolvedRef.current) {
          ctrl.autoRotate = true;
          ctrl.autoRotateSpeed = autoRotateSpeed;
          console.log('🔄 Auto-rotate STARTED (from isSolved change)');
        }
      }, INACTIVITY_TIMEOUT_MS);
    } else {
      // Puzzle no longer solved - stop auto-rotate
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
      if (controls) {
        controls.autoRotate = false;
      }
    }
  }, [isSolved, autoRotateSpeed]);
}
