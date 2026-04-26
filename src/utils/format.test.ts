import { describe, it, expect } from 'vitest';
import { formatSpeedNum } from './format';

describe('formatSpeedNum', () => {
  it('keeps small values in bps', () => {
    expect(formatSpeedNum(0)).toEqual({ val: '0', unit: 'bps' });
    expect(formatSpeedNum(999)).toEqual({ val: '999', unit: 'bps' });
  });

  it('shows 1000 bps as 1.0 Kbps', () => {
    expect(formatSpeedNum(1000)).toEqual({ val: '1.0', unit: 'Kbps' });
    expect(formatSpeedNum(1500)).toEqual({ val: '1.5', unit: 'Kbps' });
  });

  it('shows 1_000_000 bps as 1.0 Mbps', () => {
    expect(formatSpeedNum(1_000_000)).toEqual({ val: '1.0', unit: 'Mbps' });
    expect(formatSpeedNum(2_500_000)).toEqual({ val: '2.5', unit: 'Mbps' });
  });

  it('shows 1_000_000_000 bps as 1.0 Gbps', () => {
    expect(formatSpeedNum(1_000_000_000)).toEqual({ val: '1.0', unit: 'Gbps' });
  });

  it('parses string input', () => {
    expect(formatSpeedNum('1500')).toEqual({ val: '1.5', unit: 'Kbps' });
  });

  it('falls back to 0 bps on garbage input', () => {
    expect(formatSpeedNum(undefined)).toEqual({ val: '0', unit: 'bps' });
    expect(formatSpeedNum('not-a-number')).toEqual({ val: '0', unit: 'bps' });
  });
});
