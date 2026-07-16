# Onboarding — Strategy × Current-State Synthesis

Status: **design, for review** (not built). Sources: a full first-run UX audit
of the codebase and an independent strategy proposal (July 17, 2026), reconciled
here. Companions: `launch-runway.md`, `pvp-ghost-race-design.md`.

## The verdict

**The product has zero onboarding in the funnel that matters.** Every path a
shared or organic visitor actually travels — challenge link, invite link,
home → gallery → play — drops a newcomer onto a 3D board with no explanation
of the core gesture. The how-to content that exists is either behind a button
on a setup screen that solo/challenge/join presets *skip*, or auto-shows only
on the legacy `/manual/:id` route that the funnel never touches. Meanwhile the
core gesture gives **no feedback on invalid taps** (silently ignored,
`GameBoard3D.tsx:126-135`), so a confused first-timer poking the board learns
nothing from failure.

The good news: the strategy's highest-leverage behavior — **the ghost waits at
the start line until the player's first placement** — is already shipped
(`useGhostReplay` anchors to first placement). Onboarding's job reduces to:
get every newcomer to that first placed piece within 60 seconds.

## Principles (agreed)

1. **Activation = first self-placed piece**, measured within 60s of landing.
2. **Never gate the race, never delay the board.** No welcome modals, no
   mandatory tutorials, anywhere in the funnel.
3. **The ghost waits at the start line** (shipped). Learning time is free;
   the first placement is the starting gun — style it as a "GO" moment.
4. **Teach in the board, at the moment of need** — coach marks, not prose.
5. **Account = "claim your result,"** asked only after the result exists.
6. **One screen, one ask.** 7. **Losing is cheap; retry is one tap.**

## Ground truth (audit, condensed)

- **Core gesture:** tap 4 FCC-adjacent cells to draw a piece; 4th cell
  auto-matches against the 25 pieces. Invalid taps (occupied / non-adjacent)
  are silently swallowed; only a failed 4th-cell match produces a message.
- **Challenge path:** `/c/` → "Race Anton" → setup skipped → board, cold.
- **Invite path:** join overlay (fixed July 17) → coin flip → live PvP, cold.
  Signed-out joiners must sign in and *re-tap the link* (no auto-resume).
- **Home "Play"** navigates to the gallery grid — a browse/decide tax, no
  quick-start.
- **Auth walls:** guests can solo + vs-computer; saving a solve and real PvP
  require sign-in; login is magic-link and loses your place (no returnTo).
  On iOS PWA, magic links open in Safari, stranding the session — structural.
- **Inconsistent flags:** three onboarding namespaces (`createPuzzle.*`,
  `solutionViewer.*`, `manualGame.*`); the main game has none.
- **Dead code:** SharedWelcomeModal, ShareWelcomeModal, ManualSolveModeEntryModal,
  ManualGameHowToPlayModal (imported, unrendered), HowToSolveModal, InfoHubModal,
  GameStatusModal, and the gallery PlayModal/SolveModal/ExploreModal/AssembleModal
  → PuzzleActionModal/SolutionActionModal chain (no importers). GamePage also
  maintains the same info-modal JSX twice (`:2083`, `:2840`).

## First 60 seconds, per path (target design)

- **Challenge `/c/`** — landing as-is + a 3–4s looping gesture-demo clip under
  the hero. Race → board with dormant ghost ("waiting for your first move" —
  exists) + coach marks. First piece completes → "GO" flourish, ghost starts.
- **Home** — keep hero/slideshow; primary CTA becomes **"Try the puzzle"** →
  a curated 16-sphere starter (copy: *"Only 16 spheres. Over a billion ways to
  get it wrong."*), coach marks, no ghost. Play/Create/Gallery cards below for
  returners.
- **Invite `?join=`** — overlay flow (shipped) + two fixes: resume the join
  after sign-in (returnTo), and a guest escape hatch ("race their ghost
  instead") when the inviter has a recorded solve.
- **Gallery** — "Start here" starter row for signed-out first-timers; tile tap
  for guests defaults toward Solve, not a five-way choice.
- **Create** — keep CreatePuzzleGuideModal (the one well-behaved onboarding
  surface), trim to one screen.
- **MoMath email** — CTA is *Anton's own challenge link* with `?via=momath`;
  landing gains one story block (lineage + the 10⁹³ line + Ask Anton link).
  Desktop-aware: verdict share leads with the copyable link, not the video.

## Teaching the gesture (decision)

Ship **coach marks + demo loop**; skip ghost-hand animations and any mandatory
practice:

1. **Coach marks on the live board (M)** — pulse a valid starting sphere;
   after the first tap, shimmer FCC-adjacent neighbors; progress counter
   "1/4…4/4" while drawing; **inline toast on invalid taps** (fixes the
   silent-failure hole); suppress after the first completed piece
   (`koos.onboarding.gestureLearned` — one new, unified flag namespace).
2. **Gesture demo loop (S)** — one 3–4s clip (record once with the existing
   clip pipeline) on the challenge landing + home starter CTA.
3. Opt-in 30s warm-up micro-puzzle: **post-launch, only if data demands it**
   (median `mistaps_before_success` > 3).

## The account moment (decision)

- Ask at the verdict screen only: **"Claim your result"** / "put your name on
  this" — inline email field, not a `/login` redirect. Won race > finished
  solve > lost (no ask; offer Race again).
- **Switch primary auth to email OTP code** (`signInWithOtp` 6-digit): user
  never leaves the app; fixes the iOS-PWA magic-link stranding and the
  invite-link re-tap. Magic link stays as email fallback.
- **returnTo + pending claim:** hold the guest's finished result locally as a
  pending claim; after OTP verify, attach and land back on the verdict.
- No username capture at signup — default from email prefix, edit later.

## Metrics (PostHog; all carry `via` + `entry_path`)

| Event | Status |
|---|---|
| `challenge_landing` | add |
| `race_started` | add |
| **`first_piece_placed`** (ms_since_board_ready, mistaps) — the activation event | add |
| `challenge_race_finished` | shipped |
| `signup_started` / `signup_completed` (trigger, method) | add |
| `result_claimed` | add |
| `share_completed` | shipped |

**North stars:** landing → first piece within 60s ≥ **50%** (alarm < 35%);
landing → same-session `share_completed` ≥ **8%**; `via=momath` signup rate
2–3× organic.

## Build list

### Pre–Aug 5 (in order)
| # | Item | Size |
|---|---|---|
| 1 | Funnel events (§Metrics) — fly blind otherwise | S |
| 2 | Coach marks + invalid-tap feedback in GameBoard3D | M |
| 3 | "GO" moment styling when the ghost starts (driver already waits) | S |
| 4 | Gesture demo loop on challenge landing + home | S |
| 5 | OTP sign-in + returnTo + pending claim | M |
| 6 | Verdict-screen inline "Claim your result" | S |
| 7 | Home "Try the puzzle" CTA → 16-sphere starter | S |
| 8 | `?via=momath` landing variant + email pre-write | S |
| 9 | Dead-modal cleanup (delete the audit's dead list; dedupe GamePage info JSX) | S |

### Fast-follow
Invite-join guest escape hatch; auto-resume join after sign-in; gallery
starter row + guest default-to-Solve; desktop link-first verdict share;
opt-in warm-up (data-gated); first-ever badges on fresh gallery shapes.

### Explicitly rejected
Mandatory tutorial or practice gate; welcome modal on `/c/`;
watch-the-ghost-first interstitial; username at signup; pre-play leaderboards;
PvP invites that dead-end for guests.
