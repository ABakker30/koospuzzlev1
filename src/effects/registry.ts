// Import effect constructors first
import { TurnTableEffect } from './turntable/TurnTableEffect';

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
  id: 'keyframe',
  title: 'Keyframe Animation',
  description: 'Coming soon'
  // No constructor yet - will be added in later PR
});
