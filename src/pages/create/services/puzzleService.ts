import { supabase } from '../../../lib/supabase';
import type { IJK } from '../../../types/shape';
import type { Action } from '../hooks/useActionTracker';

export interface PuzzleData {
  name: string;
  creatorName: string;
  description?: string;
  visibility: 'public' | 'private';
  geometry: IJK[];
  actions: Action[];
  presetConfig: any;
  sphereCount: number;
  creationTimeMs: number;
}

export interface SavedPuzzle extends PuzzleData {
  id: string;
  createdAt: string;
  updatedAt: string;
}

export const savePuzzleToSupabase = async (puzzleData: PuzzleData): Promise<SavedPuzzle> => {
  const { data, error } = await supabase
    .from('puzzles')
    .insert([
      {
        name: puzzleData.name,
        creator_name: puzzleData.creatorName,
        description: puzzleData.description,
        visibility: puzzleData.visibility,
        geometry: puzzleData.geometry,
        actions: puzzleData.actions,
        preset_config: puzzleData.presetConfig,
        sphere_count: puzzleData.sphereCount,
        creation_time_ms: puzzleData.creationTimeMs,
      },
    ])
    .select()
    .single();

  if (error) {
    console.error('Supabase error:', error);
    throw new Error(`Failed to save puzzle: ${error.message}`);
  }

  return {
    id: data.id,
    name: data.name,
    creatorName: data.creator_name,
    description: data.description,
    visibility: data.visibility,
    geometry: data.geometry,
    actions: data.actions,
    presetConfig: data.preset_config,
    sphereCount: data.sphere_count,
    creationTimeMs: data.creation_time_ms,
    createdAt: data.created_at,
    updatedAt: data.updated_at,
  };
};

export const loadPuzzleFromSupabase = async (puzzleId: string): Promise<SavedPuzzle> => {
  const { data, error } = await supabase
    .from('puzzles')
    .select('*')
    .eq('id', puzzleId)
    .single();

  if (error) {
    console.error('Supabase error:', error);
    throw new Error(`Failed to load puzzle: ${error.message}`);
  }

  return {
    id: data.id,
    name: data.name,
    creatorName: data.creator_name,
    description: data.description,
    visibility: data.visibility,
    geometry: data.geometry,
    actions: data.actions,
    presetConfig: data.preset_config,
    sphereCount: data.sphere_count,
    creationTimeMs: data.creation_time_ms,
    createdAt: data.created_at,
    updatedAt: data.updated_at,
  };
};
