// formatReader.test.ts
// Unit tests for format reader

import { describe, it, expect } from 'vitest';
import { readSolutionFormat } from './formatReader';

describe('Format Reader', () => {
  describe('koos.state@1 format', () => {
    it('should detect koos.state@1 format', () => {
      const koosState = {
        schema: 'koos.state',
        version: 1,
        id: 'sha256:test123',
        shapeRef: 'sha256:shape456',
        placements: [
          {
            pieceId: 'A',
            anchorIJK: [0, 0, 0],
            orientationIndex: 0
          }
        ]
      };
      
      const result = readSolutionFormat(koosState, 'test.solution.json');
      
      expect(result.mode).toBe('koos.state@1');
      expect(result.placements).toHaveLength(1);
      expect(result.placements[0].piece).toBe('A');
      expect(result.placements[0].ori).toBe(0);
      expect(result.placements[0].t).toEqual([0, 0, 0]);
      expect(result.placements[0].cells_ijk).toHaveLength(4); // Tetrahedron has 4 cells
    });
    
    it('should convert multiple placements', () => {
      const koosState = {
        schema: 'koos.state',
        version: 1,
        shapeRef: 'sha256:shape456',
        placements: [
          { pieceId: 'A', anchorIJK: [0, 0, 0], orientationIndex: 0 },
          { pieceId: 'B', anchorIJK: [1, 1, 1], orientationIndex: 1 },
          { pieceId: 'C', anchorIJK: [2, 2, 2], orientationIndex: 2 }
        ]
      };
      
      const result = readSolutionFormat(koosState, 'test.solution.json');
      
      expect(result.placements).toHaveLength(3);
      expect(result.placements[0].piece).toBe('A');
      expect(result.placements[1].piece).toBe('B');
      expect(result.placements[2].piece).toBe('C');
    });
    
    it('should build piecesUsed count', () => {
      const koosState = {
        schema: 'koos.state',
        version: 1,
        shapeRef: 'sha256:shape456',
        placements: [
          { pieceId: 'A', anchorIJK: [0, 0, 0], orientationIndex: 0 },
          { pieceId: 'A', anchorIJK: [1, 1, 1], orientationIndex: 1 },
          { pieceId: 'B', anchorIJK: [2, 2, 2], orientationIndex: 0 }
        ]
      };
      
      const result = readSolutionFormat(koosState, 'test.solution.json');
      
      expect(result.piecesUsed).toEqual({
        A: 2,
        B: 1
      });
    });
    
    it('should generate correct tetrahedron cells', () => {
      const koosState = {
        schema: 'koos.state',
        version: 1,
        shapeRef: 'sha256:shape456',
        placements: [
          { pieceId: 'A', anchorIJK: [5, 3, 2], orientationIndex: 0 }
        ]
      };
      
      const result = readSolutionFormat(koosState, 'test.solution.json');
      const cells = result.placements[0].cells_ijk;
      
      // Standard FCC tetrahedron at anchor [5, 3, 2]
      expect(cells).toEqual([
        [5, 3, 2],     // anchor + [0,0,0]
        [6, 4, 2],     // anchor + [1,1,0]
        [6, 3, 3],     // anchor + [1,0,1]
        [5, 4, 3]      // anchor + [0,1,1]
      ]);
    });
  });
  
  describe('Legacy format', () => {
    it('should pass through legacy format unchanged', () => {
      const legacySolution = {
        version: 1,
        containerCidSha256: 'legacy123',
        lattice: 'fcc',
        piecesUsed: { A: 1 },
        placements: [
          {
            piece: 'A',
            ori: 0,
            t: [0, 0, 0],
            cells_ijk: [[0,0,0], [1,1,0], [1,0,1], [0,1,1]]
          }
        ],
        sid_state_sha256: 'state123',
        sid_route_sha256: 'route123',
        sid_state_canon_sha256: 'canon123',
        mode: 'legacy',
        solver: {
          engine: 'test',
          seed: 42,
          flags: { test: true }
        }
      };
      
      const result = readSolutionFormat(legacySolution, 'legacy.json');
      
      expect(result).toEqual(legacySolution);
      expect(result.mode).toBe('legacy');
    });
  });
});
