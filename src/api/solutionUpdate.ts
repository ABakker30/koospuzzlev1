import { supabase } from '../lib/supabase';

/**
 * Update solution metadata
 */
export async function updateSolution(
  id: string,
  updates: {
    solver_name?: string;
    notes?: string;
  }
): Promise<void> {
  const { error } = await supabase
    .from('solutions')
    .update(updates)
    .eq('id', id);

  if (error) {
    console.error('Failed to update solution:', error);
    throw new Error(`Failed to update solution: ${error.message}`);
  }
}
