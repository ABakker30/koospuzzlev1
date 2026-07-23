# UI Clean-Look Review — 2026-07-23

Read-only audit of Home, Gallery, game-screen chrome, and the modal family, grounded in code
(file:line). Benchmark is the app's own strongest work: **`src/components/ModalBase.tsx` +
`src/styles/tokens.ts`** — proper a11y, 44px close targets, one backdrop, one radius scale,
z-index ladder. Everything below is measured against that standard, not an external system.
The known-temporary PvP debug panel (GamePage.tsx:3159) is excluded per instructions, as are
the ThronesStrip desktop arrows (another agent is on those).

## TL;DR

1. Home's five new strips (inbox / dethrone / beaten / thrones / ticker) are five widths
   (520 / 500 / unconstrained / 500 / 420px), five header styles, and one 0px gap bug —
   unifying width + header + margin direction is the single highest-leverage cosmetic fix.
2. ⚔️ means three different things on Home; 🔵 vs 🟣 both mean "cells" in the two gallery cards.
3. The game toolbar (GameHUD action bar) can exceed a 375px viewport in PvP (6 buttons ≈ 428px)
   and its icon-only buttons have no aria-label/title — the `label` prop is silently dropped.
4. ModalBase is excellent but only ~35 of the modals use it; the four most-seen non-users are
   GameSetupModal (first thing every player sees), the PvP waiting-room/join overlays,
   UserBadgesModal, and the Home terms modal — each hand-rolls its own surface, backdrop, close.
5. Several sub-16px inputs will trigger iOS auto-zoom in the invite/share flows.
6. AgeGateModal is off-brand (Material blue) and at z-index 1100, below the modal ladder.

---

## 1. Home page — `src/pages/home/HomePage.tsx`

### Hierarchy (currently good bones, ragged rhythm)

Actual order: title → tagline → subtitle → slideshow + Play (HomePage.tsx:583-681) →
Learn pill (:684) → contest strip (:702) → PvPGamesInbox (:724) → DethroneBanner (:727) →
BeatenBanner (:730) → ThronesStrip (:733) → ActivityTicker (:736) → legal footer (:739).

That IS the right order (identity → primary action → my stuff → discovery). The problem is
purely visual: each strip was built independently.

### Findings, ranked

**H1 — Five different column widths (P0).** The center column wobbles as you scroll:

| Component | Width decl | File:line |
|---|---|---|
| Slideshow + Play | `maxWidth: '400px'` | HomePage.tsx:589 |
| PvPGamesInbox | `width: 'min(92vw, 520px)'` | PvPGamesInbox.tsx:289 |
| DethroneBanner | `width:'100%', maxWidth:'500px'` | DethroneBanner.tsx:65-66 |
| BeatenBanner | **no width constraint at all** | BeatenBanner.tsx:39-46 |
| ThronesStrip | `width:'100%', maxWidth:'500px'` | ThronesStrip.tsx:88 |
| ActivityTicker | `width: 'min(92vw, 420px)'` | ActivityTicker.tsx:96 |

BeatenBanner sizes to its content (long "X beat your best on Y" rows) — on a narrow phone a
long puzzle name can push it wider than its siblings before the inner ellipsis engages; on
desktop it renders narrower than its neighbors. Canonical: `width:'100%', maxWidth:'500px',
boxSizing:'border-box'` everywhere (Play/slideshow block can stay 400 — it reads as the hero).

**H2 — 0px gap between DethroneBanner and BeatenBanner (P0).** Every strip spaces itself with
`marginTop` (inbox :288 `16px`, dethrone :71 `16px`, thrones :88 `14px`, ticker :95 `18px`)
**except** BeatenBanner, which uses `marginBottom: '16px'` (BeatenBanner.tsx:45). Result:
dethrone and beaten cards touch (0px), then a 30px gap (16+14) before thrones. Also note the
four different marginTop values — pick one (16px).

**H3 — Five section-header treatments for five sibling sections (P0).**

