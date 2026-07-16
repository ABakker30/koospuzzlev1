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

## Done (continued)
- [x] Rank-in-video — first-ever / top-3 slice in clip overlay, caption, and
      challenge landing (solveRankService ladder)
- [x] Combinatorics standardized — `npm run combinatorics` computes exact
      numbers; classic 100-sphere ≈ 8.5×10^92 sequences, >10^100 only for the
      largest shapes; copy swept (docs/combinatorics.md)
- [x] OG cards + short codes — /c/<code> (5-char, vowel-free) minted
      owner-only via ensure_share_code(); share-preview edge function serves
      "Beat Anton — 5/5 · 0:23" cards to crawlers, 302 to humans. Verified live.
- [x] Gallery create entry (FAB + menu), Ask Anton in gallery menu,
      puzzle-first Ask Anton starter questions, home AI Chat removed,
      human-to-human PvP chat (Realtime broadcast)

## Queued (pre–Aug 5)
- [ ] Real-device share test — TikTok/IG upload from a phone (codec acceptance
      is the risk; MP4/H.264 vs WebM varies by browser). USER ACTION.
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
