# PvP Product + Design Review — 2026-07-22

Scope: the async-first turn-based PvP system (game_sessions / game_moves / game_messages, GamePage PvP paths, replaySession, inbox, share infra). Read-only review; all file references verified against the working tree at commit state of today.

---

## TL;DR

1. **Two correctness fixes are launch-blocking**, and they are the same family: (a) the known hint→repair desync, and (b) a DB constraint that silently **drops every `check` and `pass` move** — `game_moves.move_type` CHECK only allows `place|hint|resign|timeout` (migration 20260216, line 91), so `submitMove` fails the insert and returns before advancing `current_turn` → cross-client turn deadlock on pass/wrong-check in real matches.
2. Hint/check **used-counters are never persisted** — limits reset on reload and the opponent's HUD always shows 0 used.
3. Recommended hint semantics: **hint never repairs in PvP** (option a); Check keeps repair-as-mechanic — its replay path already handles it once the constraint is fixed.
4. Cap concurrent games at **5 open games per signed-in user, server-enforced**; guests can't host so they're naturally bounded.
5. Past games: keep the rows (storage is trivial), add a **"Finished games" history section** under the inbox; retention policy can wait.
6. **Rematch**: yes — pre-seated waiting session + inbox row for the absent opponent; swap first player.
7. **Match replay clip is the highest-viral-value build**: `game_moves` + `replaySession` make it deterministic, and ~70% of the render infra (ClipComposer, WebCodecs encoder, sequential piece reveal) already exists from the solo share clip.
8. The social loop closes only after adding a **many-use "play me" challenge link** — today's invite codes are one-session, one-claimant, 48h.
9. Public game gallery: defer; personal history first; chat is already players+admin-only by RLS and must stay that way.
10. Build order: Phase 1 = fixes + turn UX + cap + history; Phase 2 = replay clip + rematch + open challenge link; Phase 3 = spectate/gallery + celebrations.

---

## Grounding: what exists today (verified)

- **Schema**: `supabase/migrations/20260216_pvp_game_sessions.sql` (game_sessions, game_moves, player_stats, RLS, realtime), `20260725_guest_pvp_join.sql` (anonymous-auth guests join, hosting requires real account), `20260806_game_messages.sql` (persistent moderated chat, players+admin read only), `20260807_pvp_join_visibility.sql` (waiting sessions with codes visible to invitees).
- **Client core**: `src/game/pvp/pvpApi.ts` (session CRUD, submitMove, heartbeat, realtime subs), `src/game/pvp/replaySession.ts` (buildPvPBaseState / applyPvPMoveToState / rebuildGameState — one shared pure application path for live moves and mid-game resume, with unit tests in `__tests__/replaySession.test.ts` and a live E2E harness in `__tests__/pvpLive.e2e.test.ts`).
- **Match UI**: `src/game/ui/GamePage.tsx` (~4,100 lines) hosts everything: create/join/resume flows (L1171–1259, L686–748), realtime move stream with backlog catch-up + dedupe (L1299–1382), pass (L2045), check + repair loop (L2129–2262), hint orchestration (L2264–2418), toolbar wiring (L3538–3589), PvPHUD player cards (`src/game/pvp/PvPHUD.tsx`, green left-edge on the active card), GameEndModal (L3630).
- **Inbox**: `src/components/PvPGamesInbox.tsx` — unions localStorage store (`mySessionsStore.ts`, cap 20) with a server query (limit 25), shows max 10 rows, turn chips, unread chat badges, 14-day open-time reaping (DB rows survive; only `status` flips to `abandoned` on tap).
- **Share infra (solo)**: `src/services/clipRecorder.ts` (ClipComposer: 1080×1920 composite + overlay text), `src/services/clipEncoder.ts` (WebCodecs fast-start MP4), `src/pages/solve/components/ShareClipModal.tsx` (8s clip: 1s beauty shot → sequential piece reveal in `placedAt` order → spin; share-sheet + caption + `/c/` challenge link + OG wrapper). Note: GameEndModal's Share button is currently offered for **completed PvP games too** (GamePage L3644 gates only on `reason === 'completed' && sceneObjects`) — but it records the solo-style spin, with solo captions.
- **Untimed = truly async**: disconnect detection and forfeits are skipped when `timer_seconds === 0` (GamePage L1461–1473); heartbeats still flow but mean nothing. Verified as designed.