| Section | Style | File:line |
|---|---|---|
| Thrones | 0.85rem / 800 / `#feca57` | ThronesStrip.tsx:100-104 |
| PvP inbox | 0.88rem / 700 / `rgba(255,255,255,0.92)` | PvPGamesInbox.tsx:296-299 |
| Dethrone | 0.9rem / 800 / `#feca57` | DethroneBanner.tsx:76 |
| Beaten | 0.9rem / 800 / `#f87171` | BeatenBanner.tsx:49 |
| Activity | 0.7rem / uppercase / letterspacing / `rgba(...,0.55)` | ActivityTicker.tsx:102-109 |

Accent colors are semantic and fine to keep; size/weight should be one spec:
`fontSize:'0.85rem', fontWeight:800, marginBottom:8`.

**H4 — ⚔️ used for three different concepts (P0-ish, one-char edits).** Inbox title
(PvPGamesInbox.tsx:304-306), Dethrone title (DethroneBanner.tsx:77), Beaten title
(BeatenBanner.tsx:50) all lead with ⚔️. Meanwhile 👑 is both the thrones section header
(ThronesStrip.tsx:107) and the dethrone *Reclaim* button (DethroneBanner.tsx:131). Proposal:
⚔️ = PvP inbox only; 👑 = thrones/dethrone family; 🏁 = beaten/race (its CTA already uses 🏁).

**H5 — Dismiss ✕ targets are ~13px (P0).** DethroneBanner.tsx:79-91 and BeatenBanner.tsx:52-64:
`background:none; border:none; fontSize:'0.8rem'` with no padding — a sub-16px tap target on
the two cards most likely to be mis-tapped (their neighbors are full-row links). The PvP inbox
close chip (PvPGamesInbox.tsx:407-438, `padding:'3px 8px'`, 0.72rem) is ~22px tall — same
issue. ModalBase's own ✕ is 44px (ModalBase.tsx:71-73); match intent with padding ≥8px + a
negative margin so layout doesn't shift.

**H6 — ActivityTicker rows are 0.85rem text with `padding:'4px 0'`** (ActivityTicker.tsx:124)
→ ~26px tall tappable rows, `role="link"` but no keyboard handler (unlike the inbox rows,
PvPGamesInbox.tsx:315-319, which do it right — `tabIndex` + Enter/Space). Bump to
`padding:'8px 0'` and copy the inbox's key handling.

**H7 — Tint-card grammar is almost a system — codify it.** Inbox = indigo tint
(PvPGamesInbox.tsx:284-286), Dethrone = gold→red (DethroneBanner.tsx:67-68), Beaten = red→gold
(BeatenBanner.tsx:41-42), Thrones chips = gold pills, Ticker = neutral black 0.22. All use
radius 14 + 1px tinted border. This is good! It just needs the width/header/margin unification
above to read as intentional.

**H8 — Profile dropdown is a mini settings page (P2).** HomePage.tsx:234-503: username +
language + chat toggle + save + terms + sign-out inside a 280px dropdown, on the brandTri
gradient with `2px solid rgba(255,255,255,0.5)` borders — heavier chrome than any modal.
Long-term this wants to be a ModalBase settings modal; the dropdown keeps only
signed-in-as / Preferences… / Sign out.

**H9 — Hover-state bug, sign-in button:** HomePage.tsx:525 resets background to
`rgba(255,255,255,0.2)` on mouse-leave but the resting value is `tokens.gradient.brand`
(:511) — after one hover the button permanently loses its gradient. The signed-in variant
(:225) resets correctly. One-line P0.

**H10 — Legal links contrast:** `rgba(255,255,255,0.55)` at 0.8rem (HomePage.tsx:742,748).
tokens.ts:31-32 itself documents 0.6 as an AA fail; these are decorative-tier but they're
real links — use `tokens.text.onGradientMuted` (0.78).

---

## 2. Gallery page — `src/pages/gallery/`

### Findings, ranked

