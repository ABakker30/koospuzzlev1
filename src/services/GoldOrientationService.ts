// Gold-standard orientation service for Manual Puzzle
// MVP: Fake implementation with fixed orientation list

import { Orientation } from '../types/lattice';

export interface OrientationServiceInterface {
  getOrientationsForPiece(pieceId: string): Orientation[];
}

/**
 * Fake orientation service for MVP
 * Returns a fixed list of 6 orientations representing standard 90° rotations
 */
export class FakeOrientationService implements OrientationServiceInterface {
  private readonly orientations: Orientation[] = [
    {
      orientationId: 'ori-0-identity',
      label: 'Identity',
      matrix: [
        [1, 0, 0, 0],
        [0, 1, 0, 0],
        [0, 0, 1, 0],
        [0, 0, 0, 1]
      ]
    },
    {
      orientationId: 'ori-1-rot-x-90',
      label: 'Rotate X +90°',
      matrix: [
        [1, 0, 0, 0],
        [0, 0, -1, 0],
        [0, 1, 0, 0],
        [0, 0, 0, 1]
      ]
    },
    {
      orientationId: 'ori-2-rot-x-180',
      label: 'Rotate X 180°',
      matrix: [
        [1, 0, 0, 0],
        [0, -1, 0, 0],
        [0, 0, -1, 0],
        [0, 0, 0, 1]
      ]
    },
    {
      orientationId: 'ori-3-rot-x-270',
      label: 'Rotate X +270°',
      matrix: [
        [1, 0, 0, 0],
        [0, 0, 1, 0],
        [0, -1, 0, 0],
        [0, 0, 0, 1]
      ]
    },
    {
      orientationId: 'ori-4-rot-y-90',
      label: 'Rotate Y +90°',
      matrix: [
        [0, 0, 1, 0],
        [0, 1, 0, 0],
        [-1, 0, 0, 0],
        [0, 0, 0, 1]
      ]
    },
    {
      orientationId: 'ori-5-rot-z-90',
      label: 'Rotate Z +90°',
      matrix: [
        [0, -1, 0, 0],
        [1, 0, 0, 0],
        [0, 0, 1, 0],
        [0, 0, 0, 1]
      ]
    }
  ];

  getOrientationsForPiece(_pieceId: string): Orientation[] {
    console.log(`📐 FakeOrientationService: returning ${this.orientations.length} orientations for piece`);
    return this.orientations;
  }
}

/**
 * Controller for managing current orientation index and keyboard navigation
 */
export class GoldOrientationController {
  private currentPieceId?: string;
  private currentIndex: number = 0;
  private orientations: Orientation[] = [];
  private listeners: Array<(orientation: Orientation) => void> = [];

  constructor(private service: OrientationServiceInterface) {}

  setPiece(pieceId: string): void {
    if (this.currentPieceId === pieceId) return;
    
    this.currentPieceId = pieceId;
    this.orientations = this.service.getOrientationsForPiece(pieceId);
    this.currentIndex = 0;
    
    if (this.orientations.length > 0) {
      this.emit(this.orientations[0]);
    }
  }

  next(): void {
    if (this.orientations.length === 0) return;
    
    this.currentIndex = (this.currentIndex + 1) % this.orientations.length;
    this.emit(this.orientations[this.currentIndex]);
  }

  previous(): void {
    if (this.orientations.length === 0) return;
    
    this.currentIndex = (this.currentIndex - 1 + this.orientations.length) % this.orientations.length;
    this.emit(this.orientations[this.currentIndex]);
  }

  getCurrent(): Orientation | null {
    return this.orientations[this.currentIndex] || null;
  }

  getCurrentIndex(): number {
    return this.currentIndex;
  }

  onOrientationChanged(callback: (orientation: Orientation) => void): () => void {
    this.listeners.push(callback);
    return () => {
      this.listeners = this.listeners.filter(l => l !== callback);
    };
  }

  private emit(orientation: Orientation): void {
    console.log(`🔄 OrientationChanged: ${orientation.orientationId} (${orientation.label}) [${this.currentIndex + 1}/${this.orientations.length}]`);
    this.listeners.forEach(listener => listener(orientation));
  }
}
