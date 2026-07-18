// Piece palettes — the unified identity behind Classic / Free Pieces /
// Choose Pieces (né One Piece) play, and the key that leaderboards rank by.
//
// A palette describes which pieces a solve was allowed to use:
//   'classic'      — one of each piece (the real Koos puzzle)
//   'free'         — any piece, unlimited copies
//   'only:D'       — unlimited copies of ONLY the listed pieces
//   'only:D+Y'       (letters sorted, joined with '+')
//
// Storage note: solutions.piece_set holds the canonical signature. The
// legacy columns (piece_mode, single_piece_id) keep being written; a
// multi-piece selection is encoded in single_piece_id as the sorted
// 'D+Y' string, so everything that carries it around (PvP setup,
// challenge locks) keeps working unchanged.

export type PieceMode = 'unique' | 'duplicates' | 'single';

/** Split a piece-selection string ('D', 'D+Y', legacy 'D,Y') into sorted letters. */
export function splitPieceSelection(selection: string | null | undefined): string[] {
  if (!selection) return [];
  return [...new Set(selection.split(/[+,]/).map((s) => s.trim()).filter(Boolean))].sort();
}

/** Canonical selection string for storage/transport ('D+Y'). */
export function joinPieceSelection(pieces: string[]): string {
  return [...new Set(pieces)].sort().join('+');
}

/** Canonical palette signature for a solve. */
export function paletteSignature(pieceMode: PieceMode, pieceSelection: string | null): string {
  if (pieceMode === 'duplicates') return 'free';
  if (pieceMode === 'single') {
    const pieces = splitPieceSelection(pieceSelection);
    if (pieces.length > 0) return `only:${pieces.join('+')}`;
  }
  return 'classic';
}

/** Letters of an 'only:…' signature ([] for classic/free). */
export function palettePieces(signature: string): string[] {
  return signature.startsWith('only:') ? splitPieceSelection(signature.slice(5)) : [];
}

/**
 * Display label for a palette signature. Pass a t() for localized Classic /
 * Free labels; 'Only D+Y' is language-neutral by construction.
 */
export function paletteLabel(signature: string, t?: (key: string) => string): string {
  if (signature === 'free') return t ? t('pieceMode.free') : 'Free Pieces';
  if (signature.startsWith('only:')) return `${t ? t('palette.only') : 'Only'} ${palettePieces(signature).join('+')}`;
  return t ? t('pieceMode.classic') : 'Classic';
}

/**
 * Duplicates used in a solve: pieces placed beyond the first copy of each
 * type (25 pieces with 22 distinct types = 3 duplicates). The Free Pieces
 * leaderboard ranks by fewest duplicates first — a zero-duplicate Free solve
 * is Classic-grade play.
 */
export function duplicateCount(placedPieces: Array<{ pieceId: string }>): number {
  const types = new Set<string>();
  for (const p of placedPieces) types.add(p.pieceId);
  return placedPieces.length - types.size;
}
