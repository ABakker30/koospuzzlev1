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
  console.log('🔧 Starting puzzle save process...');
  console.log('📊 Puzzle data:', { 
    name: puzzleData.name, 
    sphereCount: puzzleData.sphereCount,
    geometryLength: puzzleData.geometry.length 
  });
  
  // Step 1: Create a canonical shape_id from the geometry
  // For now, use a simple hash of the geometry
  const geometryString = JSON.stringify(puzzleData.geometry.map(p => [p.i, p.j, p.k]).sort());
  const shapeId = `shape_${btoa(geometryString).substring(0, 16)}`;
  console.log('🔑 Generated shape_id:', shapeId);
  
  // Step 2: Ensure the shape exists in contracts_shapes
  // Check if shape already exists
  console.log('🔍 Checking if shape exists in contracts_shapes...');
  const { data: existingShape, error: checkError } = await supabase
    .from('contracts_shapes')
    .select('id')
    .eq('id', shapeId)
    .single();
  
  if (checkError && checkError.code !== 'PGRST116') {
    // PGRST116 is "not found" which is expected
    console.error('❌ Error checking for existing shape:', checkError);
    throw new Error(`Failed to check shape: ${checkError.message}`);
  }
  
  if (!existingShape) {
    console.log('➕ Shape does not exist, creating in contracts_shapes...');
    // Create the shape in contracts_shapes
    const { data: newShape, error: shapeError } = await supabase
      .from('contracts_shapes')
      .insert({
        id: shapeId,
        lattice: 'fcc',  // Face-centered cubic lattice
        cells: puzzleData.geometry.map(c => [c.i, c.j, c.k]), // Convert IJK objects to arrays
        size: puzzleData.sphereCount
      })
      .select()
      .single();
    
    if (shapeError) {
      console.error('❌ Failed to create shape:', shapeError);
      throw new Error(`Failed to create shape: ${shapeError.message}`);
    }
    
    console.log('✅ Shape created successfully:', newShape?.id);
  } else {
    console.log('✅ Shape already exists:', existingShape.id);
  }
  
  // Step 3: Create the puzzle with the shape_id
  const { data, error } = await supabase
    .from('puzzles')
    .insert([
      {
        shape_id: shapeId,
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
