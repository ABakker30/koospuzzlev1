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
        
        // Join puzzles with contracts_shapes to get geometry
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
            actions,
            preset_config,
            creation_time_ms,
            created_at,
            contracts_shapes!inner (
              cells,
              size
            )
          `)
          .eq('id', puzzleId)
          .single();

        if (fetchError) {
          console.error('Supabase error:', fetchError);
          throw new Error(`Failed to load puzzle: ${fetchError.message}`);
        }

        if (!data) {
          throw new Error('Puzzle not found');
        }

        // Convert contracts_shapes.cells format [[i,j,k],...] to IJK objects
        const shapeData = (data as any).contracts_shapes;
        const geometry: IJK[] = shapeData.cells.map((cell: number[]) => ({
          i: cell[0],
          j: cell[1],
          k: cell[2]
        }));

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
          sphere_count: shapeData.size,
          creation_time_ms: data.creation_time_ms,
          created_at: data.created_at
        };

        console.log('✅ Puzzle loaded:', puzzleData.name, `(${puzzleData.sphere_count} spheres, shape: ${puzzleData.shape_id.substring(0, 20)}...)`);
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
