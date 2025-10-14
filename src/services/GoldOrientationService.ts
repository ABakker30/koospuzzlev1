// Gold-standard orientation service for Manual Puzzle
// Loads piece orientations from public/data/Pieces/pieces.json

export type IJK = { i: number; j: number; k: number };
export type OrientationSpec = { orientationId: string; ijkOffsets: IJK[] };

export class GoldOrientationService {
  private cache?: Record<string, IJK[][]>;

  async load(): Promise<void> {
    if (this.cache) return;
    const res = await fetch('/data/Pieces/pieces.json');
    if (!res.ok) throw new Error('Failed to load gold orientations');
    this.cache = await res.json();
    if (this.cache) {
      console.log('📐 GoldOrientationService: loaded', Object.keys(this.cache).length, 'pieces');
    }
  }

  getPieces(): string[] {
    if (!this.cache) return [];
    return Object.keys(this.cache);
  }

  getOrientations(pieceId: string): OrientationSpec[] {
    const raw = this.cache?.[pieceId] ?? [];
    return raw.map((cells, idx) => ({
      orientationId: `${pieceId}-${String(idx).padStart(2, '0')}`,
      ijkOffsets: cells,
    }));
  }
}

export type OrientationListener = (o: OrientationSpec) => void;

export class GoldOrientationController {
  private svc: GoldOrientationService;
  private list: OrientationSpec[] = [];
  private idx = 0;
  private listeners = new Set<OrientationListener>();

  constructor(svc: GoldOrientationService) {
    this.svc = svc;
  }

  async init(defaultPieceId: string) {
    await this.svc.load();
    this.setPiece(defaultPieceId);
  }

  setPiece(pieceId: string) {
    this.list = this.svc.getOrientations(pieceId);
    this.idx = 0;
    this.emit();
    console.log(` Controller: setPiece(${pieceId}) → ${this.list.length} orientations`);
  }

  next() {
    if (this.list.length) {
      this.idx = (this.idx + 1) % this.list.length;
      this.emit();
    }
  }

  previous() {
    if (this.list.length) {
      this.idx = (this.idx - 1 + this.list.length) % this.list.length;
      this.emit();
    }
  }

  getCurrentIndex() {
    return this.idx;
  }

  getCurrent(): OrientationSpec | null {
    return this.list[this.idx] ?? null;
  }

  onOrientationChanged(fn: OrientationListener) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private emit() {
    const o = this.list[this.idx];
    if (o) {
      for (const l of this.listeners) l(o);
    }
  }
}
