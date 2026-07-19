// src/api/solutions.ts
import { supabase } from '../lib/supabase';
import { v4 as uuid } from 'uuid';

export interface SolutionRecord {
  id: string;
  user_id: string;
  shape_id?: string;
  name?: string;
  file_url: string;
  format: string;
  size_bytes?: number;
  checksum?: string;
  metrics?: Record<string, unknown>;
  version?: number;
  converted_to?: Record<string, unknown>;
  created_at: string;
}

export interface PuzzleSolutionRecord {
  id: string;
  puzzle_id: string;
  solver_name: string;
  solution_type: 'manual' | 'auto';
  final_geometry: any;
  actions: any[];
  solve_time_ms?: number;
  move_count?: number;
  /** Solved in Physical build mode with a verified gravity-stable assembly
   *  order (placed_pieces is stored in that order). NULL on legacy rows. */
  is_physical?: boolean | null;
  placed_pieces?: any[];
  notes?: string;
  created_at: string;
  puzzle_name?: string;
  thumbnail_url?: string; // Solution's screenshot thumbnail (from solutions table)
  // Computed fields
  time_to_solve_sec?: number;
  is_auto_solved?: boolean;
}

/**
 * Upload a solution file to Supabase storage
 * DEV MODE: Works without authentication using null user_id
 */
export async function uploadSolution(
  shapeId: string | null,
  file: File,
  name = file.name,
  metrics: Record<string, unknown> = {}
): Promise<SolutionRecord> {
  // DEV MODE: Use null if not signed in (requires nullable user_id column)
  const { data: { user } } = await supabase.auth.getUser();
  const userId = user?.id || null;

  const id = uuid();
  const path = `${userId || 'anonymous'}/${shapeId || 'unlinked'}/${Date.now()}-${file.name}`;

  // Upload to storage bucket
  const up = await supabase.storage.from('solutions').upload(path, file);
  if (up.error) throw up.error;

  // Create database record
  const { data, error } = await supabase
    .from('solutions')
    .insert({
      id,
      user_id: userId,
      shape_id: shapeId,
      name,
      file_url: path,
      size_bytes: file.size,
      metrics,
      format: 'legacy-solution'
    })
    .select()
    .single();

  if (error) throw error;
  return data as SolutionRecord;
}

/**
 * List solutions, optionally filtered by shape
 */
export async function listSolutions(shapeId?: string): Promise<SolutionRecord[]> {
  let query = supabase
    .from('solutions')
    .select('*')
    .order('created_at', { ascending: false });

  if (shapeId) {
    query = query.eq('shape_id', shapeId);
  }

  const { data, error } = await query;
  if (error) throw error;
  return data as SolutionRecord[];
}

/**
 * Get a signed URL to download/view a solution file
 */
export async function getSolutionSignedUrl(file_url: string, expiresInSeconds = 300): Promise<string> {
  const { data, error } = await supabase.storage
    .from('solutions')
    .createSignedUrl(file_url, expiresInSeconds);

  if (error) throw error;
  return data.signedUrl;
}

/**
 * Delete a solution and its file
 */
export async function deleteSolution(id: string, file_url: string): Promise<void> {
  // Delete from storage
  const { error: storageError } = await supabase.storage
    .from('solutions')
    .remove([file_url]);
  if (storageError) throw storageError;

  // Delete from database
  const { error: dbError } = await supabase
    .from('solutions')
    .delete()
    .eq('id', id);
  if (dbError) throw dbError;
}

/**
 * Get a specific solution by its ID
 */
export async function getSolutionById(solutionId: string): Promise<PuzzleSolutionRecord | null> {
  const { data: solutionData, error: solutionError } = await supabase
    .from('solutions')
    .select('*')
    .eq('id', solutionId)
    .maybeSingle();

  if (solutionError) {
    console.error('Solution query error:', solutionError);
    throw solutionError;
  }

  if (!solutionData) return null;

  // Get the puzzle name
  const { data: puzzleData } = await supabase
    .from('puzzles')
    .select('name')
    .eq('id', solutionData.puzzle_id)
    .single();

  const result: PuzzleSolutionRecord = {
    ...solutionData,
    puzzle_name: puzzleData?.name,
    time_to_solve_sec: solutionData.solve_time_ms 
      ? Math.round(solutionData.solve_time_ms / 1000) 
      : undefined,
    is_auto_solved: solutionData.solution_type === 'auto'
  };

  return result;
}

/**
 * Get a solution for a specific puzzle
 * Returns the most recent solution (newest first)
 */
