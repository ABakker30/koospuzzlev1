// ReportModal — lightweight "flag this" flow over public.reports (migration
// 20260805_moderation.sql). Signed-in users pick a reason + optional note;
// signed-out users get a "sign in to report" hint. Rate-limit rejections
// (10/hr, DB trigger) and the pre-migration missing table both land on
// friendly messages — the modal never surfaces a raw DB error.

import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ModalBase } from './ModalBase';
import { useAuth } from '../context/AuthContext';
import {
  REPORT_REASONS,
  submitReport,
  type ReportReason,
  type ReportTargetType,
} from '../services/moderationService';

const NOTE_MAX = 500;

interface ReportModalProps {
  isOpen: boolean;
  onClose: () => void;
  targetType: ReportTargetType;
  targetId: string;
  /** Optional context line under the title (puzzle name, player name…). */
  targetLabel?: string;
  /** Pre-selected reason (e.g. 'offensive_name' from leaderboard rows). */
  defaultReason?: ReportReason;
}

export const ReportModal: React.FC<ReportModalProps> = ({
  isOpen,
  onClose,
  targetType,
  targetId,
  targetLabel,
  defaultReason = 'inappropriate',
}) => {
  const { t } = useTranslation();
  const { user } = useAuth();
  const [reason, setReason] = useState<ReportReason>(defaultReason);
  const [note, setNote] = useState('');
  const [sending, setSending] = useState(false);
  const [done, setDone] = useState(false);
  const [errorKey, setErrorKey] = useState<string | null>(null);

  const titleKey =
    targetType === 'puzzle' ? 'report.puzzle' : targetType === 'solution' ? 'report.solution' : 'report.user';

  const handleSubmit = async () => {
    if (sending) return;
    setSending(true);
    setErrorKey(null);
    const result = await submitReport({ targetType, targetId, reason, note });
    setSending(false);
    if (result.ok) {
      setDone(true);
    } else if (result.code === 'rate_limited') {
      setErrorKey('report.rateLimited');
    } else if (result.code === 'not_signed_in') {
      setErrorKey('report.signInHint');
    } else {
      // 'unavailable' (pre-migration) and generic errors read the same to
      // players — the report simply couldn't be sent right now.
      setErrorKey('report.failed');
    }
  };

  const fieldFont: React.CSSProperties = { fontSize: '0.95rem', color: '#fff' };

  return (
    <ModalBase
      isOpen={isOpen}
      onClose={onClose}
      title={t(titleKey)}
      subtitle={targetLabel}
      headerIcon="🚩"
      size="sm"
      footer={
        done ? (
          <button
            onClick={onClose}
            style={{
              background: 'rgba(255,255,255,0.2)',
              border: '1px solid rgba(255,255,255,0.35)',
              borderRadius: 8,
              color: '#fff',
              padding: '8px 18px',
              fontWeight: 700,
              cursor: 'pointer',
            }}
          >
            {t('button.close')}
          </button>
        ) : user ? (
          <>
            <button
              onClick={onClose}
              disabled={sending}
              style={{
                background: 'transparent',
                border: '1px solid rgba(255,255,255,0.35)',
                borderRadius: 8,
                color: '#fff',
                padding: '8px 16px',
                fontWeight: 600,
                cursor: sending ? 'not-allowed' : 'pointer',
              }}
            >
              {t('button.cancel')}
            </button>
            <button
              onClick={handleSubmit}
              disabled={sending}
              style={{
                background: sending
                  ? 'rgba(255,255,255,0.15)'
                  : 'linear-gradient(135deg, #f87171 0%, #dc2626 100%)',
                border: 'none',
                borderRadius: 8,
                color: '#fff',
                padding: '8px 18px',
                fontWeight: 700,
                cursor: sending ? 'not-allowed' : 'pointer',
              }}
            >
              {sending ? t('report.sending') : t('report.submit')}
            </button>
          </>
        ) : undefined
      }
    >
      {done ? (
        <div style={{ textAlign: 'center', padding: '8px 0' }}>
          <div style={{ fontSize: '2rem', marginBottom: 8 }}>✅</div>
          <div style={fieldFont}>{t('report.thanks')}</div>
        </div>
      ) : !user ? (
        <div style={{ textAlign: 'center', padding: '8px 0', ...fieldFont }}>
          {t('report.signInHint')}
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div>
            <div style={{ fontSize: '0.85rem', fontWeight: 700, marginBottom: 8, opacity: 0.9 }}>
              {t('report.reasonLabel')}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {REPORT_REASONS.map((r) => (
                <label
                  key={r}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 10,
                    padding: '8px 10px',
                    borderRadius: 8,
                    background: reason === r ? 'rgba(255,255,255,0.18)' : 'rgba(255,255,255,0.06)',
                    border: `1px solid ${reason === r ? 'rgba(255,255,255,0.45)' : 'rgba(255,255,255,0.12)'}`,
                    cursor: 'pointer',
                    ...fieldFont,
                  }}
                >
                  <input
                    type="radio"
                    name="report-reason"
                    value={r}
                    checked={reason === r}
                    onChange={() => setReason(r)}
                    style={{ cursor: 'pointer' }}
                  />
                  {t(`report.reasons.${r}`)}
                </label>
              ))}
            </div>
          </div>

          <div>
            <div style={{ fontSize: '0.85rem', fontWeight: 700, marginBottom: 6, opacity: 0.9 }}>
              {t('report.noteLabel')}
            </div>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value.slice(0, NOTE_MAX))}
              placeholder={t('report.notePlaceholder')}
              rows={3}
              maxLength={NOTE_MAX}
              style={{
                width: '100%',
                boxSizing: 'border-box',
                background: 'rgba(0,0,0,0.3)',
                border: '1px solid rgba(255,255,255,0.25)',
                borderRadius: 8,
                color: '#fff',
                padding: '8px 10px',
                fontSize: '0.9rem',
                fontFamily: 'inherit',
                resize: 'vertical',
              }}
            />
            <div style={{ fontSize: '0.72rem', opacity: 0.6, textAlign: 'right', marginTop: 2 }}>
              {note.length}/{NOTE_MAX}
            </div>
          </div>

          {errorKey && (
            <div
              style={{
                background: 'rgba(239,68,68,0.25)',
                border: '1px solid rgba(239,68,68,0.5)',
                borderRadius: 8,
                padding: '8px 10px',
                fontSize: '0.88rem',
                color: '#fff',
              }}
            >
              {t(errorKey)}
            </div>
          )}
        </div>
      )}
    </ModalBase>
  );
};

export default ReportModal;
