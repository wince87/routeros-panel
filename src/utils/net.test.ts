import { describe, it, expect } from 'vitest';
import { ipToNum, numToIp, maskFromBits, networkOf, isInDhcpRange, getSubnetForIp } from './net';

describe('ipToNum / numToIp', () => {
  it('round-trips', () => {
    const n = ipToNum('192.168.88.1');
    expect(numToIp(n)).toBe('192.168.88.1');
  });

  it('returns 0 for invalid', () => {
    expect(ipToNum('invalid')).toBe(0);
    expect(ipToNum('1.2.3')).toBe(0);
  });
});

describe('maskFromBits', () => {
  it('handles edge cases', () => {
    expect(maskFromBits(0)).toBe(0);
    expect(maskFromBits(32)).toBe(0xffffffff);
    expect(maskFromBits(24) >>> 0).toBe(0xffffff00);
    expect(maskFromBits(16) >>> 0).toBe(0xffff0000);
  });
});

describe('networkOf', () => {
  it('handles /24', () => {
    expect(networkOf('192.168.88.5/24')).toBe('192.168.88.0/24');
  });

  it('handles /16', () => {
    expect(networkOf('10.5.7.1/16')).toBe('10.5.0.0/16');
  });

  it('handles /8', () => {
    expect(networkOf('10.5.7.1/8')).toBe('10.0.0.0/8');
  });

  it('handles /32 (single host)', () => {
    expect(networkOf('192.168.88.5/32')).toBe('192.168.88.5/32');
  });
});

describe('isInDhcpRange', () => {
  const pools = [{ '.id': '*1', name: 'pool', ranges: '192.168.88.10-192.168.88.254' }];
  it('detects in-range', () => {
    expect(isInDhcpRange('192.168.88.50', pools)).toBe(true);
  });
  it('detects out-of-range', () => {
    expect(isInDhcpRange('192.168.88.5', pools)).toBe(false);
    expect(isInDhcpRange('10.0.0.1', pools)).toBe(false);
  });
});

describe('getSubnetForIp', () => {
  const addrs = [
    { '.id': '*1', address: '192.168.88.1/24', interface: 'bridge' },
    { '.id': '*2', address: '10.0.0.1/24', interface: 'wg-server' },
  ];
  it('matches the right subnet', () => {
    expect(getSubnetForIp('192.168.88.50', addrs)).toEqual({ cidr: '192.168.88.1/24', interface: 'bridge' });
    expect(getSubnetForIp('10.0.0.50', addrs)).toEqual({ cidr: '10.0.0.1/24', interface: 'wg-server' });
  });
  it('returns null for unmatched', () => {
    expect(getSubnetForIp('172.16.0.1', addrs)).toBeNull();
  });
});
