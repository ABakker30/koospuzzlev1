// BlocklistCard — admin manager for public.moderation_blocklist (migration
// 20260805_moderation.sql). Words are matched server-side by the
// contains_disallowed_text() trigger on NEW writes (puzzle text, usernames,
// solver names); the client mirrors the list for instant pre-check UX.
// Admin-only English (like the rest of /admin); degrades to a "run the
// migration" note while the table doesn't exist.

import React, { useEffect, useState } from 'react';
import {
  addBlocklistWord,
  listBlocklistAdmin,
  removeBlocklistWord,
} from '../../services/moderationService';

const card: React.CSSProperties = {
  background: 'rgba(255,255,255,0.10)',
  borderRadius: 16,
  padding: '16px 18px',
};

const BlocklistCard: React.FC = () => {
  const [words, setWords] = useState<string[]>([]);
  const [missingTable, setMissingTable] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [expanded, setExpanded] = useState(false);

  const load = async () => {
    const res = await listBlocklistAdmin();
    setWords(res.words);
    setMissingTable(res.missingTable);
    setError(res.missingTable ? null : res.error);
    setLoaded(true);
  };

  useEffect(() => {
    load();
  }, []);

  const handleAdd = async () => {
    const word = draft.trim().toLowerCase();
    setError(null);
    if (!word) return;
    if (!/^[a-z]+$/.test(word)) {
      setError('Letters only (a–z) — the matcher normalizes text before comparing.');
      return;
    }
    setBusy(true);
    const err = await addBlocklistWord(word);
    setBusy(false);
    if (err) {
      setError(err);
      return;
    }
    setDraft('');
    setWords((prev) => (prev.includes(word) ? prev : [...prev, word].sort()));
  };

  const handleRemove = async (word: string) => {
    setBusy(true);
    const err = await removeBlocklistWord(word);
    setBusy(false);
    if (err) {
      setError(err);
      return;
    }
    setWords((prev) => prev.filter((w) => w !== word));
  };

  const COLLAPSED_COUNT = 30;
  const visible = expanded ? words : words.slice(0, COLLAPSED_COUNT);

  return (
    <div style={{ ...card, marginTop: 20 }}>
      <div style={{ fontWeight: 700, marginBottom: 2 }}>
        🚫 Blocklist{' '}
        <span style={{ fontSize: '0.8rem', fontWeight: 600, opacity: 0.65 }}>
          {loaded && !missingTable ? `${words.length} words` : ''}
        </span>
      </div>
      <div style={{ fontSize: '0.8rem', opacity: 0.65, marginBottom: 10 }}>
        Enforced server-side (DB trigger) on new puzzle text, usernames and solver names —
        existing content is not re-checked. The client mirrors this list for instant
        feedback (≤10 min cache).
      </div>

      {missingTable && (
        <div style={{ opacity: 0.75, fontSize: '0.88rem' }}>
          Blocklist table missing — run 20260805_moderation.sql in Supabase to enable moderation.
        </div>
      )}

      {!missingTable && (
        <>
          <div style={{ display: 'flex', gap: 8, marginBottom: 10, flexWrap: 'wrap' }}>
            <input
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleAdd();
              }}
              placeholder="add word (letters only)"
              style={{
                flex: '1 1 160px',
                minWidth: 120,
                background: 'rgba(0,0,0,0.3)',
                border: '1px solid rgba(255,255,255,0.25)',
                borderRadius: 8,
                color: '#fff',
                padding: '6px 10px',
                fontSize: '0.85rem',
              }}
            />
            <button
              onClick={handleAdd}
              disabled={busy || !draft.trim()}
              style={{
                background: 'rgba(255,255,255,0.15)',
                border: '1px solid rgba(255,255,255,0.25)',
                borderRadius: 8,
                color: '#fff',
                padding: '6px 14px',
                cursor: busy || !draft.trim() ? 'not-allowed' : 'pointer',
                fontSize: '0.85rem',
                fontWeight: 700,
              }}
            >
              + Add
            </button>
          </div>

          {error && (
            <div
              style={{
                background: 'rgba(239,68,68,0.25)',
                borderRadius: 8,
                padding: '6px 10px',
                fontSize: '0.82rem',
                marginBottom: 8,
              }}
            >
              {error}
            </div>
          )}

          {!loaded && <div style={{ opacity: 0.7, fontSize: '0.88rem' }}>Loading…</div>}
          {loaded && words.length === 0 && (
            <div style={{ opacity: 0.7, fontSize: '0.88rem' }}>No words yet.</div>
          )}

          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {visible.map((w) => (
              <span
                key={w}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 4,
                  background: 'rgba(0,0,0,0.3)',
                  border: '1px solid rgba(255,255,255,0.15)',
                  borderRadius: 999,
                  padding: '2px 6px 2px 10px',
                  fontSize: '0.8rem',
                }}
              >
                {w}
                <button
                  onClick={() => handleRemove(w)}
                  disabled={busy}
                  title={`Remove “${w}”`}
                  style={{
                    background: 'transparent',
                    border: 'none',
                    color: 'rgba(255,255,255,0.6)',
                    cursor: 'pointer',
                    fontSize: '0.85rem',
                    padding: '0 2px',
                    lineHeight: 1,
                  }}
                >
                  ✕
                </button>
              </span>
            ))}
          </div>
          {words.length > COLLAPSED_COUNT && (
            <button
              onClick={() => setExpanded((e) => !e)}
              style={{
                background: 'transparent',
                border: 'none',
                color: 'rgba(255,255,255,0.65)',
                cursor: 'pointer',
                fontSize: '0.8rem',
                padding: 0,
                marginTop: 8,
                fontWeight: 600,
              }}
            >
              {expanded ? 'Show fewer' : `Show all ${words.length}`}
            </button>
          )}
        </>
      )}
    </div>
  );
};

export default BlocklistCard;
