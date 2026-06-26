# Share, Challenge & Discovery — Design

Status: **design** (not built). Builds on the shipped share-clip v1 (vertical
solve clip + download; see `src/pages/solve/components/ShareClipModal.tsx` and
`src/services/clipRecorder.ts`).

This captures the design discussion that turns the static "Can you beat that?"
clip into a real, self-propagating challenge loop, plus a discovery layer that
rewards exploration rather than speed.

---

## 1. Vision

Two growth mechanics riding on the same solve engine:

1. **Challenge** — a posted clip carries a real link. Tapping it drops you into
   *that exact puzzle*, framed as a race against the poster's result. Beat it and
   you get an auto-made "I beat you" clip whose link now points at *your* result.
   The baton passes; the target keeps escalating. Self-propagating.
2. **Discovery** — a second axis of prestige that is **not** speed: being the
   N-th person (and ideally the **1st ever**) to find a particular solution.
   Rewards a different temperament — exploration, not competition.

---

## 2. Scoring model

### The variables collapse

Raw signals: time, hints, moves, "perfect" (minimal moves = N pieces), removals
(piece pulled because the puzzle became unsolvable).

These are not independent:

- **`moves − perfect = removals`** — literally the same number. Every wasted
  placement is a piece you'll remove. Use one; show the other as flavor.
- So there are really **three** signals: backtracking (`moves − N` ≈ removals),
  **hints** (asking the computer), **time** (speed).
- **Hints and backtracking are substitutes** — a hint hands you a correct piece,
  which *prevents* dead ends. So optimizing any single metric is gameable through
  another (time alone → hint-spam; fewest-hints alone → stubborn brute-force;
  fewest-moves alone → hint-spam).

### Primary metric: placements by you (`X / N`)

Reframe everything as **how much of the puzzle you placed yourself**:

- `placements_by_you = pieces with source === 'user' that remain in the final
  solution = N − hints` (a completed solve fills all N slots; hinted slots aren't
  yours).
- Shown **positively**: "8/10", not "2 hints". More shareable, and a hint *costs*
  you with no arbitrary penalty weight — the piece simply isn't yours.
- **Perfect = N/N, no hints** — the apex badge. Binary and ungameable: you either
  placed every piece yourself or you didn't.

### Time = tiebreak (secondary)

Among equal placement scores, fastest wins. Perfect (N/N) solvers naturally float
to the top and race on **time** — the original visceral race, but only among
people who earned it.

### Backtracking = net (time-only cost)

A piece you place wrong, remove, and replace correctly **still counts as yours**
(net). Backtracking's *only* price is **time** — not placement score. Rejected
the "first-try-only" variant: it double-charges and brutally punishes one early
misstep that cascades into several removals, even when the player knew the answer.

### Why this is sound (loophole closed)

The hint↔backtracking substitution now lands on **two different visible axes**:

- Avoid hints → figure it out → backtrack → **costs time**.
- Use hints to avoid backtracking → **costs placement score**.

You cannot trade one for the other to cheat. The only way to be **high score AND
fast** is to genuinely know the solution and execute cleanly. Hint-spammers show a
fast time but a low score; brute-forcers keep their score but lose on time.

### Run modes

- **Ranked** = timed + provenance tracked + no clock pause; produces
  challengeable / leaderboard-eligible results.
