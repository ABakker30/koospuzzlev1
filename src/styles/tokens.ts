// Design tokens — single source of truth for color, gradient, spacing, etc.
// The app uses inline styles almost everywhere, so this is a plain TS object
// (immediately usable without converting styles to CSS classes).

export const tokens = {
  // Brand gradients actually used across the app (deduped from ~8 roles).
  gradient: {
    brand: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
    brandTri: 'linear-gradient(135deg, #667eea 0%, #764ba2 50%, #f093fb 100%)',
    success: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
    info: 'linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)',
    warning: 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)',
    danger: 'linear-gradient(135deg, #ef4444 0%, #dc2626 100%)',
    accent: 'linear-gradient(135deg, #ec4899 0%, #db2777 100%)',
    violet: 'linear-gradient(135deg, #8b5cf6 0%, #7c3aed 100%)',
  },

  color: {
    accent: '#667eea',
    accentDark: '#764ba2',
    success: '#10b981',
    info: '#3b82f6',
    warning: '#f59e0b',
    danger: '#ef4444',
    highlight: '#feca57', // gold "selected" used in pickers
  },

  // Contrast-safe text on the brand/dark gradients (replaces ad-hoc rgba whites).
  text: {
    onGradient: 'rgba(255,255,255,0.96)',
    onGradientMuted: 'rgba(255,255,255,0.78)', // >= 4.5:1 — was 0.6 (fails AA)
    onGradientFaint: 'rgba(255,255,255,0.62)', // decorative only
  },

  space: (n: number) => `${n * 4}px`, // 4px scale

  radius: { sm: 8, md: 12, lg: 16, xl: 20, pill: 999 },

  shadow: {
    card: '0 6px 24px rgba(0,0,0,0.06)',
    modal: '0 20px 60px rgba(0,0,0,0.5)',
  },

  // z-index ladder — keep modals/dropdowns/toasts ordered intentionally.
  z: {
    canvasUI: 1000,
    dropdown: 9999,
    modalBackdrop: 10000,
    modal: 10001,
    toast: 100000,
  },

  breakpoint: { xs: 480, sm: 640, md: 768, lg: 1024, xl: 1280 },
} as const;

export type GradientKey = keyof typeof tokens.gradient;
