import { useEffect, useRef } from 'react';

/**
 * Gesture types detected by the system
 */
export type GestureType = 'tap' | 'double-tap' | 'long-press';

/**
 * Gesture event data passed to callback
 */
export interface GestureEvent {
  type: GestureType;
  clientX: number;
  clientY: number;
  originalEvent: TouchEvent | MouseEvent;
}

/**
 * Configuration for gesture detection
 */
export interface GestureConfig {
  /** Time window for double-tap detection (ms) */
  doubleTapWindow?: number;
  /** Time before long-press triggers (ms) */
  longPressDelay?: number;
  /** Movement threshold to cancel gesture (px) */
  moveThreshold?: number;
  /** Enable desktop click support */
  enableDesktop?: boolean;
}

const DEFAULT_CONFIG: Required<GestureConfig> = {
  doubleTapWindow: 300,
  longPressDelay: 600,
  moveThreshold: 15,
  enableDesktop: true,
};

/**
 * Single gesture detector hook - replaces multiple conflicting touch handlers
 * 
 * DESIGN PRINCIPLES:
 * 1. Single source of truth for gesture state
 * 2. Detect gestures AFTER completion, not during
 * 3. Don't interfere with OrbitControls (drags)
 * 4. Clear separation: detection vs action
 * 
 * @param element - DOM element to attach listeners to
 * @param onGesture - Callback fired when gesture is detected
 * @param config - Optional configuration
 */
