// AgeGateModal — 18+ prize-eligibility self-attestation for the Discovery
// Challenge. Deliberately NOT identity verification (that happens by hand
// before payout) and deliberately NEVER a gate on playing: "Not now" always
// dismisses, and no solve is ever blocked. Confirming writes
// users.age_confirmed_at via AuthContext.confirmAge().

import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../context/AuthContext';
import { tokens } from '../styles/tokens';

interface AgeGateModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const AgeGateModal: React.FC<AgeGateModalProps> = ({ isOpen, onClose }) => {
  const { t } = useTranslation();
  const { confirmAge } = useAuth();
  const [checked, setChecked] = useState(false);
  const [saving, setSaving] = useState(false);

  if (!isOpen) return null;

  const handleConfirm = async () => {
    setSaving(true);
    await confirmAge();
    setSaving(false);
    onClose();
  };

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.55)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: tokens.z.modalBackdrop,
        padding: '20px',
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: tokens.gradient.info,
          color: '#fff',
          padding: '28px 32px',
          borderRadius: '16px',
          boxShadow: '0 12px 40px rgba(30,136,229,0.5)',
          maxWidth: '380px',
          minWidth: '280px',
          textAlign: 'center',
        }}
      >
        <div style={{ fontSize: '36px', marginBottom: '8px' }}>🔞</div>
        <div style={{ fontSize: '20px', fontWeight: 700, marginBottom: '10px' }}>
          {t('ageGate.title')}
        </div>
        <div style={{ fontSize: '14px', opacity: 0.95, lineHeight: 1.55, marginBottom: '10px', textAlign: 'left' }}>
          {t('ageGate.body')}
        </div>
        <div style={{ fontSize: '12.5px', marginBottom: '14px', textAlign: 'left' }}>
          <Link to="/terms" style={{ color: '#d1ffe8' }}>
            {t('terms.title')}
          </Link>
        </div>
        <label
          style={{
            display: 'flex',
            alignItems: 'flex-start',
            gap: '10px',
            fontSize: '14px',
            textAlign: 'left',
            cursor: 'pointer',
            marginBottom: '16px',
          }}
        >
          <input
            type="checkbox"
            checked={checked}
            onChange={(e) => setChecked(e.target.checked)}
            style={{ marginTop: '2px', width: '16px', height: '16px', cursor: 'pointer' }}
          />
          {t('ageGate.checkbox')}
        </label>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          <button
            onClick={handleConfirm}
            disabled={!checked || saving}
            style={{
              background: checked ? '#10b981' : 'rgba(255,255,255,0.25)',
              color: '#fff',
              border: 'none',
              borderRadius: '10px',
              padding: '12px 20px',
              fontSize: '15px',
              fontWeight: 700,
              cursor: checked && !saving ? 'pointer' : 'not-allowed',
            }}
          >
            {t('ageGate.confirm')}
          </button>
          <button
            onClick={onClose}
            style={{
              background: 'transparent',
              color: '#fff',
              border: '1px solid rgba(255,255,255,0.4)',
              borderRadius: '10px',
              padding: '10px 20px',
              fontSize: '14px',
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            {t('ageGate.notNow')}
          </button>
        </div>
      </div>
    </div>
  );
};

export default AgeGateModal;
