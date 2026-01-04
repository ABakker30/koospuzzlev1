// Gallery tile construction and deduplication logic
import { GalleryTile } from '../types/gallery';
import { PuzzleRecord } from '../api/puzzles';
import { PuzzleSolutionRecord } from '../api/solutions';

/**
 * Build unified gallery tiles from puzzles and solutions
 * ONE tile per puzzle_id:
 * - If puzzle has solutions: show representative solution tile
 * - If puzzle has no solutions: show shape tile
 * 
 * Representative solution priority:
 * 1. featured_solution_id (if exists in puzzle)
 * 2. Most recent solution (created_at desc)
 */
export function buildGalleryTiles(
  puzzles: PuzzleRecord[],
  solutions: PuzzleSolutionRecord[]
): GalleryTile[] {
  const tiles: GalleryTile[] = [];
  
  // Group solutions by puzzle_id
  const solutionsByPuzzle = new Map<string, PuzzleSolutionRecord[]>();
  solutions.forEach(solution => {
    const puzzleId = solution.puzzle_id;
    if (!solutionsByPuzzle.has(puzzleId)) {
      solutionsByPuzzle.set(puzzleId, []);
    }
    solutionsByPuzzle.get(puzzleId)!.push(solution);
  });

  // Process each puzzle
  for (const puzzle of puzzles) {
    const puzzleSolutions = solutionsByPuzzle.get(puzzle.id) || [];
    
    if (puzzleSolutions.length > 0) {
      // Pick representative solution
      let representative: PuzzleSolutionRecord;
      
      // Priority 1: featured_solution_id
      if (puzzle.featured_solution_id) {
        const featured = puzzleSolutions.find(s => s.id === puzzle.featured_solution_id);
        if (featured) {
          representative = featured;
        } else {
          // Fallback: prefer solution with thumbnail_url, then most recent
          const withImage = puzzleSolutions.find(s => s.thumbnail_url);
          representative = withImage || puzzleSolutions[0];
        }
      } else {
        // Priority 2: Prefer solution with thumbnail_url, then most recent
        const withImage = puzzleSolutions.find(s => s.thumbnail_url);
        representative = withImage || puzzleSolutions[0];
      }

      // Determine display image: prefer solution's thumbnail_url, fallback to puzzle thumbnail
      const displayImage = representative.thumbnail_url || puzzle.thumbnail_url;

      // Sum likes across ALL solutions for this puzzle
      const totalLikeCount = puzzleSolutions.reduce((sum, sol) => {
        return sum + ((sol as any).like_count || 0);
      }, 0);

      console.log(`🎯 Tile for puzzle ${puzzle.id}:`, {
        hasSolutionImage: !!representative.thumbnail_url,
        solutionImage: representative.thumbnail_url,
        puzzleImage: puzzle.thumbnail_url,
        finalImage: displayImage,
        solutionCount: puzzleSolutions.length,
        totalLikeCount
      });

      // Create solution tile
      tiles.push({
        kind: 'solution',
        puzzle_id: puzzle.id,
        puzzle: puzzle, // Include puzzle for shape_size access
        solution: representative,
        solution_count: puzzleSolutions.length,
        total_like_count: totalLikeCount,
        puzzle_name: puzzle.name,
        display_image: displayImage
      });
    } else {
      // No solutions - create shape tile
      tiles.push({
        kind: 'shape',
        puzzle_id: puzzle.id,
        puzzle: puzzle,
        solution_count: 0,
        total_like_count: 0,
        puzzle_name: puzzle.name,
        display_image: puzzle.thumbnail_url
      });
    }
  }

  // Also handle solutions for puzzles that might not be in the puzzle list
  // (edge case: solution exists but puzzle was deleted or is private)
  const processedPuzzleIds = new Set(puzzles.map(p => p.id));
  const orphanSolutions = solutions.filter(s => !processedPuzzleIds.has(s.puzzle_id));
  
  // Group orphan solutions by puzzle_id
  const orphanByPuzzle = new Map<string, PuzzleSolutionRecord[]>();
  orphanSolutions.forEach(solution => {
    const puzzleId = solution.puzzle_id;
    if (!orphanByPuzzle.has(puzzleId)) {
      orphanByPuzzle.set(puzzleId, []);
    }
    orphanByPuzzle.get(puzzleId)!.push(solution);
  });

  // Add tiles for orphan solutions (use most recent as representative)
  // Note: These won't have accurate shape_size since puzzle is missing
  orphanByPuzzle.forEach((solutionsList, puzzleId) => {
    // Prefer solution with thumbnail_url
    const withImage = solutionsList.find(s => s.thumbnail_url);
    const representative = withImage || solutionsList[0];
    
    // Sum likes across ALL solutions for this orphan puzzle
    const totalLikeCount = solutionsList.reduce((sum, sol) => {
      return sum + ((sol as any).like_count || 0);
    }, 0);
    
    // Create minimal puzzle placeholder for orphan solutions
    const placeholderPuzzle = {
      id: puzzleId,
      name: representative.puzzle_name || 'Unknown Puzzle',
      shape_size: 0, // Unknown
    } as any;
    
    tiles.push({
      kind: 'solution',
      puzzle_id: puzzleId,
      puzzle: placeholderPuzzle,
      solution: representative,
      solution_count: solutionsList.length,
      total_like_count: totalLikeCount,
      puzzle_name: representative.puzzle_name || 'Unknown Puzzle',
      display_image: representative.thumbnail_url
    });
  });

  return tiles;
}

/**
 * Sort tiles: solutions first, then shapes
 * Within each group: by creation date (newest first)
 */
export function sortGalleryTiles(tiles: GalleryTile[]): GalleryTile[] {
  return [...tiles].sort((a, b) => {
    // Solutions before shapes
    if (a.kind === 'solution' && b.kind === 'shape') return -1;
    if (a.kind === 'shape' && b.kind === 'solution') return 1;
    
    // Within same kind: most recent first
    const aDate = a.kind === 'solution' 
      ? new Date(a.solution.created_at).getTime()
      : new Date(a.puzzle.created_at).getTime();
    const bDate = b.kind === 'solution'
      ? new Date(b.solution.created_at).getTime()
      : new Date(b.puzzle.created_at).getTime();
    
    return bDate - aDate; // Descending (newest first)
  });
}

/**
 * Filter tiles by solution status
 */
export function filterTilesBySolutions(
  tiles: GalleryTile[],
  filter: 'all' | 'with-solutions' | 'without-solutions'
): GalleryTile[] {
  if (filter === 'all') return tiles;
  if (filter === 'with-solutions') return tiles.filter(t => t.kind === 'solution');
  if (filter === 'without-solutions') return tiles.filter(t => t.kind === 'shape');
  return tiles;
}
