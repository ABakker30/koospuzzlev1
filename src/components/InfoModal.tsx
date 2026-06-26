// Reusable Info Modal Component
// Displays page-specific help and information.
// Thin wrapper over ModalBase (keeps its light surface + draggable identity).

import React from 'react';
import { useTranslation } from 'react-i18next';
import { ModalBase } from './ModalBase';
import { tokens } from '../styles/tokens';

export interface InfoModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
}

export const InfoModal: React.FC<InfoModalProps> = ({ isOpen, onClose, title, children }) => {
  const { t } = useTranslation();

  return (
    <ModalBase
      isOpen={isOpen}
      onClose={onClose}
      title={title}
      size="lg"
      draggable
      dimBackdrop={false}
      surface="linear-gradient(135deg, #dbeafe 0%, #bfdbfe 50%, #93c5fd 100%)"
      bodyColor="#1e40af"
      headerBackground={tokens.gradient.info}
      footer={
        <button
          onClick={onClose}
          style={{
            padding: '12px 20px',
            background: '#fff',
            border: '2px solid rgba(59,130,246,0.3)',
            borderRadius: '10px',
            color: '#1e40af',
            fontSize: '14px',
            fontWeight: 600,
            cursor: 'pointer',
          }}
        >
          {t('button.close')}
        </button>
      }
    >
      {children}
    </ModalBase>
  );
};
