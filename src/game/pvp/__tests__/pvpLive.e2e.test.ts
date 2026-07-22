// Headless two-client PvP end-to-end test — plays a real match against the
// LIVE Supabase backend so nobody needs two humans and two browsers to know
// whether PvP works. The guest side runs the app's actual code (ensurePvPGuest,
// joinPvPSession, submitMove, chat, replay fetch) on the shared client
// singleton; the host side is a second raw client whose writes mirror
// createPvPSession/submitMove field-for-field (kept in sync by hand — if those
// functions change shape, update the mirrors here).
//
// What it proves, in order:
//   1. a signed-out guest can see a waiting invite (RLS join surface)
//   2. the guest can join and the session activates
//   3. a guest move reaches the HOST via realtime (INSERT + session UPDATE),
//      with measured latency
//   4. a host move reaches the GUEST via realtime (the app's subscribeToMoves)
//   5. chat delivers live host<-guest and history reads back both ways
//   6. the moderation trigger rejects a blocklisted chat message
//   7. the move history replays: both moves, correct cells, correct order
//
// HOW TO RUN (never runs in normal gates — it writes to prod):
//   1. Create a confirmed test account once (Supabase dashboard → Auth →
//      Add user → email pvp-tester@koospuzzle.com, any strong password,
//      check "Auto Confirm").
//   2. In .env.local add:
//        VITE_TEST_PVP_EMAIL=pvp-tester@koospuzzle.com
//        VITE_TEST_PVP_PASSWORD=<the password>
//   3. PowerShell:  $env:PVP_E2E='1'; npm run test:pvp
//      bash:        PVP_E2E=1 npm run test:pvp
//
// Each run creates one anonymous guest user ("E2E Guest") and one session
// (abandoned on teardown). Occasional cleanup, as admin in the SQL editor:
//   delete from public.game_sessions where puzzle_name = 'E2E harness match';
//   delete from public.users where username = 'E2E Guest';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const RUN =
  process.env.PVP_E2E === '1' &&
  !!import.meta.env.VITE_TEST_PVP_EMAIL &&
  !!import.meta.env.VITE_TEST_PVP_PASSWORD;

// Public puzzle "32 2d" — a single-layer FCC slab that the two hardcoded
// placements below are known-valid on (taken from a real match).
const PUZZLE_ID = 'c0037240-f96d-408d-a0c0-33d72a60aef1';
const GUEST_PIECE = {
  pieceId: 'E',
  orientationId: 'E-46',
  cells: [
    { i: 0, j: 5, k: -1 },
    { i: 0, j: 5, k: 0 },
    { i: 0, j: 5, k: 1 },
    { i: 0, j: 4, k: 2 },
  ],
};
const HOST_PIECE = {
  pieceId: 'F',
  orientationId: 'F-10',
  cells: [
    { i: 0, j: 3, k: 2 },
    { i: 0, j: 4, k: 1 },
    { i: 0, j: 4, k: 0 },
    { i: 0, j: 3, k: 1 },
  ],
};

const REALTIME_TIMEOUT_MS = 12_000;

/** Await a value delivered by a callback, or fail after `ms`. */
function waitFor<T>(label: string, ms = REALTIME_TIMEOUT_MS) {
  let resolve!: (v: T) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    setTimeout(() => rej(new Error(`Timed out after ${ms}ms waiting for ${label}`)), ms);
  });
  return { promise, resolve };
}

