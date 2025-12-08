# Leaderboard Queries Reference

## Canonical patterns for leaderboard data retrieval

---

## 1. Fastest Solvers for a Puzzle

Returns top 50 fastest completions for a specific puzzle.

```sql
SELECT
  id,
  user_id,
  puzzle_id,
  duration_ms,
  total_moves,
  hints_used,
  undo_count,
  solvability_checks_used,
  created_at
FROM solutions
WHERE puzzle_id = :puzzle_id
  AND duration_ms IS NOT NULL
ORDER BY duration_ms ASC
LIMIT 50;
```

**Supabase JS:**
```typescript
const { data, error } = await supabase
  .from('solutions')
  .select('id, user_id, puzzle_id, duration_ms, total_moves, hints_used, undo_count, solvability_checks_used, created_at')
  .eq('puzzle_id', puzzleId)
  .not('duration_ms', 'is', null)
  .order('duration_ms', { ascending: true })
  .limit(50);
```

---

## 2. Most Efficient Solvers (Fewest Assists)

Returns top 50 solvers with fewest hints/undos (efficiency ranking).

```sql
SELECT
  *,
  (1000.0 / (1 + hints_used + undo_count)) AS efficiency_score
FROM solutions
WHERE puzzle_id = :puzzle_id
ORDER BY hints_used ASC, undo_count ASC, duration_ms ASC
LIMIT 50;
```

**Supabase JS:**
```typescript
const { data, error } = await supabase
  .from('solutions')
  .select('*')
  .eq('puzzle_id', puzzleId)
  .order('hints_used', { ascending: true })
  .order('undo_count', { ascending: true })
  .order('duration_ms', { ascending: true })
  .limit(50);

// Compute efficiency_score client-side:
const withScores = data?.map(entry => ({
  ...entry,
  efficiency_score: 1000.0 / (1 + entry.hints_used + entry.undo_count)
}));
```

---

## 3. Personal Bests for a User (All Puzzles)

Returns user's best time for each puzzle they've solved.

```sql
SELECT DISTINCT ON (puzzle_id)
  puzzle_id,
  id AS solution_id,
  duration_ms,
  hints_used,
  undo_count,
  created_at
FROM solutions
WHERE user_id = :user_id
ORDER BY puzzle_id, duration_ms ASC;
```

**Supabase JS:**
```typescript
// This requires RPC or custom view since DISTINCT ON isn't directly supported
// Option 1: Create a Supabase function
// Option 2: Group by and aggregate client-side
const { data, error } = await supabase
  .from('solutions')
  .select('puzzle_id, id, duration_ms, hints_used, undo_count, created_at')
  .eq('user_id', userId)
  .order('duration_ms', { ascending: true });

// Then reduce to best per puzzle client-side
const personalBests = data?.reduce((acc, entry) => {
  if (!acc[entry.puzzle_id] || entry.duration_ms < acc[entry.puzzle_id].duration_ms) {
    acc[entry.puzzle_id] = entry;
  }
  return acc;
}, {} as Record<string, any>);
```

---

## 4. Mode-Aware Leaderboards

Filter by game mode for fair comparisons.

```sql
SELECT
  id,
  user_id,
  puzzle_id,
  mode,
  duration_ms,
  hints_used,
  undo_count
FROM solutions
WHERE puzzle_id = :puzzle_id
  AND mode = :mode  -- 'oneOfEach', 'unlimited', or 'single'
ORDER BY duration_ms ASC
LIMIT 50;
```

**Supabase JS:**
```typescript
const { data, error } = await supabase
  .from('solutions')
  .select('*')
  .eq('puzzle_id', puzzleId)
  .eq('mode', mode)
  .order('duration_ms', { ascending: true })
  .limit(50);
```

---

## 5. User Rank for a Specific Puzzle

Find where a user ranks on a puzzle's leaderboard.

```sql
WITH ranked AS (
  SELECT 
    id,
    user_id,
    duration_ms,
    ROW_NUMBER() OVER (ORDER BY duration_ms ASC) AS rank
  FROM solutions
  WHERE puzzle_id = :puzzle_id
    AND duration_ms IS NOT NULL
)
SELECT rank, duration_ms
FROM ranked
WHERE user_id = :user_id
ORDER BY duration_ms ASC
LIMIT 1;
```

**Supabase RPC (recommended for this):**
Create a function `get_user_rank`:
```sql
CREATE OR REPLACE FUNCTION get_user_rank(
  p_puzzle_id TEXT,
  p_user_id TEXT
)
RETURNS TABLE(rank BIGINT, duration_ms BIGINT) AS $$
BEGIN
  RETURN QUERY
  WITH ranked AS (
    SELECT 
      id,
      user_id,
      duration_ms,
      ROW_NUMBER() OVER (ORDER BY duration_ms ASC) AS rank
    FROM solutions
    WHERE puzzle_id = p_puzzle_id
      AND duration_ms IS NOT NULL
  )
  SELECT rank, duration_ms
  FROM ranked
  WHERE user_id = p_user_id
  ORDER BY duration_ms ASC
  LIMIT 1;
END;
$$ LANGUAGE plpgsql;
```

Then call:
```typescript
const { data, error } = await supabase.rpc('get_user_rank', {
  p_puzzle_id: puzzleId,
  p_user_id: userId
});
```

---

## TypeScript Types

```typescript
export type LeaderboardEntry = {
  id: string;
  user_id: string;
  puzzle_id: string;
  mode: 'oneOfEach' | 'unlimited' | 'single';
  duration_ms: number | null;
  total_moves: number;
  undo_count: number;
  hints_used: number;
  solvability_checks_used: number;
  created_at: string;
  // Computed client-side
  efficiency_score?: number;
  rank?: number;
  user_name?: string; // From profiles join
};

export type LeaderboardMode = 'speed' | 'efficiency';
```

---

## Indexes Used

The migration creates these indexes for optimal query performance:

- `idx_solutions_puzzle_duration` - For speed leaderboards
- `idx_solutions_puzzle_efficiency` - For efficiency rankings
- `idx_solutions_user_puzzle` - For personal best lookups

All queries above will be fast even with thousands of solutions per puzzle.
