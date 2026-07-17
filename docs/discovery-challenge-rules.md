# Discovery Challenge — Official Rules (DRAFT for Anton's review)

> Status: draft, not yet published or linked in the app. Reward amounts,
> target puzzle, and dates are placeholders until Anton confirms them.
> When the challenge goes live this becomes a public page (e.g. /challenge-rules)
> linked from the challenge banner.

---

## The Discovery Challenge

In the 1980s, mathematician Koos Verhoeff put a reward on his hollow pyramid
puzzle: 1,000 guilders for a solution. That tradition returns.

**The first 10 people to discover a *new* solution to the [Hollow Pyramid]
win $100 each.**

## How it works

1. Open the challenge puzzle in Play mode and solve it yourself — tap groups
   of four connected spheres to place pieces until the shape is complete.
2. When you solve it, the app records exactly which piece types sit on which
   positions. That placement pattern is the solution's identity (its
   "signature").
3. Your solution is a **discovery** if its signature has never been recorded
   in the app before — by anyone, ever, including solutions found by
   computer search. Mirrored or rotated placements count as different
   solutions, so there are many discoveries waiting to be made.
4. Discoveries are counted in the order they are saved. The first 10
   eligible discoveries each win $100.

## What counts

A winning solution must be:

- **Solved by hand.** Only manual Play-mode solves are eligible. You must
  place every piece yourself.
- **Hint-free.** Using even one hint makes that solve ineligible (you can
  always try again with a fresh solve).
- **New.** Its signature must not match any solution already in the app —
  whether that earlier solution was found by hand, with hints, or by the
  auto-solver. Re-entering a solution you can see in the app's Explore view
  is not a discovery.
- **Saved while signed in.** We need an account to attach the win to and a
  way to contact you.
- **Solved after the challenge start date.** Solutions saved before
  [START DATE] do not count as entries — including your own earlier solves.
  Solutions solved with hints or with the auto-solver never count,
  no matter when they were made.

## Verification and payment

- Every candidate discovery is reviewed by hand before a prize is confirmed.
  We replay the solve move by move; solves that show machine-like entry
  patterns are disqualified. The reviewer's decision is final.
- Winners are contacted through their account email and paid by PayPal
  within 14 days of verification.
- One prize per person. Any taxes on a prize are the winner's responsibility.

## The fine print

- Free to enter; no purchase necessary. The app and the challenge puzzle are
  free for everyone.
- Open worldwide to individuals aged 18+ (or with a parent or guardian's
  permission), except where such contests are prohibited by law — void where
  prohibited.
- This is a contest of skill. There is no element of chance: every prize is
  awarded for verifiably being among the first to find a new solution.
- The sponsor is Anton Bakker. The sponsor may end or extend the challenge
  at any time; discoveries verified before any change is announced are
  honored.

---

## Implementation notes (not part of the public rules)

- "New" check: `solutions.signature` (sha256 of the canonical piece/cell
  set, migration `20260718_solution_signatures.sql`). A claim is a discovery
  iff no earlier-created row for the target puzzle has the same signature —
  **regardless of that earlier row's solution_type or hints**. Prior art is
  ALL solutions; eligibility to *win* is what's restricted to clean manual
  solves. This closes the copy-from-Explore loophole.
- Eligibility filter for a claim: `solution_type = 'manual'`,
  `hints_used = 0`, `placements_by_you = total_pieces`,
  `created_by is not null`, `created_at >= challenge start`.
- Review tool: ghost replay of `placed_pieces` timestamps (superhuman
  cadence check) before payout.