- **Casual** = unlimited hints, untracked. (Resolves: solo currently runs hints
  unlimited and uncounted — we just don't rank those.)
- Client-time integrity (faking the clock) is a harder server-side problem —
  **deferred**; trust-and-flag to start.

---

## 3. Challenge loop

### Flow

1. Anton solves → posts clip: "Can you beat that?"
2. Clip carries a **challenge link** → friend taps.
3. Lands on **that puzzle**, framed: *"Beat Anton — 8/10 · 1:23."*
4. Friend plays the same puzzle (ranked run).
5. Win → auto **"I beat you"** clip (head-to-head: `8/10 1:23 → 10/10 1:05`),
   whose link now points at *their* result. Baton passes; target escalates.

### The clip (≈7s, loops on IG/TikTok/Shorts)

**The CTA must name the target.** "Can you beat that?" is hollow without a
"that" — the challenge has to state the concrete result to beat. The number *is*
the dare:

> **"Can you beat 8/10 in 0:06?"**

- **0–5s — the spin:** puzzle rotating, name, and the concrete dare —
  *"Can you beat 8/10 in 0:06?"* — small persistent `koospuzzle.com` corner handle.
- **5–7s — end card (HELD static, then loops):** mirrors the landing page —
  *"Beat Anton · 8/10 · 0:06"* + big typeable code + QR. Static is deliberate so
  it's easy to pause cleanly and screenshot.
- Hero metric: **"10/10 · 1:23"** (elite/perfect dare) or **"8/10 · 0:06"**
  (accessible dare). Auto-scales to whoever's posting.

**Data status for the dare:**

- **`X/N` is accurate today** — `X = pieces with source==='user'`,
  `N = boardState.size`. Computable in the current clip with no new work.
- **Time is NOT honest yet.** `saveGameSolution` derives duration as
  `endedAt − createdAt`, which includes setup/idle time before the first move.
  An honest "beat my time" needs the **ranked-run timer (first placement →
  solve)**. So the full *"X/N in T"* dare lands with the ranked build; until then
  the clip can state *"Can you beat 8/10?"* (accurate) and add the time once the
  timer is right.

### The video→link bridge (the crux)

Video platforms kill links. Three layers, in order of real-world use:

1. **Link in bio / caption** — the no-friction tap (primary on mobile).
2. **Typeable short code** — `koospuzzle.com/c/A3F` (4–5 char base-32 covers
   millions). For "I'll just remember it."
3. **QR on the held end card** — for the **pause → screenshot → OS detects the QR
   (iOS Visual Look Up / Android Lens) → tap link** path, and for second-screen
   viewers. You cannot scan a QR on the same phone you're watching on, so the QR
   is *support*, not the hero — hence code-first, QR-second.

### Backend

- A **challenge = a pointer to one result** (puzzle + placement score + time +
  solver). Link: e.g. `/play/:puzzleId?vs=:resultId`.
- **OG card** for link-friendly channels (iMessage/WhatsApp/X/Discord): extend the
  existing `share-preview` edge function (currently puzzle-only) to render
  "Beat Anton's 8/10 · 1:23".

---

## 4. Discovery layer

### Mechanic

- **N-th person to find a solution; 1st ever is special.** Rewards exploration,
  not speed. Different CTA: *"I found one nobody's found — find your own."*
- Likely its own **"Discoverers"** prestige / board, separate from the speed race.

### Solution signature (new)

- `final_geometry` (filled cells) is **identical for every completed solve** — it
  cannot distinguish solutions. The distinguishing data is the **piece
  arrangement** (`placed_pieces`: which piece occupies which cells).
- Add a **`solution_signature`** column = hash of the set of `(pieceType, cells)`
  pairs, computed on save. Solutions are not currently deduplicated; the signature
  enables grouping.
- "N-th to find this" = rank by `created_at` among **distinct users** sharing that
  signature for the puzzle. "1st ever" = signature unseen before.

### Symmetry decision: mirrors/rotations are DISTINCT

- **No symmetry-group canonicalization.** The signature is the exact arrangement,
  so a solution and its mirror are **separate discoveries** (treated as new).
- Simpler to build (no symmetry math). Tradeoff: inflates discovery counts (a
  solution and its twin are two finds) — acceptable under the community-progress
  framing, and fits the art sensibility (each placement is its own object).

### Scarcity → community-progress framing

- "1st to find this" is hollow on puzzles with astronomically many solutions.
- Frame discoveries as **community progress**: *"the Nth distinct solution found
  for this puzzle"* — meaningful regardless of total space.

### Identity

- Claiming a discovery (or a ranked result) needs a name → **sign-in moment**.
  Guests can find/solve, then sign in to claim.

---

## 5. Data & build status

**Already in place (verified):**

- Per-piece provenance: `GamePlacedPiece.source: 'user' | 'hint' | 'ai'`
  (`src/game/contracts/GameState.ts`), tagged at placement
  (`GameMachine.ts:189,495`). So `placements_by_you = source==='user'` is trivial.
- `GameRepo.saveGameSolution` already counts `hints_used` and stores
  `placed_pieces` + per-piece `reason`.
- `REMOVE_PIECE` action already carries `scoreDelta: -1` — the engine already
  models a removal as −1.
- Share-clip pipeline (vertical record + overlay + download).
- `share-preview` OG edge function (puzzle-only).

**New work:**

- `solution_signature` column + hash-on-save + backfill.
- Challenge entity + short-code links + landing page (the conversion screen).
- Ranked run mode (timed, no-pause, provenance-tracked).
- QR + held end card in the clip; head-to-head "I beat you" overlay variant.
- Extend `share-preview` to render challenge OG cards.
- "Discoverers" surface / discovery badges.

---

## 6. Open questions

- **One board or two?** Is speed-competition and discovery one leaderboard or two
  separate prestige tracks? (Leaning: two.)
- **Ranked vs casual trigger** — does every solve count as ranked, or only an
  explicit timed attempt / challenge run?
- **Time integrity** — client clock can be faked; deferred (trust-and-flag now,
  server validation later).
- **Challenge shape** — open/broadcast ("anyone beat my 8/10") vs personal 1:1.
  (Leaning: open/broadcast, more viral.)

---

## 7. Suggested phasing (not committed)

1. **Ranked run + X/N scoring + leaderboard** — the metric foundation.
2. **Challenge links + landing page + OG card** — the loop, link-first.
3. **Clip end card + QR + head-to-head overlay** — the video bridge.
4. **Discovery (signature + community-progress + Discoverers)** — the second axis.
