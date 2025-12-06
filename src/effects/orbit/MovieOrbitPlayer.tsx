// src/effects/orbit/MovieOrbitPlayer.tsx
// Headless controller for OrbitEffect. No SceneCanvas, no recording.

import React, {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from 'react';
import { OrbitEffect } from './OrbitEffect';
import type { OrbitConfig } from './types';
import { DEFAULT_CONFIG } from './presets';
import type { EffectContext } from '../../studio/EffectContext';

export interface OrbitMovieHandle {
  play: () => void;
  pause: () => void;
  stop: () => void;
  setConfig: (config: OrbitConfig) => void;
  getConfig: () => OrbitConfig | null;
  setRecording: (isRecording: boolean) => void;
  isReady: () => boolean;
}

interface MovieOrbitPlayerProps {
  effectContext: EffectContext | null;
  baseConfig?: OrbitConfig;
  autoplay?: boolean;
  loop?: boolean;
  onComplete?: () => void;
}

/**
 * Headless orbit effect controller.
 * - Receives an EffectContext (scene, camera, renderer, controls, etc.)
 * - Creates and owns an OrbitEffect instance
 * - Runs its animation loop
 * - Exposes an imperative handle for play/pause/stop/config/recording
 * - Calls onComplete() when the effect finishes
 */
export const MovieOrbitPlayer = forwardRef<OrbitMovieHandle, MovieOrbitPlayerProps>(
  ({ effectContext, baseConfig, autoplay = false, loop, onComplete }, ref) => {
    const [effectInstance, setEffectInstance] = useState<OrbitEffect | null>(null);
    const [currentConfig, setCurrentConfig] = useState<OrbitConfig | null>(
      baseConfig || DEFAULT_CONFIG
    );
    const hasAutoPlayedRef = useRef(false);

    // Create / re-create OrbitEffect when effectContext or baseConfig changes
    useEffect(() => {
      if (!effectContext) return;

      // Clean up old instance
      if (effectInstance) {
        effectInstance.stop?.();
        effectInstance.dispose?.();
      }

      const base = baseConfig || DEFAULT_CONFIG;
      const initialConfig: OrbitConfig = {
        ...base,
      };

      const instance = new OrbitEffect();
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
          effectInstance.play();
        },
        pause() {
          if (!effectInstance) return;
          effectInstance.pause?.();
        },
        stop() {
          if (!effectInstance) return;
          effectInstance.stop?.();
        },
        setConfig(config: OrbitConfig) {
          if (!effectInstance) return;
          const cfg: OrbitConfig = {
            ...config,
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

MovieOrbitPlayer.displayName = 'MovieOrbitPlayer';

export default MovieOrbitPlayer;
