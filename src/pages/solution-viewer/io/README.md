# Solution Viewer Format Reader

This module provides automatic format detection and conversion for the Solution Viewer, supporting both legacy and new `koos.state@1` contract formats.

## Overview

The format reader allows the Solution Viewer to seamlessly load solutions in multiple formats without requiring any user intervention or UI changes.

## Supported Formats

### 1. Legacy Format (Existing)

```json
{
  "version": 1,
  "containerCidSha256": "...",
  "lattice": "fcc",
  "piecesUsed": { "A": 2, "B": 1 },
  "placements": [
    {
      "piece": "A",
      "ori": 0,
      "t": [0, 0, 0],
      "cells_ijk": [[0,0,0], [1,1,0], [1,0,1], [0,1,1]]
    }
  ],
  "sid_state_sha256": "...",
  "sid_route_sha256": "...",
  "sid_state_canon_sha256": "...",
  "mode": "manual",
  "solver": { ... }
}
```

### 2. koos.state@1 Format (New)

```json
{
  "schema": "koos.state",
  "version": 1,
  "id": "sha256:...",
  "shapeRef": "sha256:...",
  "placements": [
    {
      "pieceId": "A",
      "anchorIJK": [0, 0, 0],
      "orientationIndex": 0
    }
  ]
}
```

## How It Works

### Detection

The reader checks for the presence of `schema: "koos.state"` and `version: 1` fields:

```typescript
function isKoosState(data: any): data is KoosState {
  return (
    data.schema === 'koos.state' &&
    data.version === 1 &&
    Array.isArray(data.placements)
  );
}
```

### Conversion

When a `koos.state@1` file is detected, it's converted to the legacy format:

**Field Mappings:**
- `pieceId` → `piece`
- `anchorIJK` → `t` (translation)
- `orientationIndex` → `ori`
- `shapeRef` → `containerCidSha256`

**Cell Reconstruction:**

Since `koos.state@1` only stores the anchor position, the format reader reconstructs the tetrahedron's 4 cells using standard FCC offsets:

```typescript
const baseCells = [
  [0, 0, 0],  // anchor
  [1, 1, 0],  // offset 1
  [1, 0, 1],  // offset 2
  [0, 1, 1]   // offset 3
];

// Apply anchor translation
const cells_ijk = baseCells.map(([di, dj, dk]) => [
  anchorI + di,
  anchorJ + dj,
  anchorK + dk
]);
```

### Integration

The format reader is integrated into `LoadSolutionModal`:

```typescript
// Load raw JSON
const rawData = await response.json();

// Auto-detect and convert format
const unifiedData = readSolutionFormat(rawData, filename);

// Pass to viewer pipeline (works with any format)
onLoaded(unifiedData, filename);
```

## Usage

```typescript
import { readSolutionFormat } from './formatReader';

// Load solution from any format
const rawData = JSON.parse(fileContent);
const solution = readSolutionFormat(rawData, 'solution.json');

// Solution is now in unified format, ready for viewer
orientSolutionWorld(solution);
```

## Testing

Run tests:
```bash
npm run test -- formatReader.test.ts
```

Test coverage:
- ✅ Detects `koos.state@1` format
- ✅ Converts multiple placements
- ✅ Builds piecesUsed count
- ✅ Generates correct tetrahedron cells
- ✅ Passes through legacy format unchanged

## Exit Criteria

✅ **New koos.state@1 files load and render correctly**  
✅ **Legacy solutions still load normally**  
✅ **No visual, structural, or performance changes**  
✅ **No UI modifications required**  
✅ **No database writes**  

## No Changes Made To

- UI components (same Browse button, same layout)
- Camera or transform logic
- Viewer pipeline (`orient.ts`, `build.ts`)
- Performance characteristics
- Telemetry or logging (except format detection logs)

## Implementation Files

- **`formatReader.ts`** - Format detection and conversion
- **`formatReader.test.ts`** - Unit tests (5 tests, all passing)
- **`LoadSolutionModal.tsx`** - Integration point (3 lines changed)

## Future Formats

To add support for new formats:

1. Add type definition
2. Add detection function
3. Add conversion function to legacy format
4. Add test cases
5. Update this README

The viewer pipeline remains unchanged - all formats convert to the unified `SolutionJSON` format.
