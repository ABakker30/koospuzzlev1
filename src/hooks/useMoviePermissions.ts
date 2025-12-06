// Custom hook for movie creation/editing permissions
// Checks if user has permission to create/edit movies based on puzzle-solving status

import { useState, useEffect, useMemo } from 'react';
import { supabase } from '../lib/supabase';

interface MoviePermissionsResult {
  currentUser: any | null;
  userHasSolved: boolean;
  canCreateMovie: boolean;
  permissionMessage: string | null;
  setPermissionMessage: (message: string | null) => void;
  checkPermissionAndShowMessage: (action: string) => boolean;
}

/**
 * Hook to manage movie creation/editing permissions
 * @param movie - The movie being viewed (if any)
 * @param solution - The solution data
 * @param puzzleId - The puzzle ID (from solution or movie)
 * @returns Permission state and helper functions
 */
export const useMoviePermissions = (
  movie: any | null,
  solution: any | null,
  puzzleId: string | null
): MoviePermissionsResult => {
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [userHasSolved, setUserHasSolved] = useState(false);
  const [permissionMessage, setPermissionMessage] = useState<string | null>(null);

  // Check user session
  useEffect(() => {
    const checkUserSession = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      setCurrentUser(session?.user || null);
    };
    checkUserSession();
  }, []);

  // Check if user has solved the puzzle
  useEffect(() => {
    const checkUserSolution = async () => {
      if (!currentUser || !puzzleId) {
        setUserHasSolved(false);
        return;
      }

      const { data: userSolution } = await supabase
        .from('solutions')
        .select('id')
        .eq('puzzle_id', puzzleId)
        .eq('created_by', currentUser.id)
        .limit(1);

      const hasSolved = Boolean(userSolution && userSolution.length > 0);
      setUserHasSolved(hasSolved);
      console.log('🔐 User has solved puzzle:', hasSolved);
    };

    checkUserSolution();
  }, [currentUser, puzzleId]);

  // Compute if user can create/edit movies
  const canCreateMovie = useMemo(() => {
    if (!currentUser) return false;

    // User can create if they own the movie
    if (movie && movie.created_by === currentUser.id) return true;

    // User can create if they have solved this puzzle
    if (userHasSolved) return true;

    return false;
  }, [currentUser, movie, userHasSolved]);

  // Helper function to check permission and show message if denied
  const checkPermissionAndShowMessage = (action: string): boolean => {
    if (!canCreateMovie) {
      setPermissionMessage(`You must solve this puzzle yourself to ${action}`);
      setTimeout(() => setPermissionMessage(null), 5000);
      return false;
    }
    return true;
  };

  return {
    currentUser,
    userHasSolved,
    canCreateMovie,
    permissionMessage,
    setPermissionMessage,
    checkPermissionAndShowMessage
  };
};
