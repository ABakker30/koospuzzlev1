// Import effect constructors first
import { TurnTableEffect } from './turntable/TurnTableEffect';
import { OrbitEffect } from './orbit/OrbitEffect';
import { RevealEffect } from './reveal/RevealEffect';
import { ExplosionEffect } from './explosion/ExplosionEffect';
import { GravityEffect } from './gravity/GravityEffect';

// Effects Registry - minimal in-memory registry for effect definitions
export interface EffectDefinition {
  id: string;
  title: string;
  description?: string;
  constructor?: new () => any; // Effect constructor - will be properly typed later
}

// In-memory registry (no persistence, no side effects)
const registry = new Map<string, EffectDefinition>();

export function registerEffect(def: EffectDefinition): void {
  registry.set(def.id, { ...def });
}

export function getEffect(id: string): EffectDefinition | null {
  return registry.get(id) || null;
}

export function listEffects(): EffectDefinition[] {
  return Array.from(registry.values());
}

// Register built-in effects
registerEffect({
  id: 'turntable',
  title: 'Turn Table',
  description: 'Rotate camera or object around Y-axis',
  constructor: TurnTableEffect
});

registerEffect({
  id: 'orbit',
  title: 'Orbit (Keyframes)',
  description: 'Author camera paths via keyframes; play/pause/stop/record',
  constructor: OrbitEffect
});

registerEffect({
  id: 'reveal',
  title: 'Reveal',
  description: 'Progressive piece visibility with optional rotation',
  constructor: RevealEffect
});

registerEffect({
  id: 'explosion',
  title: 'Explosion',
  description: 'Progressive piece separation with optional rotation',
  constructor: ExplosionEffect
});

registerEffect({
  id: 'gravity',
  title: 'Gravity',
  description: 'Physics-based simulation with gravity and auto-break joints',
  constructor: GravityEffect
});
