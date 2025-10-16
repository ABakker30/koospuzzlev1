# Contracts Overview (koos.* v1)

**Purpose**  
A tiny, stable contract family for the app. *Only lattice data (IJK) and placements.*  
No transforms. No UI. No engine/meta. Those live outside.

---

## Files

### 1) `koos.shape` (immutable geometry)
```json
{
  "schema": "koos.shape",
  "version": 1,
  "id": "sha256:<content-hash>",
  "lattice": "fcc",
  "cells": [[i,j,k], ...]
}
```
- **id** is a content hash of this file (see *ID Hashing*).  
- **cells** are the available lattice points.  
- Editing a shape creates a **new** id.

### 2) `koos.state` (working config; partial or full)
```json
{
  "schema": "koos.state",
  "version": 1,
  "id": "sha256:<content-hash>",   // optional until locked
  "shapeRef": "sha256:<shape-id>",
  "placements": [
    { "pieceId": "A", "anchorIJK": [i,j,k], "orientationIndex": n }
  ]
}
```
- **Empty placements** → represents the *shape* baseline in a viewer.  
- **Partial** → an in‑progress *state*.  
- **Full + valid** → a *solution candidate*.  
- **Solution** is just a **locked** full state (same schema).

---

## Invariants (keep these tight)
- **Kinds are derived**: empty/partial/full; do not store a “type” flag.
- **No transforms**: each function derives its own viewing transforms.
- **Immutability on lock**: locked files are read‑only; any edit creates a new id.
- **Determinism**: same content ⇒ same id everywhere.
- **Minimalism**: only IJK cells and placements live in these files.

---

## Where everything else lives
- Viewer settings, studio jobs, solver options, sharing, provenance, titles, thumbnails → **external metadata** (DB or sidecar docs).

