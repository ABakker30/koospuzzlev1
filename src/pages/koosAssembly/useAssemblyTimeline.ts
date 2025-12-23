import { useState, useEffect, useRef, useCallback } from 'react';
import { AssemblyTimeline, AssemblyTimelineConfig, TimelineState, createDeterministicPieceOrder } from './AssemblyTimeline';
import { ThreeTransforms } from './computeAssemblyTransforms';
import { AssemblySolution } from './loadSolutionForAssembly';

interface UseAssemblyTimelineOptions {
  solution: AssemblySolution | null;
  transforms: ThreeTransforms | null;
  autoStart?: boolean;
  config?: Partial<AssemblyTimelineConfig>;
}

const DEFAULT_CONFIG: Omit<AssemblyTimelineConfig, 'pieceOrder'> = {
  tMoveCurve: 1.0,
  tMoveLine: 0.5,
  tPauseBetween: 0.15,
  rotateMode: 'slerp',
};

export function useAssemblyTimeline(options: UseAssemblyTimelineOptions) {
  const { solution, transforms, autoStart = false, config: userConfig = {} } = options;
  
  const [state, setState] = useState<TimelineState | null>(null);
  const timelineRef = useRef<AssemblyTimeline | null>(null);
  const rafRef = useRef<number | null>(null);

  // Initialize timeline when solution and transforms are ready
  useEffect(() => {
    if (!solution || !transforms) {
      return;
    }

    console.log('🎬 Creating timeline instance...');

    // Create deterministic piece order
    const pieceIds = solution.pieces.map(p => p.pieceId);
    const pieceOrder = createDeterministicPieceOrder(
      pieceIds,
      transforms,
      solution.puzzleCentroid
    );

    const config: AssemblyTimelineConfig = {
      ...DEFAULT_CONFIG,
      ...userConfig,
      pieceOrder,
    };

    const timeline = new AssemblyTimeline(config, transforms);
    timelineRef.current = timeline;

    if (autoStart) {
      console.log('🚀 Auto-starting timeline...');
      timeline.start();
      startAnimationLoop();
    } else {
      // Initialize to starting state
      const initialState = timeline.update(0);
      setState(initialState);
    }

    return () => {
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
    };
  }, [solution, transforms, autoStart]); // REMOVED userConfig from deps!

  const startAnimationLoop = useCallback(() => {
    const animate = () => {
      if (!timelineRef.current) return;

      const now = performance.now();
      const newState = timelineRef.current.update(now);
      setState(newState);

      if (newState.stage === 'assembling' && !timelineRef.current.isPaused()) {
        rafRef.current = requestAnimationFrame(animate);
      } else {
        rafRef.current = null;
      }
    };

    rafRef.current = requestAnimationFrame(animate);
  }, []);

  const start = useCallback(() => {
    if (!timelineRef.current) return;
    timelineRef.current.start();
    startAnimationLoop();
  }, [startAnimationLoop]);

  const pause = useCallback(() => {
    if (!timelineRef.current) return;
    timelineRef.current.pause();
    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
  }, []);

  const resume = useCallback(() => {
    if (!timelineRef.current) return;
    timelineRef.current.resume();
    startAnimationLoop();
  }, [startAnimationLoop]);

  const restart = useCallback(() => {
    if (!timelineRef.current) return;
    timelineRef.current.restart();
    startAnimationLoop();
  }, [startAnimationLoop]);

  const togglePause = useCallback(() => {
    if (!timelineRef.current) return;
    if (timelineRef.current.isPaused()) {
      resume();
    } else {
      pause();
    }
  }, [pause, resume]);

  return {
    state,
    start,
    pause,
    resume,
    restart,
    togglePause,
    isReady: !!timelineRef.current,
  };
}
