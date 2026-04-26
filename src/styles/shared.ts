import type { CSSProperties } from 'react';
import { colors, fonts, radii } from './theme';

export const inputStyle: CSSProperties = {
  padding: '7px 10px',
  fontSize: 12,
  fontFamily: fonts.mono,
  color: colors.text,
  background: colors.bgInput,
  border: `1px solid ${colors.border}`,
  borderRadius: radii.md,
  outline: 'none',
  boxSizing: 'border-box',
};

export const labelStyle: CSSProperties = {
  fontSize: 9,
  fontWeight: 600,
  fontFamily: fonts.ui,
  textTransform: 'uppercase',
  letterSpacing: '0.08em',
  color: colors.textDim,
  marginBottom: 4,
};

export const cardStyle: CSSProperties = {
  background: colors.bgCard,
  borderRadius: radii.xl,
  border: `1px solid ${colors.border}`,
  padding: 16,
};

export const cardCompactStyle: CSSProperties = {
  background: colors.bgCard,
  borderRadius: radii.lg,
  border: `1px solid ${colors.border}`,
  overflow: 'hidden',
};

export function badgeStyle(color: string): CSSProperties {
  return {
    fontSize: 9,
    fontWeight: 600,
    fontFamily: fonts.ui,
    textTransform: 'uppercase',
    letterSpacing: '0.06em',
    color,
    background: `${color}15`,
    padding: '2px 6px',
    borderRadius: radii.sm,
    border: `1px solid ${color}25`,
    display: 'inline-block',
  };
}

export function tabStyle(active: boolean, color: string = colors.blue): CSSProperties {
  return {
    padding: '7px 14px',
    fontSize: 11,
    fontWeight: 600,
    fontFamily: fonts.ui,
    letterSpacing: '0.04em',
    borderRadius: radii.md,
    cursor: 'pointer',
    background: active ? `${color}18` : colors.bgInput,
    color: active ? color : colors.textDim,
    border: `1px solid ${active ? `${color}40` : colors.border}`,
    transition: 'all 0.2s ease',
  };
}

export function btnStyle(color: string, disabled = false, small = false): CSSProperties {
  return {
    padding: small ? '4px 10px' : '6px 14px',
    fontSize: small ? 9 : 10,
    fontWeight: 600,
    fontFamily: fonts.ui,
    textTransform: 'uppercase',
    letterSpacing: '0.08em',
    borderRadius: radii.md,
    cursor: disabled ? 'default' : 'pointer',
    background: `${color}15`,
    color,
    border: `1px solid ${color}30`,
    transition: 'all 0.2s ease',
    opacity: disabled ? 0.5 : 1,
  };
}

export function btnPrimaryStyle(color: string, disabled = false): CSSProperties {
  return {
    width: '100%',
    padding: '10px 0',
    fontSize: 12,
    fontWeight: 600,
    fontFamily: fonts.ui,
    textTransform: 'uppercase',
    letterSpacing: '0.1em',
    borderRadius: radii.lg,
    cursor: disabled ? 'default' : 'pointer',
    background: `${color}18`,
    color,
    border: `1px solid ${color}40`,
    transition: 'all 0.2s ease',
    opacity: disabled ? 0.5 : 1,
  };
}

export const selectStyle: CSSProperties = {
  ...inputStyle,
  appearance: 'none',
  paddingRight: 24,
  backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%23636b7e' stroke-width='2'%3E%3Cpath d='M6 9l6 6 6-6'/%3E%3C/svg%3E")`,
  backgroundRepeat: 'no-repeat',
  backgroundPosition: 'right 8px center',
};
