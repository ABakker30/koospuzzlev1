// src/services/shapeFormatReader.test.ts
// Unit tests for shape format reader

import { describe, it, expect } from 'vitest';
import { readShapeFormat, createKoosShape, isNewFormat } from './shapeFormatReader';
import type { KoosShape } from './shapeFormatReader';

describe('Shape Format Reader', () => {
  describe('koos.shape@1 format', () => {
    it('should detect koos.shape@1 format', () => {
      const koosShape: KoosShape = {
        schema: 'koos.shape',
        version: 1,
        id: 'sha256:test123',
        lattice: 'fcc',
        cells: [[0, 0, 0], [1, 1, 0], [1, 0, 1]]
      };
      
      const result = readShapeFormat(koosShape, 'test.shape.json');
      
      expect(result.schema).toBe('ab.container.v2');
      expect(result.cid).toBe('sha256:test123'); // ID stored as CID
      expect(result.cells).toHaveLength(3);
      expect(result.meta?.originalFormat).toBe('koos.shape@1');
    });
    
    it('should convert cells correctly', () => {
      const koosShape: KoosShape = {
        schema: 'koos.shape',
        version: 1,
        id: 'sha256:abc',
        lattice: 'fcc',
        cells: [[0, 0, 0], [1, 2, 3]]
      };
      
      const result = readShapeFormat(koosShape, 'test.shape.json');
      
      expect(result.cells).toEqual([[0, 0, 0], [1, 2, 3]]);
    });
    
    it('should generate name from ID', () => {
      const koosShape: KoosShape = {
        schema: 'koos.shape',
        version: 1,
        id: 'sha256:abcdef1234567890',
        lattice: 'fcc',
        cells: [[0, 0, 0]]
      };
      
      const result = readShapeFormat(koosShape, 'test.shape.json');
      
      expect(result.name).toContain('abcdef12'); // First 8 chars
    });
  });
  
  describe('Legacy format', () => {
    it('should pass through legacy format unchanged', () => {
      const legacyShape = {
        schema: 'ab.container.v2',
        name: 'My Shape',
        cid: 'legacy123',
        cells: [[0, 0, 0], [1, 1, 0]],
        meta: {
          lattice: 'fcc'
        }
      };
      
      const result = readShapeFormat(legacyShape, 'legacy.fcc.json');
      
      expect(result).toEqual(legacyShape);
      expect(result.meta?.originalFormat).toBeUndefined();
    });
  });
  
  describe('isNewFormat', () => {
    it('should identify new format shapes', () => {
      const newFormatShape = {
        schema: 'ab.container.v2' as const,
        name: 'Test',
        cid: 'test',
        cells: [[0, 0, 0]],
        meta: {
          originalFormat: 'koos.shape@1'
        }
      };
      
      expect(isNewFormat(newFormatShape)).toBe(true);
    });
    
    it('should identify legacy shapes', () => {
      const legacyShape = {
        schema: 'ab.container.v2' as const,
        name: 'Test',
        cid: 'test',
        cells: [[0, 0, 0]],
        meta: {}
      };
      
      expect(isNewFormat(legacyShape)).toBe(false);
    });
  });
  
  describe('createKoosShape', () => {
    it('should create koos.shape@1 with computed ID', async () => {
      const cells: [number, number, number][] = [
        [0, 0, 0],
        [1, 1, 0],
        [1, 0, 1]
      ];
      
      const result = await createKoosShape(cells);
      
      expect(result.schema).toBe('koos.shape');
      expect(result.version).toBe(1);
      expect(result.lattice).toBe('fcc');
      expect(result.id).toMatch(/^sha256:[a-f0-9]{64}$/);
      expect(result.cells).toHaveLength(3);
    });
    
    it('should sort cells lexicographically', async () => {
      const cells: [number, number, number][] = [
        [2, 1, 0],
        [1, 1, 0],
        [0, 0, 0]
      ];
      
      const result = await createKoosShape(cells);
      
      expect(result.cells[0]).toEqual([0, 0, 0]);
      expect(result.cells[1]).toEqual([1, 1, 0]);
      expect(result.cells[2]).toEqual([2, 1, 0]);
    });
    
    it('should remove duplicate cells', async () => {
      const cells: [number, number, number][] = [
        [0, 0, 0],
        [1, 1, 0],
        [0, 0, 0], // Duplicate
        [1, 1, 0]  // Duplicate
      ];
      
      const result = await createKoosShape(cells);
      
      expect(result.cells).toHaveLength(2);
      expect(result.cells).toEqual([
        [0, 0, 0],
        [1, 1, 0]
      ]);
    });
    
    it('should produce same ID for same cells (idempotent)', async () => {
      const cells: [number, number, number][] = [
        [0, 0, 0],
        [1, 1, 0]
      ];
      
      const result1 = await createKoosShape(cells);
      const result2 = await createKoosShape(cells);
      
      expect(result1.id).toBe(result2.id);
    });
    
    it('should produce same ID regardless of input order', async () => {
      const cells1: [number, number, number][] = [
        [1, 1, 0],
        [0, 0, 0]
      ];
      
      const cells2: [number, number, number][] = [
        [0, 0, 0],
        [1, 1, 0]
      ];
      
      const result1 = await createKoosShape(cells1);
      const result2 = await createKoosShape(cells2);
      
      expect(result1.id).toBe(result2.id);
    });
  });
});
