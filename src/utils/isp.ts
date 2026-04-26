import type { DhcpClient } from '../types/router';

export function ispLabel(iface: string | undefined, dhcpClients: DhcpClient[]): string {
  if (!iface) return '';
  const dc = dhcpClients.find((c) => c.interface === iface);
  if (dc?.comment) {
    const n = dc.comment.replace(/WAN\d?\s*/i, '').replace(/\(.*\)/, '').trim();
    if (n) return n;
  }
  return iface;
}

export function getWanName(dhcp: DhcpClient | null | undefined): string {
  if (!dhcp) return '';
  return dhcp.comment?.replace(/WAN\d?\s*/i, '').replace(/\(.*\)/, '').trim() || dhcp.interface;
}

export function netLabel(iface: string | undefined): string {
  if (!iface) return '';
  if (/^bridge/i.test(iface)) return 'Home LAN';
  if (/^(wireguard|wg)/i.test(iface)) return 'VPN';
  if (/^vlan/i.test(iface)) return 'VLAN';
  return iface;
}
