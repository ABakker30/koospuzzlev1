import { useEffect, useRef } from 'react';
import type { IJK } from '../../../types/shape';
import type { PlacedPiece } from '../types/manualSolve';
import { supabase } from '../../../lib/supabase';
import { captureCanvasScreenshot } from '../../../services/thumbnailService';

type UseCompletionAutoSaveOptions = {
  puzzle: any;
  cells: IJK[];
  placed: Map<string, PlacedPiece>;
  solveStartTime: number | null;
  moveCount: number;
  solveActions: any[];
  getSolveStats: () => any; // Function to get comprehensive solve stats
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
  getSolveStats,
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
      
      // Auto-save logic immediately with endTime captured
      if (!hasSavedRef.current) {
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

            // Get comprehensive solve statistics with endTime passed directly
            const stats = getSolveStats();
            
            // Override duration_ms with actual endTime since state hasn't updated yet
            const durationMs = solveStartTime ? endTime - solveStartTime : null;
          
          // Build final geometry from all placed pieces
          const finalGeometry = Array.from(placed.values()).flatMap(piece => piece.cells);
          
          // Calculate animation duration based on number of pieces (200ms per piece + 500ms buffer)
          const animationDuration = (placed.size * 200) + 500;
          console.log(`⏱️ Waiting ${animationDuration}ms for ${placed.size} pieces to animate...`);
          await new Promise(resolve => setTimeout(resolve, animationDuration));
          
          // Capture screenshot for solution thumbnail
          let thumbnailUrl: string | null = null;
          try {
            const canvas = document.querySelector('canvas') as HTMLCanvasElement;
            if (canvas) {
              console.log('📸 Capturing solution screenshot...');
              const screenshotBlob = await captureCanvasScreenshot(canvas);
              console.log('✅ Screenshot captured:', (screenshotBlob.size / 1024).toFixed(2), 'KB');
              
              // Upload thumbnail to solution-thumbnails bucket
              const fileName = `${puzzle.id}-${session.user.id}-${Date.now()}.png`;
              const filePath = `thumbnails/${fileName}`;
              
              const { error: uploadError } = await supabase.storage
                .from('solution-thumbnails')
                .upload(filePath, screenshotBlob, {
                  contentType: 'image/png',
                  upsert: false
                });
              
              if (uploadError) {
                console.error('❌ Failed to upload thumbnail:', uploadError);
              } else {
                const { data: publicUrlData } = supabase.storage
                  .from('solution-thumbnails')
                  .getPublicUrl(filePath);
                thumbnailUrl = publicUrlData.publicUrl;
                console.log('✅ Thumbnail uploaded:', thumbnailUrl);
              }
            }
          } catch (err) {
            console.error('⚠️ Screenshot capture failed:', err);
            // Continue saving solution even if screenshot fails
          }
          
          const solutionData = {
            puzzle_id: puzzle.id,
            created_by: session.user.id,
            solver_name: session.user.email || 'Anonymous',
            solution_type: 'manual', // Required for puzzle_stats trigger
            final_geometry: finalGeometry,
            placed_pieces: Array.from(placed.values()), // Store piece placement data for analysis/replay
            thumbnail_url: thumbnailUrl, // Add thumbnail URL
            // Leaderboard statistics
            total_moves: stats.total_moves,
            undo_count: stats.undo_count,
            hints_used: stats.hints_used,
            solvability_checks_used: stats.solvability_checks_used,
            duration_ms: durationMs, // Use computed duration from captured endTime
            // Puzzle stats compatibility (for aggregation trigger)
            solve_time_ms: durationMs,
            move_count: stats.total_moves,
          };
          
          const { data, error } = await supabase
            .from('solutions')
            .insert([solutionData])
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
    }
  }, [
    placed,
    cells,
    puzzle,
    solveActions,
    solveStartTime,
    moveCount,
    getSolveStats,
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
