// ChallengeChoiceModal — the "Challenge a friend" chooser. Two roads:
//   ⚡ Play live now  → the existing real-time PvP invite (/game/:id?mode=pvp)
//   🏁 Send a race    → an async ghost race against MY latest solve (/c/:id)
// Mounted by both entry points (puzzle-viewer three-dot menu and the gallery
// puzzle options modal); the component itself is page-agnostic.

import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ModalBase } from './ModalBase';
import { tokens } from '../styles/tokens';
import { useAuth } from '../context/AuthContext';
import { getMyLatestSolutionId } from '../services/challengeService';

interface ChallengeChoiceModalProps {
  isOpen: boolean;
  onClose: () => void;
  puzzleId: string;
}

type RaceLookup = 'idle' | 'checking' | 'found' | 'none' | 'signedOut';

const optionButtonStyle: React.CSSProperties = {
  border: 'none',
  borderRadius: '12px',
  color: '#fff',
  cursor: 'pointer',
  padding: '16px 14px',
  fontSize: '0.9rem',
  fontWeight: 700,
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  gap: '6px',
  width: '100%',
  textAlign: 'center',
};

export const ChallengeChoiceModal: React.FC<ChallengeChoiceModalProps> = ({
  isOpen,
  onClose,
  puzzleId,
}) => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { user } = useAuth();

  const [raceLookup, setRaceLookup] = useState<RaceLookup>('idle');
  const [raceSolutionId, setRaceSolutionId] = useState<string | null>(null);
  const [linkCopied, setLinkCopied] = useState(false);

  // Fresh state every time the modal opens.
  useEffect(() => {
    if (isOpen) {
      setRaceLookup('idle');
      setRaceSolutionId(null);
      setLinkCopied(false);
    }
  }, [isOpen]);

  const handlePlayLive = () => {
    onClose();
    navigate(`/game/${puzzleId}?mode=pvp`);
  };

  const handleSendRace = async () => {
    if (!user) {
      // Races replay a saved solve — that needs an account.
      setRaceLookup('signedOut');
      return;
    }
    setRaceLookup('checking');
    const solutionId = await getMyLatestSolutionId(puzzleId, user.id);
    if (solutionId) {
      setRaceSolutionId(solutionId);
      setRaceLookup('found');
    } else {
      setRaceLookup('none');
    }
  };

  const raceUrl = raceSolutionId
    ? `${window.location.origin}/c/${raceSolutionId}`
    : null;
  const isMobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);

  return (
    <ModalBase
      isOpen={isOpen}
      onClose={onClose}
      maxWidth={440}
      title={`⚔️ ${t('pvp.challengeChoice.title')}`}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
        {/* ⚡ Play live now */}
        <button
          onClick={handlePlayLive}
          style={{
            ...optionButtonStyle,
            background: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
            boxShadow: '0 4px 12px rgba(99, 102, 241, 0.4)',
          }}
        >
          <span style={{ fontSize: '28px' }}>⚡</span>
          <span>{t('pvp.challengeChoice.liveTitle')}</span>
          <span style={{ fontWeight: 400, fontSize: '0.8rem', color: 'rgba(255,255,255,0.75)' }}>
            {t('pvp.challengeChoice.liveDesc')}
          </span>
        </button>

        {/* 🏁 Send a race */}
        <button
          onClick={handleSendRace}
          disabled={raceLookup === 'checking'}
          style={{
            ...optionButtonStyle,
            background: 'linear-gradient(135deg, #f59e0b, #ef4444)',
            boxShadow: '0 4px 12px rgba(245, 158, 11, 0.4)',
            opacity: raceLookup === 'checking' ? 0.7 : 1,
          }}
        >
          <span style={{ fontSize: '28px' }}>🏁</span>
          <span>{t('pvp.challengeChoice.raceTitle')}</span>
          <span style={{ fontWeight: 400, fontSize: '0.8rem', color: 'rgba(255,255,255,0.75)' }}>
            {t('pvp.challengeChoice.raceDesc')}
          </span>
        </button>

        {/* Race outcome states */}
        {raceLookup === 'checking' && (
          <p style={{ margin: 0, textAlign: 'center', fontSize: '0.85rem', color: 'rgba(255,255,255,0.7)' }}>
            {t('pvp.challengeChoice.checking')}
          </p>
        )}

        {raceLookup === 'signedOut' && (
          <div style={{ textAlign: 'center' }}>
            <p style={{ margin: '0 0 10px 0', fontSize: '0.85rem', color: 'rgba(255,255,255,0.8)' }}>
              {t('pvp.challengeChoice.signInHint')}
            </p>
            <button
              onClick={() => {
                onClose();
                navigate('/login');
              }}
              style={{
                background: tokens.gradient.success, color: '#fff', border: 'none',
                borderRadius: '10px', padding: '10px 22px', fontSize: '0.9rem',
                fontWeight: 700, cursor: 'pointer',
              }}
            >
              {t('pvp.challengeChoice.signIn')}
            </button>
          </div>
        )}

        {raceLookup === 'none' && (
          <div style={{ textAlign: 'center' }}>
            <p style={{ margin: '0 0 10px 0', fontSize: '0.85rem', color: 'rgba(255,255,255,0.8)' }}>
              {t('pvp.challengeChoice.noSolve')}
            </p>
            <button
              onClick={() => {
                onClose();
                navigate(`/game/${puzzleId}?mode=solo`);
              }}
              style={{
                background: tokens.gradient.success, color: '#fff', border: 'none',
                borderRadius: '10px', padding: '10px 22px', fontSize: '0.9rem',
                fontWeight: 700, cursor: 'pointer',
              }}
            >
              {t('pvp.challengeChoice.solveNow')}
            </button>
          </div>
        )}

        {raceLookup === 'found' && raceUrl && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, alignItems: 'center' }}>
            <p style={{ margin: 0, fontSize: '0.85rem', color: 'rgba(255,255,255,0.8)', textAlign: 'center' }}>
              {t('pvp.challengeChoice.raceReady')}
            </p>
            {/* Share row — same visual language as the PvP waiting room. */}
            <div style={{ display: 'flex', gap: 10, justifyContent: 'center', flexWrap: 'wrap' }}>
              <button
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(raceUrl);
                    setLinkCopied(true);
                    setTimeout(() => setLinkCopied(false), 2500);
                  } catch {
                    // Clipboard blocked — the selectable URL below still works.
                  }
                }}
                style={{
                  background: linkCopied ? '#22c55e' : '#3b82f6',
                  color: '#fff', border: 'none', borderRadius: '10px',
                  padding: '10px 20px', fontSize: '0.9rem', cursor: 'pointer',
                }}
              >
                {linkCopied ? `✓ ${t('pvp.invite.copied')}` : `📋 ${t('pvp.invite.copyLink')}`}
              </button>
              <a
                href={`https://wa.me/?text=${encodeURIComponent(
                  t('pvp.challengeChoice.raceShareMessage', { link: raceUrl })
                )}`}
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  background: '#25D366', color: '#fff', borderRadius: '10px',
                  padding: '10px 20px', fontSize: '0.9rem', textDecoration: 'none',
                  display: 'inline-flex', alignItems: 'center', gap: 6,
                }}
              >
                🟢 WhatsApp
              </a>
              {isMobile && !!navigator.share && (
                <button
                  onClick={async () => {
                    try {
                      await navigator.share({
                        title: 'Koos Puzzle',
                        text: t('pvp.challengeChoice.raceShareMessage', { link: raceUrl }),
                        url: raceUrl,
                      });
                    } catch {
                      /* user cancelled the sheet */
                    }
                  }}
                  style={{
                    background: 'rgba(255,255,255,0.15)', color: '#fff',
                    border: '1px solid rgba(255,255,255,0.25)', borderRadius: '10px',
                    padding: '10px 20px', fontSize: '0.9rem', cursor: 'pointer',
                  }}
                >
                  {t('pvp.join.shareButton')}
                </button>
              )}
            </div>
            <input
              readOnly
              value={raceUrl}
              onFocus={(e) => e.currentTarget.select()}
              style={{
                width: '100%', boxSizing: 'border-box', textAlign: 'center',
                background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.2)',
                borderRadius: '8px', color: 'rgba(255,255,255,0.8)',
                padding: '8px 10px', fontSize: '0.78rem',
              }}
            />
          </div>
        )}
      </div>
    </ModalBase>
  );
};

export default ChallengeChoiceModal;
