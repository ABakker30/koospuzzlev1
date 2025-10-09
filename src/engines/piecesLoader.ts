// src/engines/piecesLoader.ts
// Loads pieces from pieces_orientations.py

import type { PieceDB, Oriented } from './dfs';
import type { IJK } from './types';

export async function loadAllPieces(): Promise<PieceDB> {
  try {
    console.log('📦 Loading pieces from pieces_orientations.py...');
    
    const response = await fetch('/data/Pieces/pieces_orientations.py');
    const text = await response.text();
    
    // Parse Python dictionary
    const pieces = parsePythonPieces(text);
    
    console.log(`✅ Loaded ${pieces.size} pieces with orientations`);
    return pieces;
  } catch (error) {
    console.error('❌ Failed to load pieces:', error);
    throw error;
  }
}

function parsePythonPieces(pythonCode: string): PieceDB {
  console.log('🔍 parsePythonPieces: Parsing Python code...');
  console.log(`   Code length: ${pythonCode.length} chars`);
  
  const db: PieceDB = new Map();
  
  // Extract PIECES dictionary content
  const match = pythonCode.match(/PIECES\s*=\s*\{([\s\S]*)\}/);
  if (!match) {
    console.error('❌ parsePythonPieces: Could not find PIECES dictionary');
    throw new Error('Could not find PIECES dictionary in Python file');
  }
  
  console.log('✅ parsePythonPieces: Found PIECES dictionary');
  
  const content = match[1];
  
  // Split by piece IDs (letters A-Y)
  const piecePattern = /"([A-Y])":\s*\[([\s\S]*?)\](?=,\s*"[A-Y]"|$)/g;
  let pieceMatch;
  
  while ((pieceMatch = piecePattern.exec(content)) !== null) {
    const pieceId = pieceMatch[1];
    const orientationsText = pieceMatch[2];
    
    // Parse orientations (each is a 4x3 array)
    const orientations: Oriented[] = [];
    const orientationPattern = /\[\s*\[\s*(-?\d+),\s*(-?\d+),\s*(-?\d+)\s*\],\s*\[\s*(-?\d+),\s*(-?\d+),\s*(-?\d+)\s*\],\s*\[\s*(-?\d+),\s*(-?\d+),\s*(-?\d+)\s*\],\s*\[\s*(-?\d+),\s*(-?\d+),\s*(-?\d+)\s*\]\s*\]/g;
    
    let oriIdx = 0;
    let oriMatch;
    
    while ((oriMatch = orientationPattern.exec(orientationsText)) !== null) {
      const cells: IJK[] = [
        [parseInt(oriMatch[1]), parseInt(oriMatch[2]), parseInt(oriMatch[3])],
        [parseInt(oriMatch[4]), parseInt(oriMatch[5]), parseInt(oriMatch[6])],
        [parseInt(oriMatch[7]), parseInt(oriMatch[8]), parseInt(oriMatch[9])],
        [parseInt(oriMatch[10]), parseInt(oriMatch[11]), parseInt(oriMatch[12])]
      ];
      
      orientations.push({
        id: oriIdx++,
        cells
      });
    }
    
    if (orientations.length > 0) {
      db.set(pieceId, orientations);
      console.log(`  ${pieceId}: ${orientations.length} orientations`);
    }
  }
  
  return db;
}

// Get subset of pieces by IDs
export function filterPieces(db: PieceDB, pieceIds: string[]): PieceDB {
  const filtered: PieceDB = new Map();
  for (const id of pieceIds) {
    const orientations = db.get(id);
    if (orientations) {
      filtered.set(id, orientations);
    }
  }
  return filtered;
}

// Get all piece IDs (A-Y)
export function getAllPieceIds(): string[] {
  const ids: string[] = [];
  for (let i = 0; i < 25; i++) {
    ids.push(String.fromCharCode(65 + i)); // A=65, B=66, ..., Y=89
  }
  return ids;
}
