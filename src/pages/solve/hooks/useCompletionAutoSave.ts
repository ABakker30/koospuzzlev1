import { useEffect, useRef } from 'react';
import type { IJK } from '../../../types/shape';
import type { PlacedPiece } from '../types/manualSolve';
import { supabase } from '../../../lib/supabase';

type UseCompletionAutoSaveOptions = {
  puzzle: any;
  cells: IJK[];
  placed: Map<string, PlacedPiece>;
  solveStartTime: number | null;
  moveCount: number;
  solveActions: any[];
  setIsComplete: (complete: boolean) => void;
  setSolveEndTime: (time: number | null) => void;
  setRevealK: (k: number) => void;
  setShowCompletionCelebration: (show: boolean) => void;
  setCurrentSolutionId: (id: string | null) => void;
  setShowSuccessModal: (show: boolean) => void;
  setNotification: (msg: string) => void;
  setNotificationType: (type: 'info' | 'warning' | 'error' | 'success') => void;
};

export const useCompletionAutoSave = ({
  puzzle,
  cells,
  placed,
  solveStartTime,
  moveCount,
  solveActions,
  setIsComplete,
  setSolveEndTime,
  setRevealK,
  setShowCompletionCelebration,
  setCurrentSolutionId,
  setShowSuccessModal,
  setNotification,
  setNotificationType,
}: UseCompletionAutoSaveOptions) => {
  const hasSavedRef = useRef(false);
  const hasSetCompleteRef = useRef(false);

  // Check if solution is complete and auto-save it
  useEffect(() => {
    if (!puzzle || placed.size === 0) {
      hasSavedRef.current = false;
      hasSetCompleteRef.current = false;
      return;
    }

    // Build set of all placed cell coordinates
    const placedCells = new Set<string>();
    placed.forEach(piece => {
      piece.cells.forEach(cell => {
        const key = `${cell.i},${cell.j},${cell.k}`;
        placedCells.add(key);
      });
    });

    // Check if every container cell is covered
    const complete = cells.every(containerCell => {
      const key = `${containerCell.i},${containerCell.j},${containerCell.k}`;
      return placedCells.has(key);
    });

    // Set completion state once
    if (complete && !hasSetCompleteRef.current) {
      hasSetCompleteRef.current = true;
      setIsComplete(true);
      const endTime = Date.now();
      setSolveEndTime(endTime);
      setRevealK(placed.size);
      
      // Show celebration
      setShowCompletionCelebration(true);
      setTimeout(() => setShowCompletionCelebration(false), 2000);
    }
    
    // Auto-save logic (only runs once using ref)
    if (complete && !hasSavedRef.current) {
      hasSavedRef.current = true;
      console.log('🎉 Solution complete! Placed all', placedCells.size, 'cells');
      console.log('💾 Auto-saving manual solution...');
      
      // Auto-save the solution to database
      const saveSolution = async () => {
        try {
          // Get current user session
          const { data: { session } } = await supabase.auth.getSession();
          if (!session) {
            console.warn('⚠️ No user session, skipping auto-save');
            setNotification('Please log in to save solutions');
            setNotificationType('info');
            return;
          }

          const solutionGeometry = Array.from(placed.values()).flatMap(piece => piece.cells);
          const placedPieces = Array.from(placed.values()).map(piece => ({
            uid: piece.uid,
            pieceId: piece.pieceId,
            orientationId: piece.orientationId,
            anchorSphereIndex: piece.anchorSphereIndex,
            cells: piece.cells,
            placedAt: piece.placedAt
          }));
          
          // Use captured end time
          const solveTime = solveStartTime ? Date.now() - solveStartTime : null;
          
          const { data, error } = await supabase
            .from('solutions')
            .insert({
              puzzle_id: puzzle.id,
              created_by: session.user.id,
              solver_name: session.user.email || 'Anonymous',
              solution_type: 'manual',
              final_geometry: solutionGeometry,
              placed_pieces: placedPieces,
              actions: solveActions,
              solve_time_ms: solveTime,
              move_count: moveCount,
              notes: 'Manual solution'
            })
            .select()
            .single();
          
          if (error) {
            console.error('❌ Auto-save failed:', error);
            setNotification('❌ Failed to auto-save solution');
            setNotificationType('error');
            return;
          }
          
          console.log('✅ Solution auto-saved:', data.id);
          setCurrentSolutionId(data.id);
          
          // Show success modal after auto-save
          setTimeout(() => {
            setShowSuccessModal(true);
          }, 2500);
          
        } catch (err) {
          console.error('❌ Auto-save error:', err);
          setNotification('❌ Auto-save failed');
          setNotificationType('error');
        }
      };
      
      saveSolution();
    }
  }, [
    placed,
    cells,
    puzzle,
    solveActions,
    solveStartTime,
    moveCount,
    setIsComplete,
    setSolveEndTime,
    setRevealK,
    setShowCompletionCelebration,
    setCurrentSolutionId,
    setShowSuccessModal,
    setNotification,
    setNotificationType,
  ]);

  return {
    hasSavedRef,
    hasSetCompleteRef,
  };
};