**G1 — Title is not responsive and duplicates the shimmer (P0).** GalleryPage.tsx:498-512:
`fontSize:'2.5rem'` fixed (Home uses `clamp(2.5rem, 8vw, 4rem)`, HomePage.tsx:538) and the
whole shimmer gradient + keyframes block is copy-pasted (GalleryPage.tsx:492-497 vs
HomePage.tsx:755-759). Use `clamp(1.8rem, 6vw, 2.5rem)`; extract a `.koos-shimmer-title`
class to index.css eventually (P1).

**G2 — Header row density on mobile (P1).** GalleryPage.tsx:515-810 stacks 3 tabs
(12px 24px padding each) + 1 "all" chip + N category chips + admin chip + sort button in one
`flexWrap` row. On 375px this wraps to 3-4 lines of controls before any content. The tabs are
the identity of the page; the chips are secondary. Consider: tabs row fixed, chips in a single
`overflow-x:auto` row (same hidden-scrollbar pattern ThronesStrip already ships,
ThronesStrip.tsx:89-97).

**G3 — Category chips + sort button below touch minimum (P0).** Chips `padding:'5px 12px'`,
0.8rem (GalleryPage.tsx:598) ≈ 27px tall; sort trigger `padding:'6px 12px'`
(GalleryPage.tsx:644) ≈ 29px. Bump both to `padding:'8px 14px'` — visual weight barely
changes, targets reach ~34px.

**G4 — Two sort dropdowns are near-duplicates (P1).** GalleryPage.tsx:630-725 (tiles sort)
and :728-808 (challenges sort) are the same trigger + menu with different option arrays; the
challenges copy already dropped the hover handlers the first one has (drift in-file). Extract
one `SortMenu` component.

**G5 — Challenge cards vs puzzle cards: two card languages on sibling tabs (P1).**
Challenge cards: translucent white card, radius 14, 140px banner image, inline "🏁 Race" pill
(GalleryPage.tsx:894-955). Puzzle/solution tiles: solid dark `rgba(30,30,30,0.8)`, radius 12,
square/16:9 image, bottom action bar (PuzzleCard.tsx:71-83). Both are fine designs; seeing
both under the same tab bar reads as two apps. Cheapest convergence: give challenge cards the
same dark surface + radius 12, keep their content layout.

**G6 — Cells emoji drift (P0).** PuzzleCard badge uses 🔵 (PuzzleCard.tsx:158); SolutionCard
stats row uses 🟣 (SolutionCard.tsx:184); the sort menu's "pieces" option also uses 🔵
(GalleryPage.tsx:690). Canonical: 🔵.

**G7 — Admin Edit/Delete buttons use the Material palette (P0).** PuzzleCard.tsx:375
`#2196F3 0%, #1976D2` and :409 `#f44336 0%, #d32f2f` — the only Material-Design colors in the
app. Swap to `tokens.gradient.info` / `tokens.gradient.danger`. Admin-only, but it's a
two-line fix and these show on every card in admin mode.

**G8 — Like/Users/Share bar: three button styles in one 3-button row (P2).** Like = borderless
text button, Users = borderless icon button, Share = filled blue outline chip
(PuzzleCard.tsx:197-354). Also `flex:1` on Like makes its invisible hit area span half the
card — fine for taps, odd for hover highlight. Worth one pass when the card gets its next
feature; note the card currently has **no visible Play affordance** — tap-anywhere goes to the
viewer, which new users can't know (P2, owner question).

**G9 — FAB ignores safe area (P0).** GalleryPage.tsx:462-463 `bottom:'24px', right:'24px'` →
`bottom:'max(24px, env(safe-area-inset-bottom))'`, `right:'max(24px, env(safe-area-inset-right))'`.
The codebase already does this in 4 places (e.g. PuzzleViewerPage.tsx:475).

