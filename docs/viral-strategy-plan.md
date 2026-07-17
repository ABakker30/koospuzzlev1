# Koos Puzzle — Go-Viral Strategy Plan (with budget)

Status: plan of record, July 17, 2026. Launch: **Aug 5** (MoMath blast + Bridges
Galway). Companions: `launch-runway.md`, `pvp-ghost-race-design.md`,
`onboarding-design.md`, the share-challenge design doc.

## 1. The thesis (what's already true)

Every viral mechanic is **built and instrumented**: solve → rank-badged
vertical video + personal taunt → share sheet; challenge links with OG cards +
short codes that replay your ghost against the recipient; creation clips;
install-at-the-win; 12 languages; the tutorial ladder for the first 60
seconds. PostHog measures the whole funnel. The remaining work is not more
machinery — it is **surfaces, content cadence, and distribution**.

Two arms, two audiences:
- **Link arm** (email, DMs, forums, Mastodon): the MoMath/math-community
  audience. Person-to-person dares. This is the launch bet.
- **Video arm** (TikTok/IG/Shorts): the broad audience. A lottery ticket that
  costs almost nothing to keep buying because clips generate themselves.

## 2. Surfaces to finish (the "challenges everywhere" layer)

1. **Leaderboard → ghost pool** (task #12, ~1 day): every row becomes a
   playable dare (tap → `/c/`), data deduped per solver and manual-only so
   the board always agrees with the shared "#2/7" slice, verdict screen links
   in, "you are here" row, guest phantom row ("sign in to put your name
   here"). Minimal brand reskin. *Weekly boards deliberately rejected — new
   shapes are the reset mechanism ("first ever" crowns).*
2. **Challenges view in the gallery** (task #13, ~1 day): a tab/strip of
   **posed challenges** — solutions with minted share codes — rendered as
   "Beat Anton — 5/5 · 0:23 · Medium → Race". Answers "who can I play right
   now?" without anyone sending you a link. This is the browsable front door
   to the same ghost pool.
3. **"Be the first" strip** (post-launch): fresh/unsolved shapes surfaced as
   claimable crowns — the discovery axis as a standing invitation.

## 3. The content stream (what, where, automation)

**What the app generates on its own, today:** every solve mints a rank-badged
clip + a challenge link; every creation mints an "I made this" clip; every
first-ever is a story ("a shape no human had solved"). Supabase already holds
the event stream (solutions, puzzles, sessions).

**Where the stream lives — in order of build:**

| Surface | What | Automation | Cost |
|---|---|---|---|
| **In-app: home activity ticker + gallery Recent** | "Nina was first to solve Torus-12 · 2h ago" | Query existing tables; no new infra | $0 |
| **Discord server (#activity)** | Same events, live, via webhook | Supabase scheduled edge function → Discord webhook | $0 |
| **Mastodon — mathstodon.xyz** | Daily-ish: first-evers, records taken, new shapes, with OG image links | Edge function → Mastodon API (open, free, bot-friendly) | $0 |
| **Weekly email digest** ("This week in Koos") | Top solves, new shapes, one featured challenge link | Edge function + Resend/Buttondown free tier | $0–9/mo |
| **X/Twitter** | Same as Mastodon | Free API tier = ~500 posts/mo (enough for 5/day) | $0 (skip paid tier) |
| **TikTok / IG Reels / YT Shorts** | The best auto-generated clips | **Manual by design** — personal-account posting APIs are closed; the app already makes posting a 2-tap act (share sheet + auto-caption) | $0 |

**Why Mastodon before X:** mathstodon.xyz is *the* mathematician instance —
the exact Bridges/MoMath audience, bots welcome, zero cost, and a first-ever
solve is native content there. X is a mirror, not a strategy.

**Automation architecture** (task #14): one scheduled Supabase edge function
(cron, e.g. every 6h) queries "notable events since last run" (first-evers,
top-3 changes, new public puzzles), composes text + the `share-preview` OG
link, posts to Discord + Mastodon, and logs to a `stream_posts` table so
nothing posts twice. Human-in-the-loop option: post to Discord first, promote
to Mastodon on your 👍 reaction (start fully automated for Discord, gated for
public channels until tone is proven).

## 4. Channel plan by phase

**Phase 0 — now → Aug 5 (organic, $0 marketing):**
- Finish surfaces (#12, #13), MoMath email (task #6, CTA = Anton's own
  challenge link), Ask Anton app corpus (#7), device share test (#2), ops
  check (#5).
- Seed content: 10–15 fresh shapes across all categories the week before, so
  "first ever" is abundantly claimable on day 1; Anton posts one solve clip +
  one creation clip to establish the pattern.
- Set up Discord server + mathstodon account (manual posts at first).

**Phase 1 — launch month (Aug):**
- MoMath blast + Bridges: bring the physical prototype; a printed card with a
  QR to a challenge link is the entire booth strategy ("Race me — my recorded
  solve is waiting").
- Activity stream automation live (Discord + Mastodon).
- Post 2–3 clips/week to TikTok/IG/Shorts manually; watch `via=` attribution.
- **Decision gate (end of Aug):** k-factor from PostHog — does a challenge
  landing convert ≥50% to first placement, and do ≥8% of landings share?

**Phase 2 — only if the loop catches (Sept+):** put small money on the
winning arm (see budget): boost the top *organically proven* clips, seed 3–5
mid-size puzzle/math YouTubers (Standupmaths-adjacent tier responds to "10⁹³
combinations, computed exactly" + a physical prototype loaner), Reddit
r/puzzles "I built this" post timed with a good weekend.

**Phase 3 — compounding:** daily puzzle + emoji-grid text share (the Wordle
mechanic — biggest single post-launch feature bet), baton-chain lineage,
recruitment badges, prototype interest → manufacture decision.

## 5. Budget

Principle (unchanged from the original handoff): **organic until the loop
demonstrably catches; then spend on amplification, never on acquisition the
product can't retain.**

| Item | Monthly | One-off | Phase |
|---|---|---|---|
| Supabase Pro (headroom for blast day) | $25 | — | 0 |
| Sentry / PostHog / Mastodon / Discord / X free tiers | $0 | — | 0 |
| Email digest (Buttondown/Resend starter) | $0–9 | — | 1 |
| ai-chat OpenAI usage (rate-capped, see task #5) | ~$10–30 | — | 0–1 |
| Bridges printed QR challenge cards (200) | — | ~$150 | 0 |
| Prototype loaner shipping to 3–5 creators | — | ~$200 | 2 |
| Clip boosting: TikTok Promote / IG Boost / Shorts ads on top-3 organic clips | $300–500 | — | 2 (gated) |
| Creator seeding honoraria (optional, 2–3 × $250) | — | ~$500–750 | 2 (gated) |
| **Total pre-launch + launch (Phases 0–1)** | **≈ $35–65/mo** | **≈ $150** | |
| **Total Phase 2 experiment (one month, if gate passes)** | **≈ $350–550/mo** | **≈ $700–950** | |

Hard rule: no Phase 2 spend unless the Phase 1 decision gate passes on
organic data. If it doesn't pass, the money goes to fixing the funnel, not to
ads.

## 6. What we deliberately don't do

- Paid user acquisition before retention is proven (the loop must catch
  organically first — ads on a leaky funnel burn cash).
- X API paid tier ($200/mo) — free tier + Mastodon covers the volume.
- Automated posting to TikTok/IG — closed APIs; manual 2-tap posting of
  auto-generated clips is nearly as fast and keeps a human eye on quality.
- Weekly leaderboards, geo slices, follower-count vanity — per the design
  reviews, they empty small boards and fight the brand.

## 7. Metrics that decide everything (all live in PostHog)

- `challenge_landing → first_piece_placed` ≤60s: **≥50%** (funnel health)
- `challenge_landing → share_completed` same session: **≥8%** (k-factor)
- `via=momath → signup_completed`: 2–3× organic (claim framing works)
- Stream: Mastodon follows + Discord joins/week (community pull)
- Prototype interest: Ask Anton "Join the list" count (manufacture gate)
