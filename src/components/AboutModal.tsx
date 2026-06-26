import React from 'react';
import { useTranslation } from 'react-i18next';
import { ModalBase } from './ModalBase';

interface AboutModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const AboutModal: React.FC<AboutModalProps> = ({ isOpen, onClose }) => {
  const { t } = useTranslation();

  return (
    <ModalBase
      isOpen={isOpen}
      onClose={onClose}
      title={t('about.title')}
      maxWidth={600}
    >
      {/* App Description */}
      <div style={{ marginBottom: '20px' }}>
        <h3
          style={{
            fontSize: '1.1rem',
            fontWeight: 700,
            margin: '0 0 10px 0',
            color: '#fff',
            textShadow: '0 2px 6px rgba(0, 0, 0, 0.3)',
          }}
        >
          {t('about.whatIs.title')}
        </h3>
        <p
          style={{
            fontSize: '0.95rem',
            color: 'rgba(255, 255, 255, 0.95)',
            margin: 0,
            textShadow: '0 1px 3px rgba(0, 0, 0, 0.2)',
          }}
        >
          {t('about.whatIs.description')}
        </p>
      </div>

      {/* Features */}
      <div style={{ marginBottom: '20px' }}>
        <h3
          style={{
            fontSize: '1.1rem',
            fontWeight: 700,
            margin: '0 0 12px 0',
            color: '#fff',
            textShadow: '0 2px 6px rgba(0, 0, 0, 0.3)',
          }}
        >
          {t('about.features.title')}
        </h3>
        <ul
          style={{
            listStyle: 'none',
            padding: 0,
            margin: 0,
            display: 'flex',
            flexDirection: 'column',
            gap: '10px',
          }}
        >
          <li
            style={{
              display: 'flex',
              alignItems: 'flex-start',
              gap: '10px',
              fontSize: '0.9rem',
              color: 'rgba(255, 255, 255, 0.95)',
            }}
          >
            <span style={{ fontSize: '1.15rem', flexShrink: 0 }}>🧩</span>
            <span>{t('about.features.solve')}</span>
          </li>
          <li
            style={{
              display: 'flex',
              alignItems: 'flex-start',
              gap: '10px',
              fontSize: '0.9rem',
              color: 'rgba(255, 255, 255, 0.95)',
            }}
          >
            <span style={{ fontSize: '1.15rem', flexShrink: 0 }}>🎨</span>
            <span>{t('about.features.create')}</span>
          </li>
          <li
            style={{
              display: 'flex',
              alignItems: 'flex-start',
              gap: '10px',
              fontSize: '0.9rem',
              color: 'rgba(255, 255, 255, 0.95)',
            }}
          >
            <span style={{ fontSize: '1.15rem', flexShrink: 0 }}>🤖</span>
            <span>{t('about.features.auto')}</span>
          </li>
          <li
            style={{
              display: 'flex',
              alignItems: 'flex-start',
              gap: '10px',
              fontSize: '0.9rem',
              color: 'rgba(255, 255, 255, 0.95)',
            }}
          >
            <span style={{ fontSize: '1.15rem', flexShrink: 0 }}>🌍</span>
            <span>{t('about.features.multilingual')}</span>
          </li>
          <li
            style={{
              display: 'flex',
              alignItems: 'flex-start',
              gap: '10px',
              fontSize: '0.9rem',
              color: 'rgba(255, 255, 255, 0.95)',
            }}
          >
            <span style={{ fontSize: '1.15rem', flexShrink: 0 }}>💾</span>
            <span>{t('about.features.share')}</span>
          </li>
        </ul>
      </div>

      {/* Version Info */}
      <div
        style={{
          marginTop: '20px',
          paddingTop: '16px',
          borderTop: '2px solid rgba(255, 255, 255, 0.2)',
          fontSize: '0.85rem',
          color: 'rgba(255, 255, 255, 0.8)',
          textAlign: 'center',
        }}
      >
        <p style={{ margin: '0 0 6px 0' }}>
          {t('about.madeWith')} 💜
        </p>
        <p style={{ margin: 0 }}>
          Version 81.11.0
        </p>
      </div>
    </ModalBase>
  );
};