---

## Q1 — How many concurrent games? ("maybe up to 5")

**Today**: no server cap at all. The local store caps *remembered* sessions at 20 (`mySessionsStore.ts` MAX_ENTRIES), the inbox shows 10 rows and its server query fetches 25 — but a user can create unlimited `waiting`/`active` rows. Every hosted game writes a row with a live invite code; abandoned invites expire after 48h but the rows linger until someone taps them in an inbox.

**Abuse angle**: hosting requires a real account (20260725 policy), so guest spam is impossible — guests can only *join*, one seat per invite. The realistic abuse is a signed-in user scripting session creation (row growth + invite-code mint). Low severity, but a cap also serves the product: 5 open games keeps the inbox scannable and makes "your turn in N games" feel like obligations you can actually meet.

**Recommendation details**:
- Cap = **5 open games (status waiting or active) where you are a player**, counted server-side. Enforce with a `BEFORE INSERT` trigger on `game_sessions` (count open rows where `player1_id = NEW.player1_id`; raise `too_many_games`). Client-side, disable "Play a friend" with a friendly "Finish or resign a game first" when the inbox count is ≥5.
- Guests: no host cap needed (they can't host); allow them to *join* up to 5 too if you want symmetry, but it's not worth a trigger — the inbox row limit already communicates it.
- Waiting-room hygiene helps more than the cap: auto-cancel `waiting` sessions whose invite expired (the join path already flips them to `expired` lazily in `joinPvPSession`; add the same lazy flip to the inbox query path — it currently just hides them, PvPGamesInbox L134–138).

**Effort**: S (trigger migration + one client gate). **Migration**: yes, one small trigger.

**➡ Recommendation: cap at 5 open games per signed-in user, enforced by a DB trigger, with a friendly client gate; guests stay join-only and uncapped.**

---

## Q2 — What happens to past games? Do we keep a record?

**Today**: completed/abandoned/expired rows persist in the DB forever (nothing deletes them; the inbox "reaping" only flips status to `abandoned` — DB rows and full move history remain). But they are **invisible**: the inbox filters to `waiting|active` (PvPGamesInbox L93) and prunes terminal sessions from the local store (L112–121). There is no history view anywhere. RLS already allows each player to read their own completed sessions and moves — no migration needed to show them.

**Storage cost**: negligible. A full 25-piece match is ~50 move rows; `board_state_after` snapshots grow linearly so a whole game's move history is on the order of 50–100 KB of JSONB. Thousands of games ≈ tens of MB. Do not build a retention policy yet.

**Recommendation details**:
- Add a **"Finished games" collapsed section** under the inbox (or a `/games` page): opponent, puzzle, result chip (Won/Lost/Draw/Abandoned), final score, date. Query: `game_sessions` where I'm a player and status in `completed|abandoned`, order `ended_at desc`, limit 20. Reuses the inbox's row component almost verbatim.
- Tapping a finished game should eventually open a **read-only replay viewer** (step through moves — `rebuildGameState` already reconstructs any prefix). That viewer is also the foundation of the Q4 clip. Ship the list first, viewer with Phase 2.
- Guests: their history lives only in localStorage entries that the inbox self-prunes on terminal status. If you want guest history, stop pruning terminal entries and keep them in a separate local list — S effort, do it when the section ships.
- Retention: revisit at scale; if ever needed, delete `game_moves` (not sessions) for games ended > 1 year — the session row keeps the result line alive.

**Effort**: S–M for the list; replay viewer counted under Q4. **Migration**: none (an index on `(player1_id, status, ended_at)` is nice-to-have).

**➡ Recommendation: keep everything, add a "Finished games" history section now (S–M), defer retention and the full replay viewer to Phase 2.**

---

## Q3 — "Play again" / rematch, like chess?

Yes — this is the cheapest retention feature available, and the end-of-game modal is already the natural hook (`GameEndModal` gets `onNewGame` today, which nukes all PvP state and reopens setup — GamePage L2788–2804 — a dead end for PvP).

**Design for the async case** (opponent likely absent at game end):
1. Loser-or-either taps **"Rematch"** in GameEndModal (PvP only). Client creates a new `game_sessions` row: same puzzle, same `inventory_state`, same limits/timer, `first_player` = opposite of the previous game's `first_player` (chess-style swap), and — key — **`player2_id` pre-seeded with the opponent** and a `rematch_of` column pointing at the old session.
2. Status stays `waiting`. The opponent's inbox (server query matches `player2_id = uid`) shows the row with a **"Rematch offered"** chip; tapping it accepts (flips to `active`, stamps `started_at`/`turn_started_at` — the existing `startAfterHostReturn` clock-reset logic applies). Declining = the existing reap/cancel action.
3. If the opponent is present (live blitz case), their realtime session subscription can surface an "X wants a rematch" toast with an Accept button — same row, faster path.

Notes on what exists: the insert policy (`WITH CHECK auth.uid() = player1_id`) does **not** forbid pre-seeding `player2_id`, so this works today; the "Anyone signed in can join waiting games" policy targets `player2_id is null` rows so it won't collide. A guest CAN be `player1` of a rematch only if hosting were opened to them — it isn't; so when a **guest** taps Rematch, create the row inverted (original host stays player1). Handle that asymmetry in the client.

**Effort**: M (one migration for `rematch_of` + accept flow + inbox chip + end-modal button). **Migration**: yes, one column + optionally a partial unique index to prevent rematch spam (one open rematch per finished session).

**➡ Recommendation: build chess-style rematch with a pre-seated waiting session, swapped first player, and an inbox "Rematch offered" chip — M effort, one small migration.**

---

## Q4 — Game playback video for social media?

This is the highest-viral-value item, and the pieces genuinely exist:

- **Determinism**: `game_moves` + `rebuildGameState`/`applyPvPMoveToState` reconstruct every intermediate board exactly (this is what mid-game resume already does in production).
- **Render + encode**: `ClipComposer` (vertical composite + text overlay) and `recordClip` (WebCodecs, exact-duration fast-start MP4 that survives Instagram's transcoder) are production-proven from the solo clip.
- **Sequential reveal**: `ShareClipModal` already reveals pieces one-by-one in placement order by toggling `visible` on scene objects keyed by uid (L369–409). A match replay is the same trick driven by `game_moves` order instead of `placedAt` order.

**Proposed clip (12–18s vertical)**:
1. **Title card** (~1s): both names + avatars, puzzle name ("Anton ⚔️ Floris — Sun Puzzle").
2. **The race** (~8–12s): pieces appear in move order, timelapsed to fit. Per-player attribution — since pieces have their own colors, use a **per-player flash/rim pulse** on each placement (e.g. green pulse = player 1, violet = player 2) plus a persistent **score ticker** (two names + running scores, drawn by ClipComposer each frame — it redraws the overlay every rAF already, so an animated ticker is just mutable overlay state). Board slowly rotates throughout.
3. **Hint/check moments** (Q8/Q9): a hint move flashes 💡 over the piece with a "0 pts" tag; a correct check does a brief freeze + the removed pieces fade/pop out with a 🔍 stamp; a wrong check stamps "🔍 nothing wrong — turn lost".
4. **Result card** (~2s): winner name + final score + CTA "Think you can beat me? koospuzzle.com" (Phase 2: the open-challenge link from the social thesis below).

**Where it hooks in**: GameEndModal already shows Share for completed PvP games (GamePage L3644) but runs the solo modal with solo captions — replace with a PvP-aware `MatchReplayClipModal` that takes `session` + `moves` (fetch via `getSessionMoves`) and drives the reveal. Also add "Share replay" to the finished-games history rows (Q2) so the moment isn't lost if the modal was dismissed.

**Honest estimate**: 
- **MVP (M, ~a day)**: reuse the assemble-reveal mechanics + move-order from `game_moves`, add two-name ticker + result card, no per-move effects. This is 80% of the shareable value.
- **Full version (L, 2–4 days)**: per-player placement pulses, hint/check event effects, pacing curves (slow-in on the final piece), rematch/challenge link in caption, OG wrapper for the link. 
- **Hard dependency**: Q7's persistence fixes — today `check` moves never reach the DB and hint-repairs are invisible, so replays of games that used them would be wrong or unreconstructable.

**Migration**: none.

**➡ Recommendation: build the match-replay clip in two passes — MVP right after the Q7 fixes land (M), effects pass later (L); it is the centerpiece of the viral loop.**

---

## Q5 — Should games have their own gallery view?

Split the question:

- **Personal history**: yes — that's Q2, build it now.
- **Public gallery / spectating**: defer. Everything about PvP is currently participant-private by RLS (sessions, moves), and `game_messages` is explicitly players+admin-only with a moderation trigger (20260806) — chat must never ride along into any public surface, and today it structurally can't. Making matches public means new SELECT policies (or a share-code indirection like `20260717_solution_share_codes.sql`) and an anonymous-read replay endpoint. That's real work (L) with modest payoff before there's volume: an empty public gallery is worse than none.
- **The right v1 of "public"**: an **opt-in "publish this match"** action that mints a share code exposing session metadata + moves (never chat) read-only, rendering the Q4 replay in-browser at a `/m/<code>` URL. It doubles as the landing page for shared clips ("watch the full match → play the winner"). Do it in Phase 3, after the clip proves demand.
- Live spectating (realtime watch) is a further step beyond that; nothing blocks it architecturally (realtime channels are already per-session) but RLS gating is per-player today. Not worth designing yet.

**Effort**: personal history S–M (Q2); opt-in public match page L; live spectate XL. **Migration**: share-code table/column + SELECT policies when it happens.

**➡ Recommendation: no public gallery at launch — ship personal history now, and an opt-in "publish match" share-code page in Phase 3 as the clip's landing page.**

---

## Q6 — Clearer whose-turn indication?

**Today**: green left edge + green timer tint on the active player card (PvPHUD L101, L117), "Your turn / Their turn" chips in the Home inbox, and a computed banner string in GamePage (L3523–3533). On the board itself: attempting to place out of turn is **silently ignored** (`handlePlacementCommitted` L1908–1911 just logs and returns) — the single most confusing moment for a new player.

**Recommendation details** (all small):
1. **"Your move" toast on arrival** (S): when `current_turn` flips to me (realtime) or when I open a session where it's my turn, show a 2s toast — the `showOpponentNotification` machinery already exists for "X used a hint"; reuse it ("Your move — X placed piece Q").
2. **Rejected-interaction feedback** (S): out-of-turn board taps should toast "Waiting for {opponent}" instead of doing nothing. One line at GamePage L1909.
3. **Stronger card treatment** (S): pulse/glow animation on the active card edge rather than a static border color; on *your* turn, also tint your card's background slightly. Avoid full-board glows — the board is the artwork.
4. Keep the inbox chips as-is; they're good.

**Effort**: S total (hours). **Migration**: none.

**➡ Recommendation: keep the card edge but add a "Your move" arrival toast, an out-of-turn tap toast, and a pulsing active-card treatment — a few hours total, do it in Phase 1.**

---

## Q7 — Do we keep hints and checks? (and the repair-desync bug)

**Verified current behavior**:
- **Hint** (💡): request → engine enters `resolving` → `runHintFlow` (GamePage L2275) runs a **solvability check first**; if unsolvable it dispatches `START_REPAIR` (L2295) which removes pieces from the local board with **nothing persisted and nothing streamed** → the two clients silently diverge (DB stays clean; reload heals via replay). If solvable, a valid piece is placed for 0 points, the turn passes, and a fully replayable `hint` move row is submitted (L2384–2395) — that part is sound.
- **Check** (🔍): claim the board is unsolvable; if right, `runRepairLoop` removes pieces (−1 each to the placer) and you keep the turn and don't consume a check; if wrong you lose the turn and consume one. The move row records `board_state_after`, and `applyPvPMoveToState`'s `check` case (replaySession L161–179) applies it on the other client **by diffing the snapshot** — the sync design is actually correct...
- ...**except the row never lands**: `game_moves.move_type` CHECK constraint (20260216 L91) does not include `'check'` (or `'pass'`, which GamePage submits `as any` at L2103). The insert fails, `submitMove` returns null **before** its session update (pvpApi L455–459), so `current_turn` never advances server-side either. Result in a real match: pass and wrong-check leave the opponent's client believing it's still your turn — a cross-client deadlock, not just a cosmetic desync. (Caveat: verify prod wasn't hand-patched; the E2E harness only exercises `place`.)
- **Counters aren't real**: `player*_hints_used` / `player*_checks_used` are only ever incremented in local React state (GamePage L1818–1827, L2246–2255); no code writes them to the DB. Limits (default from `GameSetupModal`, 0=unlimited) therefore reset on reload and the opponent's HUD (PvPHUD L45–48) always reads 0. Also: a hint is counted at request time even if it fails (`no_suggestion` refunds nothing), and the simulated opponent's *correct* check consumes a check (L1637) while a human's doesn't (L2218) — inconsistent.

**Options weighed**:
- **(a) hint never repairs in PvP** — smallest change, kills the desync at the root, and is the right *game design*: in solo, repair is a benevolent fix-it; in PvP, a broken board is *state both players created* and Check is the designated, scored, player-invoked repair mechanic. Hint becomes purely "place a valid piece for me (0 pts, turn passes)"; if the hint engine finds no placement, report "no hint here" without consuming. One risk: on an unsolvable board, hints can place pieces into a doomed position — which is fine, that's what Check punishes.
- **(b) persist repair as replayable move rows** — the "correct" general fix, but it means inventing a new `repair` move type, transactional multi-row writes from an async effect chain, and re-testing replay for interleavings. Real work for a mechanic that (a) removes from PvP anyway.
- **(c) disable both in PvP** — throws away a genuinely differentiating mechanic (Check-as-accusation is good asymmetric-information gameplay) and the setup UI already sells limits.

**Recommendation details** (a + repairs to the plumbing):
1. Migration: `ALTER TABLE game_moves DROP CONSTRAINT ... ; ADD CHECK (move_type IN ('place','hint','check','pass','resign','timeout'))`. Also add `'pass'` to the client type union (`types.ts` L12 lacks it; GamePage casts `as any`).
2. In PvP mode only, skip the solvability gate in `runHintFlow` (branch on `pvpSession`) — go straight to `generateHint`; never dispatch `START_REPAIR` with `reason: 'hint'` in PvP.
3. Persist counters: fold `playerN_hints_used`/`checks_used` increments into `submitMove`'s session update (it already updates the row — add the fields to the patch), and stop the local-only increments. Count hint at *successful placement* time, not request time. Align sim-opponent check consumption with the human rule.
4. Balance: keep hint = free valid piece at 0 points + turn passes (tempo cost is a real price); keep correct-check-not-consumed (it rewards vigilance). Both are good as designed.

**Effort**: M overall (S for the migration, S–M for the hint branch, S for counters). **Migration**: yes — constraint fix is **launch-blocking** regardless of any other decision here.

**➡ Recommendation: keep both mechanics; fix the move_type constraint immediately, make PvP hints never repair (option a), and persist the used-counters in submitMove's session update — M total, one migration.**

---

## Q8 — Showing hint/check use in a fun way (in-game)

**Today**: a plain toast — `showOpponentNotification(t('pvp.toast.usedHint', {name}))` fired from the realtime move handler (GamePage L1327–1331). Functional, forgettable.

**Recommendation details** (lightweight, no new systems):
- **Hint**: flash 💡 over the placed piece + a brief gold rim pulse on the piece meshes (the repair-glow highlight machinery — `setHighlightPieceId`, GamePage L2437–2446 — already knows how to spotlight a piece by uid; reuse it with a different color), toast becomes "💡 {name} asked the puzzle for help — free piece, 0 pts".
- **Check**: two-beat drama. Beat 1 on request: "🔍 {name} claims this puzzle is broken…" (a 1s suspense toast). Beat 2 verdict: correct → removed pieces do the existing repair glow-then-vanish with "🔍 {name} was right! {n} pieces came off"; wrong → "🔍 False alarm — {name} loses the turn". The suspense beat needs no new data: fire beat 1 immediately on receiving the `check` move, compute the verdict from whether the snapshot diff removed anything (replaySession already computes `removed`).
- **Chat as event log**: render system lines ("{name} used a hint", "Check! 2 pieces removed") inline in the existing chat panel, derived at display time from `game_moves` — no schema change, and it gives async players a narrative of what happened while they were away. This is the sleeper feature: async players currently return to a changed board with *no story*.
- Keep the remaining-count badges on the toolbar buttons (already there, GameHUD L78–103) — they read well once counters persist (Q7.3).

**Effort**: S–M. **Migration**: none.

**➡ Recommendation: reuse the repair-glow spotlight for a 💡 flash, give Check a two-beat suspense/verdict treatment, and render hint/check events as system lines in the chat panel so async players get the story — S–M.**

---

## Q9 — And in the recording?

Covered structurally in Q4 step 3; specifics:
- `hint` move rows carry `piece_id`/`cells` (post-fix), so the clip renders the placement with a 💡 badge and "0 pts" tag floating for ~0.8s; the score ticker visibly *not* incrementing is itself the joke.
- `check` rows carry `board_state_after`; the clip diffs against the running state (same signature diff as replaySession L163–170), freeze-frames ~0.5s with a 🔍 stamp, then pops the removed pieces out with the score ticker decrementing per removed piece (−1 to the placer). Wrong check (diff empty) → "🔍 nothing wrong!" stamp + turn-pass indicator.
- `pass` renders as a small ⏭ blip; `resign`/`timeout` skip straight to the result card with the reason stamped ("{name} resigned").
- All of this is only correct if Q7's persistence fixes land first — worth stating in the ticket as an explicit dependency.

**Effort**: folded into Q4's full pass (~+half day on top of the MVP). **Migration**: none beyond Q7's.

**➡ Recommendation: yes — hint/check events render as badges/freeze-beats in the replay clip, built in Q4's effects pass, dependent on the Q7 persistence fixes.**

---

## Social potential thesis

The owner's instinct is right, and PvP is structurally better positioned than the solo loop because **the viewer of a PvP clip is being challenged by a person, not a puzzle** — and the guest-join work (20260725/20260807) already removed the single biggest drop-off (account creation).

**The loop**: play a match → share the replay clip (two names, a score race, a winner) → viewer taps the link in bio/caption → lands on a page with the match result + "Play {winner}" → **one tap, type a name, in the game as a guest** → they finish their match → their own end screen offers the same share. Every match potentially mints two sharers.

**What exists**: async matches that survive reloads and days-long gaps; guest join verified end-to-end; clip render+encode infra; `/c/` share codes + OG `share-preview` edge function pattern (for solo challenges); persistent moderated chat (the retention glue between two strangers).

**What's missing to close it** (in dependency order):
1. **Correctness** (Q7): can't ship clips of games whose moves aren't in the DB.
2. **The clip itself** (Q4 MVP).
3. **A many-use challenge link**: today's `invite_code` is one session, one claimant, 48h — useless as a bio link under a viral clip (first viewer consumes it). Need an **"open challenge"**: a per-user (or per-match) code where each claimant gets a *fresh session* against the sharer. Implementation: an edge function (or SECURITY DEFINER RPC) `claim_challenge(code)` that clones the source match's setup into a new `waiting` session with the sharer pre-seeded as player1 and the claimant seated as player2. The sharer's inbox then does what it already does: "Your turn in N games." The 5-game cap (Q1) needs an exception or a queue here — decide when building (suggestion: open-challenge claims bypass the cap up to a higher hard limit of ~15; the cap is about hosting spam, not incoming demand).
4. **A match landing page** (`/m/<code>`, Q5's opt-in publish) so the clip's link shows the result + replay to non-players and the OG card reads "Anton 12 – 9 Floris — think you can do better?".
5. **Rematch** (Q3) to keep the pair playing after the first match.

**Sequencing insight**: items 1–2 make sharing *possible*; item 3 is what makes it *compound*. Ship 1–2, watch whether clips get made, then invest in 3–4.

---

## Phased build order

**Phase 1 — launch-blocking correctness + polish** (~2–3 days total)
1. Migration: extend `move_type` CHECK to include `check` + `pass`; add `'pass'` to `PvPMoveType` (S) — **do this first, it's a live bug**.
2. PvP hints never repair (Q7 option a) (S–M).
3. Persist hints/checks-used counters via submitMove's session patch; fix count-on-failure and sim-opponent asymmetry (S).
4. Turn UX: arrival toast, out-of-turn tap toast, pulsing active card (Q6) (S).
5. Concurrent-games cap trigger + client gate (Q1) (S).
6. Hygiene: delete or quarantine the dead `usePvPGame.ts` hook (see risks) (S).

**Phase 2 — the social loop** (~1–1.5 weeks)
7. "Finished games" history section (Q2) (S–M).
8. Match replay clip MVP: move-order reveal + names/score ticker + result card, hooked into a PvP-aware end-modal share (Q4) (M).
9. Rematch flow (Q3) (M).
10. Clip effects pass: per-player pulses, hint/check beats (Q4/Q8/Q9) (M–L).
11. Chat-panel system event lines (Q8) (S).
12. Open-challenge "play me" link + OG share-preview for matches (thesis item 3) (L).

**Phase 3 — nice-to-have**
13. Opt-in public match page `/m/<code>` as the clip landing page (Q5) (L).
14. In-app step-through replay viewer for the history section (M).
15. Player stats surface (the `player_stats` table accumulates silently today — W/L record on profiles) (M).
16. Retention policy, live spectating — revisit at volume.

---

## Risks appendix (noticed while reading)

**VERIFIED**
1. **`check`/`pass` moves violate the DB CHECK constraint** — 20260216 L91 allows only `place|hint|resign|timeout`; GamePage submits `check` (L1659/1678/2207/2236) and `pass` (`'pass' as any`, L2103). Insert fails → `submitMove` returns before its session update (pvpApi L455–459) → `current_turn` never advances in the DB → opponent's client (session-row-authoritative for turns) deadlocks until the passer reloads. The E2E harness only exercises `place`, so this was never caught. *Caveat: confirm the prod constraint wasn't hand-patched (`select pg_get_constraintdef(oid) from pg_constraint where conrelid = 'game_moves'::regclass`).*
2. **Hint→repair desync** (the known bug) — GamePage L2284–2300 dispatches `START_REPAIR` locally with nothing persisted/streamed.
3. **Hint/check counters never persisted** — no code writes `player*_hints_used`/`checks_used` to the DB; limits are reload-resettable and invisible to the opponent.
4. **No server-side move/score validation** — `game_moves` INSERT only requires `player_id = auth.uid()`; nothing enforces turn order, geometry, or `score_delta`; the "Players can update own games" policy lets either player write arbitrary `winner`/`status`/scores. Fine for friendly launch, unacceptable if money/leaderboards ever attach to PvP results.
5. **Dead legacy hook `src/game/pvp/usePvPGame.ts`** — imported nowhere; contains stale semantics that contradict shipped behavior (auto-forfeit countdown in all modes, hint moves submitted without cells — exactly the "legacy hint rows" replaySession can't reconstruct). A future import would reintroduce fixed bugs. Delete it.
6. **Hint counted even when it fails** — `handleEnterHintMode`/`handleConfirmHint` increment at request time (L1818–1827, L1877–1886); a `no_suggestion` result refunds nothing. Sim-opponent checks consume on success (L1637); human checks don't (L2218 comment) — asymmetric rules.
7. **PvP completions currently open the solo ShareClipModal** (GamePage L3644 doesn't exclude `pvpSession`) with solo captions/rank lookups — harmless but off-brand until the Q4 modal replaces it.

**SUSPECTED**
8. **move_number race** — `submitMove` computes `count+1` then inserts (pvpApi L428–433) with no unique index on `(session_id, move_number)`; two near-simultaneous submissions (e.g. a move crossing a resign) can collide. Replay sorts with created_at/id tiebreaks so reconstruction survives, but the live dedupe floor (`move_number <= lastApplied` skip, GamePage L1315) could drop a move. Low probability in async play; an index + retry would close it.
9. **Simulated "random opponent" identity use** — `get_random_opponent` (SECURITY DEFINER) seats a *real user's* name/avatar on an AI in `is_simulated` matches; that user never knows. Product/trust risk more than a bug.
10. **Stats double-count on repeated session updates** — the realtime handler updates player_stats whenever an update arrives with terminal status (GamePage L1280–1292); any post-completion touch of the row (e.g. a late heartbeat write racing the end) would re-fire it. Unconfirmed in practice.
11. **Guest device-loss** — guests' games are findable only via their anonymous session + localStorage; clearing site data orphans their matches (the opponent eventually reaps them at 14 days). Inherent to account-less design; worth a one-line FAQ.
