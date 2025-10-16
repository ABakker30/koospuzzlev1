# ID Hashing (deterministic)

**Goal**  
Make `id = "sha256:<hex>"` stable across machines. Same content ⇒ same id.

---

## What to hash
Hash the **canonical JSON** of the file **excluding** the `id` field.

- *Include*: `schema`, `version`, and all content fields (`lattice`, `cells`, `shapeRef`, `placements`, …).
- *Exclude*: `id` itself and any external metadata (which never appears in these files).

---

## Canonicalization rules
1. **UTF‑8** encoding, no BOM.  
2. **Stable key order**: serialize with keys in **alphabetical** order at every object level.  
3. **Integers as integers** (no trailing decimals).  
4. **No duplicates**: dedupe arrays before hashing.  
5. **Shape (`koos.shape`)**  
   - Sort `cells` **lexicographically** by `[i, j, k]` (compare `i`, then `j`, then `k`).  
6. **State / Solution (`koos.state`)**  
   - Normalize `pieceId` casing (e.g., **upper**).  
   - Sort `placements` by: `pieceId` → `anchorIJK` (i, then j, then k) → `orientationIndex`.  

> Result: serializing the same content always produces the same byte string.

---

## Hash function
- **SHA‑256** of the canonical JSON bytes.
- Prefix with `sha256:` to form the final **id**.

Example (pseudo):
```
id = "sha256:" + SHA256(canonical_json_bytes).hex()
```

---

## Validation checklist
- Re‑serialize → re‑hash ⇒ **same id** (idempotent).  
- Small edits change the id (content‑addressed).  
- Sorting rules applied consistently (unit tests recommended).