describe.runIf(RUN)('PvP live end-to-end (prod backend)', () => {
  let host: SupabaseClient;
  let hostId: string;
  let guestId: string;
  let sessionId: string;
  let inviteCode: string;

  // Imported dynamically so a skipped run never touches the app's supabase
  // singleton (which throws without VITE_ env).
  let app: {
    supabase: SupabaseClient;
    ensurePvPGuest: typeof import('../guestAuth').ensurePvPGuest;
    joinPvPSession: typeof import('../pvpApi').joinPvPSession;
    submitMove: typeof import('../pvpApi').submitMove;
    getSessionMoves: typeof import('../pvpApi').getSessionMoves;
    subscribeToMoves: typeof import('../pvpApi').subscribeToMoves;
    sendGameMessage: typeof import('../gameMessages').sendGameMessage;
    fetchChatHistory: typeof import('../gameMessages').fetchChatHistory;
    subscribeToGameMessages: typeof import('../gameMessages').subscribeToGameMessages;
  };

  const unsubs: Array<() => void> = [];

  beforeAll(async () => {
    const [{ supabase }, guestAuth, pvpApi, gameMessages] = await Promise.all([
      import('../../../lib/supabase'),
      import('../guestAuth'),
      import('../pvpApi'),
      import('../gameMessages'),
    ]);
    app = {
      supabase,
      ensurePvPGuest: guestAuth.ensurePvPGuest,
      joinPvPSession: pvpApi.joinPvPSession,
      submitMove: pvpApi.submitMove,
      getSessionMoves: pvpApi.getSessionMoves,
      subscribeToMoves: pvpApi.subscribeToMoves,
      sendGameMessage: gameMessages.sendGameMessage,
      fetchChatHistory: gameMessages.fetchChatHistory,
      subscribeToGameMessages: gameMessages.subscribeToGameMessages,
    };

    // --- Host: dedicated password account on a second client ---
    host = createClient(
      import.meta.env.VITE_SUPABASE_URL,
      import.meta.env.VITE_SUPABASE_ANON_KEY,
      { auth: { persistSession: false, autoRefreshToken: true } }
    );
    const { data: hostAuth, error: hostErr } = await host.auth.signInWithPassword({
      email: import.meta.env.VITE_TEST_PVP_EMAIL,
      password: import.meta.env.VITE_TEST_PVP_PASSWORD,
    });
    if (hostErr || !hostAuth.user) {
      throw new Error(
        `Host sign-in failed (${hostErr?.message}). Create the test account per the header comment.`
      );
    }
    hostId = hostAuth.user.id;
    // The app creates users rows on login; a dashboard-created test account
    // has none, so mirror the guest upsert (same NOT NULL columns).
    const { error: hostRowErr } = await host.from('users').upsert(
      {
        id: hostId,
        email: import.meta.env.VITE_TEST_PVP_EMAIL,
        username: 'E2E Host',
        preferredlanguage: 'English',
        termsaccepted: true,
      },
      { onConflict: 'id' }
    );
    if (hostRowErr) throw new Error(`Host users row upsert failed: ${hostRowErr.message}`);

    // --- Guest: the app's REAL guest flow on the shared singleton ---
    const guest = await app.ensurePvPGuest('E2E Guest');
    guestId = guest.id;

    // --- Host creates the invite (mirrors createPvPSession's insert) ---
    inviteCode = `E2${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
    const { data: session, error: createErr } = await host
      .from('game_sessions')
      .insert({
        puzzle_id: PUZZLE_ID,
        puzzle_name: 'E2E harness match',
        player1_id: hostId,
        player1_name: 'E2E Host',
        player1_avatar_url: null,
        status: 'waiting',
        current_turn: 2, // guest moves first — deterministic for the test
        first_player: 2,
        timer_seconds: 0, // untimed: invitee starts immediately, no clocks
        player1_time_remaining_ms: 0,
        player2_time_remaining_ms: 0,
        board_state: [],
        inventory_state: {},
        placed_count: {},
        hint_limit: 4,
        check_limit: 4,
        player1_hints_used: 0,
        player2_hints_used: 0,
        player1_checks_used: 0,
        player2_checks_used: 0,
        is_simulated: false,
        invite_code: inviteCode,
        invite_expires_at: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
        player1_last_heartbeat: new Date().toISOString(),
      })
      .select()
      .single();
    if (createErr || !session) {
      throw new Error(`Host session create failed: ${createErr?.message}`);
    }
    sessionId = session.id;
  }, 60_000);

  afterAll(async () => {
    for (const u of unsubs.splice(0)) u();
    if (host && sessionId) {
      await host
        .from('game_sessions')
        .update({ status: 'abandoned', ended_at: new Date().toISOString() })
        .eq('id', sessionId);
    }
    await app?.supabase.auth.signOut().catch(() => {});
    await host?.auth.signOut().catch(() => {});
  }, 30_000);

  it('guest can see the waiting invite (RLS join surface)', async () => {
    const { data } = await app.supabase
      .from('game_sessions')
      .select('id, status, invite_code')
      .eq('invite_code', inviteCode)
      .maybeSingle();
    expect(data?.id).toBe(sessionId);
    expect(data?.status).toBe('waiting');
  });

  it('guest joins and the session activates', async () => {
    const joined = await app.joinPvPSession(inviteCode, guestId, 'E2E Guest', null);
    expect(joined, 'joinPvPSession returned null').toBeTruthy();
    expect(joined!.id).toBe(sessionId);
    expect(joined!.status).toBe('active');
    expect(joined!.player2_id).toBe(guestId);
  });

  it('guest move reaches the host via realtime (INSERT + session UPDATE)', async () => {
    const gotMove = waitFor<any>('game_moves INSERT on host');
    const gotTurn = waitFor<any>('game_sessions UPDATE on host');
    const t0 = Date.now();

    const moveCh = host
      .channel(`e2e-host-moves-${sessionId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'game_moves', filter: `session_id=eq.${sessionId}` },
        (p) => gotMove.resolve(p.new)
      )
      .subscribe();
    const sessCh = host
      .channel(`e2e-host-session-${sessionId}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'game_sessions', filter: `id=eq.${sessionId}` },
        (p) => {
          if (p.new.current_turn === 1) gotTurn.resolve(p.new);
        }
      )
      .subscribe();
    unsubs.push(() => host.removeChannel(moveCh), () => host.removeChannel(sessCh));

    // Give the channels a beat to finish joining before the write.
    await new Promise((r) => setTimeout(r, 2000));

    const move = await app.submitMove({
      sessionId,
      playerNumber: 2,
      moveType: 'place',
      pieceId: GUEST_PIECE.pieceId,
      orientationId: GUEST_PIECE.orientationId,
      cells: GUEST_PIECE.cells,
      scoreDelta: 1,
      boardStateAfter: [
        {
          uid: `pp-e2e-guest`,
          pieceId: GUEST_PIECE.pieceId,
          orientationId: GUEST_PIECE.orientationId,
          cells: GUEST_PIECE.cells,
          placedAt: Date.now(),
          placedBy: 2,
          source: 'manual',
        } as any,
      ],
      timeSpentMs: 1000,
      playerTimeRemainingMs: 0,
    });
    expect(move, 'submitMove returned null').toBeTruthy();

    const received = await gotMove.promise;
    const latency = Date.now() - t0;
    expect(received.move_number).toBe(1);
    expect(received.piece_id).toBe('E');
    expect(received.player_number).toBe(2);

    const turn = await gotTurn.promise;
    expect(turn.current_turn).toBe(1);
    expect(turn.player2_score).toBe(1);
    // eslint-disable-next-line no-console
    console.log(`   ↳ guest→host realtime latency: ${latency}ms (incl. 2s join grace)`);
  }, 30_000);

  it('host move reaches the guest via the app subscribeToMoves', async () => {
    const gotMove = waitFor<any>('game_moves INSERT on guest');
    const t0 = Date.now();
    unsubs.push(app.subscribeToMoves(sessionId, (m) => gotMove.resolve(m)));
    await new Promise((r) => setTimeout(r, 2000));

    // Mirror of submitMove for the host identity (raw client).
    const { data: sess } = await host.from('game_sessions').select('*').eq('id', sessionId).single();
    const { count } = await host
      .from('game_moves')
      .select('*', { count: 'exact', head: true })
      .eq('session_id', sessionId);
    const moveNumber = (count || 0) + 1;
    const { error: insErr } = await host.from('game_moves').insert({
      session_id: sessionId,
      player_number: 1,
      player_id: hostId,
      move_number: moveNumber,
      move_type: 'place',
      piece_id: HOST_PIECE.pieceId,
      orientation_id: HOST_PIECE.orientationId,
      cells: HOST_PIECE.cells,
      score_delta: 1,
      board_state_after: [
        ...(sess!.board_state || []),
        {
          uid: 'pp-e2e-host',
          pieceId: HOST_PIECE.pieceId,
          orientationId: HOST_PIECE.orientationId,
          cells: HOST_PIECE.cells,
          placedAt: Date.now(),
          placedBy: 1,
          source: 'manual',
        },
      ],
      time_spent_ms: 1000,
      player_time_remaining_ms: 0,
    });
    expect(insErr).toBeNull();
    await host
      .from('game_sessions')
      .update({
        current_turn: 2,
        player1_score: (sess!.player1_score || 0) + 1,
        turn_started_at: new Date().toISOString(),
      })
      .eq('id', sessionId);

    const received = await gotMove.promise;
    expect(received.move_number).toBe(moveNumber);
    expect(received.piece_id).toBe('F');
    expect(received.player_number).toBe(1);
    // eslint-disable-next-line no-console
    console.log(`   ↳ host→guest realtime latency: ${Date.now() - t0}ms (incl. 2s join grace)`);
  }, 30_000);

  it('chat delivers live and history reads back for both players', async () => {
    const gotMsg = waitFor<any>('game_messages INSERT on host');
    const ch = host
      .channel(`e2e-host-chat-${sessionId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'game_messages', filter: `session_id=eq.${sessionId}` },
        (p) => gotMsg.resolve(p.new)
      )
      .subscribe();
    unsubs.push(() => host.removeChannel(ch));
    await new Promise((r) => setTimeout(r, 2000));

    const sent = await app.sendGameMessage(sessionId, guestId, 'E2E: hello from the guest');
    expect(sent.ok, `sendGameMessage failed: ${(sent as any).code}`).toBe(true);
    const received = await gotMsg.promise;
    expect(received.text).toBe('E2E: hello from the guest');

    const { error: replyErr } = await host
      .from('game_messages')
      .insert({ session_id: sessionId, sender_id: hostId, text: 'E2E: hello back from the host' });
    expect(replyErr).toBeNull();

    const history = await app.fetchChatHistory(sessionId);
    expect(history.available).toBe(true);
    const texts = (history as any).messages.map((m: any) => m.text);
    expect(texts).toContain('E2E: hello from the guest');
    expect(texts).toContain('E2E: hello back from the host');
  }, 30_000);

  it('moderation trigger rejects a blocklisted chat message', async () => {
    const sent = await app.sendGameMessage(sessionId, guestId, 'this contains fuck which is blocked');
    expect(sent.ok).toBe(false);
    expect((sent as any).code).toBe('disallowed_content');
  });

  it('move history replays: both moves, correct cells, correct order', async () => {
    const moves = await app.getSessionMoves(sessionId);
    expect(moves).toBeTruthy();
    expect(moves!.length).toBe(2);
    expect(moves![0].move_number).toBe(1);
    expect(moves![0].piece_id).toBe('E');
    expect(moves![0].cells).toEqual(GUEST_PIECE.cells);
    expect(moves![1].move_number).toBe(2);
    expect(moves![1].piece_id).toBe('F');
    expect(moves![1].cells).toEqual(HOST_PIECE.cells);
    // The final board snapshot carries both pieces (8 cells).
    const lastBoard = moves![1].board_state_after as any[];
    expect(lastBoard.flatMap((p) => p.cells).length).toBe(8);
  });
});

describe.runIf(!RUN)('PvP live end-to-end (skipped)', () => {
  it('is disabled — set PVP_E2E=1 and VITE_TEST_PVP_EMAIL/PASSWORD in .env.local', () => {
    expect(true).toBe(true);
  });
});
