// Post-login return path — lets deep links (PvP invites ?join=CODE, challenge
// races) survive the sign-in round trip instead of dumping the user on home.
// sessionStorage so it survives the OAuth/magic-link redirect but not longer.

const KEY = 'postLoginRedirect';

export function setPostLoginRedirect(path: string): void {
  try {
    sessionStorage.setItem(KEY, path);
  } catch {
    /* storage unavailable — user just lands on the default page */
  }
}

export function consumePostLoginRedirect(): string | null {
  try {
    const v = sessionStorage.getItem(KEY);
    if (v) sessionStorage.removeItem(KEY);
    // Only same-app paths — never absolute URLs.
    return v && v.startsWith('/') ? v : null;
  } catch {
    return null;
  }
}
