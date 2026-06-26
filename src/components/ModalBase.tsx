import React, { useEffect, useId, useRef } from 'react';
import { createPortal } from 'react-dom';
import { tokens, type GradientKey } from '../styles/tokens';
import { useDraggable } from '../hooks/useDraggable';

const SIZE_MAX: Record<'sm' | 'md' | 'lg', number> = { sm: 380, md: 480, lg: 600 };

const FOCUSABLE =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

// Single shared scrollbar style + entrance fade (replaces per-modal blocks).
// Fade only (no transform) so it never conflicts with the drag transform.
const SCROLL_CSS = `
  @keyframes kpModalIn { from { opacity: 0; } to { opacity: 1; } }
  .kp-modal-body::-webkit-scrollbar { width: 10px; }
  .kp-modal-body::-webkit-scrollbar-track { background: rgba(255,255,255,0.08); border-radius: 8px; }
  .kp-modal-body::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.28); border-radius: 8px; }
  .kp-modal-body::-webkit-scrollbar-thumb:hover { background: rgba(255,255,255,0.4); }
  .kp-modal-body { scrollbar-width: thin; scrollbar-color: rgba(255,255,255,0.28) transparent; }
`;

export interface ModalBaseProps {
  isOpen: boolean;
  onClose: () => void;
  title?: React.ReactNode;
  /** Optional secondary line under the title in the header. */
  subtitle?: React.ReactNode;
  /** Optional large icon/emoji shown above the title in the header. */
  headerIcon?: React.ReactNode;
  children: React.ReactNode;
  /** Action buttons row pinned at the bottom. */
  footer?: React.ReactNode;
  /** maxWidth preset: sm 380 / md 480 / lg 600. Default 'md'. */
  size?: 'sm' | 'md' | 'lg';
  /** Exact maxWidth in px (overrides `size` when set). */
  maxWidth?: number;
  /** Brand gradient used as the modal surface. Default 'brand'. */
  gradient?: GradientKey;
  /** Raw CSS background override (for light-surface modals). Wins over `gradient`. */
  surface?: string;
  /** Body text color. Default white. */
  bodyColor?: string;
  /** Header bar background. Default a dark translucent bar. */
  headerBackground?: string;
  /** Enable drag-by-header (auto-disabled on touch devices). Default false. */
  draggable?: boolean;
  /** Close when the backdrop is clicked. Default true. */
  dismissOnBackdrop?: boolean;
  /** Dim + blur the backdrop. Default true; false = transparent/non-dimming. */
  dimBackdrop?: boolean;
}

/** Accessible, labeled close button (44px target). */
export const ModalCloseButton: React.FC<{ onClose: () => void }> = ({ onClose }) => (
  <button
    onClick={(e) => { e.stopPropagation(); onClose(); }}
    aria-label="Close"
    style={{
      position: 'absolute',
      top: '6px',
      right: '6px',
      width: '44px',
      height: '44px',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: 'transparent',
      border: 'none',
      cursor: 'pointer',
      fontSize: '24px',
      lineHeight: 1,
      color: 'rgba(255, 255, 255, 0.8)',
      touchAction: 'manipulation',
      WebkitTapHighlightColor: 'transparent',
    }}
    onMouseEnter={(e) => { e.currentTarget.style.color = '#fff'; }}
    onMouseLeave={(e) => { e.currentTarget.style.color = 'rgba(255, 255, 255, 0.8)'; }}
  >
    ✕
  </button>
);

/**
 * Shared modal primitive. Owns the backdrop, portal, header/close, scrollable
 * body, footer, and all accessibility (role=dialog, aria-modal, aria-labelledby,
 * Escape-to-close, focus trap, scroll-lock, focus restore).
 */
