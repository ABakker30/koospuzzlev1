// beaten-digest — daily "someone beat your best" email, the comeback trigger.
//
// For every ranked solve (manual, Classic) saved in the last LOOKBACK hours,
// find users whose best on that puzzle it displaced, dedupe via
// beaten_notifications, and send each displaced user ONE email (their newest
// beat leads; up to 3 puzzles listed). Detection mirrors
// src/services/beatenService.ts — placements desc, then time asc.
//
// Deploy:  supabase functions deploy beaten-digest
// Secrets: RESEND_API_KEY (resend.com), optionally FROM_EMAIL
// Schedule (SQL editor, runs daily at 16:00 UTC):
//   select cron.schedule('beaten-digest', '0 16 * * *', $$
//     select net.http_post(
//       url := 'https://cpblvcajrvlqatniceap.supabase.co/functions/v1/beaten-digest',
//       headers := jsonb_build_object('Authorization', 'Bearer ' || '<SERVICE_ROLE_KEY>')
//     )
//   $$);
// Without RESEND_API_KEY the function logs what it WOULD send (dry run).

import { createClient } from 'npm:@supabase/supabase-js@2';

const LOOKBACK_HOURS = 26; // daily schedule + slack
const APP = 'https://koospuzzle.com';

type Row = {
  id: string;
  puzzle_id: string;
  created_by: string | null;
  solver_name: string | null;
  placements_by_you: number | null;
  duration_ms: number | null;
  created_at: string;
};

function better(a: Row, b: Row): number {
  const ap = a.placements_by_you, bp = b.placements_by_you;
  if (ap != null && bp != null && ap !== bp) return bp - ap;
  if ((ap != null) !== (bp != null)) return ap != null ? -1 : 1;
  const ad = a.duration_ms, bd = b.duration_ms;
  if (ad != null && bd != null && ad !== bd) return ad - bd;
  if ((ad != null) !== (bd != null)) return ad != null ? -1 : 1;
  return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
}

Deno.serve(async (req) => {
  // Only the scheduled/service caller may run this.
  const auth = req.headers.get('Authorization') ?? '';
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  if (!auth.includes(serviceKey)) {
    return new Response('forbidden', { status: 403 });
  }

  const db = createClient(Deno.env.get('SUPABASE_URL')!, serviceKey);
  const resendKey = Deno.env.get('RESEND_API_KEY');
  const from = Deno.env.get('FROM_EMAIL') ?? 'Koos Puzzle <onboarding@resend.dev>';
  const since = new Date(Date.now() - LOOKBACK_HOURS * 3600 * 1000).toISOString();

  // New ranked solves in the window.
  const { data: fresh, error: freshErr } = await db
    .from('solutions')
    .select('id, puzzle_id, created_by, solver_name, placements_by_you, duration_ms, created_at, puzzles(name)')
    .eq('solution_type', 'manual')
    .eq('piece_mode', 'unique')
    .gt('created_at', since)
    .not('created_by', 'is', null)
    .limit(500);
  if (freshErr) return new Response(freshErr.message, { status: 500 });
  if (!fresh?.length) return Response.json({ sent: 0, reason: 'no new solves' });

  // All ranked solves on the touched puzzles (to compute each user's best).
  const puzzleIds = [...new Set(fresh.map((r) => r.puzzle_id))];
  const { data: all, error: allErr } = await db
    .from('solutions')
    .select('id, puzzle_id, created_by, solver_name, placements_by_you, duration_ms, created_at')
    .in('puzzle_id', puzzleIds)
    .eq('solution_type', 'manual')
    .eq('piece_mode', 'unique')
    .not('created_by', 'is', null)
    .limit(5000);
  if (allErr) return new Response(allErr.message, { status: 500 });

  // Best per (puzzle, user), EXCLUDING solves in the window — the standings
  // the fresh solves displaced.
  const bestBefore = new Map<string, Row>(); // `${puzzle}:${user}` -> best
  for (const r of (all ?? []) as Row[]) {
    if (r.created_at > since) continue;
    const k = `${r.puzzle_id}:${r.created_by}`;
    const prev = bestBefore.get(k);
    if (!prev || better(r, prev) < 0) bestBefore.set(k, r);
  }

  // Who did each fresh solve displace?
  type Beat = { rival: Row & { puzzles?: { name?: string } }; puzzleName: string };
  const perUser = new Map<string, Beat[]>(); // displaced userId -> beats
  for (const rival of fresh as (Row & { puzzles?: { name?: string } })[]) {
    for (const [k, mine] of bestBefore) {
      const [pz, uid] = k.split(':');
      if (pz !== rival.puzzle_id || uid === rival.created_by) continue;
      if (better(rival, mine) < 0) {
        const arr = perUser.get(uid) ?? [];
        arr.push({ rival, puzzleName: rival.puzzles?.name ?? 'a puzzle' });
        perUser.set(uid, arr);
      }
    }
  }
  if (perUser.size === 0) return Response.json({ sent: 0, reason: 'no displacements' });

  let sent = 0;
  for (const [userId, beats] of perUser) {
    // Dedup: skip beats already notified.
    const rivalIds = beats.map((b) => b.rival.id);
    const { data: already } = await db
      .from('beaten_notifications')
      .select('solution_id')
      .eq('user_id', userId)
      .in('solution_id', rivalIds);
    const seen = new Set((already ?? []).map((r) => r.solution_id));
    const newBeats = beats.filter((b) => !seen.has(b.rival.id)).slice(0, 3);
    if (!newBeats.length) continue;

    // Respect the signup notification opt-in; need auth email.
    const { data: userRes } = await db.auth.admin.getUserById(userId);
    const email = userRes?.user?.email;
    const allow = userRes?.user?.user_metadata?.allowNotifications;
    if (!email || allow === false) continue;

    const lines = newBeats.map((b) => {
      const who = (b.rival.solver_name || 'Someone').split('@')[0];
      return `<p><strong>${who}</strong> just beat your best on <strong>${b.puzzleName}</strong> — <a href="${APP}/c/${b.rival.id}">race their exact solve</a> and take your spot back.</p>`;
    });
    const html = `
      <div style="font-family:sans-serif;max-width:520px">
        <h2>⚔️ You've been beaten</h2>
        ${lines.join('')}
        <p style="color:#666;font-size:13px">You're getting this because you allowed
        notifications on koospuzzle.com. Reply to this email to opt out.</p>
      </div>`;

    if (resendKey) {
      const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { Authorization: `Bearer ${resendKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          from,
          to: email,
          subject: '⚔️ Someone beat your Koos Puzzle best — reclaim your spot',
          html,
        }),
      });
      if (!res.ok) {
        console.error('resend failed', userId, await res.text());
        continue;
      }
    } else {
      console.log('[dry-run] would email', email, 'about', newBeats.length, 'beats');
    }

    await db
      .from('beaten_notifications')
      .upsert(newBeats.map((b) => ({ user_id: userId, solution_id: b.rival.id })));
    sent++;
  }

  return Response.json({ sent, users_considered: perUser.size, dry_run: !resendKey });
});
