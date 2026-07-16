# PvP & Ghost Race — Design

Status: **design** (not built). Companion to `share-and-challenge-design.md`
(the challenge loop, scoring, short codes, clip end card, OG cards). That doc
designs *what a challenge is*; this one designs *what it feels like to have a
real opponent* — and how the resulting footage gets posted.

The ask, in chess terms: today you play the bot; how does someone play a
person? Chess actually has three human modes — live (blitz), correspondence
(async turns), and one borrowed from racing games: the **ghost** (racing a
recording of a real run). The order we build them in is the whole strategy.

---

## 1. The empty-room problem (why NOT live-first)

Live matchmaking only works when two humans are online at the same moment. At
launch we will have neither the traffic nor the time-zone overlap. A "Find
opponent" button that finds no one is worse than no button — it advertises
that the app is dead, exactly when first impressions decide virality.

So the ladder is ordered by **how many concurrent users each mode needs**:

| Mode | Needs online at once | Coordination cost |
|---|---|---|
| A. Ghost race | 1 (you) | none — the opponent is data |
| B. Live duel via invite | 2, but self-arranged | the players bring each other |
| C. Async correspondence | 1 at a time | notifications |
| D. Open matchmaking | a liquid pool | ours — and we can't fake it |

Every mode reuses the previous one's rails. At every stage the product works
even if only two people on Earth use it — the property a viral loop needs on
day one.

---

## 2. Mode A — Ghost race (the launch PvP)

### What it is

A challenge link (`/c/:code`) doesn't just show Anton's numbers — it **replays
Anton's actual run against you, live, while you solve**. His pieces materialize
on a ghosted overlay (or a mini-board) at the exact moments he placed them,
driven by his recorded timestamps. You are not chasing a stat; you are racing
a person who happens to have already run.

This is Mario Kart's ghost applied to the solve engine: asynchronous in
reality, synchronous in feeling.

### Why the data already exists (verified)

- Every placed piece persists an **absolute `placedAt` timestamp**
  (`GameState.ts:160`), saved with the solution
  (`GameRepo.saveGameSolution`, `GameRepo.ts:93`), normalized against first
  placement for honest elapsed times (`GameRepo.ts:66-71`).
- `ShareClipModal` already consumes `placementOrder` (placedAt asc) to drive
  the assemble reveal — the ghost is the same replay pointed at the *other*
  player's solution instead of your own.
- The vs-AI machinery (opponent moves arriving over time, action
  notifications, the VS header, `simulatedOpponent.ts`) is exactly the
  machinery a ghost needs. **A ghost is a simulated opponent whose move
  generator is a recorded move list.** No new backend at all: the "opponent"
  arrives inside the solution row the challenge already fetches.

### UX

- **Landing** (`/c/:code`, per the companion doc): hero stays
  *"Beat Anton — 8/10 · 1:23"*, Start button protected. New: the start button
  becomes **"Race Anton"** — the framing shift from stat to person.
- **During play:** two-lane progress bar (You ▓▓▓░░ 4/10 · Anton ▓▓▓▓░ 5/10)
  plus the ghost's pieces appearing translucent on a mini-board or as a count
  ticker. The tension mechanic: *you can see him pulling ahead in real time.*
  Placement remains the hero metric (per the scoring doc); the ghost supplies
  the live pressure the lumpy placement score can't.
- **Verdict:** existing `judgeChallenge` already decides won/lost/tied on
  placements-then-time — unchanged. The verdict screen gains the head-to-head
  replay moment: both runs side by side.
- **The retry loop:** losing to a ghost is private (nobody watched). "So
  close — race again" is frictionless and shame-free, which makes retries —
  and eventual wins — and therefore *shares* — more likely.
- **Guests race, winners sign in.** The ghost needs nothing from you; identity
  is only needed to claim/post the win (matches the companion doc's identity
  rule and the shipped "saving requires an account" gate).

### Ghost pacing edge cases

- **Idle gaps** in the source run (challenger stared at the board for 4
  minutes) replay as dead air. Cap inter-move gaps for the *ghost display*
  (e.g. max 20s, visually marked "thinking…") while keeping the honest total
  time for the verdict. Decision: display-only compression, never verdict
  compression.