export const ModalBase: React.FC<ModalBaseProps> = ({
  isOpen,
  onClose,
  title,
  subtitle,
  headerIcon,
  children,
  footer,
  size = 'md',
  maxWidth,
  gradient = 'brand',
  surface,
  bodyColor = '#fff',
  headerBackground = 'rgba(0, 0, 0, 0.3)',
  draggable = false,
  dismissOnBackdrop = true,
  dimBackdrop = true,
}) => {
  const titleId = useId();
  const hasHeader = title != null || subtitle != null || headerIcon != null;
  const fallbackRef = useRef<HTMLDivElement>(null);
  const lastFocused = useRef<Element | null>(null);
  const drag = useDraggable();

  const isTouch =
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(pointer: coarse)').matches;
  const dragEnabled = draggable && !isTouch;
  // When draggable, the drag hook owns the container ref; otherwise use our own.
  const containerRef = dragEnabled ? drag.ref : fallbackRef;

  // Escape, focus trap, scroll-lock, focus restore — all while open.
  useEffect(() => {
    if (!isOpen) return;
    lastFocused.current = document.activeElement;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    // Focus the dialog so keyboard users land inside it.
    containerRef.current?.focus();

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
        return;
      }
      if (e.key === 'Tab') {
        const node = containerRef.current;
        if (!node) return;
        const items = Array.from(node.querySelectorAll<HTMLElement>(FOCUSABLE));
        if (items.length === 0) {
          e.preventDefault();
          return;
        }
        const first = items[0];
        const last = items[items.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };

    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = prevOverflow;
      (lastFocused.current as HTMLElement | null)?.focus?.();
    };
    // containerRef identity is stable for the modal's lifetime.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return createPortal(
    <>
      <style>{SCROLL_CSS}</style>
      <div
        onClick={dismissOnBackdrop ? onClose : undefined}
        style={{
          position: 'fixed',
          inset: 0,
          background: dimBackdrop ? 'rgba(0, 0, 0, 0.75)' : 'transparent',
          backdropFilter: dimBackdrop ? 'blur(8px)' : 'none',
          zIndex: tokens.z.modalBackdrop,
        }}
      >
        <div
          ref={containerRef}
          role="dialog"
          aria-modal="true"
          aria-labelledby={title != null ? titleId : undefined}
          tabIndex={-1}
          onClick={(e) => e.stopPropagation()}
          style={{
            position: 'fixed',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            ...(dragEnabled ? drag.style : {}),
            animation: 'kpModalIn 0.25s ease-out',
            width: '90%',
            maxWidth: `${maxWidth ?? SIZE_MAX[size]}px`,
            maxHeight: '85vh',
            display: 'flex',
            flexDirection: 'column',
            background: surface ?? tokens.gradient[gradient],
            color: bodyColor,
            borderRadius: `${tokens.radius.xl}px`,
            boxShadow: tokens.shadow.modal,
            border: '2px solid rgba(255, 255, 255, 0.2)',
            overflow: 'hidden',
            zIndex: tokens.z.modal,
            outline: 'none',
          }}
        >
          {hasHeader && (
            <div
              style={{
                position: 'relative',
                flexShrink: 0,
                minHeight: '56px',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '6px',
                padding: '16px 52px',
                background: headerBackground,
                textAlign: 'center',
                userSelect: 'none',
                ...(dragEnabled ? drag.headerStyle : {}),
              }}
            >
              {headerIcon != null && (
                <div style={{ fontSize: '2.75rem', lineHeight: 1 }}>{headerIcon}</div>
              )}
              {title != null && (
                <h2
                  id={titleId}
                  style={{
                    margin: 0,
                    fontSize: '1.25rem',
                    fontWeight: 700,
                    color: '#fff',
                    textShadow: '0 2px 8px rgba(0, 0, 0, 0.3)',
                  }}
                >
                  {title}
                </h2>
              )}
              {subtitle != null && (
                <p style={{ margin: 0, fontSize: '0.95rem', color: tokens.text.onGradientMuted }}>
                  {subtitle}
                </p>
              )}
              <ModalCloseButton onClose={onClose} />
            </div>
          )}

          <div
            className="kp-modal-body"
            style={{ overflowY: 'auto', padding: tokens.space(5) }}
          >
            {children}
          </div>

          {footer && (
            <div
              style={{
                flexShrink: 0,
                display: 'flex',
                justifyContent: 'flex-end',
                alignItems: 'center',
                gap: tokens.space(3),
                padding: tokens.space(4),
                borderTop: '1px solid rgba(255, 255, 255, 0.15)',
              }}
            >
              {footer}
            </div>
          )}
        </div>
      </div>
    </>,
    document.body
  );
};
