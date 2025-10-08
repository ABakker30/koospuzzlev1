// Adapters for legacy JSON format

import type { IJK, LegacyContainer, PieceDef } from "./types";

// FCC basis (same as Solution Viewer): x=0.5*(i+j), y=0.5*(i+k), z=0.5*(j+k)
export function ijkToXyz(i: number, j: number, k: number): [number, number, number] {
  return [0.5 * (i + j), 0.5 * (i + k), 0.5 * (j + k)];
}

export function fccPoint(c: IJK): [number, number, number] {
  return ijkToXyz(c[0], c[1], c[2]);
}

export function getCells(container: LegacyContainer): IJK[] {
  return (container.cells_ijk ?? container.cells ?? []) as IJK[];
}

// Parse "All 4-Sphere Pieces.txt" (simple parser: piece id and orientations)
export async function parsePieces(text: string): Promise<PieceDef[]> {
  // Expect blocks like:
  // Piece A:
  //  ori 0: (0,0,0),(1,0,0),(0,1,0),(0,0,1)
  const lines = text.split(/\r?\n/);
  const out: PieceDef[] = [];
  let cur: PieceDef | null = null;
  let oriId = 0;
  
  for (const raw of lines) {
    const line = raw.trim();
    const mPiece = /^Piece\s+([A-Za-z]):/.exec(line);
    if (mPiece) {
      if (cur) out.push(cur);
      cur = { id: mPiece[1], orientations: [] };
      oriId = 0;
      continue;
    }
    
    const mOri = /^ori\s*\d+:\s*(.+)$/.exec(line) || /^orientation\s*\d+:\s*(.+)$/.exec(line);
    if (mOri && cur) {
      const coords = mOri[1].match(/\((-?\d+),\s*(-?\d+),\s*(-?\d+)\)/g) ?? [];
      const cells: IJK[] = coords.map(str => {
        const m = /\((-?\d+),\s*(-?\d+),\s*(-?\d+)\)/.exec(str)!;
        return [parseInt(m[1], 10), parseInt(m[2], 10), parseInt(m[3], 10)] as IJK;
      });
      cur.orientations.push({ id: oriId++, cells });
    }
  }
  
  if (cur) out.push(cur);
  return out;
}
