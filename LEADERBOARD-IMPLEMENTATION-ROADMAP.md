# Leaderboard Implementation Roadmap

**Status:** Foundation complete (v42.8.0) ✅  
**Next Steps:** UI implementation and data integration

---

## ✅ DONE: Data Engine (v42.8.0)

- [x] Track `undoCount` in ManualSolvePage
- [x] Compute comprehensive solve stats (`computeSolveStats()`)
- [x] Save stats to database via `useSolutionSave`
- [x] Stats tracked:
  - `total_moves`
  - `undo_count`
  - `hints_used`
  - `solvability_checks_used`
  - `duration_ms`

---

## 📋 TODO: Database Migration

### Task 1: Run Migration in Supabase

**File:** `supabase-add-leaderboard-stats-columns.sql`

1. Open Supabase SQL Editor
2. Run the migration script
3. Verify columns exist:
   ```sql
   SELECT column_name FROM information_schema.columns 
   WHERE table_name = 'solutions';
   ```

**What it does:**
- Adds stats columns with `IF NOT EXISTS`
- Backfills NULL values with zeros
- Creates performance indexes
- Adds documentation comments

---

## 📋 TODO: Leaderboard Page

### Task 2: Create Route & Basic Structure

**Files to create:**
- `src/pages/leaderboards/LeaderboardsPage.tsx`
- `src/pages/leaderboards/components/PuzzleLeaderboard.tsx`
- `src/pages/leaderboards/components/PuzzleSelector.tsx`

**Routing:**
```typescript
// Add to App.tsx or routes config
<Route path="/leaderboards" element={<LeaderboardsPage />} />
<Route path="/leaderboards/:puzzleId" element={<LeaderboardsPage />} />
```

---

### Task 3: Implement PuzzleLeaderboard Component

**Features:**
- Mode toggle: Speed / Efficiency
- Data table with columns:
  - Rank
  - Player (user_id → username later)
  - Time (formatted: "3m 42s")
  - Hints
  - Undos
  - Moves
  - Date
- Load data from Supabase using queries from `LEADERBOARD-QUERIES.md`

**Pseudo-code:**
```typescript
export const PuzzleLeaderboard: FC<{ puzzleId: string }> = ({ puzzleId }) => {
  const [mode, setMode] = useState<'speed' | 'efficiency'>('speed');
  const [entries, setEntries] = useState<LeaderboardEntry[]>([]);
  
  useEffect(() => {
    loadLeaderboard(puzzleId, mode);
  }, [puzzleId, mode]);
  
  return (
    <div>
      <div className="mode-toggle">
        <button onClick={() => setMode('speed')}>Speed</button>
        <button onClick={() => setMode('efficiency')}>Efficiency</button>
      </div>
      <table>
        {/* render entries */}
      </table>
    </div>
  );
};
```

---

## 📋 TODO: Enhance Success Modal

### Task 4: Display Stats in ManualSolveSuccessModal

**File:** `src/pages/solve/components/ManualSolveSuccessModal.tsx`

**Add stats display:**
```typescript
const durationMs = solveEndTime && solveStartTime 
  ? solveEndTime - solveStartTime 
  : null;

const formatTime = (ms: number) => {
  const seconds = Math.floor(ms / 1000);
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}m ${secs}s`;
};

// In modal body:
<div className="solve-stats">
  <p>⏱️ Time: {formatTime(durationMs)}</p>
  <p>🎯 Moves: {totalMoves}</p>
  <p>💡 Hints: {hintsUsed}</p>
  <p>↩️ Undos: {undoCount}</p>
</div>

<button onClick={() => navigate(`/leaderboards/${puzzle.id}`)}>
  View Leaderboard
</button>
```

---

## 📋 TODO: Mode-Aware Leaderboards

### Task 5: Add Mode Filter

**Enhancement:**
Filter leaderboards by game mode for fair comparison.

```typescript
// In PuzzleLeaderboard
const [gameMode, setGameMode] = useState<'oneOfEach' | 'unlimited' | 'single'>('oneOfEach');

// Update Supabase query:
.eq('mode', gameMode)
```

**UI:**
```typescript
<select value={gameMode} onChange={(e) => setGameMode(e.target.value)}>
  <option value="oneOfEach">One of Each</option>
  <option value="unlimited">Unlimited</option>
  <option value="single">Identical Pieces</option>
</select>
```

---

## 🎯 Compact To-Do Checklist

```
[ ] 1. Run Supabase migration (supabase-add-leaderboard-stats-columns.sql)
[ ] 2. Create /leaderboards route in App.tsx
[ ] 3. Create LeaderboardsPage.tsx (with puzzle selector)
[ ] 4. Create PuzzleLeaderboard.tsx component
    [ ] Mode toggle (Speed/Efficiency)
    [ ] Supabase data fetching
    [ ] Table UI with rank + stats
[ ] 5. Enhance ManualSolveSuccessModal.tsx
    [ ] Display formatted stats
    [ ] Add "View Leaderboard" button
[ ] 6. (Optional) Add mode filter to leaderboards
[ ] 7. (Later) Join with profiles table for usernames
```

---

## 🚀 Quick Wins First

**Minimum Viable Leaderboard (1-2 hours):**
1. Run migration ✅
2. Create basic `/leaderboards/:puzzleId` route
3. Fetch top 50 by speed
4. Display in simple table (user_id as string for now)
5. Link from success modal

**Then iterate:**
- Add efficiency toggle
- Add mode filter
- Pretty formatting
- Username lookups
- Personal best highlighting
- My rank indicator

---

## 📚 Reference Files

- **Migration:** `supabase-add-leaderboard-stats-columns.sql`
- **Queries:** `LEADERBOARD-QUERIES.md`
- **This Roadmap:** `LEADERBOARD-IMPLEMENTATION-ROADMAP.md`

---

**You've built the data engine. Now it's time to visualize it!** 🎉
