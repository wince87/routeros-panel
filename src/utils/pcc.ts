import { api } from '../api';
import type { AddressListEntry, MangleRule, Route } from '../types/router';

export const PCC_COMMENT = 'PCC-PANEL';
export const PCC_BUCKETS = 10;

export interface PCCCounters {
  isp1: { bytes: number; packets: number };
  isp2: { bytes: number; packets: number };
}

export class PCCDeactivateError extends Error {
  errors: string[];
  constructor(errors: string[]) {
    super(`PCC deactivate had ${errors.length} error(s)`);
    this.name = 'PCCDeactivateError';
    this.errors = errors;
  }
}

export async function activatePCC(
  initialUkrPercent = 70,
  exclusions: string[] = [],
  wanIfaces: string[] = [],
): Promise<void> {
  const isp1 = wanIfaces[0] || 'ether1';
  const isp2 = wanIfaces[1] || 'ether2';

  await api('PUT', '/routing/table', { name: 'ISP1', fib: '' });
  await api('PUT', '/routing/table', { name: 'ISP2', fib: '' });

  await api('PUT', '/ip/route', { 'dst-address': '0.0.0.0/0', gateway: isp1, 'routing-table': 'ISP1', distance: '1', comment: `${PCC_COMMENT}: ISP1 primary` });
  await api('PUT', '/ip/route', { 'dst-address': '0.0.0.0/0', gateway: isp2, 'routing-table': 'ISP1', distance: '2', comment: `${PCC_COMMENT}: ISP1 fallback` });
  await api('PUT', '/ip/route', { 'dst-address': '0.0.0.0/0', gateway: isp2, 'routing-table': 'ISP2', distance: '1', comment: `${PCC_COMMENT}: ISP2 primary` });
  await api('PUT', '/ip/route', { 'dst-address': '0.0.0.0/0', gateway: isp1, 'routing-table': 'ISP2', distance: '2', comment: `${PCC_COMMENT}: ISP2 fallback` });

  for (const addr of exclusions) {
    await api('PUT', '/ip/firewall/address-list', { list: 'no-pcc', address: addr, comment: `${PCC_COMMENT}: exclusion` });
  }

  await api('PUT', '/ip/firewall/mangle', { chain: 'input', 'in-interface': isp1, 'connection-state': 'new', action: 'mark-connection', 'new-connection-mark': 'ISP1_conn', comment: `${PCC_COMMENT}: input ISP1` });
  await api('PUT', '/ip/firewall/mangle', { chain: 'input', 'in-interface': isp2, 'connection-state': 'new', action: 'mark-connection', 'new-connection-mark': 'ISP2_conn', comment: `${PCC_COMMENT}: input ISP2` });

  if (exclusions.length > 0) {
    await api('PUT', '/ip/firewall/mangle', { chain: 'prerouting', 'in-interface': 'bridge', 'dst-address-list': 'no-pcc', 'connection-state': 'new', action: 'mark-connection', 'new-connection-mark': 'ISP1_conn', passthrough: 'no', comment: `${PCC_COMMENT}: no-pcc force ISP1` });
  }

  const ukrCount = Math.round(initialUkrPercent / PCC_BUCKETS);
  for (let i = 0; i < PCC_BUCKETS; i++) {
    const mark = i < ukrCount ? 'ISP1_conn' : 'ISP2_conn';
    await api('PUT', '/ip/firewall/mangle', {
      chain: 'prerouting',
      'in-interface': 'bridge',
      'connection-mark': 'no-mark',
      'connection-state': 'new',
      'dst-address-type': '!local',
      'per-connection-classifier': `both-addresses:${PCC_BUCKETS}/${i}`,
      action: 'mark-connection',
      'new-connection-mark': mark,
      passthrough: 'yes',
      comment: `${PCC_COMMENT}: pcc ${i}`,
    });
  }

  await api('PUT', '/ip/firewall/mangle', { chain: 'prerouting', 'connection-mark': 'ISP1_conn', 'in-interface': 'bridge', action: 'mark-routing', 'new-routing-mark': 'ISP1', comment: `${PCC_COMMENT}: route ISP1` });
  await api('PUT', '/ip/firewall/mangle', { chain: 'prerouting', 'connection-mark': 'ISP2_conn', 'in-interface': 'bridge', action: 'mark-routing', 'new-routing-mark': 'ISP2', comment: `${PCC_COMMENT}: route ISP2` });
  await api('PUT', '/ip/firewall/mangle', { chain: 'output', 'connection-mark': 'ISP1_conn', action: 'mark-routing', 'new-routing-mark': 'ISP1', comment: `${PCC_COMMENT}: output ISP1` });
  await api('PUT', '/ip/firewall/mangle', { chain: 'output', 'connection-mark': 'ISP2_conn', action: 'mark-routing', 'new-routing-mark': 'ISP2', comment: `${PCC_COMMENT}: output ISP2` });
}