- **Hinted pieces** in the source run: render differently (per scoring doc,
  they're not "his" pieces) — the ghost shows 8/10 worth of self-placements.
- **Ghost finished, you haven't:** ghost holds its finished state + your clock
  keeps running; you can still win on placements even after losing on time.

---

## 3. Mode B — Live duel (the upgrade, not a separate system)

### Entry: presence on the challenge page

When a recipient opens `/c/:code` while the challenger is online (Supabase
Realtime **presence** on a per-user or per-challenge channel), the landing
upgrades itself: *"Anton is online now — race him live?"* Decline → ghost race
as normal. This makes live play an opportunistic bonus that never blocks the
loop, and it needs no lobby, no queue, no liquidity.

Also reachable deliberately: "Rematch — invite him" on the verdict screen
sends a live invite (a `/c/` link flagged live) via the native share sheet.

### Two live flavors, one transport

1. **Live race** (same-puzzle, parallel boards): each player solves their own
   board; only lightweight progress events cross the wire (piece placed/
   removed, hint used, finished). The opponent's lane renders exactly like a
   ghost — same UI, real-time source. This is Mode A's UI with a live feed,
   and it ships first because of that.
2. **Live turn duel** (shared board, alternating placements): the chess mode —
   this is what vs-AI is today. The human version swaps
   `simulatedOpponent`'s move generator for moves relayed over the session
   channel; `GamePage`, the turn engine, scoring, and the VS header stay.

### Transport & session model

- One Realtime **broadcast channel per `game_session`**; both clients
  subscribe; moves are also **persisted to `game_moves`** (already exists,
  with `time_spent_ms`) so the server is the source of truth.
- **Reconnection:** phone locks, tab dies → rejoin channel, rebuild board from
  `game_moves` replay. Never trust local state.
- **Turn timer & forfeit:** per-turn clock (e.g. 60s) enforced by both clients
  + a "gone quiet" grace; abandon writes `status` and feeds the existing
  `player_stats.games_abandoned`. Decide defaults, not options.
- `game_sessions.is_simulated = false` finally earns its keep.

---

## 4. Modes C & D — later, on the same rails

- **C. Correspondence:** the turn duel without the "both online" requirement —
  move, close the app, opponent gets a push. Needs Web Push (PWA push now
  works on iOS 16.4+, but it's real work and needs the install prompt).
  `game_sessions` already models a paused two-player game. Build only after
  live duels prove demand.
- **D. Open matchmaking:** a "race a random recent run" button is actually a
  **ghost pool** — matchmaking with zero liquidity requirement, and it can
  ship early. True live matchmaking (queue, rating, pairing) waits until
  concurrent traffic exists. Ratings/ladders are a retention feature, not a
  launch feature.

---

## 5. Integrity (merges with the release RLS blocker)

Ghost races raise the stakes on data honesty:

- The current RLS policies allow **anyone to update any `solutions` row** —
  i.e., anyone can falsify the ghost everyone else races. The release-blocker
  RLS decision and this design converge: lock `solutions`/`game_moves` updates
  to owner (or make them insert-only), validate move inserts server-side for
  live duels (is it your turn, is the placement legal, are timestamps
  monotonic) — via an edge function or DB constraint.
- Client-clock fakery: per the companion doc, **trust-and-flag at launch**,
  server-side validation later. Ghost replays actually help here: a falsified
  run *looks* wrong when replayed (superhuman cadence), and can be flagged.

---

## 6. Social posting — make the win want to leave the app

The companion doc designs the clip (end card, QR, typeable code, OG cards).
This section is about **removing every step between "I won" and "it's posted."**

### 6.1 The share sheet is the product (files, not downloads)

Today the clip **downloads**, and the user must find the file and upload it to
TikTok/IG — three apps, four steps, most people drop. The Web Share API Level
2 (`navigator.share({ files })`) hands the MP4 **directly to the OS share
sheet** → TikTok / Instagram / WhatsApp / Messages appear as one-tap targets.
Supported on iOS Safari 15+ and Android Chrome; feature-detect via
`navigator.canShare({ files })`, keep download as the desktop fallback.
This is the single highest-leverage change in the whole posting pipeline.

### 6.2 Codec reality check (verify before building on it)

Platforms are picky: IG/TikTok want **H.264/AAC MP4**; WebM is rejected.
`MediaRecorder` output varies by browser (Safari → MP4/H.264; Chrome → WebM
unless `video/mp4;codecs=avc1` is supported, which is recent). The modal's
comments already fight MP4 moov-atom quirks. Action: pick mimeType by
capability probe, prefer `avc1` MP4, and **test actual uploads to IG/TikTok
from both iOS and Android** before calling this shipped. If Chrome-on-Android
can't produce accepted MP4s, consider capturing WebM and transcoding in a
wasm ffmpeg worker as a fallback (cost: bundle size + time; decide by data).

### 6.3 The caption kit

When sharing, auto-copy a ready caption to the clipboard and say so
("Caption copied — paste it in TikTok"):

> Just beat Anton's ghost 10/10 in 1:05 🧩 Race me: koospuzzle.com/c/A3F
> #koospuzzle #puzzle #satisfying

- The link goes in the caption/bio arm; the code + QR ride in the video
  (companion doc). One tap covers all three bridge layers.
- Localize the caption (i18n already exists).

### 6.4 Right arm per platform

- **Link-friendly** (WhatsApp, Telegram, iMessage, X, Discord): share the
  `/c/` URL with prefilled text — these render the OG card and carry a tap.
  Deep links (`wa.me/?text=`, `t.me/share`, X intent) as explicit buttons for
  desktop where the share sheet is weak.
- **Video-first** (TikTok, IG, Shorts): the file share sheet (6.1) + caption
  kit (6.3). No API posts on the free web — the share sheet *is* the
  integration.
- **The ghost race improves the footage itself:** the head-to-head clip stops
  being a spin with numbers and becomes a *race you watch* — two lanes filling,
  a comeback, a finish. "I beat you" footage with narrative tension is what
  actually gets watched to the end (and loop-watched), which is what the
  TikTok/Reels algorithm rewards.

### 6.5 OG cards on a static host (the crawler gap)

`koospuzzle.com` is GitHub Pages: crawlers fetching `/c/:code` get the SPA
shell — generic meta, no "Beat Anton · 8/10" card. JS-injected OG tags don't
help; link scrapers don't run JS. Options:

1. **Share-URL wrapper (recommended):** when the app composes a *link* share,
   use the existing `share-preview` edge function extended per the companion
   doc — it serves per-challenge OG tags + an instant redirect to
   `koospuzzle.com/c/:code` for humans. Typed codes and QR still use the
   brand-domain URL directly (they don't need OG).
2. A CDN/proxy in front of Pages rewriting meta per-path — more moving parts,
   later.

Decision: (1) now, invisible to users, zero hosting change.

### 6.6 Measure the loop or fly blind

The k-factor funnel, as PostHog events (observability plumbing exists; keys
must actually be set in the deploy workflow — currently they are not):

`clip_recorded → share_opened → share_completed(channel) →
challenge_landing(code, via) → race_started → race_finished(outcome) →
signup_from_challenge → clip_recorded (next generation)`

- Tag every inbound link: `?via=caption|qr|code|dm` + share channel.
- K-factor = new racers per sharer × their conversion to sharers. This number
  tells us which arm (video vs link vs QR) deserves investment — opinions
  don't.

---

## 7. Data & build status

**Already in place (verified):**

- Per-piece `placedAt` timestamps persisted with solutions
  (`GameRepo.ts:66-93`, `GameState.ts:160`) — ghost replay data exists today.
- Full vs-opponent game machinery: `game_sessions` (+`is_simulated`),
  `game_moves` (+`time_spent_ms`), `player_stats` (+abandoned),
  `simulatedOpponent.ts`, VS header, opponent notifications.
- Challenge target fetch + verdict (`challengeService.ts`, `judgeChallenge`),
  landing page (`ChallengePage.tsx`), clip pipeline (`clipRecorder.ts`,
  `ShareClipModal.tsx`).
- Supabase Realtime available (presence + broadcast) — no new infra.
- Observability wrapper (`lib/observability.ts`) — needs keys in deploy env.

**New work by phase:**

1. **Ghost race:** ghost replay driver (recorded-move opponent), two-lane
   progress UI, ghost pacing rules, landing "Race Anton" framing, funnel
   events. *(Client-only.)*
2. **Posting pipeline:** `navigator.share({files})`, codec capability probe +
   real IG/TikTok upload tests, caption kit, share-URL OG wrapper, `?via=`
   attribution.
3. **Live duel:** presence on challenge/verdict pages, session channel,
   live race feed (reuses ghost UI), then turn-duel move relay; timers,
   forfeit, reconnection; RLS/edge-function move validation.
4. **Later:** correspondence + push; ghost-pool "race a stranger"; ratings.

Phases 1–2 are independent of each other and can land in either order; both
multiply the companion doc's challenge loop.

---

## 8. Open questions

- Ghost display compression cap (20s? configurable?) — display-only, never
  affects verdict.
- Does a ghost race create a `game_sessions` row (for stats/history) or stay
  ephemeral until the result is saved? (Leaning: ephemeral for guests, session
  row once signed in.)
- Live race vs turn duel — which live flavor first? (Leaning: race — it
  reuses the ghost UI and the challenge framing; turn duel is a different
  game with different virality.)
- Rematch etiquette: does losing auto-offer "send your ghost back" to the
  original challenger (closing the loop person-to-person), and through which
  channel?
- wasm-ffmpeg fallback: only if upload tests fail on Android — measure first.
