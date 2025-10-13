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
  
  // Parse each piece by manually finding brackets (handles piece Y correctly)
  const pieceIds = ['A','B','C','D','E','F','G','H','I','J','K','L','M','N','O','P','Q','R','S','T','U','V','W','X','Y'];
  
  for (const pieceId of pieceIds) {
    const pieceStartPattern = new RegExp(`"${pieceId}":\\s*\\[`);
    const startMatch = pieceStartPattern.exec(content);
    if (!startMatch) continue;
    
    // Find the matching closing bracket by counting depth
    let depth = 1;
    let i = startMatch.index + startMatch[0].length;
    while (i < content.length && depth > 0) {
      if (content[i] === '[') depth++;
      else if (content[i] === ']') depth--;
      i++;
    }
    
    const orientationsText = content.substring(startMatch.index + startMatch[0].length, i - 1);
    
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
  
  console.log(`📦 Total pieces parsed: ${db.size} (expected 25: A-Y)`);
  console.log(`📦 Piece IDs found: ${Array.from(db.keys()).join(', ')}`);
  
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
