// One-time backfill: tag every existing solution with is_physical
// (gravity-supported = a stable physical assembly order exists).
//
// HOW TO RUN: open the app on http://localhost:3000 (dev server, which talks
// to the same Supabase DB), sign in as the owner/admin, open the browser
// devtools console, paste this whole file, press Enter. It recomputes under
// the current (v5 canonical) orientation and updates rows you're allowed to
// write (RLS: your own solutions / admin). Safe to re-run; it's idempotent.

(async () => {
  const { supabase } = await import('/src/lib/supabase.ts');
  const puzzles = await import('/src/api/puzzles.ts');
  const phys = await import('/src/utils/physicalSupport.ts');

  const { data: rows, error } = await supabase
    .from('solutions')
    .select('id,puzzle_id,placed_pieces,is_physical');
  if (error) { console.error('fetch failed', error); return; }
  console.log(`backfill: ${rows.length} solutions`);

  const geomCache = new Map();
  let updated = 0, unchanged = 0, skipped = 0, failed = 0;

  for (let i = 0; i < rows.length; i++) {
    const s = rows[i];
    if (!s.placed_pieces || !s.placed_pieces.length) { skipped++; continue; }
    let cells = geomCache.get(s.puzzle_id);
    if (cells === undefined) {
      try { const p = await puzzles.getPuzzleById(s.puzzle_id); cells = p?.geometry ?? null; }
      catch { cells = null; }
      geomCache.set(s.puzzle_id, cells);
    }
    if (!cells) { skipped++; continue; }

    let isPhysical = false;
    try { isPhysical = !!phys.orderForPhysicalBuild(s.placed_pieces.map((pc) => ({ cells: pc.cells })), cells); }
    catch { isPhysical = false; }

    if (s.is_physical === isPhysical) { unchanged++; }
    else {
      const { error: upErr } = await supabase.from('solutions').update({ is_physical: isPhysical }).eq('id', s.id);
      if (upErr) { failed++; if (failed <= 3) console.warn('update failed', s.id, upErr.message); }
      else updated++;
    }
    if ((i + 1) % 25 === 0) console.log(`  ${i + 1}/${rows.length}  (updated ${updated}, unchanged ${unchanged}, failed ${failed})`);
  }
  console.log(`DONE: updated ${updated}, unchanged ${unchanged}, skipped ${skipped}, failed ${failed}`);
})();
