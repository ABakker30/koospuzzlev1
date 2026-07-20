// Golden-master equivalence test for engine2.
//
// Run normally: asserts each case's fingerprint matches the committed golden.
// Regenerate the golden (only when a behavior change is intended and reviewed):
//   CAPTURE_GOLDEN=1 npx vitest run src/engines/engine2/__tests__/engineGolden.test.ts
//
// A behavior-preserving refactor (incremental MRV, Uint32 bitboards, …) must
// leave every fingerprint byte-identical. A failing case with a changed node
// count is the refactor diverging from the original search.

import { describe, it, expect, beforeAll } from 'vitest';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { CASES, GEOMETRIES, runFingerprint, loadPiecesForTest, type Fingerprint } from './engineGolden.fixtures';

const GOLDEN_PATH = resolve(process.cwd(), 'src/engines/engine2/__tests__/engineGolden.golden.json');
const CAPTURE = !!process.env.CAPTURE_GOLDEN;

describe('engine2 golden master', () => {
  beforeAll(async () => {
    await loadPiecesForTest();
  }, 60000);

  if (CAPTURE) {
    it('captures golden fingerprints', async () => {
      const golden: Record<string, Fingerprint> = {};
      for (const c of CASES) {
        golden[c.name] = await runFingerprint(GEOMETRIES[c.geometry], c.settings);
      }
      writeFileSync(GOLDEN_PATH, JSON.stringify(golden, null, 2) + '\n', 'utf8');
      expect(Object.keys(golden).length).toBe(CASES.length);
    }, 120000);
    return;
  }

  it('golden file exists', () => {
    expect(existsSync(GOLDEN_PATH)).toBe(true);
  });

  const golden: Record<string, Fingerprint> = existsSync(GOLDEN_PATH)
    ? JSON.parse(readFileSync(GOLDEN_PATH, 'utf8'))
    : {};

  for (const c of CASES) {
    it(`matches golden: ${c.name}`, async () => {
      const fp = await runFingerprint(GEOMETRIES[c.geometry], c.settings);
      expect(fp).toEqual(golden[c.name]);
    }, 60000);
  }
});