**G10 — UserBadgesModal hand-rolls ModalBase (P1).** UserBadgesModal.tsx:172-253: own
backdrop (0.7/blur4 vs canonical 0.75/blur8), own 32px close, dark surface
`rgba(40,40,50,.98)→rgba(30,30,40,.98)`, no focus trap/Escape (ModalBase gives all of it
free). Same story for ShareOptionsModal / AboutPuzzleInfoModal / AboutSolutionInfoModal /
EditPuzzleModal / EditSolutionModal (none import ModalBase; the `modals/` subdirectory ones
all do — the older top-level files predate it).

---

## 3. Game screen chrome — `src/game/ui/`, `src/game/pvp/`

### Findings, ranked

**GS1 — PvP toolbar can overflow a phone viewport (P0).** GameHUD styles.actionBar
(GameHUD.tsx:365-377): fixed, centered, `gap:12`, `padding:'12px 16px'`, no max-width, no
wrap. In PvP with removal allowed the bar holds up to 6 buttons (Inventory, Hint, Show/Hide,
Check, Resign, Remove; GameHUD.tsx:66-126); each button is ~56px (icon 1.5rem + 12/16
padding) → 6×56 + 5×12 + 32 ≈ 428px on a 375px viewport. Fix at CSS level:
`maxWidth:'calc(100vw - 12px)'`, `gap:8`, button `padding:'10px 12px'`, and
`bottom:'max(20px, env(safe-area-inset-bottom))'` (currently `bottom:'20px'`, :367).

**GS2 — Icon-only toolbar buttons drop their labels AND have no aria-label (P0).**
`ActionButton` receives `label` but renders only icon + count (GameHUD.tsx:221-237);
`styles.actionLabel` (:399) is dead. 🙈 / 🔍 / 🏳️ are not self-evident. Minimum fix:
`aria-label={label}` + `title={label}` on the button. (Rendering the tiny label text under the
icon is a P1 choice for the owner — it costs ~12px height.)

**GS3 — Game menu trigger is 28px (P0).** GamePage.tsx:4317-4320 `ThreeDotMenu size={28}
iconSize={18}`; component default is 44 (ThreeDotMenu.tsx:39). This is the only exit/settings
affordance during a match, top-right where reach is worst. `size={44} iconSize={20}` — the
visual dots stay small, the target grows.

**GS4 — The PvP overlay family is one hand-rolled card ×5 (P1).** Join overlay
(GamePage.tsx:3245-3369), waiting room (:3371-3559), pending-start (:3565-3653), coin flip
(:3655-3686), How-to-Play (:3688-3800) all rebuild: `rgba(0,0,0,0.9)` backdrop (no blur —
ModalBase uses 0.75 + blur8), surface `linear-gradient(145deg,#2d3748,#1a202c)`, radius 20,
`padding:40px`, z 10200/10300. None have Escape/focus handling. They are visually consistent
*with each other* — extracting one local `PvPOverlayCard` (or ModalBase with
`surface=` + `dismissOnBackdrop={false}`) makes them consistent with everything.

**GS5 — How-to-Play modal exists twice, ~110 lines each (P1).** GamePage.tsx:3688-3800
(pre-game return) vs :4567-4677 (in-game return) — near-identical markup drifting apart
already (the pre-game copy includes timer info the in-game copy lacks). Extract one component.

**GS6 — Waiting-room buttons: primary/secondary hierarchy is right, colors are ad-hoc.**
"Leave open" is `#3b82f6` (GamePage.tsx:3503) — raw hex where `tokens.gradient.info`/`color.info`
exists; copy-link buttons `#3b82f6`→`#22c55e` on success (:3435) while tokens.success is
`#10b981`. See consistency table.

**GS7 — Share-URL inputs will iOS-zoom (P0).** Readonly link inputs at `fontSize:'0.78rem'`
(GamePage.tsx:3479, ChallengeChoiceModal.tsx:249) and the guest-name input at 15px
(GamePage.tsx:3325). iOS Safari zooms any focused input under 16px — in the exact
WhatsApp-invite flow the audience uses most. Set `fontSize:'16px'` on all three (the readonly
ones can visually compensate with `padding:'6px 10px'`).

