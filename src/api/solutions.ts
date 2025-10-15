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

/**
 * Upload a solution file to Supabase storage
 * DEV MODE: Works without authentication using dev-user ID
 */
export async function uploadSolution(
  shapeId: string | null,
  file: File,
  name = file.name,
  metrics: Record<string, unknown> = {}
): Promise<SolutionRecord> {
  // DEV MODE: Use dev-user if not signed in
  const { data: { user } } = await supabase.auth.getUser();
  const userId = user?.id || 'dev-user';

  const id = uuid();
  const path = `${userId}/${shapeId || 'unlinked'}/${Date.now()}-${file.name}`;

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
