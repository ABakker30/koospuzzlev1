# Launch Runway — Bridges Galway / MoMath blast (Aug 5, 2026)

Status tracker for the launch-marketing work. Strategy source: the viral-launch
handoff (rank-in-video, leaderboard slices, MoMath email) as amended — geo
slices deferred (no reliable country data; guardrail would empty them anyway),
discovery ("first ever") promoted as the launch-window slice, challenge-link
arm treated as co-equal with the video arm for the MoMath audience.

## Done
- [x] Share loop: share-sheet video, caption kit, personal message (?m= on landing)
- [x] Ghost race on challenge links (two-lane live race vs recorded solve)
- [x] Creation clip ("I made this" build-up video after saving a puzzle)
- [x] Install-at-the-peak PWA prompt
- [x] Release blockers: icons/meta, privacy + LICENSE, dev routes, RLS owner-lock
- [x] PostHog live end-to-end; funnel events on every share/race/install step
- [x] Admin dashboard (/admin) + Ask Anton overlay + koos-puzzle corpus entry

## In progress
- [ ] **Rank-in-video** — motivating slice in the clip overlay + caption +
      challenge landing. Ladder: first-ever solver → "#N of M on this puzzle"
      (M ≥ 2) → fallback to existing X/N framing. No geo slices at launch.

## Queued (pre–Aug 5)
- [ ] Real-device share test — TikTok/IG upload from a phone (codec acceptance
      is the risk; MP4/H.264 vs WebM varies by browser). USER ACTION.
- [ ] Standardize the combinatorics number — app + corpus say ~10^80, handoff
      says >10^100. Pick one, define the counting method, sweep everywhere
      (AIHelpModal, home tagline, corpus, email copy).
- [ ] OG cards + short codes for challenge links — per-challenge unfurl cards
      ("Beat Anton · 8/10 · 1:23") via a share-preview edge function +
      /c/<base32> short codes. Launch-relevant if the email carries challenge links.
- [ ] Blast-day ops check (week before): Supabase plan headroom, rate-limit /
      cap the OpenAI ai-chat edge function, PostHog tier, Sentry DSN wired.
- [ ] Pre-write the MoMath email — story-led (Koos Verhoeff lineage) + a
      challenge link; ready to fire on go-live day.
- [ ] Ask Anton corpus: comprehensive app coverage (pieces/math, features,
      hints, game modes, scoring). "One of the hardest puzzles ever devised"
      framing; no flat superlative.

## Post-launch
- [ ] A/B the video hook: name-first vs striking-moment-first opening; measure
      share→landing conversion in PostHog (attribution already in place).
- [ ] Geo leaderboard slices (country/region) — only after user base + data.
- [ ] Daily puzzle + emoji result grid; baton-chain lineage; recruitment badges.