**GS8 — Player cards (PvPHUD) are the best-integrated chrome on the board** — compact, dark
glass, active-side accent border (PvPHUD.tsx:96-159, 184-198). Two notes: (a) name column
`maxWidth:160` × 2 + gaps fits 375px — good; (b) the *turn* signal is a 3px border color
only — colorblind-safe pass exists elsewhere in the app, consider the timer color already
doing double duty as sufficient. No change required.

**GS9 — Tutorial/challenge banner vs chat drawer top-offset assumption (P1).**
ChatDrawer.tsx:19 pins the drawer `top: 56px /* Below header */` but the game screen has no
56px header (menu is at top:12). Harmless today; will bite when someone "fixes" it. Also
`width:320px; max-width:320px` on mobile (:64-69) leaves a sliver of board visible — fine —
but the drawer has no safe-area bottom padding for the input row inside.

**GS10 — Coin-flip copy shows the wrong name for the joiner (P1, copy not CSS).**
GamePage.tsx:3672 `vs {pvpSession.player2_name}` — the joiner IS player2, so they see their
own name. Use `myNumber` (already in `pvpCoinFlipResult`) to pick the opponent's name.

**GS11 — Ended/waiting states location.** GameEndModal correctly rides ModalBase with a dark
surface + gold celebration boxes (GameEndModal.tsx:70-91, 345-367) — this is the benchmark
for what GS4's overlays should become. `stats` text at `rgba(255,255,255,0.4)`
(GameEndModal.tsx:342) is below AA on that surface → 0.6.

---

## 4. Modals family

**The split:** 35 files use ModalBase (grep `from '.*ModalBase'`) — all of `pages/gallery/modals/`,
solve-page modals, ReportModal, ChallengeChoiceModal, GameEndModal, InstallAppPrompt, etc.
Holdouts, in order of user exposure:

