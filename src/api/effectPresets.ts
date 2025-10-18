import { supabase } from '../lib/supabase';

export type EffectType = 'turntable' | 'orbit' | 'reveal' | 'explosion';

export interface EffectPreset<T = any> {
  id: string;
  created_at: string;
  updated_at: string;
  user_id: string | null;
  effect_type: EffectType;
  name: string;
  description?: string;
  config: T; // The effect configuration object
  is_public: boolean;
}

export interface CreateEffectPresetParams<T = any> {
  effect_type: EffectType;
  name: string;
  description?: string;
  config: T;
  is_public?: boolean;
}

export interface UpdateEffectPresetParams<T = any> {
  name?: string;
  description?: string;
  config?: T;
  is_public?: boolean;
}

/**
 * Save a new effect preset
 * DEV MODE: Works without authentication
 */
export async function saveEffectPreset<T = any>(params: CreateEffectPresetParams<T>): Promise<EffectPreset<T>> {
  const { data: { user } } = await supabase.auth.getUser();
  const userId = user?.id || null; // DEV MODE: Allow null user_id

  const { data, error } = await supabase
    .from('effect_presets')
    .insert({
      user_id: userId,
      effect_type: params.effect_type,
      name: params.name,
      description: params.description,
      config: params.config,
      is_public: params.is_public || false
    })
    .select()
    .single();

  if (error) {
    if (error.code === '23505') {
      throw new Error('A preset with this name already exists for this effect');
    }
    throw new Error(`Failed to save preset: ${error.message}`);
  }

  return data;
}

/**
 * Get all presets for a specific effect type
 * DEV MODE: Returns all presets if not authenticated
 */
export async function getEffectPresets<T = any>(effectType: EffectType): Promise<EffectPreset<T>[]> {
  const { data: { user } } = await supabase.auth.getUser();
  const userId = user?.id || null;

  // DEV MODE: If no user, return all presets for this effect type
  let query = supabase
    .from('effect_presets')
    .select('*')
    .eq('effect_type', effectType);
  
  if (userId) {
    // If authenticated, get user's presets + public presets
    query = query.or(`user_id.eq.${userId},is_public.eq.true`);
  }
  
  const { data, error } = await query.order('updated_at', { ascending: false });

  if (error) {
    throw new Error(`Failed to load presets: ${error.message}`);
  }

  return data || [];
}

/**
 * Get a specific preset by ID
 */
export async function getEffectPresetById<T = any>(id: string): Promise<EffectPreset<T>> {
  const { data, error } = await supabase
    .from('effect_presets')
    .select('*')
    .eq('id', id)
    .single();

  if (error) {
    throw new Error(`Failed to load preset: ${error.message}`);
  }

  return data;
}

/**
 * Update an existing effect preset
 * DEV MODE: Works without authentication
 */
export async function updateEffectPreset<T = any>(id: string, params: UpdateEffectPresetParams<T>): Promise<EffectPreset<T>> {
  const { data: { user } } = await supabase.auth.getUser();
  const userId = user?.id || null;

  const updateData: any = {};
  if (params.name !== undefined) updateData.name = params.name;
  if (params.description !== undefined) updateData.description = params.description;
  if (params.config !== undefined) updateData.config = params.config;
  if (params.is_public !== undefined) updateData.is_public = params.is_public;

  let query = supabase
    .from('effect_presets')
    .update(updateData)
    .eq('id', id);
  
  // Only filter by user_id if authenticated
  if (userId) {
    query = query.eq('user_id', userId);
  }
  
  const { data, error } = await query.select().single();

  if (error) {
    if (error.code === '23505') {
      throw new Error('A preset with this name already exists for this effect');
    }
    throw new Error(`Failed to update preset: ${error.message}`);
  }

  return data;
}

/**
 * Delete an effect preset
 * DEV MODE: Works without authentication
 */
export async function deleteEffectPreset(id: string): Promise<void> {
  const { data: { user } } = await supabase.auth.getUser();
  const userId = user?.id || null;

  let query = supabase
    .from('effect_presets')
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
