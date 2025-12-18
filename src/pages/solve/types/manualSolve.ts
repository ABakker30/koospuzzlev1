import type { FitPlacement } from '../../../services/FitFinder';

export type PlacedPiece = FitPlacement & {
  uid: string;
  placedAt: number;
  reason?: 'hint' | 'computer' | 'user' | 'undo'; // Debug: placement source
};

export type Action =
  | { type: 'place'; piece: PlacedPiece }
  | { type: 'delete'; piece: PlacedPiece };
