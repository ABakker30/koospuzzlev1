// AdminGuide — collapsible in-page manual for the /admin promotion tooling.
// Admin-only English (like the rest of /admin), no i18n keys on purpose.
// Every step documents what the cards on THIS page actually do — if a card's
// behavior changes, update the matching section here.

import React, { useState } from 'react';
import { CONTEST_CAPS } from '../../constants/contest';

const card: React.CSSProperties = {
  background: 'rgba(255,255,255,0.10)',
  borderRadius: 16,
  padding: '16px 18px',
};

const Section: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => (
  <div style={{ marginTop: 14 }}>
    <div style={{ fontWeight: 700, fontSize: '0.92rem', marginBottom: 4 }}>{title}</div>
    <div style={{ fontSize: '0.86rem', opacity: 0.9, lineHeight: 1.55 }}>{children}</div>
  </div>
);

const Steps: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <ol style={{ margin: '4px 0 6px', paddingLeft: 22 }}>{children}</ol>
);

const Gotcha: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div
    style={{
      background: 'rgba(254,202,87,0.12)',
      border: '1px solid rgba(254,202,87,0.4)',
      borderRadius: 8,
      padding: '5px 10px',
      fontSize: '0.82rem',
      marginTop: 4,
    }}
  >
    ⚠️ {children}
  </div>
);

