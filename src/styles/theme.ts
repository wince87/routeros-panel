export const colors = {
  bg: '#0a0c10',
  bgCard: '#12151c',
  bgInput: '#0d1017',
  border: '#1a1f2e',
  text: '#eef0f4',
  textMuted: '#c8ccd4',
  textDim: '#636b7e',
  accent: '#22c55e',
  blue: '#3b82f6',
  amber: '#f59e0b',
  purple: '#8b5cf6',
  red: '#ef4444',
} as const;

export const fonts = {
  ui: "'Outfit', sans-serif",
  mono: "'JetBrains Mono', monospace",
} as const;

export const radii = {
  sm: 4,
  md: 6,
  lg: 8,
  xl: 12,
  xxl: 16,
} as const;

export type Color = keyof typeof colors;
