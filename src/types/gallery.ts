// Unified gallery tile types - one tile per puzzle_id
import { PuzzleRecord } from '../api/puzzles';
import { PuzzleSolutionRecord } from '../api/solutions';

export type GalleryTile =
  | { 
      kind: 'solution'; 
      puzzle_id: string; 
      solution: PuzzleSolutionRecord; 
      solution_count: number;
      puzzle_name: string;
      thumbnail_url?: string;
    }
  | { 
      kind: 'shape'; 
      puzzle_id: string; 
      puzzle: PuzzleRecord; 
      solution_count: 0;
      puzzle_name: string;
      thumbnail_url?: string;
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
