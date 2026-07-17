// solutionSignature — the canonical identity of a solution.
//
// Two solves are THE SAME solution iff they place the same piece types on the
// same container cells (orientation follows from the cells; who/when/how fast
// is irrelevant). Mirrors and rotations of the container count as different
// solutions by design (docs/share-and-challenge-design.md §4).
//
// Canonical string: for each piece `${pieceId}:${cells}` with cells sorted
// numerically by (i,j,k) and written "i,j,k" joined by ";"; pieces sorted
// lexically (ASCII); joined by "|". Signature = SHA-256 hex of that string.
//
// The SQL backfill in 20260718_solution_signatures.sql implements the SAME
// canonicalization (COLLATE "C" for the lexical sort) — change both or none.

export interface SignaturePiece {
  pieceId: string;
  cells: { i: number; j: number; k: number }[];
}

export function canonicalSolutionString(pieces: SignaturePiece[]): string {
  return pieces
    .map((p) => {
      const cells = [...p.cells]
        .sort((a, b) => a.i - b.i || a.j - b.j || a.k - b.k)
        .map((c) => `${c.i},${c.j},${c.k}`)
        .join(';');
      return `${p.pieceId}:${cells}`;
    })
    .sort()
    .join('|');
}

export async function computeSolutionSignature(pieces: SignaturePiece[]): Promise<string> {
  const data = new TextEncoder().encode(canonicalSolutionString(pieces));
  const hash = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}
