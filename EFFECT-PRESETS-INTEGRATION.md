# Effect Presets Integration Guide

## What Was Created

### 1. Database Schema
**File:** `supabase-effect-presets.sql`
- Single table `effect_presets` for all effect types
- Fields: `effect_type`, `name`, `description`, `config` (JSONB)
- No authentication required (DEV MODE)
- RLS policies allow anonymous operations

### 2. API Functions
**File:** `src/api/effectPresets.ts`
- `saveEffectPreset<T>()` - Save effect configuration
- `getEffectPresets<T>(effectType)` - Load presets for specific effect
- `updateEffectPreset<T>()` - Update existing preset
- `deleteEffectPreset()` - Delete preset

### 3. Reusable Component
**File:** `src/components/EffectPresetsSection.tsx`
- Generic component for save/load UI
- Works with any effect configuration type
- Handles all CRUD operations

---

## How to Integrate Into Effect Modals

### Example: TurnTable Modal

```typescript
// 1. Import the component and types
import { EffectPresetsSection } from '../../components/EffectPresetsSection';
import type { TurnTableConfig } from './presets';

export const TurnTableModal: React.FC<TurnTableModalProps> = ({ 
  isOpen, 
  onClose, 
  onSave, 
  initialConfig = DEFAULT_CONFIG 
}) => {
  const [config, setConfig] = useState<TurnTableConfig>(initialConfig);
  
  // ... existing modal code ...

  return (
    <div style={{ /* backdrop */ }}>
      <div style={{ /* modal container */ }}>
        <h3>Turntable Configuration</h3>
        
        {/* Existing configuration inputs */}
        <div>
          <label>Duration (seconds)</label>
          <input 
            type="number" 
            value={config.duration}
            onChange={(e) => setConfig({ ...config, duration: parseFloat(e.target.value) })}
          />
        </div>
        
        <div>
          <label>Speed</label>
          <input 
            type="number" 
            value={config.speed}
            onChange={(e) => setConfig({ ...config, speed: parseFloat(e.target.value) })}
          />
        </div>
        
        {/* ADD THIS: Presets Section */}
        <EffectPresetsSection<TurnTableConfig>
          effectType="turntable"
          currentConfig={config}
          onLoadPreset={(loadedConfig) => {
            setConfig(loadedConfig);
            console.log('✅ Loaded turntable preset');
          }}
        />
        
        {/* Existing save/cancel buttons */}
        <button onClick={() => onSave(config)}>Save</button>
        <button onClick={onClose}>Cancel</button>
      </div>
    </div>
  );
};
```

---

## Integration for Each Effect

### 1. **Turntable Modal**
**File:** `src/effects/turntable/TurnTableModal.tsx`
```typescript
<EffectPresetsSection<TurnTableConfig>
  effectType="turntable"
  currentConfig={config}
  onLoadPreset={setConfig}
/>
```

### 2. **Orbit Modal**
**File:** `src/effects/orbit/OrbitModal.tsx`
```typescript
<EffectPresetsSection<OrbitConfig>
  effectType="orbit"
  currentConfig={config}
  onLoadPreset={setConfig}
/>
```

### 3. **Reveal Modal**
**File:** `src/effects/reveal/RevealModal.tsx`
```typescript
<EffectPresetsSection<RevealConfig>
  effectType="reveal"
  currentConfig={config}
  onLoadPreset={setConfig}
/>
```

### 4. **Explosion Modal**
**File:** `src/effects/explosion/ExplosionModal.tsx`
```typescript
<EffectPresetsSection<ExplosionConfig>
  effectType="explosion"
  currentConfig={config}
  onLoadPreset={setConfig}
/>
```

---

## Setup Instructions

### Step 1: Run SQL in Supabase
1. Go to Supabase Dashboard → SQL Editor
2. Copy contents of `supabase-effect-presets.sql`
3. Run the query

### Step 2: Add Presets Section to Each Modal
For each effect modal file:
1. Import `EffectPresetsSection` component
2. Add the component before your save/cancel buttons
3. Pass the correct effect type and config

### Step 3: Test
1. Open any effect modal
2. Configure settings
3. Scroll down to "Presets" section
4. Click "Save Current Configuration"
5. Name it and save
6. Change settings and click "Load" to restore

---

## Features

✅ **Save presets** - Save any effect configuration with a name
✅ **Load presets** - One-click restore saved configurations  
✅ **Delete presets** - Remove unwanted presets
✅ **Public presets** - Option to share with all users
✅ **Per-effect organization** - Each effect has its own preset list
✅ **No auth required** - Works in development without login
✅ **Type-safe** - Full TypeScript support for all effect configs

---

## Database Structure

```
effect_presets
├── id (UUID)
├── effect_type ('turntable' | 'orbit' | 'reveal' | 'explosion')
├── name (TEXT)
├── description (TEXT, optional)
├── config (JSONB) - stores the effect configuration
├── is_public (BOOLEAN)
├── user_id (UUID, nullable)
└── created_at, updated_at (TIMESTAMPTZ)
```

---

## Notes

- **Single table design**: All effect types share one table, filtered by `effect_type`
- **JSONB storage**: Each effect's config is stored as flexible JSON
- **Type safety**: Generic types ensure correct config structure
- **Unique constraint**: `(user_id, effect_type, name)` prevents duplicate names per effect
