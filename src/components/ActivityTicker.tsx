// ActivityTicker — the in-app half of the activity stream (viral plan §3):
// a compact "Latest" list on the home page mixing recent human solves (tap →
// race that solve's ghost) and fresh shapes (tap → view; "be the first!").
// Times localize via Intl.RelativeTimeFormat; no backend beyond two queries.

import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { supabase } from '../lib/supabase';
import { getUsernames } from '../services/usernameService';

type ActivityItem =
  | {
      kind: 'solve';
      id: string;
      name: string;
      puzzle: string;
      at: string;
    }
  | {
      kind: 'shape';
      id: string;
      puzzle: string;
      at: string;
    };

function relTime(iso: string, locale: string): string {
  const s = (Date.now() - new Date(iso).getTime()) / 1000;
  const rtf = new Intl.RelativeTimeFormat(locale, { numeric: 'always', style: 'narrow' });
  if (s < 3600) return rtf.format(-Math.max(1, Math.floor(s / 60)), 'minute');
  if (s < 86400) return rtf.format(-Math.floor(s / 3600), 'hour');
  return rtf.format(-Math.floor(s / 86400), 'day');
}

export const ActivityTicker: React.FC = () => {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const [items, setItems] = useState<ActivityItem[]>([]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [solvesRes, shapesRes] = await Promise.all([
          supabase
            .from('solutions')
            .select('id, solver_name, created_by, created_at, puzzles(name)')
            .eq('solution_type', 'manual')
            .order('created_at', { ascending: false })
            .limit(4),
          supabase
            .from('puzzles')
            .select('id, name, created_at')
            .eq('visibility', 'public')
            .order('created_at', { ascending: false })
            .limit(2),
        ]);
        const solves = (solvesRes.data ?? []) as any[];
        const names = await getUsernames(solves.map((s) => s.created_by));
        const merged: ActivityItem[] = [
          ...solves.map((s) => ({
            kind: 'solve' as const,
            id: s.id,
            name:
              (s.created_by && names.get(s.created_by)) ||
              s.solver_name?.split('@')[0] ||
              '—',
            puzzle: s.puzzles?.name ?? '…',
            at: s.created_at,
          })),
          ...((shapesRes.data ?? []) as any[]).map((p) => ({
            kind: 'shape' as const,
            id: p.id,
            puzzle: p.name,
            at: p.created_at,
          })),
        ]
          .sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime())
          .slice(0, 4);
        if (!cancelled) setItems(merged);
      } catch {
        /* the ticker is decoration — never surface errors */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (items.length === 0) return null;

  return (
    <div
      style={{
        marginTop: '16px',
        width: '100%',
        maxWidth: '500px',
        boxSizing: 'border-box',
        background: 'rgba(0,0,0,0.22)',
        borderRadius: '14px',
        padding: '10px 14px',
      }}
    >
      <div
        style={{
          fontSize: '0.7rem',
          textTransform: 'uppercase',
          letterSpacing: '0.1em',
          color: 'rgba(255,255,255,0.55)',
          marginBottom: '6px',
        }}
      >
        {t('activity.title')}
      </div>
      {items.map((item) => (
        <div
          key={`${item.kind}-${item.id}`}
          onClick={() =>
            navigate(item.kind === 'solve' ? `/c/${item.id}` : `/puzzles/${item.id}/view`)
          }
          role="link"
          tabIndex={0}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              navigate(item.kind === 'solve' ? `/c/${item.id}` : `/puzzles/${item.id}/view`);
            }
          }}
          style={{
            display: 'flex',
            alignItems: 'baseline',
            gap: '8px',
            padding: '8px 0',
            fontSize: '0.85rem',
            color: 'rgba(255,255,255,0.9)',
            cursor: 'pointer',
          }}
        >
          <span style={{ flexShrink: 0 }}>{item.kind === 'solve' ? '🧩' : '✨'}</span>
          <span
            style={{
              flex: 1,
              minWidth: 0,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {item.kind === 'solve'
              ? t('activity.solved', { name: item.name, puzzle: item.puzzle })
              : `${t('activity.newShape', { puzzle: item.puzzle })} — ${t('activity.beFirst')}`}
          </span>
          <span style={{ flexShrink: 0, color: 'rgba(255,255,255,0.45)', fontSize: '0.75rem' }}>
            {relTime(item.at, i18n.language)}
          </span>
        </div>
      ))}
    </div>
  );
};
