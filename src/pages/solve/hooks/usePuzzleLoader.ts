// Hook to load puzzle from Supabase by ID
import { useState, useEffect } from 'react';
import { supabase } from '../../../lib/supabase';
import type { IJK } from '../../../types/shape';
import type { StudioSettings } from '../../../types/studio';

export interface PuzzleData {
  id: string;
  shape_id: string; // Reference to contracts_shapes
  name: string;
  creator_name: string;
  description: string | null;
  challenge_message: string | null;
  visibility: 'public' | 'private';
  geometry: IJK[]; // From contracts_shapes.cells
  actions: any[];
  preset_config: StudioSettings | null;
  sphere_count: number; // From contracts_shapes.size
  creation_time_ms: number | null;
  created_at: string;
}

interface UsePuzzleLoaderReturn {
  puzzle: PuzzleData | null;
  loading: boolean;
  error: string | null;
}

export const usePuzzleLoader = (puzzleId: string | undefined): UsePuzzleLoaderReturn => {
  const [puzzle, setPuzzle] = useState<PuzzleData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!puzzleId) {
      setError('No puzzle ID provided');
      setLoading(false);
      return;
    }

    const loadPuzzle = async () => {
      try {
        console.log('🔍 Loading puzzle:', puzzleId);
        
        // Try to join with contracts_shapes, but make it optional (left join)
        const { data, error: fetchError } = await supabase
          .from('puzzles')
          .select(`
            id,
            shape_id,
            name,
            creator_name,
            description,
            challenge_message,
            visibility,
            geometry,
            sphere_count,
            actions,
            preset_config,
            creation_time_ms,
            created_at,
            contracts_shapes (
              cells,
              size
            )
          `)
          .eq('id', puzzleId)
          .single();

        if (fetchError) {
          console.error('Supabase error:', fetchError);
          console.error('Error code:', fetchError.code);
          console.error('Error details:', fetchError.details);
          console.error('Puzzle ID:', puzzleId);
          throw new Error(`Failed to load puzzle: ${fetchError.message}`);
        }

        if (!data) {
          throw new Error('Puzzle not found');
        }

        // Get geometry from contracts_shapes OR from puzzles.geometry
        const shapeData = (data as any).contracts_shapes;
        let geometry: IJK[];
        let sphereCount: number;
        
        if (shapeData && shapeData.cells && shapeData.cells.length > 0) {
          // Geometry from contracts_shapes.cells (canonical format: [[i,j,k], ...])
          const firstCell = shapeData.cells[0];
          
          // Check if format is valid (arrays, not objects)
          if (Array.isArray(firstCell)) {
            // Valid contract format - convert to IJK objects
            console.log('📦 Loading geometry from contracts_shapes (valid format)');
            geometry = shapeData.cells.map((cell: number[]) => ({
              i: cell[0],
              j: cell[1],
              k: cell[2]
            }));
            sphereCount = shapeData.size;
          } else {
            // Invalid format in contracts_shapes - fall back to puzzles.geometry
            console.warn('⚠️ Invalid cell format in contracts_shapes, falling back to puzzles.geometry');
            if ((data as any).geometry) {
              geometry = (data as any).geometry;
              sphereCount = (data as any).sphere_count || geometry.length;
            } else {
              throw new Error('Puzzle has invalid shape data and no fallback geometry');
            }
          }
        } else if ((data as any).geometry) {
          // New format: geometry directly in puzzles.geometry [{i,j,k},...]
          console.log('📦 Loading geometry from puzzles.geometry');
          geometry = (data as any).geometry;
          sphereCount = (data as any).sphere_count || geometry.length;
        } else {
          throw new Error('Puzzle has no geometry data');
        }

        const puzzleData: PuzzleData = {
          id: data.id,
          shape_id: data.shape_id,
          name: data.name,
          creator_name: data.creator_name,
          description: data.description,
          challenge_message: data.challenge_message,
          visibility: data.visibility as 'public' | 'private',
          geometry,
          actions: data.actions,
          preset_config: data.preset_config,
          sphere_count: sphereCount,
          creation_time_ms: data.creation_time_ms,
          created_at: data.created_at
        };

        console.log('✅ Puzzle loaded:', puzzleData.name, `(${puzzleData.sphere_count} spheres${puzzleData.shape_id ? `, shape: ${puzzleData.shape_id.substring(0, 20)}...` : ''})`);
        setPuzzle(puzzleData);
        setError(null);
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : 'Unknown error occurred';
        console.error('❌ Failed to load puzzle:', errorMessage);
        setError(errorMessage);
        setPuzzle(null);
      } finally {
        setLoading(false);
      }
    };

    loadPuzzle();
  }, [puzzleId]);

  return { puzzle, loading, error };
};
