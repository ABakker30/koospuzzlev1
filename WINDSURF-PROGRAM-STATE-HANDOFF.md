# 🧭 Windsurf Program — Function Contracts + Lightweight State Handoff

## Goal
Implement clean function boundaries and seamless handoff using a tiny in-memory "active state".
Legacy is already retired. No UI redesign.

## Contract (frozen)
- **Shape:** read shape / write shape (koos.shape@1)
- **View:** read solution only (koos.state@1 full)
- **Solve:** read shape → write solution (koos.state@1)
- **Puzzle:** read shape → write solution or save state (koos.state@1 partial/full)
- **Studio:** read shape or solution (read-only)

## State (in memory only for now)
```
activeState = { shapeRef: string, placements: [] }
```
No transforms. No metadata. "Kind" is derived: empty / partial / full.

---

## Phase 1 — Active State Holder + Router

### Task
Create a tiny app-level holder and deterministic navigation rules.

### Do
1. Add an **Active State service** (in memory):
   - `getActiveState()`, `setActiveState(newState)`, `clearActiveState()`
   - validate structure `{ schema:"koos.state", version:1, shapeRef, placements[] }` on set

2. Add **Last Known Refs** (in memory):
   - `lastShapeRef`, `lastSolutionRef` (ids/paths only)

3. **Router rules** (no UI changes):
   - On switch pass only `activeState` to the next function
   - If the next function needs a container and `activeState.shapeRef` is missing → show a small placeholder; do not mutate state

### Exit
Router compiles. No behavior changes yet.

**Run name:** `State Core — Active Holder + Router Rules`

---

## Phase 2 — Wire Each Function to the Contract

### Task
Connect each page to read/write exactly what the contract says. Keep existing visuals and controls.

### A) Shape
- **On open:** read koos.shape@1, set
  ```
  activeState = { schema:"koos.state", version:1, shapeRef: shape.id, placements: [] }
  ```
- **On save:** write new koos.shape@1 (new id), then reset
  ```
  activeState.shapeRef = newId and placements = []
  ```
- Do not write state files here

### B) Solve
- **On start:** require `activeState.shapeRef` → fetch shape; seed from `activeState.placements` (if any)
- **On solution:** write koos.state@1 (full) to `solutions/<id>.solution.json`
- **After write:** `setActiveState(loadedSolution)` so View/Puzzle can use it

### C) View
- **On open:** read koos.state@1 (full). Do not fetch shape for viewing
- **After load:** `setActiveState(loadedSolution)` (in memory only). No writes

### D) Puzzle
- **On open:** need `activeState.shapeRef` → fetch shape; render `activeState.placements`
- **On user edits:** update `activeState.placements` in memory
- **On Save Solution:** write koos.state@1 full to `solutions/…`
- **On Save State (optional):** write koos.state@1 partial to `states/…` (can be deferred; see Phase 3)

### E) Studio
- **On open:** consume `activeState` (shape or solution). Read-only. No writes

### Exit
- Each page compiles and runs with the new read/write boundaries
- Visuals unchanged

**Run name:** `Functions — Contract Wiring (Shape/Solve/View/Puzzle/Studio)`

---

## Phase 3 — Optional: Save/Load State Files (later)

Add simple Save State / Load State using `states/<id>.state.json`
Keep the in-memory state as primary; file I/O is explicit user action

**Run name:** `States — Optional Save/Load`

---

## Derived Transition Rules (enforced by router + pages)

- **View → Puzzle:** viewing a solution sets activeState → Puzzle keeps placements
- **Puzzle → Solve:** Solver reads current activeState as seed
- **Shape → (Puzzle/Solve/Studio):** new shapeRef, placements reset []
- **Solve → View:** solution written, then activeState = solution

---

## Acceptance (for this program)

- ✅ Switching functions retains the last known shape/solution/state in memory only
- ✅ Each function reads/writes only its contract; no transforms or meta in files
- ✅ No cross-page click handlers; router passes only activeState
- ✅ If required data is missing, the function shows a small placeholder and does not mutate state

---

## Implementation Status

- [ ] Phase 1: Active State Holder + Router
- [ ] Phase 2: Wire Each Function to Contract
  - [ ] A) Shape Editor
  - [ ] B) Auto Solver
  - [ ] C) Solution Viewer
  - [ ] D) Manual Puzzle
  - [ ] E) Content Studio
- [ ] Phase 3: Optional Save/Load State Files
