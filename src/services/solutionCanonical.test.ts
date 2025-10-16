// src/services/solutionCanonical.test.ts
// Unit tests for solution canonicalization

import { describe, it, expect } from 'vitest';
import {
  canonicalizePlacements,
  canonicalizeSolution,
  computeSolutionId,
  createKoosSolution,
  verifySolutionId,
  type KoosStatePlacement
} from './solutionCanonical';

describe('Solution Canonicalization', () => {
  const shapeRef = 'sha256:0123456789abcdef';

  describe('canonicalizePlacements', () => {
    it('should upper-case pieceId', () => {
      const placements: KoosStatePlacement[] = [
        { pieceId: 'a', anchorIJK: [0, 0, 0], orientationIndex: 0 }
      ];
      
      const result = canonicalizePlacements(placements);
      
      expect(result[0].pieceId).toBe('A');
    });

    it('should remove duplicates', () => {
      const placements: KoosStatePlacement[] = [
        { pieceId: 'A', anchorIJK: [0, 0, 0], orientationIndex: 0 },
        { pieceId: 'A', anchorIJK: [0, 0, 0], orientationIndex: 0 }
      ];
      
      const result = canonicalizePlacements(placements);
      
      expect(result).toHaveLength(1);
    });

    it('should sort by pieceId first', () => {
      const placements: KoosStatePlacement[] = [
        { pieceId: 'C', anchorIJK: [0, 0, 0], orientationIndex: 0 },
        { pieceId: 'A', anchorIJK: [0, 0, 0], orientationIndex: 0 },
        { pieceId: 'B', anchorIJK: [0, 0, 0], orientationIndex: 0 }
      ];
      
      const result = canonicalizePlacements(placements);
      
      expect(result.map(p => p.pieceId)).toEqual(['A', 'B', 'C']);
    });

    it('should sort by anchorIJK after pieceId', () => {
      const placements: KoosStatePlacement[] = [
        { pieceId: 'A', anchorIJK: [2, 1, 0], orientationIndex: 0 },
        { pieceId: 'A', anchorIJK: [1, 1, 0], orientationIndex: 0 },
        { pieceId: 'A', anchorIJK: [0, 0, 0], orientationIndex: 0 }
      ];
      
      const result = canonicalizePlacements(placements);
      
      expect(result[0].anchorIJK).toEqual([0, 0, 0]);
      expect(result[1].anchorIJK).toEqual([1, 1, 0]);
      expect(result[2].anchorIJK).toEqual([2, 1, 0]);
    });

    it('should sort by orientationIndex last', () => {
      const placements: KoosStatePlacement[] = [
        { pieceId: 'A', anchorIJK: [0, 0, 0], orientationIndex: 2 },
        { pieceId: 'A', anchorIJK: [0, 0, 0], orientationIndex: 0 },
        { pieceId: 'A', anchorIJK: [0, 0, 0], orientationIndex: 1 }
      ];
      
      const result = canonicalizePlacements(placements);
      
      expect(result.map(p => p.orientationIndex)).toEqual([0, 1, 2]);
    });
  });

  describe('canonicalizeSolution', () => {
    it('should preserve shapeRef', () => {
      const solution = {
        schema: 'koos.state' as const,
        version: 1 as const,
        shapeRef,
        placements: []
      };
      
      const result = canonicalizeSolution(solution);
      
      expect(result.shapeRef).toBe(shapeRef);
    });

    it('should canonicalize placements', () => {
      const solution = {
        schema: 'koos.state' as const,
        version: 1 as const,
        shapeRef,
        placements: [
          { pieceId: 'b', anchorIJK: [0, 0, 0] as [number, number, number], orientationIndex: 0 },
          { pieceId: 'a', anchorIJK: [0, 0, 0] as [number, number, number], orientationIndex: 0 }
        ]
      };
      
      const result = canonicalizeSolution(solution);
      
      expect(result.placements[0].pieceId).toBe('A');
      expect(result.placements[1].pieceId).toBe('B');
    });
  });

  describe('computeSolutionId', () => {
    it('should compute a sha256 hash', async () => {
      const solution = {
        schema: 'koos.state' as const,
        version: 1 as const,
        shapeRef,
        placements: [
          { pieceId: 'A', anchorIJK: [0, 0, 0] as [number, number, number], orientationIndex: 0 }
        ]
      };
      
      const id = await computeSolutionId(solution);
      
      expect(id).toMatch(/^sha256:[a-f0-9]{64}$/);
    });

    it('should be deterministic (same input → same ID)', async () => {
      const solution = {
        schema: 'koos.state' as const,
        version: 1 as const,
        shapeRef,
        placements: [
          { pieceId: 'A', anchorIJK: [0, 0, 0] as [number, number, number], orientationIndex: 0 }
        ]
      };
      
      const id1 = await computeSolutionId(solution);
      const id2 = await computeSolutionId(solution);
      
      expect(id1).toBe(id2);
    });

    it('should be order-independent (canonicalization)', async () => {
      const solution1 = {
        schema: 'koos.state' as const,
        version: 1 as const,
        shapeRef,
        placements: [
          { pieceId: 'A', anchorIJK: [0, 0, 0] as [number, number, number], orientationIndex: 0 },
          { pieceId: 'B', anchorIJK: [1, 1, 0] as [number, number, number], orientationIndex: 1 }
        ]
      };

      const solution2 = {
        schema: 'koos.state' as const,
        version: 1 as const,
        shapeRef,
        placements: [
          { pieceId: 'B', anchorIJK: [1, 1, 0] as [number, number, number], orientationIndex: 1 },
          { pieceId: 'A', anchorIJK: [0, 0, 0] as [number, number, number], orientationIndex: 0 }
        ]
      };
      
      const id1 = await computeSolutionId(solution1);
      const id2 = await computeSolutionId(solution2);
      
      expect(id1).toBe(id2);
    });
  });

  describe('createKoosSolution', () => {
    it('should create solution with computed ID', async () => {
      const placements: KoosStatePlacement[] = [
        { pieceId: 'A', anchorIJK: [0, 0, 0], orientationIndex: 0 }
      ];
      
      const result = await createKoosSolution(shapeRef, placements);
      
      expect(result.schema).toBe('koos.state');
      expect(result.version).toBe(1);
      expect(result.id).toMatch(/^sha256:[a-f0-9]{64}$/);
      expect(result.shapeRef).toBe(shapeRef);
      expect(result.placements).toHaveLength(1);
    });

    it('should canonicalize placements', async () => {
      const placements: KoosStatePlacement[] = [
        { pieceId: 'b', anchorIJK: [0, 0, 0], orientationIndex: 0 },
        { pieceId: 'a', anchorIJK: [0, 0, 0], orientationIndex: 0 }
      ];
      
      const result = await createKoosSolution(shapeRef, placements);
      
      // Should be sorted: A before B
      expect(result.placements[0].pieceId).toBe('A');
      expect(result.placements[1].pieceId).toBe('B');
    });
  });

  describe('verifySolutionId', () => {
    it('should verify correct ID', async () => {
      const placements: KoosStatePlacement[] = [
        { pieceId: 'A', anchorIJK: [0, 0, 0], orientationIndex: 0 }
      ];
      
      const solution = await createKoosSolution(shapeRef, placements);
      const isValid = await verifySolutionId(solution);
      
      expect(isValid).toBe(true);
    });

    it('should reject incorrect ID', async () => {
      const placements: KoosStatePlacement[] = [
        { pieceId: 'A', anchorIJK: [0, 0, 0], orientationIndex: 0 }
      ];
      
      const solution = await createKoosSolution(shapeRef, placements);
      solution.id = 'sha256:wronghash';
      
      const isValid = await verifySolutionId(solution);
      
      expect(isValid).toBe(false);
    });
  });
});
