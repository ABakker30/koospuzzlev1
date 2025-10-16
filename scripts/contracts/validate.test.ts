// scripts/contracts/validate.test.ts
// Unit tests for canonicalization and hashing

import { describe, it, expect } from 'vitest';
import { canonicalizeShape, canonicalizeState, verifyIdempotency } from './canonicalize';

describe('Canonicalization', () => {
  describe('Shape canonicalization', () => {
    it('should sort cells lexicographically', () => {
      const shape = canonicalizeShape({
        schema: 'koos.shape',
        version: 1,
        lattice: 'fcc',
        cells: [
          [2, 1, 0],
          [1, 2, 3],
          [1, 2, 1],
          [0, 0, 0],
        ],
      });

      expect(shape.cells).toEqual([
        [0, 0, 0], // i=0
        [1, 2, 1], // i=1, j=2, k=1
        [1, 2, 3], // i=1, j=2, k=3
        [2, 1, 0], // i=2
      ]);
    });

    it('should deduplicate cells', () => {
      const shape = canonicalizeShape({
        schema: 'koos.shape',
        version: 1,
        lattice: 'fcc',
        cells: [
          [0, 0, 0],
          [1, 1, 1],
          [0, 0, 0], // duplicate
          [1, 1, 1], // duplicate
        ],
      });

      expect(shape.cells).toEqual([
        [0, 0, 0],
        [1, 1, 1],
      ]);
    });

    it('should produce deterministic IDs for same content', () => {
      const shape1 = canonicalizeShape({
        schema: 'koos.shape',
        version: 1,
        lattice: 'fcc',
        cells: [
          [1, 0, 0],
          [0, 1, 0],
          [0, 0, 1],
        ],
      });

      const shape2 = canonicalizeShape({
        schema: 'koos.shape',
        version: 1,
        lattice: 'fcc',
        cells: [
          [0, 0, 1], // Different order
          [1, 0, 0],
          [0, 1, 0],
        ],
      });

      expect(shape1.id).toBe(shape2.id);
    });

    it('should produce different IDs for different content', () => {
      const shape1 = canonicalizeShape({
        schema: 'koos.shape',
        version: 1,
        lattice: 'fcc',
        cells: [[0, 0, 0]],
      });

      const shape2 = canonicalizeShape({
        schema: 'koos.shape',
        version: 1,
        lattice: 'fcc',
        cells: [[1, 1, 1]], // Different cell
      });

      expect(shape1.id).not.toBe(shape2.id);
    });

    it('should verify idempotency', () => {
      const shape = canonicalizeShape({
        schema: 'koos.shape',
        version: 1,
        lattice: 'fcc',
        cells: [[0, 0, 0], [1, 1, 1]],
      });

      expect(verifyIdempotency(shape)).toBe(true);
    });
  });

  describe('State canonicalization', () => {
    it('should normalize pieceId to uppercase', () => {
      const state = canonicalizeState({
        schema: 'koos.state',
        version: 1,
        shapeRef: 'sha256:abc123',
        placements: [
          { pieceId: 'a', anchorIJK: [0, 0, 0], orientationIndex: 0 },
          { pieceId: 'B', anchorIJK: [1, 1, 1], orientationIndex: 1 },
        ],
      });

      expect(state.placements[0].pieceId).toBe('A');
      expect(state.placements[1].pieceId).toBe('B');
    });

    it('should sort placements by pieceId, then anchorIJK, then orientationIndex', () => {
      const state = canonicalizeState({
        schema: 'koos.state',
        version: 1,
        shapeRef: 'sha256:abc123',
        placements: [
          { pieceId: 'C', anchorIJK: [0, 0, 0], orientationIndex: 0 },
          { pieceId: 'A', anchorIJK: [1, 1, 1], orientationIndex: 0 },
          { pieceId: 'B', anchorIJK: [0, 0, 1], orientationIndex: 2 },
          { pieceId: 'B', anchorIJK: [0, 0, 1], orientationIndex: 1 },
          { pieceId: 'B', anchorIJK: [0, 0, 0], orientationIndex: 0 },
        ],
      });

      expect(state.placements).toEqual([
        { pieceId: 'A', anchorIJK: [1, 1, 1], orientationIndex: 0 },
        { pieceId: 'B', anchorIJK: [0, 0, 0], orientationIndex: 0 },
        { pieceId: 'B', anchorIJK: [0, 0, 1], orientationIndex: 1 },
        { pieceId: 'B', anchorIJK: [0, 0, 1], orientationIndex: 2 },
        { pieceId: 'C', anchorIJK: [0, 0, 0], orientationIndex: 0 },
      ]);
    });

    it('should produce deterministic IDs for same content', () => {
      const state1 = canonicalizeState({
        schema: 'koos.state',
        version: 1,
        shapeRef: 'sha256:abc123',
        placements: [
          { pieceId: 'A', anchorIJK: [0, 0, 0], orientationIndex: 0 },
          { pieceId: 'B', anchorIJK: [1, 1, 1], orientationIndex: 1 },
        ],
      });

      const state2 = canonicalizeState({
        schema: 'koos.state',
        version: 1,
        shapeRef: 'sha256:abc123',
        placements: [
          { pieceId: 'b', anchorIJK: [1, 1, 1], orientationIndex: 1 }, // Different order & case
          { pieceId: 'a', anchorIJK: [0, 0, 0], orientationIndex: 0 },
        ],
      });

      expect(state1.id).toBe(state2.id);
    });

    it('should verify idempotency', () => {
      const state = canonicalizeState({
        schema: 'koos.state',
        version: 1,
        shapeRef: 'sha256:abc123',
        placements: [
          { pieceId: 'A', anchorIJK: [0, 0, 0], orientationIndex: 0 },
        ],
      });

      expect(verifyIdempotency(state)).toBe(true);
    });
  });

  describe('Edge cases', () => {
    it('should handle empty cells', () => {
      const shape = canonicalizeShape({
        schema: 'koos.shape',
        version: 1,
        lattice: 'fcc',
        cells: [],
      });

      expect(shape.cells).toEqual([]);
      expect(shape.id).toBeDefined();
    });

    it('should handle empty placements', () => {
      const state = canonicalizeState({
        schema: 'koos.state',
        version: 1,
        shapeRef: 'sha256:abc123',
        placements: [],
      });

      expect(state.placements).toEqual([]);
      expect(state.id).toBeDefined();
    });

    it('should handle special characters in pieceId', () => {
      const state = canonicalizeState({
        schema: 'koos.state',
        version: 1,
        shapeRef: 'sha256:abc123',
        placements: [
          { pieceId: 'piece-123', anchorIJK: [0, 0, 0], orientationIndex: 0 },
        ],
      });

      expect(state.placements[0].pieceId).toBe('PIECE-123');
    });
  });
});
