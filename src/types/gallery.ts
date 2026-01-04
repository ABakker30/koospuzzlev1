// Unified gallery tile types - one tile per puzzle_id
import { PuzzleRecord } from '../api/puzzles';
import { PuzzleSolutionRecord } from '../api/solutions';

export type GalleryTile =
  | { 
      kind: 'solution'; 
      puzzle_id: string; 
      puzzle: PuzzleRecord; // Include puzzle for shape_size access
      solution: PuzzleSolutionRecord; 
      solution_count: number;
      total_like_count: number; // Sum of likes across ALL solutions for this puzzle
      puzzle_name: string;
      display_image?: string; // Solution preview_image or fallback to thumbnail
    }
  | { 
      kind: 'shape'; 
      puzzle_id: string; 
      puzzle: PuzzleRecord; 
      solution_count: 0;
      total_like_count: 0;
      puzzle_name: string;
      display_image?: string; // Puzzle thumbnail_url
    };

/**
 * Helper to get display name from tile
 */
export function getTileName(tile: GalleryTile): string {
  return tile.puzzle_name || (tile.kind === 'shape' ? tile.puzzle.name : 'Untitled');
}

/**
 * Helper to get creator from tile
 */
export function getTileCreator(tile: GalleryTile): string {
  return tile.kind === 'solution' ? tile.solution.solver_name : tile.puzzle.creator_name;
}
