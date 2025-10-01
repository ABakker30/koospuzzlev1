// Effects Registry - minimal in-memory registry for effect definitions
export interface EffectDefinition {
  id: string;
  title: string;
  description?: string;
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
  description: 'Rotate camera or object around Y-axis'
});

registerEffect({
  id: 'keyframe',
  title: 'Keyframe Animation',
  description: 'Coming soon'
});
