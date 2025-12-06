# Header Rebuild Plan - Manual & Auto Solve Pages

## Problem
Current header has conflicting CSS classes (mobile-only/desktop-only) that don't work properly on mobile.

## Solution: Clean Rebuild

### New Structure (BOTH Manual & Auto Solve Pages)

```tsx
<div className="solve-header">
  {/* Left: Main controls */}
  <div className="solve-header-left">
    <button>📦 Pieces</button>
    <button>🎲 Mode</button> {/* with dropdown */}
    <button>👁️/🙈</button> {/* hide toggle */}
  </div>
  
  {/* Right: Undo + 3-dot menu */}
  <div className="solve-header-right">
    <button>↶ Undo</button>
    <button>⋮ Menu</button> {/* 3-dot for ALL devices */}
  </div>
</div>
```

### 3-Dot Menu Items

**Manual Solve Page:**
- Undo
- Auto-Solve
- Info
- Settings  
- Gallery

**Auto Solve Page:**
- Manual Solve
- Info
- Settings
- Gallery

### CSS (Simple, no media queries for showing/hiding)

```css
.solve-header {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  height: 56px;
  display: flex;
  align-items: center;
  padding: 0 12px;
  gap: 12px;
}

.solve-header-left {
  display: flex;
  gap: 8px;
  flex: 1;
  overflow-x: auto;
}

.solve-header-right {
  display: flex;
  gap: 8px;
}
```

### Mode Dropdown Fix
- Use `className="menu-dropdown"` from CSS
- z-index: 10000
- position: absolute (relative to parent div)
- Must render INSIDE the Mode button's parent div

### Key Changes
1. NO mobile-only / desktop-only classes
2. 3-dot menu for EVERYONE (mobile and desktop)
3. Undo button always visible in header-right
4. Mode dropdown uses CSS class, not inline styles for positioning
5. All dropdowns use same z-index system

## Implementation Steps

1. Replace entire header section (lines 853-1350)
2. Use new clean structure above
3. Copy 3-dot menu logic to AutoSolvePage
4. Test: Mode dropdown should work, 3-dot should be on right edge
