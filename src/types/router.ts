export interface AuthData {
  ip: string;
  username: string;
  token: string;
  protocol: 'http' | 'https';
}

export interface SystemIdentity {
  name: string;
}

export interface SystemResource {
  'cpu-load'?: string;
  'total-memory'?: string;
  'free-memory'?: string;
  uptime?: string;
  version?: string;
  'architecture-name'?: string;
  [key: string]: string | undefined;
}

export interface RouterEntity {
  '.id': string;
  comment?: string;
  disabled?: 'true' | 'false';
  [key: string]: string | undefined;
}

export interface DhcpClient extends RouterEntity {
  interface: string;
  status?: 'bound' | 'searching' | 'stopped' | 'error';
  address?: string;
  gateway?: string;
  'primary-dns'?: string;
  'secondary-dns'?: string;
  'expires-after'?: string;
  'default-route-distance'?: string;
  'dhcp-server'?: string;
}

export interface IpAddress extends RouterEntity {
  address: string;
  interface: string;
  network?: string;
}

export interface Interface extends RouterEntity {
  name: string;
  type?: string;
  running?: 'true' | 'false';
}

export type Ethernet = Interface;

export type Bridge = Interface;

export interface BridgePort extends RouterEntity {
  interface: string;
  bridge: string;
}

export interface Route extends RouterEntity {
  'dst-address'?: string;
  gateway?: string;
  'routing-table'?: string;
  distance?: string;
  active?: 'true' | 'false';
  'vrf-interface'?: string;
}

export interface FirewallRule extends RouterEntity {
  chain?: string;
  action?: string;
  'src-address'?: string;
  'dst-address'?: string;
  protocol?: string;
  'dst-port'?: string;
  'in-interface'?: string;
  'out-interface'?: string;
  bytes?: string;
  packets?: string;
}

export interface MangleRule extends FirewallRule {
  'connection-mark'?: string;
  'connection-state'?: string;
  'new-connection-mark'?: string;
  'new-routing-mark'?: string;
  'per-connection-classifier'?: string;
  passthrough?: 'yes' | 'no';
}

export interface AddressListEntry extends RouterEntity {
  list: string;
  address: string;
}

export interface DhcpLease extends RouterEntity {
  address?: string;
  'mac-address'?: string;
  'host-name'?: string;
  status?: string;
}

export interface DhcpServer extends RouterEntity {
  name: string;
  interface: string;
  'address-pool'?: string;
}

export interface IpPool extends RouterEntity {
  name: string;
  ranges: string;
}

export interface WireGuardInterface extends Interface {
  'public-key'?: string;
  'private-key'?: string;
  'listen-port'?: string;
}

export interface WireGuardPeer extends RouterEntity {
  interface: string;
  'public-key'?: string;
  'allowed-address'?: string;
  'endpoint-address'?: string;
  'endpoint-port'?: string;
}

export interface RouterboardInfo {
  'board-name'?: string;
  model?: string;
  'serial-number'?: string;
  'current-firmware'?: string;
}

export interface PackageInfo extends RouterEntity {
  name: string;
  version?: string;
}

export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