export const AdminGuide: React.FC = () => {
  const [open, setOpen] = useState(false);

  return (
    <div style={{ ...card, marginBottom: 20 }}>
      <button
        onClick={() => setOpen((o) => !o)}
        style={{
          background: 'transparent',
          border: 'none',
          color: '#fff',
          cursor: 'pointer',
          fontSize: '1rem',
          fontWeight: 700,
          padding: 0,
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          width: '100%',
          textAlign: 'left',
        }}
      >
        <span>{open ? '▾' : '▸'}</span>
        <span>📘 Admin guide — how to run promotions &amp; challenges</span>
      </button>

      {open && (
        <>
          <div style={{ fontSize: '0.8rem', opacity: 0.65, marginTop: 6 }}>
            Two separate systems live on this page: the 🏆 <b>Legacy Discovery Challenge</b> (one
            first-N-new-solutions bounty on a single puzzle — drives the puzzle banner, the
            /challenge-rules page and the 🎬 promo video) and the 🏁 <b>Contests</b> engine (many
            concurrent leaderboard contests, shown publicly on /contests). Both share the same
            caps: {CONTEST_CAPS.maxWinners} winners max · ${CONTEST_CAPS.maxPrizeUsd}/prize max ·
            ${CONTEST_CAPS.maxTotalUsd} total max (DB-enforced too).
          </div>

          <Section title="1 · Run the Discovery Challenge (🏆 card)">
            <Steps>
              <li>Pick the <b>Target puzzle</b> from the dropdown.</li>
              <li>Set <b>Prize per discovery (USD)</b> and <b>Winners</b> — the Pool line below turns red if the total exceeds the cap.</li>
              <li>Set <b>Starts</b> (required to enable) and optionally <b>Ends</b>.</li>
              <li>Write the <b>Custom message</b> — it appears on the puzzle banner, the rules page, and prefills the promo video's promotion text.</li>
              <li>Optionally add <b>Partner name</b> / <b>Partner URL</b> and upload a <b>Sponsor logo</b> (PNG/JPEG/WebP ≤2MB — shown labeled "Sponsored" on the banner, rules page and contest clips).</li>
              <li>Tick <b>Contest enabled</b> and hit <b>Save contest</b>.</li>
            </Steps>
            The status dot next to the card title tells you what players see: <b>● live</b> (green)
            = enabled + inside the date window → banner shows on the target puzzle;{' '}
            <b>● enabled, outside window</b> (amber) = saved but not started yet or already ended;{' '}
            <b>○ off</b> = disabled.
            <Gotcha>
              Enabling requires a target puzzle AND a start date — the Save button stays blocked
              (with the reason shown below it) until validation passes. Logo uploads also need a
              Save afterwards to apply.
            </Gotcha>
          </Section>

          <Section title="2 · Record the promo video (🎬)">
            <Steps>
              <li>In the 🏆 card, fill the 🎬 Promo video fields: <b>Kicker</b>, <b>Headline</b>, <b>Subline</b>, <b>Call to action</b>. Lines left empty are simply omitted from the clip.</li>
              <li>Hit <b>Save contest</b>.</li>
              <li>In the 📣 Announcement block, click <b>🎬 Record video</b> (or open the challenge puzzle's viewer yourself → menu → 🎬 Promo video — the menu item is admin-only).</li>
              <li>Adjust the <b>Promotion text</b> line if you like (prefilled from the custom message, max 90 chars, shown in quotes mid-frame).</li>
              <li><b>● Record 12s clip</b> → <b>⬇ Download</b>. Re-record as many takes as you like; change the viewer's environment preset for different styles.</li>
            </Steps>
            The clip is a vertical 9:16 video of the unsolved puzzle spinning, overlaid with ONLY
            the configured lines plus the koospuzzle.com watermark — no prize amounts ever. The
            sponsor logo (when uploaded) appears labeled "Sponsored"; if a partner name is set,
            "Brought to you by …" is added.
            <Gotcha>
              The recorder reads the SAVED config, not what's typed in the form — always Save
              before recording.
            </Gotcha>
          </Section>

          <Section title="3 · Solo game deeplink (🎯)">
            <Steps>
              <li>In the 🏆 card, pick a mode: <b>Off (viewer page)</b>, <b>Classic</b>, <b>Free Pieces</b>, or <b>Choose Pieces</b> (then tap at least one letter A–Y in the grid).</li>
              <li>Hit <b>Save contest</b>.</li>
              <li>Use <b>📋 Copy link</b> next to the shown URL to grab the deeplink.</li>
            </Steps>
            When configured, every contest "play" CTA — the rules-page button and the announcement's
            Play link — drops visitors straight into a solo game with those settings, no setup
            screen. It works for anonymous players (no account needed). "Off" keeps linking to the
            puzzle viewer as before.
            <Gotcha>
              Choose Pieces with zero letters selected blocks Save — pick at least one piece, or
              switch back to Off.
            </Gotcha>
          </Section>

          <Section title="4 · Verify &amp; pay winners (Claims list)">
            <Steps>
              <li>Watch the <b>Claims</b> list at the bottom of the 🏆 card — it shows claim number, solver and time, capped at the configured winner count.</li>
              <li>Open <b>replay</b> for each claim before paying — watch for machine-like cadence.</li>
              <li>Check the <b>18+ chip</b>: green ✓ = self-declared 18+, amber = not confirmed, grey = unknown.</li>
              <li>Pay outside the app (PayPal, by hand), then hit <b>Mark paid</b> — it toggles, so you can undo a mistake.</li>
            </Steps>
            <Gotcha>
              The 18+ chip is self-declared, not verified — verify age/identity manually before
              paying. The app never moves money.
            </Gotcha>
          </Section>

          <Section title="5 · Engine contests (🏁 card)">
            Use this for everything that isn't the single discovery bounty: multiple contests can
            run at once and are listed publicly on /contests. Three types:{' '}
            <b>New-puzzle popularity</b> (most distinct solvers of puzzles created in the window),{' '}
            <b>Solution rush</b> (most new discoveries on the target puzzle),{' '}
            <b>Speed trial</b> (fastest solo solve of the target puzzle). Lifecycle:{' '}
            <b>draft → live → ended → settled</b>.
            <Steps>
              <li><b>+ New contest</b> → pick the <b>Type</b> (locked after creation), give it a <b>Title</b> and a <b>Message</b> (shown on the contests page).</li>
              <li>Set <b>Starts</b>/<b>Ends</b>, <b>Prize per winner</b> (0 = no-prize promo for recognition only) and <b>Winners</b>.</li>
              <li>For rush/speed: paste the <b>Target puzzle id</b> and hit <b>Verify</b> to confirm it resolves to a real puzzle. Speed trials can set a <b>Palette</b>; popularity can require <b>Min distinct solvers</b>.</li>
              <li>Optionally add partner name/URL and a sponsor logo, then <b>Create contest</b> — it starts as a draft, invisible to players.</li>
              <li><b>Go live</b> when ready. Players see it on /contests while the window is open.</li>
              <li>After the window: <b>End now</b> → open <b>Standings</b> (top 10, winners flagged 🏆) → <b>Settle</b> to write the awards ledger.</li>
              <li><b>Awards</b> shows the ledger: replay links, 18+ chips, and <b>Mark paid</b> toggles — same manual-payment rule as the challenge.</li>
            </Steps>
            <Gotcha>
              Settle records the top entries from the Standings panel you have OPEN — open
              Standings first, then Settle. Only drafts can be deleted; edit is only available
              for draft and live contests.
            </Gotcha>
          </Section>

          <Section title="6 · Moderation (🚩 Reports &amp; 🚫 Blocklist)">
            <Steps>
              <li><b>🚩 Reports</b>: player flags on puzzles, solutions and usernames land here (badge = open count). Per report: jump to the target / watch the <b>replay</b>, then <b>✓ Resolve</b> with an optional note — or <b>🗑 Delete puzzle</b> for puzzle targets (permanent, cascades for everyone).</li>
              <li><b>🚫 Blocklist</b>: add lowercase letters-only words; they're enforced by a DB trigger on new puzzle text, usernames and solver names.</li>
            </Steps>
            <Gotcha>
              The blocklist applies to NEW writes only — existing content is not re-checked
              (report + resolve/delete is the tool for that). Clients mirror the list with up to a
              10-minute cache delay.
            </Gotcha>
          </Section>

          <Section title="7 · Tutorial (Show me how) (🎓 card)">
            <Steps>
              <li>For each of the three steps, pick a <b>Puzzle</b> from the dropdown.</li>
              <li>Choose the <b>Piece rules</b>: <b>Classic</b> (one of each), <b>Free Pieces</b> (any piece, unlimited), or <b>Choose Pieces</b> (then tap at least one letter A–Y).</li>
              <li>Hit <b>Save tutorial</b>. The <code>Opens:</code> line under each step previews the exact deep-link.</li>
            </Steps>
            <b>Step 1 feeds the home page</b> — it's what the “Show me how” / “Learn in 60 seconds”
            button launches, so keep it pointed at a live puzzle. A step whose puzzle was deleted
            shows a ⚠️ <b>Puzzle missing</b> warning until you repoint it. The lesson copy
            (title/instruction/praise) is fixed in code, not editable here.
            <Gotcha>
              If you pick <b>Choose Pieces</b>, the puzzle must actually be SOLVABLE with only those
              pieces — otherwise the lesson dead-ends. Save is blocked while any step has no puzzle,
              or a Choose Pieces step has zero letters selected.
            </Gotcha>
          </Section>
        </>
      )}
    </div>
  );
};

export default AdminGuide;