export function useGestureDetector(
  element: HTMLElement | null | undefined,
  onGesture: (gesture: GestureEvent) => void,
  config: GestureConfig = {}
) {
  const cfg = { ...DEFAULT_CONFIG, ...config };
  
  // Gesture tracking state
  const stateRef = useRef({
    // Touch tracking
    touchStartX: 0,
    touchStartY: 0,
    touchStartTime: 0,
    touchMoved: false,
    longPressFired: false, // Track if long-press already handled
    
    // Tap tracking for double-tap detection
    lastTapTime: 0,
    lastTapX: 0,
    lastTapY: 0,
    
    // Timers
    longPressTimer: null as NodeJS.Timeout | null,
    singleTapTimer: null as NodeJS.Timeout | null,
  });

  useEffect(() => {
    if (!element) {
      console.log('🔴 useGestureDetector: No element provided');
      return;
    }

    console.log('🟢 useGestureDetector: Attaching listeners to', element);
    const state = stateRef.current;

    // Cleanup function for timers
    const clearTimers = () => {
      if (state.longPressTimer) {
        clearTimeout(state.longPressTimer);
        state.longPressTimer = null;
      }
      if (state.singleTapTimer) {
        clearTimeout(state.singleTapTimer);
        state.singleTapTimer = null;
      }
    };

    // ============================================
    // TOUCH HANDLERS (Mobile)
    // ============================================

    const onTouchStart = (e: TouchEvent) => {
      // Only track single-finger gestures
      // Multi-touch = OrbitControls (pan/zoom)
      if (e.touches.length !== 1) {
        clearTimers();
        return;
      }

      const touch = e.touches[0];
      state.touchStartX = touch.clientX;
      state.touchStartY = touch.clientY;
      state.touchStartTime = Date.now();
      state.touchMoved = false;
      state.longPressFired = false; // Reset for new gesture

      // Start long-press timer
      state.longPressTimer = setTimeout(() => {
        if (!state.touchMoved) {
          // Long-press detected!
          console.log('🔵 Gesture: LONG-PRESS');
          state.longPressFired = true; // Mark as handled
          e.preventDefault(); // Block OrbitControls
          onGesture({
            type: 'long-press',
            clientX: state.touchStartX,
            clientY: state.touchStartY,
            originalEvent: e,
          });
          state.longPressTimer = null;
        }
      }, cfg.longPressDelay);
    };

    const onTouchMove = (e: TouchEvent) => {
      if (e.touches.length !== 1) return;

      const touch = e.touches[0];
      const deltaX = Math.abs(touch.clientX - state.touchStartX);
      const deltaY = Math.abs(touch.clientY - state.touchStartY);

      // Movement detected - this is a DRAG for OrbitControls
      if (deltaX > cfg.moveThreshold || deltaY > cfg.moveThreshold) {
        state.touchMoved = true;
        clearTimers(); // Cancel gesture detection
        // DON'T preventDefault - let OrbitControls handle
      }
    };

    const onTouchEnd = (e: TouchEvent) => {
      const touch = e.changedTouches[0];
      const now = Date.now();

      // Cancel long-press timer if it hasn't fired
      if (state.longPressTimer) {
        clearTimeout(state.longPressTimer);
        state.longPressTimer = null;
      }

      // If this was a drag, let OrbitControls finish
      // Don't dispatch any gesture
      if (state.touchMoved) {
        console.log('🔵 Gesture: DRAG (ignored)');
        state.touchMoved = false;
        return;
      }

      // If long-press already fired, don't process touchend as a tap
      if (state.longPressFired) {
        console.log('🔵 touchEnd: Long-press already handled, skipping tap detection');
        state.longPressFired = false; // Reset for next gesture
        return;
      }

      // Stationary touch = TAP or DOUBLE-TAP
      const timeSinceLastTap = now - state.lastTapTime;
      const distanceFromLastTap = Math.sqrt(
        Math.pow(touch.clientX - state.lastTapX, 2) +
        Math.pow(touch.clientY - state.lastTapY, 2)
      );

      // Check for DOUBLE-TAP
      if (
        timeSinceLastTap < cfg.doubleTapWindow &&
        distanceFromLastTap < cfg.moveThreshold
      ) {
        // Double-tap detected!
        console.log('🔵 Gesture: DOUBLE-TAP');
        e.preventDefault(); // Block OrbitControls
        
        // Cancel pending single-tap
        if (state.singleTapTimer) {
          clearTimeout(state.singleTapTimer);
          state.singleTapTimer = null;
        }

        onGesture({
          type: 'double-tap',
          clientX: touch.clientX,
          clientY: touch.clientY,
          originalEvent: e,
        });

        // Reset tap tracking
        state.lastTapTime = 0;
      } else {
        // Potential SINGLE-TAP
        // Wait to see if second tap comes
        state.lastTapTime = now;
        state.lastTapX = touch.clientX;
        state.lastTapY = touch.clientY;

        state.singleTapTimer = setTimeout(() => {
          // No second tap came - it's a SINGLE-TAP
          console.log('🔵 Gesture: TAP');
          e.preventDefault(); // Block OrbitControls
          
          onGesture({
            type: 'tap',
            clientX: touch.clientX,
            clientY: touch.clientY,
            originalEvent: e,
          });
          state.singleTapTimer = null;
        }, cfg.doubleTapWindow);
      }
    };

    // ============================================
    // MOUSE HANDLERS (Desktop)
    // ============================================

    const onMouseDown = (e: MouseEvent) => {
      if (!cfg.enableDesktop) return;
      
      state.touchStartX = e.clientX;
      state.touchStartY = e.clientY;
      state.touchStartTime = Date.now();
      state.touchMoved = false;
      state.longPressFired = false; // Reset for new gesture

      // Start long-press timer
      state.longPressTimer = setTimeout(() => {
        if (!state.touchMoved) {
          console.log('🔵 Gesture: LONG-PRESS (mouse)');
          state.longPressFired = true; // Mark as handled
          onGesture({
            type: 'long-press',
            clientX: state.touchStartX,
            clientY: state.touchStartY,
            originalEvent: e,
          });
          state.longPressTimer = null;
        }
      }, cfg.longPressDelay);
    };

    const onMouseMove = (e: MouseEvent) => {
      if (!cfg.enableDesktop) return;

      const deltaX = Math.abs(e.clientX - state.touchStartX);
      const deltaY = Math.abs(e.clientY - state.touchStartY);

      if (deltaX > cfg.moveThreshold || deltaY > cfg.moveThreshold) {
        state.touchMoved = true;
        clearTimers();
      }
    };

    const onMouseUp = (e: MouseEvent) => {
      if (!cfg.enableDesktop) return;

      if (state.longPressTimer) {
        clearTimeout(state.longPressTimer);
        state.longPressTimer = null;
      }

      if (state.touchMoved) {
        state.touchMoved = false;
        return;
      }

      // If long-press already fired, don't process mouseup as a click
      if (state.longPressFired) {
        console.log('🔵 mouseUp: Long-press already handled, skipping click');
        state.longPressFired = false; // Reset for next gesture
        return;
      }

      // Mouse click logic (simplified - no double-click needed, browser provides dblclick)
      console.log('🔵 Gesture: TAP (mouse)');
      onGesture({
        type: 'tap',
        clientX: e.clientX,
        clientY: e.clientY,
        originalEvent: e,
      });
    };

    const onMouseDoubleClick = (e: MouseEvent) => {
      if (!cfg.enableDesktop) return;

      console.log('🔵 Gesture: DOUBLE-TAP (mouse)');
      
      // Cancel any pending single-tap
      if (state.singleTapTimer) {
        clearTimeout(state.singleTapTimer);
        state.singleTapTimer = null;
      }

      onGesture({
        type: 'double-tap',
        clientX: e.clientX,
        clientY: e.clientY,
        originalEvent: e,
      });
    };

    // ============================================
    // ATTACH LISTENERS
    // ============================================

    // Touch events (mobile) - use CAPTURE phase to intercept before old handlers
    element.addEventListener('touchstart', onTouchStart, { passive: false, capture: true });
    element.addEventListener('touchmove', onTouchMove, { passive: true, capture: true });
    element.addEventListener('touchend', onTouchEnd, { passive: false, capture: true });

    // Mouse events (desktop)
    if (cfg.enableDesktop) {
      element.addEventListener('mousedown', onMouseDown, { capture: true });
      element.addEventListener('mousemove', onMouseMove, { capture: true });
      element.addEventListener('mouseup', onMouseUp, { capture: true });
      element.addEventListener('dblclick', onMouseDoubleClick, { capture: true });
    }

    // Cleanup
    return () => {
      clearTimers();

      element.removeEventListener('touchstart', onTouchStart, true);
      element.removeEventListener('touchmove', onTouchMove, true);
      element.removeEventListener('touchend', onTouchEnd, true);

      if (cfg.enableDesktop) {
        element.removeEventListener('mousedown', onMouseDown, true);
        element.removeEventListener('mousemove', onMouseMove, true);
        element.removeEventListener('mouseup', onMouseUp, true);
        element.removeEventListener('dblclick', onMouseDoubleClick, true);
      }
    };
  }, [element, onGesture, cfg.doubleTapWindow, cfg.longPressDelay, cfg.moveThreshold, cfg.enableDesktop]);
}
