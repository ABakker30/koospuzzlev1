// Hook to load puzzle from Supabase by ID
import { useState, useEffect } from 'react';
import { supabase } from '../../../lib/supabase';
import type { IJK } from '../../../types/shape';
import type { StudioSettings } from '../../../types/studio';

export interface PuzzleData {
  id: string;
  name: string;
  creator_name: string;
  description: string | null;
  challenge_message: string | null;
  visibility: 'public' | 'private';
  geometry: IJK[];
  actions: any[];
  preset_config: StudioSettings | null;
  sphere_count: number;
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
        
        const { data, error: fetchError } = await supabase
          .from('puzzles')
          .select('*')
          .eq('id', puzzleId)
          .single();

        if (fetchError) {
          console.error('Supabase error:', fetchError);
          throw new Error(`Failed to load puzzle: ${fetchError.message}`);
        }

        if (!data) {
          throw new Error('Puzzle not found');
        }

        console.log('✅ Puzzle loaded:', data.name, `(${data.sphere_count} spheres)`);
        setPuzzle(data as PuzzleData);
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
