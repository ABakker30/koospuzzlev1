// src/api/contracts.ts
// API functions for new contract-based shapes and solutions

import { supabase } from '../lib/supabase';

export interface ContractShapeRecord {
  id: string; // sha256:...
  lattice: string;
  cells: number[][];
  size: number;
  created_at: string;
}

export interface ContractSolutionRecord {
  id: string; // sha256:...
  shape_id: string;
  placements: any[];
  is_full: boolean;
  metadata?: { name?: string };
  created_at: string;
}

/**
 * List all contract solutions from contracts_solutions table
 */
export async function listContractSolutions(): Promise<ContractSolutionRecord[]> {
  const { data, error } = await supabase
    .from('contracts_solutions')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) throw error;
  return data as ContractSolutionRecord[];
}

/**
 * Get a contract solution by ID
 */
export async function getContractSolution(id: string): Promise<ContractSolutionRecord | null> {
  const { data, error } = await supabase
    .from('contracts_solutions')
    .select('*')
    .eq('id', id)
    .single();

  if (error) throw error;
  return data as ContractSolutionRecord;
}

/**
 * Get contract solutions for a specific shape
 */
export async function listContractSolutionsByShape(shapeId: string): Promise<ContractSolutionRecord[]> {
  const { data, error } = await supabase
    .from('contracts_solutions')
    .select('*')
    .eq('shape_id', shapeId)
    .order('created_at', { ascending: false });

  if (error) throw error;
  return data as ContractSolutionRecord[];
}

/**
 * Get a signed URL for a contract solution file
 * File path: solutions/<solutionId>.solution.json
 */
export async function getContractSolutionSignedUrl(solutionId: string, expiresInSeconds = 300): Promise<string> {
  const filePath = `${solutionId}.solution.json`;
  
  const { data, error } = await supabase.storage
    .from('solutions')
    .createSignedUrl(filePath, expiresInSeconds);

  if (error) throw error;
  return data.signedUrl;
}

/**
 * Check if a contract shape exists by ID
 */
export async function contractShapeExists(shapeId: string): Promise<boolean> {
  const { data, error } = await supabase
    .from('contracts_shapes')
    .select('id')
    .eq('id', shapeId)
    .maybeSingle();

  if (error) throw error;
  return data !== null;
}

/**
 * List all contract shapes from contracts_shapes table
 */
export async function listContractShapes(): Promise<ContractShapeRecord[]> {
  const { data, error } = await supabase
    .from('contracts_shapes')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) throw error;
  return data as ContractShapeRecord[];
}

/**
 * Get a contract shape by ID
 */
export async function getContractShape(id: string): Promise<ContractShapeRecord | null> {
  const { data, error } = await supabase
    .from('contracts_shapes')
    .select('*')
    .eq('id', id)
    .single();

  if (error) throw error;
  return data as ContractShapeRecord;
}

/**
 * Get a signed URL for a contract shape file
 * File path: shapes/<shapeId>.shape.json
 */
export async function getContractShapeSignedUrl(shapeId: string, expiresInSeconds = 300): Promise<string> {
  const filePath = `${shapeId}.shape.json`;
  
  const { data, error } = await supabase.storage
    .from('shapes')
    .createSignedUrl(filePath, expiresInSeconds);

  if (error) throw error;
  return data.signedUrl;
}

/**
 * Upload a contract shape to storage and database
 */
export async function uploadContractShape(shape: {
  id: string;
  lattice: string;
  cells: number[][];
  size: number;
  name?: string;
}): Promise<void> {
  // Upload to storage
  const filePath = `${shape.id}.shape.json`;
  const fileContent = JSON.stringify({
    schema: 'koos.shape',
    version: 1,
    id: shape.id,
    lattice: shape.lattice,
    cells: shape.cells
  }, null, 2);
  
  const { error: storageError } = await supabase.storage
    .from('shapes')
    .upload(filePath, fileContent, {
      contentType: 'application/json',
      upsert: true
    });
  
  if (storageError) throw storageError;
  
  // Insert into database with optional metadata
  const record: any = {
    id: shape.id,
    lattice: shape.lattice,
    cells: shape.cells,
    size: shape.size
  };
  
  // Add metadata if name provided
  if (shape.name) {
    record.metadata = { name: shape.name };
  }
  
  const { error: dbError } = await supabase
    .from('contracts_shapes')
    .upsert(record);
  
  if (dbError) throw dbError;
}

/**
 * Upload a contract solution to storage and database
 */
export async function uploadContractSolution(solution: {
  id: string;
  shapeRef: string;
  placements: any[];
  isFull?: boolean;
  name?: string;
}): Promise<void> {
  // Upload to storage
  const filePath = `${solution.id}.solution.json`;
  const fileContent = JSON.stringify({
    schema: 'koos.state',
    version: 1,
    id: solution.id,
    shapeRef: solution.shapeRef,
    placements: solution.placements
  }, null, 2);
  
  const { error: storageError } = await supabase.storage
    .from('solutions')
    .upload(filePath, fileContent, {
      contentType: 'application/json',
      upsert: true
    });
  
  if (storageError) throw storageError;
  
  // Insert into database with optional metadata
  const record: any = {
    id: solution.id,
    shape_id: solution.shapeRef,
    placements: solution.placements,
    is_full: solution.isFull !== false // Default to true
  };
  
  // Add metadata if name provided
  if (solution.name) {
    record.metadata = { name: solution.name };
  }
  
  const { error: dbError } = await supabase
    .from('contracts_solutions')
    .upsert(record);
  
  if (dbError) throw dbError;
}
