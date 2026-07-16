# Koos Puzzle Combinatorics — the honest numbers

Computed exactly (BigInt, no estimates) from the engine's own piece data
(`public/data/Pieces/pieces.json`) by `npm run combinatorics`
(`scripts/combinatorics.ts`). Run it on any container:

```
npm run combinatorics                     # demo ladder (16 / 100 / … cells)
npm run combinatorics -- --block 5x5x4   # ijk block container
npm run combinatorics -- --puzzle <uuid> # real puzzle from the database
```

## What is counted

- **Orientations (O_p)** — distinct rotated forms of piece p, straight from the
  engine's orientation file. Range: **2** (piece K, maximally symmetric) to
  **48** (pieces E and Y). Total across all 25 pieces: **475**.
- **Placements (P_p)** — ways piece p fits fully inside a given container
  (orientation × translation). This is per-container and is what the solver's
  exact-cover matrix is built from.
- **Configurations, e_k(P)** — choose k = N/4 *distinct* pieces and one
  placement for each, ignoring overlaps. The naive configuration space a blind
  search wanders. (Exact: the k-th elementary symmetric polynomial of the
  placement counts.)
- **Assembly sequences, e_k × k!** — the same, counting the *order* pieces are
  placed. This is what a person or a depth-first solver actually walks.

Almost all of these configurations are invalid (pieces overlap); the puzzle is
hard because valid solutions are a vanishing fraction of this space.

## Computed values

| Container | Cells | Pieces | Solver rows | Configurations | Assembly sequences |
|---|---|---|---|---|---|
| ijk block 2×2×4 (small) | 16 | 4 | 387 | 6.3 × 10⁸ | 1.5 × 10¹⁰ |
| real puzzle "3x4" | 20 | 5 | 749 | 1.1 × 10¹² | 1.3 × 10¹⁴ |
| ijk block 5×5×4 (classic scale) | 100 | 25 | 15,809 | 5.5 × 10⁶⁷ | **8.5 × 10⁹²** |
| ijk block 5×5×8 (two sets, lower bound) | 200 | 50 | 40,589 | ≥ 1.0 × 10⁷⁸ | **≥ 1.6 × 10¹⁰³** |

(The 100-cell ijk block is a stand-in for the classic 5×5×4 stacked shape;
exact geometry shifts the number by a little, the exponent by essentially
nothing. The 200-cell numbers cap at 25 distinct pieces — true multi-set
counting is larger still.)

## The standardized claims (use these everywhere)

- **Classic 100-sphere puzzle:** "nearly **10⁹³ ways to attempt an assembly** —
  over a **trillion times the number of atoms in the observable universe**
  (~10⁸⁰)." Unordered: ~5 × 10⁶⁷ configurations.
- **Large shapes (200 spheres and up):** "the search space passes **10¹⁰⁰**."
- **Small puzzles are honest too:** even a 16-ball starter has over a billion
  configurations.
- Framing: "**one of the hardest puzzles ever devised**" — never the flat
  superlative "world's hardest."

This resolves the earlier 10⁸⁰-vs-10¹⁰⁰ discrepancy: both were approximations
of different counting methods. 10⁸⁰ survives as the *atoms-in-the-universe
comparator* (the claim "more combinations than atoms in the universe" is true
by 13 orders of magnitude); 10¹⁰⁰⁺ is correct only for the largest shapes.

## Notes on the orientation counts

Orientation counts come from the engine's data file, so app claims always match
solver behavior. The FCC rotation group has 24 proper rotations; pieces with
fewer counts (K=2, A=3, D=6, B=8, many at 12) are symmetric under some
rotations, and the two 48s (E, Y) include mirror forms in the data. "Some
pieces have 30+ orientations" is accurate (two have 48).
