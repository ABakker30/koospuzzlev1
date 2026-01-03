// Badge calculation and user data API
import { supabase } from '../lib/supabase';
import { BadgeId, BADGE_THRESHOLDS, UserWithBadges } from '../types/badges';

/**
 * Get badges for a user from the user_badges table
 */
export async function getUserBadges(userId: string): Promise<BadgeId[]> {
  try {
    const { data, error } = await supabase
      .from('user_badges')
      .select('badge_id')
      .eq('user_id', userId);
    
    if (error) {
      console.error('Error fetching badges:', error);
      return ['new_explorer']; // Fallback
    }
    
    if (data && data.length > 0) {
      return data.map(b => b.badge_id as BadgeId);
    }
    
    return ['new_explorer']; // Default badge
  } catch (error) {
    console.error('Error fetching badges for user:', userId, error);
    return ['new_explorer'];
  }
}

/**
 * Sync badges for a user (call after solving puzzle or creating puzzle)
 */
export async function syncUserBadges(userId: string): Promise<void> {
  try {
    // Count manual solutions
    const { count: solveCount } = await supabase
      .from('solutions')
      .select('*', { count: 'exact', head: true })
      .eq('created_by', userId)
      .eq('solution_type', 'manual');
    
    // Determine which solver badge they should have
    let solverBadge: BadgeId | null = null;
    if (solveCount !== null) {
      if (solveCount >= BADGE_THRESHOLDS.puzzlesSolved.solver_3) {
        solverBadge = 'solver_3';
      } else if (solveCount >= BADGE_THRESHOLDS.puzzlesSolved.solver_2) {
        solverBadge = 'solver_2';
      } else if (solveCount >= BADGE_THRESHOLDS.puzzlesSolved.solver_1) {
        solverBadge = 'solver_1';
      }
    }
    
    // Ensure new_explorer badge exists
    await supabase
      .from('user_badges')
      .upsert({ user_id: userId, badge_id: 'new_explorer' }, { onConflict: 'user_id,badge_id' });
    
    // Add solver badge if earned
    if (solverBadge) {
      await supabase
        .from('user_badges')
        .upsert({ user_id: userId, badge_id: solverBadge }, { onConflict: 'user_id,badge_id' });
    }
  } catch (error) {
    console.error('Error syncing badges for user:', userId, error);
  }
}

/**
 * Get puzzle creator and all solvers with their badges
 */
export async function getPuzzleUsers(puzzleId: string): Promise<{
  creator: UserWithBadges | null;
  solvers: UserWithBadges[];
}> {
  try {
    // Get puzzle to find creator
    const { data: puzzle } = await supabase
      .from('puzzles')
      .select('created_by, creator_name')
      .eq('id', puzzleId)
      .single();
    
    let creator: UserWithBadges | null = null;
    
    if (puzzle?.created_by) {
      // Get creator user info
      const { data: creatorUser } = await supabase
        .from('users')
        .select('id, username')
        .eq('id', puzzle.created_by)
        .single();
      
      if (creatorUser) {
        const badges = await getUserBadges(creatorUser.id);
        creator = {
          id: creatorUser.id,
          username: creatorUser.username || puzzle.creator_name || 'Anonymous',
          badges,
          isCreator: true
        };
      } else if (puzzle.creator_name) {
        // Fallback for puzzles without linked user
        creator = {
          id: puzzle.created_by,
          username: puzzle.creator_name,
          badges: ['new_explorer'],
          isCreator: true
        };
      }
    }
    
    // Get all solvers for this puzzle
    const { data: solutions } = await supabase
      .from('solutions')
      .select('created_by, solver_name, created_at')
      .eq('puzzle_id', puzzleId)
      .eq('solution_type', 'manual')
      .order('created_at', { ascending: true });
    
    const solvers: UserWithBadges[] = [];
    const seenUserIds = new Set<string>();
    
    // Skip creator in solvers list
    if (creator) {
      seenUserIds.add(creator.id);
    }
    
    if (solutions) {
      for (const solution of solutions) {
        // Skip if we've already added this user or if it's the creator
        if (solution.created_by && seenUserIds.has(solution.created_by)) {
          continue;
        }
        
        if (solution.created_by) {
          seenUserIds.add(solution.created_by);
          
          // Get user info
          const { data: solverUser } = await supabase
            .from('users')
            .select('id, username')
            .eq('id', solution.created_by)
            .single();
          
          if (solverUser) {
            const badges = await getUserBadges(solverUser.id);
            solvers.push({
              id: solverUser.id,
              username: solverUser.username || solution.solver_name || 'Anonymous',
              badges,
              solveDate: solution.created_at
            });
          } else {
            // Fallback for solutions without linked user
            solvers.push({
              id: solution.created_by,
              username: solution.solver_name || 'Anonymous',
              badges: ['new_explorer'],
              solveDate: solution.created_at
            });
          }
        } else if (solution.solver_name) {
          // Anonymous solver
          solvers.push({
            id: `anon-${solution.created_at}`,
            username: solution.solver_name,
            badges: [],
            solveDate: solution.created_at
          });
        }
      }
    }
    
    return { creator, solvers };
  } catch (error) {
    console.error('Error fetching puzzle users:', error);
    return { creator: null, solvers: [] };
  }
}
