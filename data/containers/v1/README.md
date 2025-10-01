# Shape Container Files v1

This directory contains shape files in the canonical IJK format for the Koos Puzzle application.

## Structure

- `samples/` - Small demo shapes for quick loading and testing
- `library/` - Full library of puzzle container shapes
- `manifest.json` - Index file for fast Browse dialog rendering

## File Format

Each `.fcc.json` file contains:

```json
{
  "schema": "ab.container.v2",
  "name": "Shape Name",
  "cid": "sha256:...",
  "cells": [[i,j,k], [i,j,k], ...],
  "meta": {
    "designer": "Author Name",
    "date": "2025-09-27"
  }
}
```

## Notes

- All coordinates are in canonical IJK format (integers only)
- No XYZ world coordinates stored (computed at runtime)
- CID is computed from the canonical IJK cell set
- Files are served statically by Vite from /public
