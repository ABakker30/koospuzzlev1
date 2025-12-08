import { useState, useRef, useCallback } from 'react';
import type { IJK } from '../../../types/shape';
import type { PlacedPiece } from '../types/manualSolve';
import { supabase } from '../../../lib/supabase';

type Mode = 'oneOfEach' | 'unlimited' | 'single';

type UseSolutionSaveOptions = {
  puzzle: any;
  placed: Map<string, PlacedPiece>;
  mode: Mode;
  solveStartTime: number | null;
  solveEndTime: number | null;
  moveCount: number;
  solveActions: any[];
  setNotification: (msg: string) => void;
  setNotificationType: (type: 'info' | 'warning' | 'error' | 'success') => void;
};

export const useSolutionSave = ({
  puzzle,
  placed,
  mode,
  solveStartTime,
  solveEndTime,
  moveCount,
  solveActions,
  setNotification,
  setNotificationType,
}: UseSolutionSaveOptions) => {
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [showSaveModal, setShowSaveModal] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [currentSolutionId, setCurrentSolutionId] = useState<string | null>(null);
  const hasSavedRef = useRef(false);

  const handleSaveSolution = useCallback(async () => {
    if (!puzzle) {
      console.error('❌ No puzzle loaded');
      setNotification('Cannot save solution: no puzzle loaded.');
      setNotificationType('error');
      return;
    }

    if (placed.size === 0) {
      setNotification('No pieces placed yet.');
      setNotificationType('info');
      return;
    }

    if (hasSavedRef.current) {
      console.log('ℹ️ Solution already saved, skipping duplicate save');
      return;
    }

    const { data: { session }, error: sessionError } = await supabase.auth.getSession();
    if (sessionError || !session) {
      console.warn('⚠️ User not logged in, cannot save solution');
      setNotification('Please log in to save your solution.');
      setNotificationType('info');
      return;
    }

    const userId = session.user.id;
    const placedArray = Array.from(placed.values());

    const solveDurationMs = solveStartTime && solveEndTime 
      ? solveEndTime - solveStartTime 
      : null;

    const solutionData = {
      puzzle_id: puzzle.id,
      created_by: userId,
      user_id: userId,
      mode,
      solve_duration_ms: solveDurationMs,
      move_count: moveCount,
      placed_pieces: placedArray.map(p => ({
        pieceId: p.pieceId,
        orientationId: p.orientationId,
        anchorSphereIndex: p.anchorSphereIndex,
        cells: p.cells,
      })),
      solve_actions: solveActions,
    };

    setIsSaving(true);

    try {
      const { data, error } = await supabase
        .from('solutions')
        .insert([solutionData])
        .select()
        .single();

      if (error) {
        console.error('❌ Failed to save solution:', error);
        setNotification('Failed to save solution to database.');
        setNotificationType('error');
        setIsSaving(false);
        return;
      }

      if (!data) {
        console.error('❌ No data returned from insert');
        setNotification('Failed to save solution (no data returned).');
        setNotificationType('error');
        setIsSaving(false);
        return;
      }

      console.log('✅ Solution saved successfully:', data);
      hasSavedRef.current = true;
      setCurrentSolutionId(data.id);
      setNotification('Solution saved successfully!');
      setNotificationType('success');
      setIsSaving(false);
      setShowSaveModal(false);
      setShowSuccessModal(true);
    } catch (err) {
      console.error('❌ Error saving solution:', err);
      setNotification('Error saving solution.');
      setNotificationType('error');
      setIsSaving(false);
    }
  }, [
    puzzle,
    placed,
    mode,
    solveStartTime,
    solveEndTime,
    moveCount,
    solveActions,
    setNotification,
    setNotificationType,
  ]);

  return {
    showSuccessModal,
    setShowSuccessModal,
    showSaveModal,
    setShowSaveModal,
    isSaving,
    currentSolutionId,
    setCurrentSolutionId,
    hasSavedRef,
    handleSaveSolution,
  };
};