export async function syncExclusions(newExclusions: string[]): Promise<void> {
  const addrList = await api<AddressListEntry[]>('GET', '/ip/firewall/address-list');
  const existing = (addrList || []).filter((a) => a.comment?.startsWith(PCC_COMMENT));

  for (const a of existing) {
    if (!newExclusions.includes(a.address)) {
      await api('DELETE', `/ip/firewall/address-list/${a['.id']}`);
    }
  }

  const existingAddresses = existing.map((a) => a.address);
  for (const addr of newExclusions) {
    if (!existingAddresses.includes(addr)) {
      await api('PUT', '/ip/firewall/address-list', { list: 'no-pcc', address: addr, comment: `${PCC_COMMENT}: exclusion` });
    }
  }
}

export async function fetchExclusions(): Promise<string[]> {
  const addrList = await api<AddressListEntry[]>('GET', '/ip/firewall/address-list');
  return (addrList || []).filter((a) => a.comment?.startsWith(PCC_COMMENT)).map((a) => a.address);
}

export async function fetchPCCCounters(): Promise<PCCCounters | null> {
  const mangles = await api<MangleRule[]>('GET', '/ip/firewall/mangle');
  const list = mangles || [];
  const routeISP1 = list.find((m) => m.comment === `${PCC_COMMENT}: route ISP1`);
  const routeISP2 = list.find((m) => m.comment === `${PCC_COMMENT}: route ISP2`);
  if (!routeISP1 || !routeISP2) return null;
  return {
    isp1: { bytes: parseInt(routeISP1.bytes ?? '0', 10) || 0, packets: parseInt(routeISP1.packets ?? '0', 10) || 0 },
    isp2: { bytes: parseInt(routeISP2.bytes ?? '0', 10) || 0, packets: parseInt(routeISP2.packets ?? '0', 10) || 0 },
  };
}

export async function deactivatePCC(): Promise<void> {
  const errors: string[] = [];
  const safeDelete = async (path: string): Promise<void> => {
    try {
      await api('DELETE', path);
    } catch (e) {
      errors.push(`DELETE ${path}: ${(e as Error).message}`);
    }
  };

  const mangles = (await api<MangleRule[]>('GET', '/ip/firewall/mangle')) || [];
  const pccMangles = mangles.filter((m) => m.comment?.startsWith(PCC_COMMENT));

  for (const m of pccMangles) {
    try {
      await api('PATCH', `/ip/firewall/mangle/${m['.id']}`, { disabled: 'true' });
    } catch (e) {
      errors.push(`disable mangle ${m['.id']}: ${(e as Error).message}`);
    }
  }

  for (const m of pccMangles) {
    await safeDelete(`/ip/firewall/mangle/${m['.id']}`);
  }

  const addrList = (await api<AddressListEntry[]>('GET', '/ip/firewall/address-list')) || [];
  for (const a of addrList) {
    if (a.comment?.startsWith(PCC_COMMENT)) {
      await safeDelete(`/ip/firewall/address-list/${a['.id']}`);
    }
  }

  const routes = (await api<Route[]>('GET', '/ip/route')) || [];
  for (const r of routes) {
    if (r.comment?.startsWith(PCC_COMMENT)) {
      await safeDelete(`/ip/route/${r['.id']}`);
    }
  }

  const tables = (await api<Array<{ '.id': string; name?: string }>>('GET', '/routing/table')) || [];
  for (const t of tables) {
    if (t.name === 'ISP1' || t.name === 'ISP2') {
      await safeDelete(`/routing/table/${t['.id']}`);
    }
  }

  if (errors.length > 0) {
    throw new PCCDeactivateError(errors);
  }
}

export async function applyPCCRatio(ukrPercent: number): Promise<void> {
  const mangles = (await api<MangleRule[]>('GET', '/ip/firewall/mangle')) || [];
  const pccRules = mangles
    .filter((m) => m.comment && new RegExp(`^${PCC_COMMENT}: pcc \\d+$`).test(m.comment))
    .sort((a, b) => {
      const ai = parseInt((a.comment ?? '').split(' ').pop() ?? '0', 10);
      const bi = parseInt((b.comment ?? '').split(' ').pop() ?? '0', 10);
      return ai - bi;
    });

  if (pccRules.length !== PCC_BUCKETS) return;

  const ukrCount = Math.round(ukrPercent / PCC_BUCKETS);
  for (let i = 0; i < PCC_BUCKETS; i++) {
    const targetMark = i < ukrCount ? 'ISP1_conn' : 'ISP2_conn';
    const rule = pccRules[i];
    if (rule && rule['new-connection-mark'] !== targetMark) {
      await api('PATCH', `/ip/firewall/mangle/${rule['.id']}`, { 'new-connection-mark': targetMark });
    }
  }
}

export async function fetchPCCState(): Promise<number | null> {
  const mangles = (await api<MangleRule[]>('GET', '/ip/firewall/mangle')) || [];
  const pccRules = mangles
    .filter((m) => m.comment && new RegExp(`^${PCC_COMMENT}: pcc \\d+$`).test(m.comment))
    .sort((a, b) => {
      const ai = parseInt((a.comment ?? '').split(' ').pop() ?? '0', 10);
      const bi = parseInt((b.comment ?? '').split(' ').pop() ?? '0', 10);
      return ai - bi;
    });

  if (pccRules.length !== PCC_BUCKETS) return null;

  let ukrCount = 0;
  for (const r of pccRules) {
    if (r['new-connection-mark'] === 'ISP1_conn') ukrCount++;
  }
  return ukrCount * PCC_BUCKETS;
}
