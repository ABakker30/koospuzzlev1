import type { FitPlacement } from '../../../services/FitFinder';

export type PlacedPiece = FitPlacement & {
  uid: string;
  placedAt: number;
};

export type Action =
  | { type: 'place'; piece: PlacedPiece }
  | { type: 'delete'; piece: PlacedPiece };
