# Plan: Design tokens + `<ModalBase>`

Status: Phase 0–1 in progress (tokens + ModalBase + 3-modal pilot). Phases 2–3 not started.

## Goals / non-goals
- **Goal:** one source of truth for color/gradient/spacing/radius/z-index, and one modal
  primitive that bakes in accessibility (ESC, focus trap, `role="dialog"`, scroll-lock,
  focus restore) — eliminating the ~45-modal / 35-gradient duplication.
- **Non-goals (separate tracks):** replacing emoji with an icon set; the
  touch-target/breakpoint pass; converting inline styles to CSS classes wholesale.

## Background (from the UI/UX review)
- `src/styles/tokens.ts` existed but had **0 importers** and used a blue accent
  (`#2f6ff4`) the app doesn't actually use (real brand is purple `#667eea`).
- The signature gradient `linear-gradient(135deg,#667eea 0%,#764ba2 100%)` is hardcoded
  in **35 files**; ~8 distinct gradient roles in total (with case-duplication like
  `#10B981` vs `#10b981`).
- **45 modal files**, **24** use `useDraggable`; each re-implements backdrop, animation,
  close button, and webkit scrollbar styles.

## Part A — tokens.ts
Rewritten with the palette actually in use: `gradient` (brand/brandTri/success/info/
warning/danger/accent/violet), `color`, contrast-safe `text.onGradient*` (replacing
`rgba(255,255,255,0.6)` which fails WCAG AA), `space()` (4px scale), `radius`, `shadow`,
`z` (z-index ladder), `breakpoint`. TS object (not CSS variables) because the app is
~100% inline styles, so a TS object is immediately usable with zero refactor.

## Part B — `<ModalBase>`
Single primitive (`src/components/ModalBase.tsx`) absorbing every variation found:
transparent-vs-dimmed backdrop, draggable-vs-fixed, scrollable body, footer actions,
size presets, surface/body-color overrides (for light-surface outliers like InfoModal).

Baked in for all modals: `role="dialog"` / `aria-modal` / `aria-labelledby`,
Escape-to-close, focus trap, background scroll-lock, focus restore, single portal at a
token-driven z-index, one shared `ModalHeader` + `ModalCloseButton`, one shared
scrollbar style, optional drag via the existing `useDraggable()` (default-off on touch).

```tsx
<ModalBase isOpen={open} onClose={close} title="Choose Solution" size="sm">
  {rows}
</ModalBase>
```

## Migration sequencing (each phase independently shippable + build-verified)
- **Phase 0:** land tokens + ModalBase (nothing consumes them → zero behavior change).
- **Phase 1 (pilot):** migrate `SolutionPickerModal` (list), `EditMetadataModal` (form),
  `InfoModal` (draggable + light surface) to validate the API across the real axes.
- **Phase 2:** batch-migrate the remaining ~42 modals, grouped by folder.
- **Phase 3:** scripted tokenization of gradients/colors app-wide; fix low-contrast text.

Phases 2–3 are large diffs → separate PRs, not auto-deployed without review.

## Decisions (locked)
1. Token format: **TS object** (CSS variables optional later for the few `.css` files).
2. Draggable on mobile: **keep the prop, default-off on touch**.
3. First PR scope: **Phase 0–1 only** (reviewable before touching 42 files).
