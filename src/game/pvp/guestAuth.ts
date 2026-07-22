// Guest identity for invited PvP players — no account required.
//
// An invitee who isn't signed in gets a Supabase *anonymous* session
// (auth.signInAnonymously) plus a minimal public.users row so the
// game_sessions / game_moves foreign keys and live name lookups work.
// AuthContext deliberately ignores anonymous sessions, so the rest of the
// app keeps treating guests as signed out — saving solves, hosting games,
// and the profile still ask for a real account.
import { supabase } from '../../lib/supabase';
import type { User } from '../../context/AuthContext';

// users.email is NOT NULL with a format CHECK; guests get a synthetic
// address that also marks the row as a guest identity server-side.
const guestEmail = (uid: string) =>
  `guest-${uid.replace(/-/g, '').slice(0, 16)}@guest.koospuzzle.com`;

function toGuestUser(uid: string, username: string): User {
  return {
    id: uid,
    email: '',
    username,
    preferredlanguage: 'English',
    region: null,
    termsaccepted: true,
    allownotifications: false,
    usertype: 'regular',
    registeredat: '',
    lastactiveat: '',
  };
}

/** Restore a guest identity from a persisted anonymous session, if any. */
export async function getExistingPvPGuest(): Promise<User | null> {
  const { data: { session } } = await supabase.auth.getSession();
  const authUser = session?.user;
  if (!authUser?.is_anonymous) return null;
  const { data } = await supabase
    .from('users')
    .select('username')
    .eq('id', authUser.id)
    .maybeSingle();
  if (!data?.username) return null;
  return toGuestUser(authUser.id, data.username);
}

/**
 * Sign the invitee in anonymously (reusing a persisted anonymous session)
 * and upsert their guest users row with the chosen display name.
 */
export async function ensurePvPGuest(name: string): Promise<User> {
  const username = name.trim();
  let { data: { session } } = await supabase.auth.getSession();
  if (!session?.user) {
    const { data, error } = await supabase.auth.signInAnonymously();
    if (error || !data.session) {
      throw new Error(error?.message || 'Anonymous sign-in unavailable');
    }
    session = data.session;
  }
  if (!session.user.is_anonymous) {
    // A real signed-in session should never reach the guest flow; don't
    // overwrite that account's users row.
    throw new Error('Already signed in with an account');
  }
  const uid = session.user.id;
  // users has NOT NULL columns beyond the identity fields (no defaults):
  // preferredlanguage + termsaccepted must be supplied or the insert 23502s
  // ("Couldn't set up a guest session"). Values mirror toGuestUser.
  const { error: upsertError } = await supabase
    .from('users')
    .upsert(
      {
        id: uid,
        email: guestEmail(uid),
        username,
        preferredlanguage: 'English',
        termsaccepted: true,
      },
      { onConflict: 'id' }
    );
  if (upsertError) throw new Error(upsertError.message);
  // Guest fallback name used across the app (and next visit's prefill).
  localStorage.setItem('user_preferences_username', username);
  return toGuestUser(uid, username);
}
