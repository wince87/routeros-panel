import { useState, useEffect, useCallback } from 'react';
import { api, apiList } from '../api';
import { useMessage } from '../hooks/useMessage';
import { MessageBar } from '../components/MessageBar';
import { networkOf } from '../utils/net';
import nacl from 'tweetnacl';
import { QRCodeSVG } from 'qrcode.react';

function toBase64(arr) {
  return btoa(String.fromCharCode(...arr));
}

function generateKeyPair() {
  const keyPair = nacl.box.keyPair();
  return {
    privateKey: toBase64(keyPair.secretKey),
    publicKey: toBase64(keyPair.publicKey),
  };
}

export default function WireGuardPage() {
  const [message, showMsg] = useMessage();
  const [tab, setTab] = useState('server');
  const [loading, setLoading] = useState(false);
  const [showCreateServer, setShowCreateServer] = useState(false);
  const [showCreateClient, setShowCreateClient] = useState(false);

  const [wgInterfaces, setWgInterfaces] = useState([]);
  const [peers, setPeers] = useState([]);
  const [ipAddresses, setIpAddresses] = useState([]);
  const [dhcpClients, setDhcpClients] = useState([]);

  const [serverName, setServerName] = useState('wg-server');
  const [listenPort, setListenPort] = useState('51820');
  const [serverSubnet, setServerSubnet] = useState('10.0.0.1/24');

  const [peerName, setPeerName] = useState('');
  const [generatedPeer, setGeneratedPeer] = useState(null);
  const [addPeerFor, setAddPeerFor] = useState(null);

  const [clientName, setClientName] = useState('wg-client');
  const [clientEndpoint, setClientEndpoint] = useState('');
  const [clientServerPubKey, setClientServerPubKey] = useState('');
  const [clientAllowedIps, setClientAllowedIps] = useState('0.0.0.0/0');
  const [addClientPeerFor, setAddClientPeerFor] = useState(null);
  const [editingPeer, setEditingPeer] = useState(null);
  const [editEndpoint, setEditEndpoint] = useState('');
  const [editAllowedIps, setEditAllowedIps] = useState('');
  const [expandedPeer, setExpandedPeer] = useState(null);
  const [selectedWanIp, setSelectedWanIp] = useState('');

  const fetchData = useCallback(async () => {
    try {
      const [wg, p, ip, dc] = await Promise.all([
        apiList('GET', '/interface/wireguard'),
        apiList('GET', '/interface/wireguard/peers'),
        apiList('GET', '/ip/address'),
        apiList('GET', '/ip/dhcp-client'),
      ]);
      setWgInterfaces(wg);
      setPeers(p);
      setIpAddresses(ip);
      setDhcpClients(dc);
    } catch (e) { console.error('WireGuard fetch:', e); }
  }, []);

  useEffect(() => {
    fetchData();
    const id = setInterval(fetchData, 10000);
    return () => clearInterval(id);
  }, [fetchData]);

  const isClientIface = (iface) => {
    const ifacePeers = peers.filter(p => p.interface === iface.name);
    return ifacePeers.length > 0 && ifacePeers.every(p => p['endpoint-address']);
  };
  const serverIfaces = wgInterfaces.filter(w => !isClientIface(w));
  const clientIfaces = wgInterfaces.filter(w => isClientIface(w));

  const getWanIps = () => {
    return dhcpClients
      .filter(dc => dc.address)
      .map(dc => ({
        ip: dc.address.split('/')[0],
        label: `${dc.address.split('/')[0]} (${dc.comment || dc.interface})`,
      }));
  };

  const getNextPeerIp = (iface) => {
    const addr = ipAddresses.find(a => a.interface === iface.name);
    const base = addr ? addr.address.split('/')[0].split('.').slice(0, 3).join('.') : '10.0.0';
    const ifacePeers = peers.filter(p => p.interface === iface.name);
    const used = ifacePeers.map(p => p['allowed-address']?.split('/')[0]).filter(Boolean);
    for (let i = 2; i < 255; i++) {
      const ip = `${base}.${i}`;
      if (!used.includes(ip)) return ip;
    }
    return `${base}.2`;
  };

  const handleCreateServer = async () => {
    if (wgInterfaces.some(w => w.name === serverName)) {
      showMsg(`Interface "${serverName}" already exists`);
      return;
    }
    setLoading(true);
    try {
      await api('PUT', '/interface/wireguard', { name: serverName, 'listen-port': listenPort });
      await api('PUT', '/ip/address', { address: serverSubnet, interface: serverName });
      await api('PUT', '/ip/firewall/filter', {
        chain: 'input',
        protocol: 'udp',
        'dst-port': listenPort,
        action: 'accept',
        comment: `WireGuard ${serverName}`,
      });
      const subnet = networkOf(serverSubnet);
      await api('PUT', '/ip/firewall/filter', {
        chain: 'forward',
        action: 'accept',
        'src-address': subnet,
        comment: `WireGuard ${serverName} forward`,
      });
      await api('PUT', '/ip/firewall/nat', {
        chain: 'srcnat',
        action: 'masquerade',
        'src-address': subnet,
        'out-interface-list': 'WAN',
        comment: `WireGuard ${serverName} NAT`,
      });
      showMsg('WireGuard server created');
      setShowCreateServer(false);
      setServerName('wg-server');
      setListenPort('51820');
      setServerSubnet('10.0.0.1/24');
      await fetchData();
    } catch (e) {
      showMsg('Server creation failed');
    }
    setLoading(false);
  };

  const handleAddPeer = async (iface) => {
    setLoading(true);
    try {
      const keys = generateKeyPair();
      const peerIp = getNextPeerIp(iface);
      await api('PUT', '/interface/wireguard/peers', {
        interface: iface.name,
        'public-key': keys.publicKey,
        'allowed-address': `${peerIp}/32`,
        comment: peerName || `peer-${peerIp}`,
      });

      const wanIps = getWanIps();
      const wanIp = selectedWanIp || (wanIps.length > 0 ? wanIps[0].ip : '');
      const conf = `[Interface]
PrivateKey = ${keys.privateKey}
Address = ${peerIp}/32
DNS = 8.8.8.8, 1.1.1.1

[Peer]
PublicKey = ${iface['public-key']}
AllowedIPs = 0.0.0.0/0
Endpoint = ${wanIp}:${iface['listen-port']}
PersistentKeepalive = 25`;

      setGeneratedPeer({ name: peerName || `peer-${peerIp}`, ip: peerIp, conf, keys, ifaceName: iface.name });
      setPeerName('');
      setAddPeerFor(null);
      showMsg('Peer added');
      await fetchData();
    } catch (e) {
      showMsg('Add peer failed');
    }
    setLoading(false);
  };

  const handleTogglePeer = async (id, disabled) => {
    setLoading(true);
    try {
      await api('PATCH', `/interface/wireguard/peers/${id}`, { disabled: disabled ? 'false' : 'true' });
      showMsg(disabled ? 'Peer enabled' : 'Peer disabled');
      await fetchData();
    } catch (e) {
      showMsg('Toggle failed');
    }
    setLoading(false);
  };

  const handleDeletePeer = async (id) => {
    setLoading(true);
    try {
      await api('DELETE', `/interface/wireguard/peers/${id}`);
      showMsg('Peer deleted');
      setGeneratedPeer(null);
      if (expandedPeer === id) setExpandedPeer(null);
      await fetchData();
    } catch (e) {
      showMsg('Delete failed');
    }
    setLoading(false);
  };

  const handleDownloadConf = () => {
    if (!generatedPeer) return;
    const blob = new Blob([generatedPeer.conf], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${generatedPeer.name}.conf`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleCreateClientIface = async () => {
    setLoading(true);
    try {
      await api('PUT', '/interface/wireguard', { name: clientName });
      showMsg('Client interface created');
      setShowCreateClient(false);
      setClientName('wg-client');
      await fetchData();
    } catch (e) {
      showMsg('Creation failed');
    }
    setLoading(false);
  };

  const handleAddClientPeer = async (iface) => {
    if (!clientServerPubKey || !clientEndpoint) { showMsg('Fill server public key and endpoint'); return; }
    setLoading(true);
    try {
      await api('PUT', '/interface/wireguard/peers', {
        interface: iface.name,
        'public-key': clientServerPubKey,
        'endpoint-address': clientEndpoint.split(':')[0],
        'endpoint-port': clientEndpoint.split(':')[1] || '51820',
        'allowed-address': clientAllowedIps,
      });
      showMsg('Remote peer added');
      setAddClientPeerFor(null);
      setClientServerPubKey('');
      setClientEndpoint('');
      setClientAllowedIps('0.0.0.0/0');
      await fetchData();
    } catch (e) {
      showMsg('Add peer failed');
    }
    setLoading(false);
  };

  const handleEditPeer = async (peerId) => {
    if (!editEndpoint) { showMsg('Fill endpoint'); return; }
    setLoading(true);
    try {
      await api('PATCH', `/interface/wireguard/peers/${peerId}`, {
        'endpoint-address': editEndpoint.split(':')[0],
        'endpoint-port': editEndpoint.split(':')[1] || '51820',
        'allowed-address': editAllowedIps,
      });
      showMsg('Peer updated');
      setEditingPeer(null);
      await fetchData();
    } catch (e) {
      showMsg('Update failed');
    }
    setLoading(false);
  };

  const handleToggleInterface = async (id, disabled) => {
    setLoading(true);
    try {
      await api('PATCH', `/interface/wireguard/${id}`, { disabled: disabled ? 'false' : 'true' });
      showMsg(disabled ? 'Interface enabled' : 'Interface disabled');
      await fetchData();
    } catch (e) {
      showMsg('Toggle failed');
    }
    setLoading(false);
  };

  const handleDeleteInterface = async (id) => {
    setLoading(true);
    try {
      await api('DELETE', `/interface/wireguard/${id}`);
      showMsg('Interface deleted');
      await fetchData();
    } catch (e) {
      showMsg('Delete failed');
    }
    setLoading(false);
  };

  const cardStyle = {
    background: '#12151c',
    borderRadius: 12,
    border: '1px solid #1a1f2e',
    padding: 20,
    marginBottom: 16,
  };

  const labelStyle = {
    fontSize: 10,
    fontWeight: 600,
    textTransform: 'uppercase',
    letterSpacing: '0.08em',
    color: '#636b7e',
    fontFamily: "'Outfit', sans-serif",
    marginBottom: 6,
    display: 'block',
  };

  const inputStyle = {
    width: '100%',
    padding: '10px 12px',
    fontSize: 12,
    fontFamily: "'JetBrains Mono', monospace",
    color: '#eef0f4',
    background: '#0d1017',
    border: '1px solid #1a1f2e',
    borderRadius: 6,
    outline: 'none',
    boxSizing: 'border-box',
  };

  const tabBtn = (value, label, count) => (
    <button
      onClick={() => setTab(value)}
      style={{
        flex: 1,
        padding: '10px 0',
        fontSize: 12,
        fontWeight: 600,
        fontFamily: "'Outfit', sans-serif",
        textTransform: 'uppercase',
        letterSpacing: '0.1em',
        borderRadius: 8,
        cursor: 'pointer',
        background: tab === value ? '#3b82f618' : '#0d1017',
        color: tab === value ? '#3b82f6' : '#636b7e',
        border: `1px solid ${tab === value ? '#3b82f640' : '#1a1f2e'}`,
        transition: 'all 0.2s ease',
      }}
    >{label}{count > 0 ? ` (${count})` : ''}</button>
  );

  const renderServerIface = (iface) => {
    const ifacePeers = peers.filter(p => p.interface === iface.name);
    const ifaceIp = ipAddresses.find(a => a.interface === iface.name);
    const isAddingPeer = addPeerFor === iface.name;

    return (
      <div key={iface['.id']} style={cardStyle}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <div style={{
                width: 8, height: 8, borderRadius: '50%',
                background: iface.running === 'true' && iface.disabled !== 'true' ? '#22c55e' : '#636b7e',
              }} />
              <span style={{ fontSize: 14, fontWeight: 700, color: '#eef0f4', letterSpacing: '-0.02em' }}>{iface.name}</span>
            </div>
            <div style={{ fontSize: 10, fontFamily: "'JetBrains Mono', monospace", color: '#636b7e', marginTop: 2, paddingLeft: 16 }}>
              Port: {iface['listen-port']}
              {ifaceIp ? ` • ${ifaceIp.address}` : ''}
              {` • ${ifacePeers.length} peer${ifacePeers.length !== 1 ? 's' : ''}`}
            </div>
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            <button
              onClick={() => handleToggleInterface(iface['.id'], iface.disabled === 'true')}
              disabled={loading}
              style={{
                padding: '6px 14px',
                fontSize: 10,
                fontWeight: 600,
                fontFamily: "'Outfit', sans-serif",
                textTransform: 'uppercase',
                letterSpacing: '0.08em',
                borderRadius: 6,
                cursor: loading ? 'default' : 'pointer',
                background: iface.disabled === 'true' ? '#22c55e12' : '#f59e0b12',
                color: iface.disabled === 'true' ? '#22c55e' : '#f59e0b',
                border: `1px solid ${iface.disabled === 'true' ? '#22c55e30' : '#f59e0b30'}`,
                opacity: loading ? 0.5 : 1,
              }}
            >{iface.disabled === 'true' ? 'Enable' : 'Disable'}</button>
            <button
              onClick={() => handleDeleteInterface(iface['.id'])}
              disabled={loading}
              style={{
                padding: '6px 14px',
                fontSize: 10,
                fontWeight: 600,
                fontFamily: "'Outfit', sans-serif",
                textTransform: 'uppercase',
                letterSpacing: '0.08em',
                borderRadius: 6,
                cursor: loading ? 'default' : 'pointer',
                background: '#ef444512',
                color: '#ef4444',
                border: '1px solid #ef444430',
                opacity: loading ? 0.5 : 1,
              }}
            >Delete</button>
          </div>
        </div>

        <div style={{ background: '#0d1017', borderRadius: 6, padding: '8px 10px', border: '1px solid #1a1f2e', marginBottom: 12 }}>
          <div style={labelStyle}>Public Key</div>
          <div
            onClick={() => { navigator.clipboard.writeText(iface['public-key']); showMsg('Public key copied'); }}
            style={{ fontSize: 11, fontFamily: "'JetBrains Mono', monospace", color: '#c8ccd4', wordBreak: 'break-all', cursor: 'pointer' }}
          >{iface['public-key']}</div>
        </div>

        {ifacePeers.length > 0 && (
          <div style={{ marginBottom: 12 }}>
            {ifacePeers.map(p => {
              const isExpanded = expandedPeer === p['.id'];
              const isDisabled = p.disabled === 'true';
              const isOnline = !isDisabled && !!p['current-endpoint-address'];
              return (
                <div key={p['.id']} style={{
                  background: '#0d1017',
                  borderRadius: 6,
                  border: `1px solid ${isExpanded ? '#3b82f630' : '#1a1f2e'}`,
                  marginBottom: 4,
                  transition: 'all 0.2s ease',
                  opacity: isDisabled ? 0.5 : 1,
                }}>
                  <div
                    onClick={() => setExpandedPeer(isExpanded ? null : p['.id'])}
                    style={{
                      padding: '10px 12px',
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      cursor: 'pointer',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <div style={{
                        width: 6, height: 6, borderRadius: '50%',
                        background: isDisabled ? '#ef4444' : isOnline ? '#22c55e' : '#636b7e',
                        boxShadow: isDisabled ? '0 0 6px #ef444450' : isOnline ? '0 0 6px #22c55e50' : 'none',
                        flexShrink: 0,
                      }} />
                      <span style={{ fontSize: 11, fontFamily: "'JetBrains Mono', monospace", color: '#eef0f4', fontWeight: 600 }}>
                        {p.comment || p.name || 'unnamed'}
                      </span>
                      <span style={{ fontSize: 10, fontFamily: "'JetBrains Mono', monospace", color: '#636b7e' }}>
                        {p['allowed-address']}
                      </span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      {p['last-handshake'] && !isDisabled && (
                        <span style={{ fontSize: 9, fontFamily: "'JetBrains Mono', monospace", color: '#636b7e' }}>
                          {p['last-handshake']}
                        </span>
                      )}
                      {isDisabled && (
                        <span style={{ fontSize: 9, fontFamily: "'Outfit', sans-serif", fontWeight: 600, color: '#ef4444' }}>disabled</span>
                      )}
                    </div>
                  </div>
                  {isExpanded && (
                    <div style={{ padding: '0 12px 12px', display: 'flex', flexDirection: 'column', gap: 6 }}>
                      <div style={{ height: 1, background: '#1a1f2e', marginBottom: 2 }} />
                      <div style={{
                        display: 'flex', alignItems: 'center', gap: 6,
                        padding: '4px 8px', borderRadius: 4,
                        background: isDisabled ? '#ef444508' : isOnline ? '#22c55e08' : '#636b7e08',
                      }}>
                        <div style={{
                          width: 6, height: 6, borderRadius: '50%',
                          background: isDisabled ? '#ef4444' : isOnline ? '#22c55e' : '#636b7e',
                          boxShadow: isDisabled ? '0 0 6px #ef444450' : isOnline ? '0 0 6px #22c55e50' : 'none',
                        }} />
                        <span style={{
                          fontSize: 10, fontWeight: 600, fontFamily: "'Outfit', sans-serif",
                          color: isDisabled ? '#ef4444' : isOnline ? '#22c55e' : '#636b7e',
                        }}>
                          {isDisabled ? 'Disabled' : isOnline ? 'Connected' : 'Waiting for handshake'}
                        </span>
                      </div>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                        <div>
                          <div style={{ ...labelStyle, marginBottom: 2 }}>Allowed Address</div>
                          <div style={{ fontSize: 11, fontFamily: "'JetBrains Mono', monospace", color: '#c8ccd4' }}>{p['allowed-address'] || '—'}</div>
                        </div>
                        <div>
                          <div style={{ ...labelStyle, marginBottom: 2 }}>Endpoint</div>
                          <div style={{ fontSize: 11, fontFamily: "'JetBrains Mono', monospace", color: '#c8ccd4' }}>
                            {p['current-endpoint-address'] ? `${p['current-endpoint-address']}:${p['current-endpoint-port']}` : '—'}
                          </div>
                        </div>
                        <div>
                          <div style={{ ...labelStyle, marginBottom: 2 }}>Last Handshake</div>
                          <div style={{ fontSize: 11, fontFamily: "'JetBrains Mono', monospace", color: '#c8ccd4' }}>{p['last-handshake'] || 'never'}</div>
                        </div>
                        <div>
                          <div style={{ ...labelStyle, marginBottom: 2 }}>Traffic</div>
                          <div style={{ fontSize: 11, fontFamily: "'JetBrains Mono', monospace", color: '#c8ccd4' }}>
                            {(p.tx && p.tx !== '0') || (p.rx && p.rx !== '0') ? `TX: ${p.tx} / RX: ${p.rx}` : 'no traffic'}
                          </div>
                        </div>
                      </div>
                      <div>
                        <div style={{ ...labelStyle, marginBottom: 2 }}>Public Key</div>
                        <div
                          onClick={e => { e.stopPropagation(); navigator.clipboard.writeText(p['public-key']); showMsg('Public key copied'); }}
                          style={{ fontSize: 10, fontFamily: "'JetBrains Mono', monospace", color: '#636b7e', wordBreak: 'break-all', cursor: 'pointer' }}
                        >{p['public-key']}</div>
                      </div>
                      <div style={{ display: 'flex', gap: 6, marginTop: 4 }}>
                        <button
                          onClick={e => { e.stopPropagation(); handleTogglePeer(p['.id'], isDisabled); }}
                          disabled={loading}
                          style={{
                            padding: '6px 14px',
                            fontSize: 10,
                            fontWeight: 600,
                            fontFamily: "'Outfit', sans-serif",
                            textTransform: 'uppercase',
                            letterSpacing: '0.08em',
                            borderRadius: 6,
                            cursor: loading ? 'default' : 'pointer',
                            background: isDisabled ? '#22c55e12' : '#f59e0b12',
                            color: isDisabled ? '#22c55e' : '#f59e0b',
                            border: `1px solid ${isDisabled ? '#22c55e30' : '#f59e0b30'}`,
                            opacity: loading ? 0.5 : 1,
                          }}
                        >{isDisabled ? 'Enable' : 'Disable'}</button>
                        <button
                          onClick={e => { e.stopPropagation(); handleDeletePeer(p['.id']); }}
                          disabled={loading}
                          style={{
                            padding: '6px 14px',
                            fontSize: 10,
                            fontWeight: 600,
                            fontFamily: "'Outfit', sans-serif",
                            textTransform: 'uppercase',
                            letterSpacing: '0.08em',
                            borderRadius: 6,
                            cursor: loading ? 'default' : 'pointer',
                            background: '#ef444512',
                            color: '#ef4444',
                            border: '1px solid #ef444430',
                            opacity: loading ? 0.5 : 1,
                          }}
                        >Delete</button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {generatedPeer && generatedPeer.ifaceName === iface.name && (
          <div style={{
            background: '#0d1017',
            borderRadius: 8,
            border: '1px solid #3b82f630',
            padding: 16,
            marginBottom: 12,
          }}>
            <div style={{ display: 'flex', gap: 16 }}>
              <div style={{
                background: '#fff',
                borderRadius: 8,
                padding: 8,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
              }}>
                <QRCodeSVG value={generatedPeer.conf} size={160} />
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: '#eef0f4', marginBottom: 6 }}>{generatedPeer.name}</div>
                <pre style={{
                  fontSize: 10,
                  fontFamily: "'JetBrains Mono', monospace",
                  color: '#c8ccd4',
                  background: '#12151c',
                  borderRadius: 6,
                  padding: 10,
                  border: '1px solid #1a1f2e',
                  overflow: 'auto',
                  margin: 0,
                  whiteSpace: 'pre-wrap',
                }}>{generatedPeer.conf}</pre>
                <button
                  onClick={handleDownloadConf}
                  style={{
                    marginTop: 8,
                    padding: '6px 14px',
                    fontSize: 10,
                    fontWeight: 600,
                    fontFamily: "'Outfit', sans-serif",
                    textTransform: 'uppercase',
                    letterSpacing: '0.08em',
                    borderRadius: 6,
                    cursor: 'pointer',
                    background: '#22c55e12',
                    color: '#22c55e',
                    border: '1px solid #22c55e30',
                  }}
                >Download .conf</button>
              </div>
            </div>
          </div>
        )}

        {isAddingPeer ? (
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <div style={{ flex: 1, minWidth: 140 }}>
              <input value={peerName} onChange={e => setPeerName(e.target.value)} placeholder="Peer name (optional)" style={inputStyle} />
            </div>
            {getWanIps().length > 1 && (
              <div style={{ minWidth: 200 }}>
                <select
                  value={selectedWanIp}
                  onChange={e => setSelectedWanIp(e.target.value)}
                  style={{ ...inputStyle, cursor: 'pointer' }}
                >
                  {getWanIps().map(w => (
                    <option key={w.ip} value={w.ip}>{w.label}</option>
                  ))}
                </select>
              </div>
            )}
            <button
              onClick={() => handleAddPeer(iface)}
              disabled={loading}
              style={{
                padding: '10px 20px',
                fontSize: 11,
                fontWeight: 600,
                fontFamily: "'Outfit', sans-serif",
                textTransform: 'uppercase',
                letterSpacing: '0.08em',
                borderRadius: 6,
                cursor: loading ? 'default' : 'pointer',
                background: '#3b82f618',
                color: '#3b82f6',
                border: '1px solid #3b82f640',
                opacity: loading ? 0.5 : 1,
                whiteSpace: 'nowrap',
              }}
            >{loading ? 'Adding...' : 'Generate'}</button>
            <button
              onClick={() => { setAddPeerFor(null); setPeerName(''); }}
              style={{
                padding: '10px 14px',
                fontSize: 11,
                fontWeight: 600,
                fontFamily: "'Outfit', sans-serif",
                borderRadius: 6,
                cursor: 'pointer',
                background: '#0d1017',
                color: '#636b7e',
                border: '1px solid #1a1f2e',
              }}
            >Cancel</button>
          </div>
        ) : (
          <button
            onClick={() => { setAddPeerFor(iface.name); setGeneratedPeer(null); }}
            style={{
              width: '100%',
              padding: '10px 0',
              fontSize: 11,
              fontWeight: 600,
              fontFamily: "'Outfit', sans-serif",
              textTransform: 'uppercase',
              letterSpacing: '0.08em',
              borderRadius: 6,
              cursor: 'pointer',
              background: '#3b82f610',
              color: '#3b82f6',
              border: '1px solid #3b82f625',
              transition: 'all 0.2s ease',
            }}
          >+ Add Peer</button>
        )}
      </div>
    );
  };

  const renderClientIface = (iface) => {
    const ifacePeers = peers.filter(p => p.interface === iface.name);
    const ifaceIp = ipAddresses.find(a => a.interface === iface.name);
    const isAddingPeer = addClientPeerFor === iface.name;

    return (
      <div key={iface['.id']} style={cardStyle}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <div style={{
                width: 8, height: 8, borderRadius: '50%',
                background: iface.running === 'true' && iface.disabled !== 'true' ? '#22c55e' : '#636b7e',
              }} />
              <span style={{ fontSize: 14, fontWeight: 700, color: '#eef0f4', letterSpacing: '-0.02em' }}>{iface.name}</span>
            </div>
            <div style={{ fontSize: 10, fontFamily: "'JetBrains Mono', monospace", color: '#636b7e', marginTop: 2, paddingLeft: 16 }}>
              {iface.running === 'true' && iface.disabled !== 'true' ? 'Connected' : iface.disabled === 'true' ? 'Disabled' : 'Stopped'}
              {ifaceIp ? ` • ${ifaceIp.address}` : ''}
              {ifacePeers.length > 0 ? ` • ${ifacePeers.length} peer${ifacePeers.length !== 1 ? 's' : ''}` : ''}
            </div>
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            <button
              onClick={() => handleToggleInterface(iface['.id'], iface.disabled === 'true')}
              disabled={loading}
              style={{
                padding: '6px 14px',
                fontSize: 10,
                fontWeight: 600,
                fontFamily: "'Outfit', sans-serif",
                textTransform: 'uppercase',
                letterSpacing: '0.08em',
                borderRadius: 6,
                cursor: loading ? 'default' : 'pointer',
                background: iface.disabled === 'true' ? '#22c55e12' : '#ef444512',
                color: iface.disabled === 'true' ? '#22c55e' : '#ef4444',
                border: `1px solid ${iface.disabled === 'true' ? '#22c55e30' : '#ef444430'}`,
              }}
            >{iface.disabled === 'true' ? 'Enable' : 'Disable'}</button>
            <button
              onClick={() => handleDeleteInterface(iface['.id'])}
              disabled={loading}
              style={{
                padding: '6px 10px',
                fontSize: 10,
                fontWeight: 600,
                fontFamily: "'Outfit', sans-serif",
                borderRadius: 6,
                cursor: loading ? 'default' : 'pointer',
                background: '#ef444512',
                color: '#ef4444',
                border: '1px solid #ef444530',
                opacity: loading ? 0.5 : 1,
              }}
            >✕</button>
          </div>
        </div>

        <div style={{ background: '#0d1017', borderRadius: 6, padding: '10px 12px', border: '1px solid #3b82f630', marginBottom: 12 }}>
          <div style={{ ...labelStyle, color: '#3b82f6' }}>Public Key — share this with the server</div>
          <div
            onClick={() => { navigator.clipboard.writeText(iface['public-key']); showMsg('Public key copied'); }}
            style={{ fontSize: 12, fontFamily: "'JetBrains Mono', monospace", color: '#eef0f4', wordBreak: 'break-all', cursor: 'pointer' }}
          >{iface['public-key']}</div>
        </div>

        {ifacePeers.map(p => editingPeer === p['.id'] ? (
          <div key={p['.id']} style={{ background: '#0d1017', borderRadius: 8, padding: 14, border: '1px solid #1a1f2e', marginBottom: 12 }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
              <div>
                <label style={labelStyle}>Endpoint (host:port)</label>
                <input value={editEndpoint} onChange={e => setEditEndpoint(e.target.value)} style={inputStyle} placeholder="1.2.3.4:51820" />
              </div>
              <div>
                <label style={labelStyle}>Allowed IPs</label>
                <input value={editAllowedIps} onChange={e => setEditAllowedIps(e.target.value)} style={inputStyle} />
              </div>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button
                onClick={() => handleEditPeer(p['.id'])}
                disabled={loading}
                style={{
                  flex: 1,
                  padding: '10px 0',
                  fontSize: 11,
                  fontWeight: 600,
                  fontFamily: "'Outfit', sans-serif",
                  textTransform: 'uppercase',
                  letterSpacing: '0.08em',
                  borderRadius: 6,
                  cursor: loading ? 'default' : 'pointer',
                  background: '#3b82f618',
                  color: '#3b82f6',
                  border: '1px solid #3b82f640',
                  opacity: loading ? 0.5 : 1,
                }}
              >{loading ? 'Saving...' : 'Save'}</button>
              <button
                onClick={() => setEditingPeer(null)}
                style={{
                  padding: '10px 14px',
                  fontSize: 11,
                  fontWeight: 600,
                  fontFamily: "'Outfit', sans-serif",
                  borderRadius: 6,
                  cursor: 'pointer',
                  background: '#0d1017',
                  color: '#636b7e',
                  border: '1px solid #1a1f2e',
                }}
              >Cancel</button>
            </div>
          </div>
        ) : (
          <div key={p['.id']} style={{
            background: '#0d1017',
            borderRadius: 6,
            padding: '10px 12px',
            border: '1px solid #1a1f2e',
            marginBottom: 12,
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}>
            <div>
              <div style={{ fontSize: 10, fontFamily: "'JetBrains Mono', monospace", color: '#636b7e' }}>
                {p['endpoint-address'] ? `${p['endpoint-address']}:${p['endpoint-port']}` : 'no endpoint'}
                {' • '}{p['allowed-address'] || '—'}
                {p['last-handshake'] ? ` • ${p['last-handshake']}` : ''}
              </div>
              {p.tx && <div style={{ fontSize: 9, fontFamily: "'JetBrains Mono', monospace", color: '#636b7e', marginTop: 1 }}>TX: {p.tx} / RX: {p.rx}</div>}
            </div>
            <div style={{ display: 'flex', gap: 4 }}>
              <button
                onClick={() => {
                  setEditingPeer(p['.id']);
                  setEditEndpoint(p['endpoint-address'] ? `${p['endpoint-address']}:${p['endpoint-port'] || '51820'}` : '');
                  setEditAllowedIps(p['allowed-address'] || '0.0.0.0/0');
                }}
                style={{
                  padding: '4px 8px',
                  fontSize: 9,
                  fontWeight: 600,
                  fontFamily: "'Outfit', sans-serif",
                  borderRadius: 5,
                  cursor: 'pointer',
                  background: '#3b82f612',
                  color: '#3b82f6',
                  border: '1px solid #3b82f630',
                }}
              >Edit</button>
              <button
                onClick={() => handleDeletePeer(p['.id'])}
                disabled={loading}
                style={{
                  padding: '4px 8px',
                  fontSize: 9,
                  fontWeight: 600,
                  fontFamily: "'Outfit', sans-serif",
                  borderRadius: 5,
                  cursor: loading ? 'default' : 'pointer',
                  background: '#ef444512',
                  color: '#ef4444',
                  border: '1px solid #ef444430',
                  opacity: loading ? 0.5 : 1,
                }}
              >✕</button>
            </div>
          </div>
        ))}

        {ifacePeers.length === 0 && (isAddingPeer ? (
          <div style={{ background: '#0d1017', borderRadius: 8, padding: 14, border: '1px solid #1a1f2e' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
              <div>
                <label style={labelStyle}>Server Public Key</label>
                <input value={clientServerPubKey} onChange={e => setClientServerPubKey(e.target.value)} style={inputStyle} placeholder="base64..." />
              </div>
              <div>
                <label style={labelStyle}>Endpoint (host:port)</label>
                <input value={clientEndpoint} onChange={e => setClientEndpoint(e.target.value)} style={inputStyle} placeholder="1.2.3.4:51820" />
              </div>
            </div>
            <div style={{ marginBottom: 12 }}>
              <label style={labelStyle}>Allowed IPs</label>
              <input value={clientAllowedIps} onChange={e => setClientAllowedIps(e.target.value)} style={inputStyle} />
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button
                onClick={() => handleAddClientPeer(iface)}
                disabled={loading}
                style={{
                  flex: 1,
                  padding: '10px 0',
                  fontSize: 11,
                  fontWeight: 600,
                  fontFamily: "'Outfit', sans-serif",
                  textTransform: 'uppercase',
                  letterSpacing: '0.08em',
                  borderRadius: 6,
                  cursor: loading ? 'default' : 'pointer',
                  background: '#3b82f618',
                  color: '#3b82f6',
                  border: '1px solid #3b82f640',
                  opacity: loading ? 0.5 : 1,
                }}
              >{loading ? 'Adding...' : 'Add Peer'}</button>
              <button
                onClick={() => setAddClientPeerFor(null)}
                style={{
                  padding: '10px 14px',
                  fontSize: 11,
                  fontWeight: 600,
                  fontFamily: "'Outfit', sans-serif",
                  borderRadius: 6,
                  cursor: 'pointer',
                  background: '#0d1017',
                  color: '#636b7e',
                  border: '1px solid #1a1f2e',
                }}
              >Cancel</button>
            </div>
          </div>
        ) : (
          <button
            onClick={() => setAddClientPeerFor(iface.name)}
            style={{
              width: '100%',
              padding: '10px 0',
              fontSize: 11,
              fontWeight: 600,
              fontFamily: "'Outfit', sans-serif",
              textTransform: 'uppercase',
              letterSpacing: '0.08em',
              borderRadius: 6,
              cursor: 'pointer',
              background: '#3b82f610',
              color: '#3b82f6',
              border: '1px solid #3b82f625',
              transition: 'all 0.2s ease',
            }}
          >+ Add Remote Peer</button>
        ))}
      </div>
    );
  };

  return (
    <>
      <MessageBar message={message} />

      <div style={{ display: 'flex', gap: 10, marginBottom: 20 }}>
        {tabBtn('server', 'Server', serverIfaces.length)}
        {tabBtn('client', 'Client', clientIfaces.length)}
      </div>

      {tab === 'server' && (
        <>
          {serverIfaces.map(renderServerIface)}

          {showCreateServer ? (
            <div style={cardStyle}>
              <div style={{ fontSize: 14, fontWeight: 700, color: '#eef0f4', marginBottom: 12, letterSpacing: '-0.02em' }}>Create WireGuard Server</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12, marginBottom: 16 }}>
                <div>
                  <label style={labelStyle}>Interface Name</label>
                  <input value={serverName} onChange={e => setServerName(e.target.value)} style={inputStyle} />
                </div>
                <div>
                  <label style={labelStyle}>Listen Port</label>
                  <input value={listenPort} onChange={e => setListenPort(e.target.value)} style={inputStyle} />
                </div>
                <div>
                  <label style={labelStyle}>Subnet</label>
                  <input value={serverSubnet} onChange={e => setServerSubnet(e.target.value)} style={inputStyle} />
                </div>
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button
                  onClick={handleCreateServer}
                  disabled={loading}
                  style={{
                    flex: 1,
                    padding: '12px 0',
                    fontSize: 12,
                    fontWeight: 600,
                    fontFamily: "'Outfit', sans-serif",
                    textTransform: 'uppercase',
                    letterSpacing: '0.1em',
                    borderRadius: 8,
                    cursor: loading ? 'default' : 'pointer',
                    background: '#22c55e18',
                    color: '#22c55e',
                    border: '1px solid #22c55e40',
                    opacity: loading ? 0.5 : 1,
                  }}
                >{loading ? 'Creating...' : 'Create Server'}</button>
                <button
                  onClick={() => setShowCreateServer(false)}
                  style={{
                    padding: '12px 20px',
                    fontSize: 12,
                    fontWeight: 600,
                    fontFamily: "'Outfit', sans-serif",
                    borderRadius: 8,
                    cursor: 'pointer',
                    background: '#0d1017',
                    color: '#636b7e',
                    border: '1px solid #1a1f2e',
                  }}
                >Cancel</button>
              </div>
            </div>
          ) : (
            <button
              onClick={() => setShowCreateServer(true)}
              style={{
                width: '100%',
                padding: '14px 0',
                fontSize: 12,
                fontWeight: 600,
                fontFamily: "'Outfit', sans-serif",
                textTransform: 'uppercase',
                letterSpacing: '0.1em',
                borderRadius: 10,
                cursor: 'pointer',
                background: '#12151c',
                color: '#636b7e',
                border: '1px dashed #1a1f2e',
                transition: 'all 0.2s ease',
              }}
            >+ Create Server</button>
          )}
        </>
      )}

      {tab === 'client' && (
        <>
          {clientIfaces.map(renderClientIface)}

          {showCreateClient ? (
            <div style={cardStyle}>
              <div style={{ fontSize: 14, fontWeight: 700, color: '#eef0f4', marginBottom: 12, letterSpacing: '-0.02em' }}>Create WireGuard Client</div>
              <div style={{ marginBottom: 12 }}>
                <label style={labelStyle}>Interface Name</label>
                <input value={clientName} onChange={e => setClientName(e.target.value)} style={inputStyle} />
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button
                  onClick={handleCreateClientIface}
                  disabled={loading}
                  style={{
                    flex: 1,
                    padding: '12px 0',
                    fontSize: 12,
                    fontWeight: 600,
                    fontFamily: "'Outfit', sans-serif",
                    textTransform: 'uppercase',
                    letterSpacing: '0.1em',
                    borderRadius: 8,
                    cursor: loading ? 'default' : 'pointer',
                    background: '#3b82f618',
                    color: '#3b82f6',
                    border: '1px solid #3b82f640',
                    opacity: loading ? 0.5 : 1,
                  }}
                >{loading ? 'Creating...' : 'Create Interface'}</button>
                <button
                  onClick={() => setShowCreateClient(false)}
                  style={{
                    padding: '12px 20px',
                    fontSize: 12,
                    fontWeight: 600,
                    fontFamily: "'Outfit', sans-serif",
                    borderRadius: 8,
                    cursor: 'pointer',
                    background: '#0d1017',
                    color: '#636b7e',
                    border: '1px solid #1a1f2e',
                  }}
                >Cancel</button>
              </div>
            </div>
          ) : (
            <button
              onClick={() => setShowCreateClient(true)}
              style={{
                width: '100%',
                padding: '14px 0',
                fontSize: 12,
                fontWeight: 600,
                fontFamily: "'Outfit', sans-serif",
                textTransform: 'uppercase',
                letterSpacing: '0.1em',
                borderRadius: 10,
                cursor: 'pointer',
                background: '#12151c',
                color: '#636b7e',
                border: '1px dashed #1a1f2e',
                transition: 'all 0.2s ease',
              }}
            >+ Create Client</button>
          )}
        </>
      )}
    </>
  );
}