export async function getPuzzleSolution(puzzleId: string): Promise<PuzzleSolutionRecord | null> {
  // First get the solution - most recent first
  const { data: solutionData, error: solutionError } = await supabase
    .from('solutions')
    .select('*')
    .eq('puzzle_id', puzzleId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (solutionError) {
    console.error('Solution query error:', solutionError);
    throw solutionError;
  }

  if (!solutionData) return null;

  // Then get the puzzle name separately
  const { data: puzzleData } = await supabase
    .from('puzzles')
    .select('name')
    .eq('id', puzzleId)
    .single();

  // Add computed fields
  const result: PuzzleSolutionRecord = {
    ...solutionData,
    puzzle_name: puzzleData?.name,
    time_to_solve_sec: solutionData.solve_time_ms 
      ? Math.round(solutionData.solve_time_ms / 1000) 
      : undefined,
    is_auto_solved: solutionData.solution_type === 'auto'
  };

  return result;
}

/**
 * Get all solutions for a specific puzzle
 */
export async function getPuzzleSolutions(puzzleId: string): Promise<PuzzleSolutionRecord[]> {
  // Get all solutions
  const { data: solutions, error } = await supabase
    .from('solutions')
    .select('*')
    .eq('puzzle_id', puzzleId)
    .order('created_at', { ascending: false });

  if (error) throw error;

  // Get puzzle name
  const { data: puzzleData } = await supabase
    .from('puzzles')
    .select('name')
    .eq('id', puzzleId)
    .single();

  return (solutions || []).map(solution => ({
    ...solution,
    puzzle_name: puzzleData?.name,
    time_to_solve_sec: solution.solve_time_ms 
      ? Math.round(solution.solve_time_ms / 1000) 
      : undefined,
    is_auto_solved: solution.solution_type === 'auto'
  })) as PuzzleSolutionRecord[];
}

/**
 * Lightweight summary of a solution, used to populate the solution picker
 * in explore mode. Excludes the heavy per-solution blobs (final_geometry,
 * actions, placed_pieces) — those are only fetched when a solution is opened.
 */
export interface PuzzleSolutionSummary {
  id: string;
  solver_name: string;
  solution_type: 'manual' | 'auto';
  created_at: string;
  thumbnail_url?: string;
  move_count?: number;
  solve_time_ms?: number;
  like_count?: number;
}

/**
 * List all solutions for a puzzle as lightweight summaries (no geometry),
 * newest first. For the explore-mode solution selector.
 */
export async function getPuzzleSolutionsList(puzzleId: string): Promise<PuzzleSolutionSummary[]> {
  const { data, error } = await supabase
    .from('solutions')
    .select('id, solver_name, solution_type, created_at, thumbnail_url, move_count, solve_time_ms, like_count')
    .eq('puzzle_id', puzzleId)
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Failed to list puzzle solutions:', error);
    throw error;
  }

  return (data || []) as PuzzleSolutionSummary[];
}

/**
 * Check if the current user has solved a specific puzzle
 */
export async function hasUserSolvedPuzzle(puzzleId: string): Promise<boolean> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return false;

  const { data, error } = await supabase
    .from('solutions')
    .select('id')
    .eq('puzzle_id', puzzleId)
    .eq('user_id', user.id)
    .limit(1);

  if (error) throw error;
  return (data?.length || 0) > 0;
}

/**
 * Fetch all public solutions with puzzle metadata for unified gallery
 * Returns solutions with puzzle names for tile construction
 */
export async function getPublicSolutions(): Promise<PuzzleSolutionRecord[]> {
  // Gallery feed: select only the lightweight columns the tiles need.
  // Heavy per-solution blobs (final_geometry, actions, placed_pieces) are
  // excluded here — they are only loaded when a single solution is opened.
  // Pulling them for every row ballooned this response to ~6.4 MB, which
  // stalled/blanked the gallery on mobile connections.
  const { data, error } = await supabase
    .from('solutions')
    .select(`
      id,
      puzzle_id,
      created_by,
      solver_name,
      solution_type,
      solve_time_ms,
      move_count,
      total_moves,
      undo_count,
      hints_used,
      solvability_checks_used,
      duration_ms,
      notes,
      like_count,
      created_at,
      thumbnail_url,
      puzzles!inner(name, thumbnail_url)
    `)
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Failed to fetch public solutions:', error);
    throw new Error(`Failed to fetch solutions: ${error.message}`);
  }

  return (data || []).map((row: any) => ({
    ...row,
    puzzle_name: row.puzzles?.name,
    puzzle_thumbnail_url: row.puzzles?.thumbnail_url, // Puzzle's thumbnail (from puzzles table)
    // thumbnail_url comes from solutions table (solution screenshot)
    time_to_solve_sec: row.solve_time_ms 
      ? Math.round(row.solve_time_ms / 1000) 
      : undefined,
    is_auto_solved: row.solution_type === 'auto',
    puzzles: undefined // Remove nested object
  })) as PuzzleSolutionRecord[];
}

/**
 * Get the most recent solution thumbnails for home page slideshow
 */
export async function getRecentSolutionThumbnails(limit: number = 5): Promise<string[]> {
  const { data, error } = await supabase
    .from('solutions')
    .select('thumbnail_url')
    .not('thumbnail_url', 'is', null)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) {
    console.error('Failed to fetch recent solution thumbnails:', error);
    return [];
  }

  return (data || [])
    .map((row: any) => row.thumbnail_url)
    .filter((url: string | null) => url && url.length > 0);
}