| Modal | Surface | Backdrop | Close | File |
|---|---|---|---|---|
| GameSetupModal | slate `#4a5568→#2d3748` | 0.8 + blur4, z 10000 | 32px square | GameSetupModal.tsx:659-711 |
| PvP overlays ×5 | `#2d3748→#1a202c` | 0.9, no blur, z 10200+ | none (buttons only) | GamePage.tsx:3245-3800 |
| Home terms modal | `rgba(0,0,0,0.95)` | 0.8 + blur4 | text ✕, 4px pad | HomePage.tsx:787-938 |
| UserBadgesModal | `rgba(40,40,50,.98)` | 0.7 + blur4 | 32px square | UserBadgesModal.tsx:172-253 |
| AgeGateModal | **Material blue `#1e88e5→#42a5f5`** | 0.55, no blur, **z 1100** | none | AgeGateModal.tsx:32-57 |
| Gallery About/Share/Edit (top-level) | assorted dark | assorted | assorted | pages/gallery/*.tsx |

- **GameSetupModal is the highest-value migration (P1):** it is the first surface every player
  sees when starting any game, and it's the one on the slate-gray palette no other modal uses.
  Its internals are solid (section titles, preset buttons); only the shell needs ModalBase.
  Its `ruleHint` color `rgba(255,255,255,0.4)` (GameSetupModal.tsx:891) fails AA → use
  `tokens.text.onGradientMuted` (P0). Stepper buttons 26px (:382-384,:397-399) and piece
  letters 34px (:268-269) are under-target; steppers → 32px min (P0-adjacent).
- **AgeGateModal (P0-level fixes even before migration):** `zIndex:1100` (AgeGateModal.tsx:42)
  is below the modal ladder (tokens.z.modalBackdrop 10000) — any ModalBase modal opened
  simultaneously covers it. Its blue gradient is the only `#1e88e5` in the app → 
  `tokens.gradient.info`. It's also a legal-ish surface, so keep `dismissOnBackdrop` behavior
  deliberate when migrating.
- **ChallengeChoiceModal + ReportModal + PlayModal are the pattern to copy** — ModalBase shell,
  gradient option buttons, shared share-row language (ChallengeChoiceModal.tsx:184-240
  explicitly mirrors the waiting room — good).

---

## 5. Cross-cutting consistency inventory

| Concept | Variants found (file:line samples) | Proposed canonical |
|---|---|---|
| Dark modal surface | `#4a5568→#2d3748` (GameSetupModal.tsx:675) · `#2d3748→#1a202c` (GamePage.tsx:3256, PvPHUD.tsx:356) · `#1e1e2e→#2d2d44` (GameEndModal.tsx:75) · `rgba(40,40,50,.98)→(30,30,40,.98)` (UserBadgesModal.tsx:196, GameHUD.tsx:422) · `rgba(0,0,0,0.95)` (HomePage.tsx:805) · `rgba(30,30,40,0.98)` (GalleryPage.tsx:676) | one token, suggest `tokens.gradient.darkSurface = linear-gradient(135deg,#1e1e2e,#2d2d44)` (GameEndModal's) |
| HUD glass panel | `rgba(30,30,40,0.95)` (GameHUD.tsx:255,348,374) · `rgba(15,20,30,0.85)` (PvPHUD.tsx:189) · `rgba(11,11,30,0.85)` (GamePage.tsx:4126,4220) | `rgba(15,20,30,0.9)` + blur 8-12 |
| Backdrop | 0.55 (AgeGate) · 0.7+blur4 (UserBadges) · 0.75+blur8 (**ModalBase**) · 0.8+blur4 (Setup, Terms) · 0.9 (PvP overlays) · 0.95 (coin flip) | ModalBase's 0.75 + blur8 (coin flip may stay darker for drama) |
| Border radius | 4,6,8,10,12,13,14,16,20,999 all present; 10 and 14 are off the tokens scale (tokens.ts:37) yet dominate the new Home strips (14 containers / 10 rows) | containers 16 (lg), rows/chips 12 (md), pills 999 |
| Pill shape | `999px` (chips everywhere) · `'20px'` (gallery sort trigger, GalleryPage.tsx:643) · `'14px'` (PuzzleCard badges :149,:169) | 999 |
| Success green | `#10b981` tokens · `#22c55e` (copied-state GamePage.tsx:3435, setup :899) · `#4ade80` (turn chips PvPGamesInbox.tsx:383, PvPHUD.tsx:101) · `#34d399` (GameEndModal.tsx:145) | `#10b981` fills; `#4ade80` as the on-dark "active/turn" text tint; retire the other two |
| Gold | `#feca57` (tokens.highlight) · `#fbbf24` (score pulse GameHUD.tsx:305, tie GameEndModal.tsx:280) · `#ffd24d` (time chips GamePage.tsx:4284, GalleryPage.tsx:939) · `#ffd93d` (mock color PuzzleCard.tsx:60) | `#feca57` |
| CTA blue | `#3b82f6` tokens.info · `#2196F3` (PuzzleCard.tsx:375) · `#1e88e5` (AgeGate) · `#60a5fa` (invite code + h3 accents GamePage.tsx:3406,3719) · `#339af0` (shimmer only) | `#3b82f6`; `#60a5fa` as on-dark text-accent |
| Close affordance | 44px ✕ (ModalBase.tsx:71) · 32px square (UserBadges :241, Setup :703) · bare text ✕ (HomePage.tsx:823, DethroneBanner.tsx:79) · pill chip ✕ (PvPGamesInbox.tsx:407) | ModalBase ✕ in modals; 32px+ padded chip in cards |
| "cells/pieces" emoji | 🔵 (PuzzleCard.tsx:158, GalleryPage.tsx:690) · 🟣 (SolutionCard.tsx:184) | 🔵 |
| ⚔️ | PvP inbox · dethrone · beaten (see H4) | ⚔️ inbox only; 👑 throne family; 🏁 race family |
| Section header (Home) | 5 variants (see H3) | 0.85rem / 800 / semantic accent color |
| z-index | tokens ladder (tokens.ts:45-51) vs literals 100/200/999/1000/1001/1100/9998/9999/10000/10100/10200/10300/99999 | migrate literals to tokens.z as files are touched |
| Timer emoji | ⏱ (GalleryPage.tsx:779,939) · ⏱️ (GamePage.tsx:3724, GameHUD.tsx:176) | ⏱️ (with VS16) |
| Font size units | rem and px mixed within single files (GamePage overlays use px 13/15/16; strips use rem) | rem for text, px for hairlines/geometry |

---

## 6. Prioritized list

### P0 — quick cosmetic wins (each <1h, mechanically applicable)

1. **Unify Home strip widths.**
   - `PvPGamesInbox.tsx:289` `width: 'min(92vw, 520px)'` → `width: '100%', maxWidth: '500px'`
   - `ActivityTicker.tsx:96` `width: 'min(92vw, 420px)'` → `width: '100%', maxWidth: '500px'`
   - `BeatenBanner.tsx:40-46` add `width: '100%', maxWidth: '500px', boxSizing: 'border-box'`
2. **Fix BeatenBanner margin direction.** `BeatenBanner.tsx:45` `marginBottom: '16px'` →
   `marginTop: '16px'`. Also normalize `ThronesStrip.tsx:88` `marginTop: '14px'` → `'16px'`
   and `ActivityTicker.tsx:95` `marginTop: '18px'` → `'16px'`.
3. **Unify Home section headers.** Set `fontSize:'0.85rem', fontWeight:800, marginBottom:8` at
   `PvPGamesInbox.tsx:296-300` (add color `#a5b4fc` or keep white), `DethroneBanner.tsx:76`,
   `BeatenBanner.tsx:49`, `ThronesStrip.tsx:100-104` (already conformant — reference).
4. **De-conflict emoji.** `DethroneBanner.tsx:77` `⚔️` → `👑`; `BeatenBanner.tsx:50` `⚔️` → `🏁`;
   `SolutionCard.tsx:184` `🟣` → `🔵`.
5. **Grow dismiss/close targets.**
   - `DethroneBanner.tsx:79-91` and `BeatenBanner.tsx:52-64`: add `padding:'8px', margin:'-8px -8px -8px auto', fontSize:'1rem'` (replaces `marginLeft:'auto'`)
   - `PvPGamesInbox.tsx:428` `padding: confirming ? '3px 10px' : '3px 8px'` → `'7px 12px' : '7px 10px'`
6. **GameHUD toolbar: label + fit + safe area.**
   - `GameHUD.tsx:223-230` add `aria-label={label}` and `title={label}` to the ActionButton `<button>`
   - `GameHUD.tsx:365-377` (`styles.actionBar`) add `maxWidth: 'calc(100vw - 12px)'`, change `gap:'12px'` → `'8px'`, `bottom:'20px'` → `'max(20px, env(safe-area-inset-bottom))'`
   - `GameHUD.tsx:378-391` (`styles.actionButton`) `padding:'12px 16px'` → `'10px 12px'`
7. **Game menu target.** `GamePage.tsx:4319-4320` `size={28} iconSize={18}` → `size={44} iconSize={20}`.
8. **iOS zoom inputs.** `GamePage.tsx:3479` and `ChallengeChoiceModal.tsx:249` `fontSize:'0.78rem'` → `'16px'`; `GamePage.tsx:3325` `fontSize:'15px'` → `'16px'`.
9. **Sign-in hover bug.** `HomePage.tsx:525` `'rgba(255,255,255,0.2)'` → `tokens.gradient.brand`.
10. **Contrast floors.** `GameSetupModal.tsx:891` `rgba(255,255,255,0.4)` → `tokens.text.onGradientMuted`;
    `GameEndModal.tsx:342` `rgba(255,255,255,0.4)` → `'rgba(255,255,255,0.6)'`;
    `HomePage.tsx:742,748` `rgba(255,255,255,0.55)` → `tokens.text.onGradientMuted`.
11. **AgeGateModal ladder + brand.** `AgeGateModal.tsx:42` `zIndex:1100` → `tokens.z.modalBackdrop`;
    `:49` `'linear-gradient(135deg,#1e88e5,#42a5f5)'` → `tokens.gradient.info` (import tokens).
12. **Gallery title responsive.** `GalleryPage.tsx:499` `fontSize:'2.5rem'` → `'clamp(1.8rem, 6vw, 2.5rem)'`.
13. **Gallery touch targets.** `GalleryPage.tsx:598` chips `padding:'5px 12px'` → `'8px 14px'`;
    `:644` sort trigger `padding:'6px 12px'` → `'8px 14px'`.
14. **Gallery FAB safe area.** `GalleryPage.tsx:462-463` `bottom:'24px'` →
    `'max(24px, env(safe-area-inset-bottom))'`, `right:'24px'` → `'max(24px, env(safe-area-inset-right))'`.
15. **Admin card buttons to tokens.** `PuzzleCard.tsx:375` → `tokens.gradient.info`;
    `PuzzleCard.tsx:409` → `tokens.gradient.danger`.
16. **ActivityTicker rows.** `ActivityTicker.tsx:124` `padding:'4px 0'` → `'8px 0'`; add
    `tabIndex={0}` + Enter/Space `onKeyDown` (copy PvPGamesInbox.tsx:315-319 pattern).

### P1 — worthwhile restructures (~a day each)

1. **GameSetupModal → ModalBase** (shell only; keep internals). Kills the slate-gray one-off,
   gains focus trap/Escape/scroll-lock on the app's most-seen configuration surface.
2. **Extract `PvPOverlayCard`** and route the five GamePage overlays (join / waiting /
   pending / how-to ×2) through it; dedupe the twin How-to-Play modals into one component.
3. **Home "my stuff" SectionCard:** one shared card component (width, header row with emoji +
   title + optional ✕, row spec) consumed by inbox/dethrone/beaten/thrones/ticker. Consider
   merging DethroneBanner + BeatenBanner — identical layout, adjacent placement, same job
   ("someone outdid you → one-tap revenge").
4. **Gallery header responsive pass:** tabs fixed row; category chips in a horizontal-scroll
   strip (reuse ThronesStrip's hidden-scrollbar CSS); extract shared `SortMenu`.
5. **Migrate legacy gallery modals** (UserBadges, ShareOptions, About×2, Edit×2) + Home terms
   modal to ModalBase.
6. **Coin flip opponent name** (GamePage.tsx:3671-3682): pick name by `pvpCoinFlipResult.myNumber`.
7. **ChatDrawer:** correct the `top:56px` header assumption for the game screen; add
   safe-area bottom padding inside the drawer content.

### P2 — design questions for the owner

1. **Desktop Home:** a single 400-500px column centered on wide screens leaves 60%+ empty
   gradient. Two-column (hero left, my-stuff right) or capped 640px column with the strips
   in a 2-up grid?
2. **Gallery card primary action:** cards have like/users/share but no visible "Play". Is
   tap-to-viewer discoverable enough for WhatsApp-arrival users, or should cards carry a
   Play pill (the challenge cards' 🏁 Race pill proves the pattern)?
3. **Toolbar labels:** keep icon-only (with the new aria/title) or show 0.65rem labels under
   icons? Labels cost ~12px height but remove the 🙈/🔍 guessing game for new players.
4. **Dark-surface consolidation:** bless one dark family (recommend GameEndModal's
   `#1e1e2e→#2d2d44`) and add it to tokens; retire the slate `#2d3748` family as files are
   touched.
5. **Profile dropdown → settings modal** (H8): worth it before more preferences accrue.
6. **Codify the Home tint-card grammar** in tokens (gold=throne, red=beaten, indigo=PvP,
   neutral=ambient) so the next strip lands on-system automatically.
