import React, { useState, useRef, useEffect, useCallback } from 'react';
import { useNavigate, useParams, useLocation } from 'react-router-dom';
import { ReferenceCardTransition } from './koosAssembly/ReferenceCardTransition';
import { ReferenceCardPinned } from './koosAssembly/ReferenceCardPinned';
import { AssemblyCanvas } from './koosAssembly/AssemblyCanvas';
import { MatGridMode } from './koosAssembly/MatGridOverlay';
import { loadSolutionForAssembly, type AssemblySolution } from './koosAssembly/loadSolutionForAssembly';
import { computeAssemblyTransforms, type ThreeTransforms } from './koosAssembly/computeAssemblyTransforms';
import { useAssemblyTimeline } from './koosAssembly/useAssemblyTimeline';
import type { CameraSnapshot, SolutionOrientation } from './koosAssembly/types';
import { autoOrientSolution } from './koosAssembly/orientation/autoOrientSolution';
import { ijkToXyz } from '../lib/ijk';
import * as THREE from 'three';

type AssemblyStage = 'intro_reference_fullscreen' | 'assembling' | 'complete';

interface CardScreenPosition {
  x: number;
  y: number;
  visible: boolean;
}

export const KoosPuzzleAssemblyPage: React.FC = () => {
  const navigate = useNavigate();
  const { solutionId } = useParams<{ solutionId: string }>();
  const location = useLocation();
  const thumbDataUrl = location.state?.thumbDataUrl as string | undefined;
  const cameraSnapshot = location.state?.cameraSnapshot as CameraSnapshot | undefined;
  const solutionOrientation = location.state?.solutionOrientation as SolutionOrientation | undefined;
  
  const [stage, setStage] = useState<AssemblyStage>('intro_reference_fullscreen');
  const [cardScreen, setCardScreen] = useState<CardScreenPosition | null>(null);
  const [gridMode, setGridMode] = useState<MatGridMode>('A_SQUARE');
  const [solution, setSolution] = useState<AssemblySolution | null>(null);
  const [transforms, setTransforms] = useState<ThreeTransforms | null>(null);
  const [loading, setLoading] = useState(true);
  const [shouldStartTimeline, setShouldStartTimeline] = useState(false);
  const [computedOrientation, setComputedOrientation] = useState<SolutionOrientation | null>(null);
  
  // Assembly timeline
  const timeline = useAssemblyTimeline({
    solution,
    transforms,
    autoStart: false,
    config: {
      tMoveCurve: 1.0,
      tMoveLine: 0.5,
      tPauseBetween: 0.15,
    },
  });

  // Log timeline state for debugging
  useEffect(() => {
    console.log('📊 Timeline state:', timeline.state);
  }, [timeline.state]);
  
  // Store the API from onFrame to avoid re-creating functions
  const worldToScreenRef = useRef<((p: THREE.Vector3) => { x: number; y: number; visible: boolean }) | null>(null);
  const getAnchorsRef = useRef<(() => { card: THREE.Vector3 }) | null>(null);

  const handleClose = () => {
    // Try to go back, fallback to gallery
    if (window.history.length > 1) {
      navigate(-1);
    } else {
      navigate('/gallery');
    }
  };

  const handleTransitionComplete = () => {
    setStage('assembling');
    setShouldStartTimeline(true);
    console.log('✅ Transition complete - flagged to start assembly animation');
  };

  // Start timeline when ready and flagged
  useEffect(() => {
    if (shouldStartTimeline && timeline.isReady && stage === 'assembling') {
      console.log('🚀 Starting timeline...');
      timeline.start();
      setShouldStartTimeline(false);
    }
  }, [shouldStartTimeline, timeline.isReady, stage, timeline]);

  // Watch for timeline completion
  useEffect(() => {
    if (timeline.state?.stage === 'done' && stage === 'assembling') {
      setStage('complete');
      console.log('✅ Assembly animation complete');
    }
  }, [timeline.state?.stage, stage]);

  const handleFrame = useCallback((api: {
    worldToScreen: (p: THREE.Vector3) => { x: number; y: number; visible: boolean };
    getAnchors: () => { card: THREE.Vector3 };
  }) => {
    // Store API refs
    worldToScreenRef.current = api.worldToScreen;
    getAnchorsRef.current = api.getAnchors;

    // Update card screen position only if it changes significantly
    const anchors = api.getAnchors();
    const cardPos = api.worldToScreen(anchors.card);

    // Throttle setState by only updating when position changes by more than 3px or visibility changes
    setCardScreen((prev) => {
      if (!prev) return cardPos;
      const dxSq = (cardPos.x - prev.x) ** 2;
      const dySq = (cardPos.y - prev.y) ** 2;
      const distSq = dxSq + dySq;
      if (distSq > 9 || cardPos.visible !== prev.visible) {
        return cardPos;
      }
      return prev;
    });
  }, []);

  // Load solution on mount
  useEffect(() => {
    if (!solutionId) {
      setLoading(false);
      return;
    }

    const loadData = async () => {
      try {
        setLoading(true);
        console.log(`🔄 Loading solution ${solutionId} for assembly...`);
        
        const solutionData = await loadSolutionForAssembly(solutionId);
        setSolution(solutionData);

        // Compute deterministic orientation using autoOrientSolution
        let rootQuat: THREE.Quaternion | undefined;
        if (solutionData.allCells && solutionData.allCells.length > 0) {
          const orientResult = autoOrientSolution({
            ijkCells: solutionData.allCells,
            ijkToXyz: (ijk) => {
              const xyz = ijkToXyz(ijk);
              return { x: xyz.x, y: xyz.y, z: xyz.z };
            },
          });
          setComputedOrientation({
            quaternion: orientResult.rootQuaternion,
          });
          rootQuat = new THREE.Quaternion().fromArray(orientResult.rootQuaternion);
          console.log('🧭 Computed deterministic orientation for assembly');
        }

        // Compute transforms with root quaternion for proper TABLE/EXPLODED localization
        const transformsData = computeAssemblyTransforms(
          solutionData.pieces,
          solutionData.puzzleCentroid,
          rootQuat
        );
        setTransforms(transformsData);

        console.log(`✅ Loaded ${solutionData.pieces.length} pieces with 3 transform sets`);
        setLoading(false);
      } catch (error) {
        console.error('❌ Failed to load solution:', error);
        setLoading(false);
      }
    };

    loadData();
  }, [solutionId]);

  // Keyboard listener for dev controls
  useEffect(() => {
    const handleKeyPress = (e: KeyboardEvent) => {
      if (e.key === 'g' || e.key === 'G') {
        setGridMode(prev => prev === 'A_SQUARE' ? 'B_TRIANGULAR' : 'A_SQUARE');
        console.log('🔀 Grid mode toggled');
      } else if (e.key === ' ') {
        e.preventDefault();
        timeline.togglePause();
        console.log('⏯️ Timeline paused/resumed');
      } else if (e.key === 'r' || e.key === 'R') {
        timeline.restart();
        console.log('🔄 Timeline restarted');
      }
    };

    window.addEventListener('keydown', handleKeyPress);
    return () => window.removeEventListener('keydown', handleKeyPress);
  }, [timeline]);

  return (
    <div style={{
      position: 'fixed',
      inset: 0,
      overflow: 'hidden',
    }}>
      {/* Three.js Scene - Full screen background */}
      <AssemblyCanvas 
        onFrame={handleFrame} 
        gridMode={gridMode}
        solution={solution}
        poses={timeline.state?.poses ?? null}
        cameraSnapshot={cameraSnapshot}
        solutionOrientation={computedOrientation || solutionOrientation}
      />

      {/* X Button - Top Right - Always visible and clickable */}
      <button
        onClick={handleClose}
        style={{
          position: 'fixed',
          top: '20px',
          right: '20px',
          background: 'rgba(0, 0, 0, 0.3)',
          border: '2px solid rgba(255, 255, 255, 0.3)',
          borderRadius: '12px',
          color: '#fff',
          cursor: 'pointer',
          fontSize: '24px',
          width: '48px',
          height: '48px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          transition: 'all 0.2s',
          zIndex: 10000,
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.background = 'rgba(255, 255, 255, 0.2)';
          e.currentTarget.style.transform = 'scale(1.05)';
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.background = 'rgba(0, 0, 0, 0.3)';
          e.currentTarget.style.transform = 'scale(1)';
        }}
      >
        ✕
      </button>

      {/* Reference Card Transition - Phase 2 & 4 */}
      {thumbDataUrl && stage === 'intro_reference_fullscreen' && (
        <ReferenceCardTransition
          snapshotImage={thumbDataUrl}
          onDone={handleTransitionComplete}
          target={cardScreen}
        />
      )}

      {/* Assembly/Complete State - Show pinned reference card */}
      {thumbDataUrl && (stage === 'assembling' || stage === 'complete') && cardScreen && (
        <ReferenceCardPinned
          snapshotImage={thumbDataUrl}
          target={cardScreen}
        />
      )}

      {/* Fallback - no thumbnail */}
      {!thumbDataUrl && (
        <div style={{
          position: 'fixed',
          inset: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 20000,
        }}>
          <div style={{
            background: 'rgba(255, 255, 255, 0.95)',
            borderRadius: '20px',
            padding: '30px',
            maxWidth: '500px',
            boxShadow: '0 20px 60px rgba(0, 0, 0, 0.3)',
            textAlign: 'center',
          }}>
            <p style={{ color: '#666', margin: 0 }}>
              No reference image available. Please return to gallery and try again.
            </p>
          </div>
        </div>
      )}
    </div>
  );
};
