import type { IpAddress, IpPool } from '../types/router';

export function ipToNum(ip: string): number {
  const p = ip.split('.');
  if (p.length !== 4) return 0;
  return ((+(p[0] ?? 0) << 24) | (+(p[1] ?? 0) << 16) | (+(p[2] ?? 0) << 8) | +(p[3] ?? 0)) >>> 0;
}

export function numToIp(n: number): string {
  return [(n >>> 24) & 0xff, (n >>> 16) & 0xff, (n >>> 8) & 0xff, n & 0xff].join('.');
}

export function maskFromBits(bits: number): number {
  if (bits <= 0) return 0;
  if (bits >= 32) return 0xffffffff >>> 0;
  return (0xffffffff << (32 - bits)) >>> 0;
}

export function networkOf(cidr: string): string {
  const [ip = '', bitsStr = ''] = cidr.split('/');
  const bits = parseInt(bitsStr, 10) || 0;
  const mask = maskFromBits(bits);
  const network = ipToNum(ip) & mask;
  return `${numToIp(network)}/${bits}`;
}

export function isInDhcpRange(ip: string, pools: IpPool[]): boolean {
  const num = ipToNum(ip);
  for (const pool of pools) {
    for (const range of (pool.ranges || '').split(',')) {
      const [start, end] = range.trim().split('-');
      if (!start || !end) continue;
      if (num >= ipToNum(start) && num <= ipToNum(end)) return true;
    }
  }
  return false;
}

export interface SubnetMatch {
  cidr: string;
  interface: string;
}

export function getSubnetForIp(ip: string, routerAddresses: IpAddress[]): SubnetMatch | null {
  const num = ipToNum(ip);
  for (const ra of routerAddresses) {
    const [rIp, mask] = (ra.address || '').split('/');
    if (!rIp || !mask) continue;
    const bits = parseInt(mask, 10);
    const maskNum = maskFromBits(bits);
    if ((num & maskNum) === (ipToNum(rIp) & maskNum)) {
      return { cidr: `${rIp}/${mask}`, interface: ra.interface };
    }
  }
  return null;
}
