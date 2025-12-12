// src/effects/gravity/MovieGravityPlayer.tsx
// Headless controller for GravityEffect. No SceneCanvas, no recording.

import React,
{
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from 'react';
import { GravityEffect } from './GravityEffect';
import type { GravityEffectConfig } from './types';
import { DEFAULT_GRAVITY } from './types';
import type { EffectContext } from '../../studio/EffectContext';

/**
 * Compute a time-based seed from current HHMMSS.
 * E.g., 13:05:09 => 130509
 */
function computeTimeSeed(): number {
  const now = new Date();
  const hh = now.getHours();
  const mm = now.getMinutes();
  const ss = now.getSeconds();
  return hh * 10000 + mm * 100 + ss;
}

export interface GravityMovieHandle {
  play: () => void;
  pause: () => void;
  resume: () => void;
  stop: () => void;
  setConfig: (config: GravityEffectConfig) => void;
  getConfig: () => GravityEffectConfig | null;
  setRecording: (isRecording: boolean) => void;
  isReady: () => boolean;
}

interface MovieGravityPlayerProps {
  effectContext: EffectContext | null;
  baseConfig?: GravityEffectConfig;
  autoplay?: boolean;
  loop?: boolean; // (not used for internal looping yet; kept for future)
  onComplete?: () => void;
}

/**
 * Headless gravity effect controller.
 * - Receives an EffectContext (scene, camera, renderer, controls, etc.)
 * - Creates and owns a GravityEffect instance
 * - Runs its animation loop
 * - Exposes an imperative handle for play/pause/stop/config/recording
 * - Calls onComplete() when the effect finishes
 */
export const MovieGravityPlayer = forwardRef<GravityMovieHandle, MovieGravityPlayerProps>(
  ({ effectContext, baseConfig, autoplay = false, loop, onComplete }, ref) => {
    const [effectInstance, setEffectInstance] = useState<GravityEffect | null>(null);
    const [currentConfig, setCurrentConfig] = useState<GravityEffectConfig | null>(
      baseConfig || DEFAULT_GRAVITY
    );
    const hasAutoPlayedRef = useRef(false);

    // Create / re-create GravityEffect when effectContext or baseConfig changes
    useEffect(() => {
      if (!effectContext) return;

      // Clean up old instance
      if (effectInstance) {
        effectInstance.stop?.();
        effectInstance.dispose?.();
      }

      const base = baseConfig || DEFAULT_GRAVITY;
      const initialConfig: GravityEffectConfig = {
        ...base,
        preserveControls: true,
        // We explicitly disable internal looping; page controls loop behavior
        loop:
          (base && base.loop)
            ? { ...base.loop, enabled: false }
            : undefined,
        seed: base.seed ?? computeTimeSeed(),  // ✅ time-based seed
      };

      const instance = new GravityEffect();
      instance.init(effectContext);
      instance.setConfig(initialConfig);

      instance.setOnComplete(() => {
        // We don't make assumptions about loop here; page decides what to do.
        onComplete?.();
      });

      setCurrentConfig(initialConfig);
      setEffectInstance(instance);
      hasAutoPlayedRef.current = false;

      return () => {
        instance.stop?.();
        instance.dispose?.();
      };
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [effectContext, baseConfig]); // Don't include onComplete - it changes on every render

    // Animation loop
    useEffect(() => {
      if (!effectInstance) return;

      let animationFrameId: number;

      const tick = () => {
        // GravityEffect expects time in SECONDS
        effectInstance.tick(performance.now() / 1000);
        animationFrameId = requestAnimationFrame(tick);
      };

      animationFrameId = requestAnimationFrame(tick);

      return () => {
        cancelAnimationFrame(animationFrameId);
      };
    }, [effectInstance]);

    // Autoplay once when ready
    useEffect(() => {
      if (!effectInstance) return;
      if (!autoplay) return;
      if (hasAutoPlayedRef.current) return;

      effectInstance.play();
      hasAutoPlayedRef.current = true;
    }, [effectInstance, autoplay]);

    // Imperative API
    useImperativeHandle(
      ref,
      () => ({
        play() {
          if (!effectInstance) return;
          
          const base = currentConfig || DEFAULT_GRAVITY;
          const timeSeed = computeTimeSeed();
          const updated: GravityEffectConfig = {
            ...base,
            seed: timeSeed,  // ✅ new time-based seed per play
          };
          
          console.log(`🎲 New time-based seed: ${timeSeed} (${new Date().toTimeString().substring(0, 8)})`);
          setCurrentConfig(updated);
          effectInstance.setConfig(updated);
          effectInstance.play();
        },
        pause() {
          if (!effectInstance) return;
          effectInstance.pause?.();
        },
        resume() {
          if (!effectInstance) return;
          effectInstance.resume?.();
        },
        stop() {
          if (!effectInstance) return;
          effectInstance.stop?.();
        },
        setConfig(config: GravityEffectConfig) {
          if (!effectInstance) return;
          const cfg: GravityEffectConfig = {
            ...config,
            preserveControls: true,
            seed: config.seed ?? computeTimeSeed(),  // ✅ time-based seed
          };
          setCurrentConfig(cfg);
          effectInstance.setConfig(cfg);
        },
        getConfig() {
          return currentConfig;
        },
        setRecording(isRecording: boolean) {
          if (!effectInstance) return;
          (effectInstance as any).setRecording?.(isRecording);
        },
        isReady() {
          return !!effectInstance;
        },
      }),
      [effectInstance, currentConfig]
    );

    // Headless: renders nothing
    return null;
  }
);

MovieGravityPlayer.displayName = 'MovieGravityPlayer';

export default MovieGravityPlayer;
