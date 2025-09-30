/**
 * Seeded Pseudo-Random Number Generator
 * Provides deterministic random numbers for reproducible effects
 */

export class PRNG {
  private seed: number;
  private state: number;

  constructor(seed: number = Date.now()) {
    this.seed = seed;
    this.state = seed;
  }

  /**
   * Generate next random number between 0 and 1
   */
  next(): number {
    // Simple LCG (Linear Congruential Generator)
    this.state = (this.state * 1664525 + 1013904223) % 0x100000000;
    return this.state / 0x100000000;
  }

  /**
   * Generate random number between min and max
   */
  range(min: number, max: number): number {
    return min + this.next() * (max - min);
  }

  /**
   * Generate random integer between min and max (inclusive)
   */
  int(min: number, max: number): number {
    return Math.floor(this.range(min, max + 1));
  }

  /**
   * Generate random boolean
   */
  bool(): boolean {
    return this.next() < 0.5;
  }

  /**
   * Reset to initial seed
   */
  reset(): void {
    this.state = this.seed;
  }

  /**
   * Get current seed
   */
  getSeed(): number {
    return this.seed;
  }

  /**
   * Set new seed
   */
  setSeed(seed: number): void {
    this.seed = seed;
    this.state = seed;
  }
}

// Default instance with current timestamp
export const defaultPRNG = new PRNG();
