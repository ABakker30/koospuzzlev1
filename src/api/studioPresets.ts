import { supabase } from '../lib/supabase';
import type { StudioSettings } from '../types/studio';

export interface StudioPreset {
  id: string;
  created_at: string;
  updated_at: string;
  user_id: string;
  name: string;
  description?: string;
  settings: StudioSettings;
  is_public: boolean;
}

export interface CreatePresetParams {
  name: string;
  description?: string;
  settings: StudioSettings;
  is_public?: boolean;
}

export interface UpdatePresetParams {
  name?: string;
  description?: string;
  settings?: StudioSettings;
  is_public?: boolean;
}

/**
 * Save a new studio preset
 * DEV MODE: Works without authentication
 */
export async function saveStudioPreset(params: CreatePresetParams): Promise<StudioPreset> {
  const { data: { user } } = await supabase.auth.getUser();
  const userId = user?.id || null; // DEV MODE: Allow null user_id

  const { data, error } = await supabase
    .from('studio_presets')
    .insert({
      user_id: userId,
      name: params.name,
      description: params.description,
      settings: params.settings,
      is_public: params.is_public || false
    })
    .select()
    .single();

  if (error) {
    if (error.code === '23505') {
      throw new Error('A preset with this name already exists');
    }
    throw new Error(`Failed to save preset: ${error.message}`);
  }

  return data;
}

/**
 * Get all presets for the current user
 * DEV MODE: Returns all presets if not authenticated
 */
export async function getUserPresets(): Promise<StudioPreset[]> {
  const { data: { user } } = await supabase.auth.getUser();
  const userId = user?.id || null;

  // DEV MODE: If no user, return all presets (for development)
  let query = supabase
    .from('studio_presets')
    .select('*');
  
  if (userId) {
    query = query.eq('user_id', userId);
  }
  
  const { data, error } = await query.order('updated_at', { ascending: false });

  if (error) {
    throw new Error(`Failed to load presets: ${error.message}`);
  }

  return data || [];
}

/**
 * Get public presets from all users
 */
export async function getPublicPresets(): Promise<StudioPreset[]> {
  const { data, error } = await supabase
    .from('studio_presets')
    .select('*')
    .eq('is_public', true)
    .order('created_at', { ascending: false })
    .limit(50); // Limit to prevent overwhelming list

  if (error) {
    throw new Error(`Failed to load public presets: ${error.message}`);
  }

  return data || [];
}

/**
 * Get a specific preset by ID
 */
export async function getPresetById(id: string): Promise<StudioPreset> {
  const { data, error } = await supabase
    .from('studio_presets')
    .select('*')
    .eq('id', id)
    .single();

  if (error) {
    throw new Error(`Failed to load preset: ${error.message}`);
  }

  return data;
}

/**
 * Update an existing preset
 * DEV MODE: Works without authentication
 */
export async function updateStudioPreset(id: string, params: UpdatePresetParams): Promise<StudioPreset> {
  const { data: { user } } = await supabase.auth.getUser();
  const userId = user?.id || null;

  const updateData: any = {};
  if (params.name !== undefined) updateData.name = params.name;
  if (params.description !== undefined) updateData.description = params.description;
  if (params.settings !== undefined) updateData.settings = params.settings;
  if (params.is_public !== undefined) updateData.is_public = params.is_public;

  let query = supabase
    .from('studio_presets')
    .update(updateData)
    .eq('id', id);
  
  // Only filter by user_id if authenticated
  if (userId) {
    query = query.eq('user_id', userId);
  }
  
  const { data, error } = await query.select().single();

  if (error) {
    if (error.code === '23505') {
      throw new Error('A preset with this name already exists');
    }
    throw new Error(`Failed to update preset: ${error.message}`);
  }

  return data;
}

/**
 * Delete a preset
 * DEV MODE: Works without authentication
 */
export async function deleteStudioPreset(id: string): Promise<void> {
  const { data: { user } } = await supabase.auth.getUser();
  const userId = user?.id || null;

  let query = supabase
    .from('studio_presets')
    .delete()
    .eq('id', id);
  
  // Only filter by user_id if authenticated
  if (userId) {
    query = query.eq('user_id', userId);
  }
  
  const { error } = await query;

  if (error) {
    throw new Error(`Failed to delete preset: ${error.message}`);
  }
}
