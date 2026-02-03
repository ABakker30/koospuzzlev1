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
  maxSolutions?: number; // How many solutions requested (0 = unlimited)
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
  maxSolutions = 1,
}: UseCompletionAutoSaveOptions) => {
  // Track saved solutions by signature to allow saving multiple unique solutions
  const savedSolutionsRef = useRef<Set<string>>(new Set());
  const hasSetCompleteRef = useRef(false);
  const lastSolutionSigRef = useRef<string | null>(null);

  // Compute a signature for the current solution
  const computeSolutionSignature = (placedMap: Map<string, PlacedPiece>): string => {
    const pieces = Array.from(placedMap.values());
    // Sort by pieceId and cells to get consistent signature
    const sorted = pieces.map(p => ({
      pieceId: p.pieceId,
      cells: p.cells.map(c => `${c.i},${c.j},${c.k}`).sort().join(';')
    })).sort((a, b) => a.pieceId.localeCompare(b.pieceId) || a.cells.localeCompare(b.cells));
    return JSON.stringify(sorted);
  };

  // Check if solution is complete and auto-save it
  useEffect(() => {
    if (!puzzle || placed.size === 0) {
      // Reset completion state when puzzle is cleared
      hasSetCompleteRef.current = false;
      lastSolutionSigRef.current = null;
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

    // Compute signature for current solution
    const currentSig = computeSolutionSignature(placed);
    const isNewSolution = !savedSolutionsRef.current.has(currentSig);
    const isDifferentFromLast = currentSig !== lastSolutionSigRef.current;

    // Set completion state (reset hasSetCompleteRef when solution changes)
    if (isDifferentFromLast) {
      hasSetCompleteRef.current = false;
      lastSolutionSigRef.current = currentSig;
    }

    if (complete && !hasSetCompleteRef.current) {
      hasSetCompleteRef.current = true;
      setIsComplete(true);
      const endTime = Date.now();
      setSolveEndTime(endTime);
      setRevealK(placed.size);
      
      // Show celebration
      setShowCompletionCelebration(true);
      setTimeout(() => setShowCompletionCelebration(false), 2000);
      
      // Auto-save logic - only save if this is a new unique solution
      if (isNewSolution) {
        savedSolutionsRef.current.add(currentSig);
        console.log('🎉 Solution complete! Placed all', placedCells.size, 'cells');
        console.log(`💾 Auto-saving solution #${savedSolutionsRef.current.size}...`);
        
        // Auto-save the solution to database
        const saveSolution = async () => {
          try {
            // Get current user session
            const { data: { session } } = await supabase.auth.getSession();
            
            // Calculate animation duration based on number of pieces (200ms per piece + 500ms buffer)
            const animationDuration = (placed.size * 200) + 500;
            console.log(`⏱️ Waiting ${animationDuration}ms for ${placed.size} pieces to animate...`);
            await new Promise(resolve => setTimeout(resolve, animationDuration));
            
            // Determine if we should show blocking modal or just notification
            // Show blocking modal only if: maxSolutions=1, or this is the last requested solution
            const solutionCount = savedSolutionsRef.current.size;
            const isLastSolution = maxSolutions > 0 && solutionCount >= maxSolutions;
            const showBlockingModal = maxSolutions === 1 || isLastSolution;
            
            if (showBlockingModal) {
              // Show blocking success modal
              setTimeout(() => {
                setShowSuccessModal(true);
              }, 500);
            } else {
              // Show non-blocking notification for intermediate solutions
              setNotification(`✅ Solution #${solutionCount} saved! Searching for more...`);
              setNotificationType('success');
            }
            
            if (!session) {
              console.warn('⚠️ No user session, skipping database save');
              setNotification('Log in to save your solution to the gallery!');
              setNotificationType('info');
              return;
            }

            // Fetch username from users table
            let solverName = session.user.email || 'Anonymous';
            try {
              const { data: userData } = await supabase
                .from('users')
                .select('username')
                .eq('id', session.user.id)
                .single();
              if (userData?.username) {
                solverName = userData.username;
              }
            } catch (err) {
              console.warn('⚠️ Could not fetch username, using email');
            }

            // Get comprehensive solve statistics with endTime passed directly
            const stats = getSolveStats();
            
            // Override duration_ms with actual endTime since state hasn't updated yet
            const durationMs = solveStartTime ? endTime - solveStartTime : null;
          
            // Build final geometry from all placed pieces
            const finalGeometry = Array.from(placed.values()).flatMap(piece => piece.cells);
          
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
            solver_name: solverName,
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
    savedSolutionsRef,
    hasSetCompleteRef,
  };
};
