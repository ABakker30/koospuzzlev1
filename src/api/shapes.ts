// src/api/shapes.ts
import { supabase } from '../lib/supabase';
import { v4 as uuid } from 'uuid';

export interface ShapeRecord {
  id: string;
  user_id: string;
  name: string;
  file_url: string;
  format: string;
  size_bytes?: number;
  checksum?: string;
  metadata?: Record<string, unknown>;
  version?: number;
  converted_to?: Record<string, unknown>;
  created_at: string;
}

/**
 * Upload a shape file to Supabase storage and create a database record
 */
export async function uploadShape(
  file: File, 
  name = file.name, 
  meta: Record<string, unknown> = {}
): Promise<ShapeRecord> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not signed in');

  const id = uuid();
  const path = `${user.id}/${id}-${file.name}`;

  // Upload to storage bucket
  const up = await supabase.storage.from('shapes').upload(path, file);
  if (up.error) throw up.error;

  // Create database record
  const { data, error } = await supabase
    .from('shapes')
    .insert({
      id,
      user_id: user.id,
      name,
      file_url: path,
      size_bytes: file.size,
      metadata: meta,
      format: 'legacy'
    })
    .select()
    .single();

  if (error) throw error;
  return data as ShapeRecord;
}

/**
 * List all shapes for the current user
 */
export async function listShapes(): Promise<ShapeRecord[]> {
  const { data, error } = await supabase
    .from('shapes')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) throw error;
  return data as ShapeRecord[];
}

/**
 * Get a signed URL to download/view a shape file
 */
export async function getShapeSignedUrl(file_url: string, expiresInSeconds = 120): Promise<string> {
  const { data, error } = await supabase.storage
    .from('shapes')
    .createSignedUrl(file_url, expiresInSeconds);

  if (error) throw error;
  return data.signedUrl;
}

/**
 * Delete a shape and its file
 */
export async function deleteShape(id: string, file_url: string): Promise<void> {
  // Delete from storage
  const { error: storageError } = await supabase.storage
    .from('shapes')
    .remove([file_url]);
  if (storageError) throw storageError;

  // Delete from database
  const { error: dbError } = await supabase
    .from('shapes')
    .delete()
    .eq('id', id);
  if (dbError) throw dbError;
}
