import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, apiList } from '../api';
import { activatePCC } from '../utils/pcc';
import { useMessage } from '../hooks/useMessage';
import { MessageBar } from '../components/MessageBar';

const STEPS = 5;

export default function SetupPage() {
  const navigate = useNavigate();
  const [message, showMsg] = useMessage();
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [applying, setApplying] = useState(false);
  const [applyLog, setApplyLog] = useState([]);

  const [ethernets, setEthernets] = useState([]);
  const [bridges, setBridges] = useState([]);
  const [bridgePorts, setBridgePorts] = useState([]);
  const [dhcpClients, setDhcpClients] = useState([]);
  const [ipAddresses, setIpAddresses] = useState([]);
  const [dhcpServers, setDhcpServers] = useState([]);
  const [pools, setPools] = useState([]);
  const [natRules, setNatRules] = useState([]);

  const [roles, setRoles] = useState({});
  const [wanConfig, setWanConfig] = useState({});
  const [lanConfig, setLanConfig] = useState({
    bridgeName: 'bridge',
    address: '192.168.88.1/24',
    dhcpEnabled: true,
    dhcpStart: '192.168.88.10',
    dhcpEnd: '192.168.88.254',
    dns: '1.1.1.1,8.8.8.8',
  });
  const [scheme, setScheme] = useState('');

  const fetchPorts = useCallback(async () => {
    try {
      const [ethList, brList, bpList, dcList, ipaList, dsList, plList, natList] = await Promise.all([
        apiList('GET', '/interface/ethernet'),
        apiList('GET', '/interface/bridge'),
        apiList('GET', '/interface/bridge/port'),
        apiList('GET', '/ip/dhcp-client'),
        apiList('GET', '/ip/address'),
        apiList('GET', '/ip/dhcp-server'),
        apiList('GET', '/ip/pool'),
        apiList('GET', '/ip/firewall/nat'),
      ]);
      setEthernets(ethList);
      setBridges(brList);
      setBridgePorts(bpList);
      setDhcpClients(dcList);
      setIpAddresses(ipaList);
      setDhcpServers(dsList);
      setPools(plList);
      setNatRules(natList);

      const autoRoles = {};
      const autoWanConfig = {};
      const bpNames = bpList.map(b => b.interface);
      const dcNames = dcList.map(d => d.interface);
      ethList.forEach(e => {
        if (dcNames.includes(e.name)) {
          autoRoles[e.name] = 'wan';
          const dc = dcList.find(d => d.interface === e.name);
          autoWanConfig[e.name] = {
            type: 'dhcp',
            name: (dc?.comment || '').replace(/^WAN\d*\s*/i, '').trim(),
            address: dc?.address || '',
            gateway: dc?.gateway || '',
            dns: '',
            currentDhcp: dc,
          };
        } else if (bpNames.includes(e.name)) {
          autoRoles[e.name] = 'lan';
        } else {
          const staticIp = ipaList.find(a => a.interface === e.name);
          if (staticIp) {
            autoRoles[e.name] = 'wan';
            autoWanConfig[e.name] = {
              type: 'static',
              name: '',
              address: staticIp.address || '',
              gateway: '',
              dns: '',
            };
          } else {
            autoRoles[e.name] = 'unused';
          }
        }
      });
      setRoles(autoRoles);
      setWanConfig(autoWanConfig);

      if (brList.length > 0) {
        const br0 = brList[0];
        const brIp = ipaList.find(a => a.interface === br0.name);
        const brDhcp = dsList.find(s => s.interface === br0.name);
        const brPool = brDhcp ? plList.find(p => p.name === brDhcp['address-pool']) : null;
        setLanConfig(prev => ({
          ...prev,
          bridgeName: br0.name,
          address: brIp?.address || prev.address,
          dhcpEnabled: !!brDhcp,
          dhcpStart: brPool?.ranges?.split('-')[0] || prev.dhcpStart,
          dhcpEnd: brPool?.ranges?.split('-')[1] || prev.dhcpEnd,
        }));
      }
    } catch (e) {
      showMsg('Failed to load ports');
    }
  }, []);

  useEffect(() => { fetchPorts(); }, [fetchPorts]);

  const wanPorts = Object.entries(roles).filter(([, r]) => r === 'wan').map(([n]) => n);
  const lanPorts = Object.entries(roles).filter(([, r]) => r === 'lan').map(([n]) => n);
  const hasLan = lanPorts.length > 0 || bridges.length > 0;
  const rolesKey = Object.entries(roles).map(([k, v]) => `${k}:${v}`).join(',');

  useEffect(() => {
    const newWanConfig = { ...wanConfig };
    wanPorts.forEach(p => {
      if (!newWanConfig[p]) {
        newWanConfig[p] = { type: 'dhcp', name: '', address: '', gateway: '', dns: '' };
      }
    });
    Object.keys(newWanConfig).forEach(p => {
      if (!wanPorts.includes(p)) delete newWanConfig[p];
    });
    setWanConfig(newWanConfig);
  }, [rolesKey]);

  useEffect(() => {
    if (wanPorts.length === 1) setScheme('simple');
    else if (wanPorts.length === 2) setScheme('pcc');
    else setScheme('');
  }, [rolesKey]);

  const updateWan = (port, field, value) => {
    setWanConfig(prev => ({ ...prev, [port]: { ...prev[port], [field]: value } }));
  };

  const logStep = (msg) => setApplyLog(prev => [...prev, msg]);

  const handleApply = async () => {
    setLoading(true);
    setApplying(true);
    setApplyLog([]);
    try {
      for (let i = 0; i < wanPorts.length; i++) {
        const port = wanPorts[i];
        const cfg = wanConfig[port];
        const wanComment = cfg.name ? `WAN${wanPorts.length > 1 ? i + 1 : ''} ${cfg.name}` : '';
        if (cfg.type === 'dhcp') {
          const existing = dhcpClients.find(c => c.interface === port);
          if (!existing) {
            logStep(`Creating DHCP client on ${port}...`);
            const dhcpBody = {
              interface: port,
              disabled: 'false',
              'add-default-route': 'yes',
              'use-peer-dns': 'yes',
              'use-peer-ntp': 'yes',
            };
            if (wanComment) dhcpBody.comment = wanComment;
            await api('PUT', '/ip/dhcp-client', dhcpBody);
          } else {
            if (wanComment && existing.comment !== wanComment) {
              logStep(`Updating provider name on ${port}...`);
              await api('PATCH', `/ip/dhcp-client/${existing['.id']}`, { comment: wanComment });
            } else {
              logStep(`DHCP client on ${port} already exists`);
            }
          }
        } else {
          const existing = ipAddresses.find(a => a.interface === port);
          if (existing) {
            logStep(`Updating static IP on ${port}...`);
            await api('PATCH', `/ip/address/${existing['.id']}`, { address: cfg.address, interface: port });
          } else {
            logStep(`Setting static IP on ${port}: ${cfg.address}`);
            await api('PUT', '/ip/address', { address: cfg.address, interface: port });
          }
          if (cfg.gateway) {
            logStep(`Adding gateway ${cfg.gateway} for ${port}...`);
            await api('PUT', '/ip/route', {
              'dst-address': '0.0.0.0/0',
              gateway: cfg.gateway,
              distance: String(wanPorts.indexOf(port) + 1),
              comment: `setup: ${port} gateway`,
            });
          }
          if (cfg.dns) {
            logStep(`Setting DNS for ${port}...`);
            await api('PATCH', '/ip/dns', { servers: cfg.dns });
          }
        }
      }

      const bridgeName = lanConfig.bridgeName;
      if (bridges.length === 0 && (lanPorts.length > 0)) {
        logStep(`Creating bridge ${bridgeName}...`);
        await api('PUT', '/interface/bridge', { name: bridgeName });
      } else {
        logStep(`Bridge ${bridgeName} exists`);
      }

      for (const port of lanPorts) {
        const existing = bridgePorts.find(bp => bp.interface === port);
        if (!existing) {
          logStep(`Adding ${port} to ${bridgeName}...`);
          await api('PUT', '/interface/bridge/port', { interface: port, bridge: bridgeName });
        } else {
          logStep(`${port} already in bridge`);
        }
      }

      const brIpExisting = ipAddresses.find(a => a.interface === bridgeName);
      if (brIpExisting) {
        if (brIpExisting.address !== lanConfig.address) {
          logStep(`Updating bridge IP to ${lanConfig.address}...`);
          await api('PATCH', `/ip/address/${brIpExisting['.id']}`, { address: lanConfig.address });
        } else {
          logStep(`Bridge IP ${lanConfig.address} unchanged`);
        }
      } else {
        logStep(`Assigning ${lanConfig.address} to ${bridgeName}...`);
        await api('PUT', '/ip/address', { address: lanConfig.address, interface: bridgeName });
      }

      if (lanConfig.dhcpEnabled) {
        const poolName = `${bridgeName}-pool`;
        const poolRange = `${lanConfig.dhcpStart}-${lanConfig.dhcpEnd}`;
        const existingPool = pools.find(p => p.name === poolName);
        if (existingPool) {
          logStep(`Updating DHCP pool...`);
          await api('PATCH', `/ip/pool/${existingPool['.id']}`, { ranges: poolRange });
        } else {
          logStep(`Creating DHCP pool ${poolRange}...`);
          await api('PUT', '/ip/pool', { name: poolName, ranges: poolRange });
        }

        const subnet = lanConfig.address.split('/')[0].split('.').slice(0, 3).join('.') + '.0/' + lanConfig.address.split('/')[1];
        const existingServer = dhcpServers.find(s => s.interface === bridgeName);
        if (!existingServer) {
          logStep(`Creating DHCP server on ${bridgeName}...`);
          await api('PUT', '/ip/dhcp-server', {
            name: `${bridgeName}-dhcp`,
            interface: bridgeName,
            'address-pool': poolName,
            disabled: 'false',
          });
          await api('PUT', '/ip/dhcp-server/network', {
            address: subnet,
            gateway: lanConfig.address.split('/')[0],
            'dns-server': lanConfig.dns,
          });
        } else {
          logStep(`DHCP server on ${bridgeName} exists`);
        }
      }

      const hasMasquerade = natRules.some(r => r.action === 'masquerade' && r.chain === 'srcnat');
      if (!hasMasquerade) {
        logStep(`Creating NAT masquerade...`);
        for (const port of wanPorts) {
          await api('PUT', '/ip/firewall/nat', {
            chain: 'srcnat',
            action: 'masquerade',
            'out-interface': port,
            comment: `setup: masquerade ${port}`,
          });
        }
      } else {
        logStep(`NAT masquerade already configured`);
      }

      if (scheme === 'pcc' && wanPorts.length >= 2) {
        logStep(`Activating PCC Load Balance...`);
        await activatePCC(70, [], wanPorts);
        logStep(`PCC activated: 70/30`);
      } else if (scheme === 'failover' && wanPorts.length >= 2) {
        const sorted = [...wanPorts].sort();
        for (let i = 0; i < sorted.length; i++) {
          const dc = dhcpClients.find(c => c.interface === sorted[i]);
          if (dc) {
            logStep(`Setting distance ${i + 1} on ${sorted[i]}...`);
            await api('PATCH', `/ip/dhcp-client/${dc['.id']}`, { 'default-route-distance': String(i + 1) });
          }
        }
        logStep(`Failover configured`);
      } else {
        logStep(`Simple connection ready`);
      }

      logStep(`Done!`);
      showMsg('Configuration applied');
      setTimeout(() => navigate('/isp'), 2000);
    } catch (e) {
      logStep(`Error: ${e.message}`);
      showMsg('Apply failed');
    }
    setLoading(false);
  };

  const roleBtn = (port, role, label, color) => (
    <button
      onClick={() => setRoles({ ...roles, [port]: role })}
      style={{
        flex: 1,
        padding: '6px 0',
        fontSize: 10,
        fontWeight: 600,
        fontFamily: "'Outfit', sans-serif",
        textTransform: 'uppercase',
        letterSpacing: '0.08em',
        borderRadius: 6,
        cursor: 'pointer',
        background: roles[port] === role ? color + '18' : '#0d1017',
        color: roles[port] === role ? color : '#636b7e',
        border: `1px solid ${roles[port] === role ? color + '40' : '#1a1f2e'}`,
        transition: 'all 0.2s ease',
      }}
    >{label}</button>
  );

  const schemeBtn = (value, label, color, desc) => (
    <button
      onClick={() => setScheme(value)}
      style={{
        flex: 1,
        padding: 16,
        borderRadius: 10,
        cursor: 'pointer',
        background: scheme === value ? color + '10' : '#0d1017',
        border: `1px solid ${scheme === value ? color + '40' : '#1a1f2e'}`,
        textAlign: 'left',
        transition: 'all 0.2s ease',
      }}
    >
      <div style={{ fontSize: 13, fontWeight: 600, color: scheme === value ? color : '#eef0f4', marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 10, color: '#636b7e', fontFamily: "'JetBrains Mono', monospace" }}>{desc}</div>
    </button>
  );

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

  const nextBtn = (onClick) => (
    <button
      onClick={onClick}
      style={{
        flex: 2,
        padding: '12px 0',
        fontSize: 12,
        fontWeight: 600,
        fontFamily: "'Outfit', sans-serif",
        textTransform: 'uppercase',
        letterSpacing: '0.1em',
        borderRadius: 8,
        cursor: 'pointer',
        background: '#22c55e18',
        color: '#22c55e',
        border: '1px solid #22c55e40',
        transition: 'all 0.2s ease',
      }}
    >Next</button>
  );

  const backBtn = (onClick) => (
    <button
      onClick={onClick}
      style={{
        flex: 1,
        padding: '12px 0',
        fontSize: 12,
        fontWeight: 600,
        fontFamily: "'Outfit', sans-serif",
        textTransform: 'uppercase',
        letterSpacing: '0.1em',
        borderRadius: 8,
        cursor: 'pointer',
        background: '#0d1017',
        color: '#636b7e',
        border: '1px solid #1a1f2e',
      }}
    >Back</button>
  );

  const lanLabel = lanPorts.length > 0 ? lanPorts.join(', ') : bridges.map(b => b.name).join(', ');

  return (
    <>
      <MessageBar message={message} />

      <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
        {Array.from({ length: STEPS }, (_, i) => i + 1).map(s => (
          <div key={s} style={{
            flex: 1,
            height: 3,
            borderRadius: 2,
            background: s <= step ? '#22c55e' : '#1a1f2e',
            transition: 'background 0.3s ease',
          }} />
        ))}
      </div>

      {step === 1 && (
        <div style={cardStyle}>
          <div style={{ fontSize: 16, fontWeight: 700, color: '#eef0f4', marginBottom: 4, letterSpacing: '-0.02em' }}>Port Assignment</div>
          <div style={{ ...labelStyle, marginBottom: 16 }}>Assign each ethernet port a role</div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {ethernets.map(e => {
              const dc = dhcpClients.find(d => d.interface === e.name);
              const ip = ipAddresses.find(a => a.interface === e.name);
              const bp = bridgePorts.find(b => b.interface === e.name);
              return (
                <div key={e.name} style={{
                  background: '#0d1017',
                  borderRadius: 8,
                  border: `1px solid ${roles[e.name] === 'wan' ? '#f59e0b25' : roles[e.name] === 'lan' ? '#3b82f625' : '#1a1f2e'}`,
                  padding: '12px 14px',
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
                    <span style={{ fontSize: 13, fontFamily: "'JetBrains Mono', monospace", color: '#eef0f4', fontWeight: 600, minWidth: 80 }}>{e.name}</span>
                    <div style={{ flex: 1, display: 'flex', gap: 6 }}>
                      {roleBtn(e.name, 'wan', 'WAN', '#f59e0b')}
                      {roleBtn(e.name, 'lan', 'LAN', '#3b82f6')}
                      {roleBtn(e.name, 'unused', 'Unused', '#636b7e')}
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', paddingLeft: 92 }}>
                    {dc && <span style={{ fontSize: 9, fontFamily: "'JetBrains Mono', monospace", color: '#22c55e', background: '#22c55e10', padding: '2px 6px', borderRadius: 3, border: '1px solid #22c55e20' }}>DHCP: {dc.address || 'obtaining...'}</span>}
                    {dc && dc.status && <span style={{ fontSize: 9, fontFamily: "'JetBrains Mono', monospace", color: dc.status === 'bound' ? '#22c55e' : '#f59e0b', background: '#0d1017', padding: '2px 6px', borderRadius: 3, border: '1px solid #1a1f2e' }}>{dc.status}</span>}
                    {ip && !dc && <span style={{ fontSize: 9, fontFamily: "'JetBrains Mono', monospace", color: '#8b5cf6', background: '#8b5cf610', padding: '2px 6px', borderRadius: 3, border: '1px solid #8b5cf620' }}>Static: {ip.address}</span>}
                    {bp && <span style={{ fontSize: 9, fontFamily: "'JetBrains Mono', monospace", color: '#3b82f6', background: '#3b82f610', padding: '2px 6px', borderRadius: 3, border: '1px solid #3b82f620' }}>Bridge: {bp.bridge}</span>}
                    {e.running === 'true' && <span style={{ fontSize: 9, fontFamily: "'JetBrains Mono', monospace", color: '#22c55e', background: '#22c55e10', padding: '2px 6px', borderRadius: 3, border: '1px solid #22c55e20' }}>link up</span>}
                    {e.running !== 'true' && <span style={{ fontSize: 9, fontFamily: "'JetBrains Mono', monospace", color: '#ef4444', background: '#ef444410', padding: '2px 6px', borderRadius: 3, border: '1px solid #ef444420' }}>link down</span>}
                  </div>
                </div>
              );
            })}
          </div>

          <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
            {nextBtn(() => {
              if (wanPorts.length > 0 && hasLan) setStep(2);
              else showMsg('Select at least 1 WAN port. LAN requires bridge or LAN-assigned port');
            })}
          </div>
        </div>
      )}

      {step === 2 && (
        <div style={cardStyle}>
          <div style={{ fontSize: 16, fontWeight: 700, color: '#eef0f4', marginBottom: 4, letterSpacing: '-0.02em' }}>WAN Configuration</div>
          <div style={{ ...labelStyle, marginBottom: 16 }}>Configure each WAN port connection type</div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {wanPorts.map(port => {
              const cfg = wanConfig[port] || { type: 'dhcp', name: '', address: '', gateway: '', dns: '' };
              return (
                <div key={port} style={{
                  background: '#0d1017',
                  borderRadius: 8,
                  border: '1px solid #f59e0b25',
                  padding: 16,
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
                    <span style={{ fontSize: 14, fontFamily: "'JetBrains Mono', monospace", color: '#eef0f4', fontWeight: 700, flexShrink: 0 }}>{port}</span>
                    <input
                      value={cfg.name}
                      onChange={e => updateWan(port, 'name', e.target.value)}
                      placeholder="Provider name"
                      style={{
                        flex: 1,
                        padding: '7px 10px',
                        fontSize: 12,
                        fontFamily: "'JetBrains Mono', monospace",
                        color: '#eef0f4',
                        background: '#12151c',
                        border: '1px solid #1a1f2e',
                        borderRadius: 6,
                        outline: 'none',
                        boxSizing: 'border-box',
                      }}
                    />
                    <div style={{ display: 'flex', gap: 6 }}>
                      <button
                        onClick={() => updateWan(port, 'type', 'dhcp')}
                        style={{
                          padding: '5px 12px',
                          fontSize: 10,
                          fontWeight: 600,
                          fontFamily: "'Outfit', sans-serif",
                          textTransform: 'uppercase',
                          letterSpacing: '0.08em',
                          borderRadius: 6,
                          cursor: 'pointer',
                          background: cfg.type === 'dhcp' ? '#22c55e18' : '#12151c',
                          color: cfg.type === 'dhcp' ? '#22c55e' : '#636b7e',
                          border: `1px solid ${cfg.type === 'dhcp' ? '#22c55e40' : '#1a1f2e'}`,
                          transition: 'all 0.2s ease',
                        }}
                      >DHCP</button>
                      <button
                        onClick={() => updateWan(port, 'type', 'static')}
                        style={{
                          padding: '5px 12px',
                          fontSize: 10,
                          fontWeight: 600,
                          fontFamily: "'Outfit', sans-serif",
                          textTransform: 'uppercase',
                          letterSpacing: '0.08em',
                          borderRadius: 6,
                          cursor: 'pointer',
                          background: cfg.type === 'static' ? '#8b5cf618' : '#12151c',
                          color: cfg.type === 'static' ? '#8b5cf6' : '#636b7e',
                          border: `1px solid ${cfg.type === 'static' ? '#8b5cf640' : '#1a1f2e'}`,
                          transition: 'all 0.2s ease',
                        }}
                      >Static</button>
                    </div>
                  </div>

                  {cfg.type === 'dhcp' && (
                    <div style={{ fontSize: 11, fontFamily: "'JetBrains Mono', monospace", color: '#636b7e' }}>
                      {cfg.currentDhcp ? (
                        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                          <span>IP: <span style={{ color: '#22c55e' }}>{cfg.currentDhcp.address || '...'}</span></span>
                          <span>GW: <span style={{ color: '#c8ccd4' }}>{cfg.currentDhcp.gateway || '...'}</span></span>
                          <span>Status: <span style={{ color: cfg.currentDhcp.status === 'bound' ? '#22c55e' : '#f59e0b' }}>{cfg.currentDhcp.status || '...'}</span></span>
                        </div>
                      ) : (
                        <span>Automatic — IP address will be obtained from ISP</span>
                      )}
                    </div>
                  )}

                  {cfg.type === 'static' && (
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                      <div>
                        <label style={{ ...labelStyle, marginBottom: 4, display: 'block' }}>IP Address / Mask</label>
                        <input
                          value={cfg.address}
                          onChange={e => updateWan(port, 'address', e.target.value)}
                          placeholder="203.0.113.10/24"
                          style={inputStyle}
                        />
                      </div>
                      <div>
                        <label style={{ ...labelStyle, marginBottom: 4, display: 'block' }}>Gateway</label>
                        <input
                          value={cfg.gateway}
                          onChange={e => updateWan(port, 'gateway', e.target.value)}
                          placeholder="203.0.113.1"
                          style={inputStyle}
                        />
                      </div>
                      <div style={{ gridColumn: '1 / -1' }}>
                        <label style={{ ...labelStyle, marginBottom: 4, display: 'block' }}>DNS Servers</label>
                        <input
                          value={cfg.dns}
                          onChange={e => updateWan(port, 'dns', e.target.value)}
                          placeholder="1.1.1.1,8.8.8.8"
                          style={inputStyle}
                        />
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
            {backBtn(() => setStep(1))}
            {nextBtn(() => {
              for (const port of wanPorts) {
                const cfg = wanConfig[port];
                if (cfg?.type === 'static' && !cfg.address) {
                  showMsg(`Enter IP address for ${port}`);
                  return;
                }
              }
              setStep(3);
            })}
          </div>
        </div>
      )}

      {step === 3 && (
        <div style={cardStyle}>
          <div style={{ fontSize: 16, fontWeight: 700, color: '#eef0f4', marginBottom: 4, letterSpacing: '-0.02em' }}>LAN Configuration</div>
          <div style={{ ...labelStyle, marginBottom: 16 }}>
            Bridge: {lanConfig.bridgeName} ({lanLabel})
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <div>
                <label style={{ ...labelStyle, marginBottom: 4, display: 'block' }}>Bridge Name</label>
                <input
                  value={lanConfig.bridgeName}
                  onChange={e => setLanConfig({ ...lanConfig, bridgeName: e.target.value })}
                  style={inputStyle}
                />
              </div>
              <div>
                <label style={{ ...labelStyle, marginBottom: 4, display: 'block' }}>Bridge IP / Mask</label>
                <input
                  value={lanConfig.address}
                  onChange={e => setLanConfig({ ...lanConfig, address: e.target.value })}
                  style={inputStyle}
                />
              </div>
            </div>

            <div style={{
              background: '#0d1017',
              borderRadius: 8,
              border: '1px solid #1a1f2e',
              padding: 14,
            }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: lanConfig.dhcpEnabled ? 12 : 0 }}>
                <span style={{ fontSize: 12, fontWeight: 600, color: '#eef0f4' }}>DHCP Server</span>
                <button
                  onClick={() => setLanConfig({ ...lanConfig, dhcpEnabled: !lanConfig.dhcpEnabled })}
                  style={{
                    padding: '4px 12px',
                    fontSize: 10,
                    fontWeight: 600,
                    fontFamily: "'Outfit', sans-serif",
                    textTransform: 'uppercase',
                    letterSpacing: '0.08em',
                    borderRadius: 6,
                    cursor: 'pointer',
                    background: lanConfig.dhcpEnabled ? '#22c55e18' : '#ef444518',
                    color: lanConfig.dhcpEnabled ? '#22c55e' : '#ef4444',
                    border: `1px solid ${lanConfig.dhcpEnabled ? '#22c55e40' : '#ef444540'}`,
                    transition: 'all 0.2s ease',
                  }}
                >{lanConfig.dhcpEnabled ? 'Enabled' : 'Disabled'}</button>
              </div>

              {lanConfig.dhcpEnabled && (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
                  <div>
                    <label style={{ ...labelStyle, marginBottom: 4, display: 'block' }}>Pool Start</label>
                    <input
                      value={lanConfig.dhcpStart}
                      onChange={e => setLanConfig({ ...lanConfig, dhcpStart: e.target.value })}
                      style={inputStyle}
                    />
                  </div>
                  <div>
                    <label style={{ ...labelStyle, marginBottom: 4, display: 'block' }}>Pool End</label>
                    <input
                      value={lanConfig.dhcpEnd}
                      onChange={e => setLanConfig({ ...lanConfig, dhcpEnd: e.target.value })}
                      style={inputStyle}
                    />
                  </div>
                  <div>
                    <label style={{ ...labelStyle, marginBottom: 4, display: 'block' }}>DNS Servers</label>
                    <input
                      value={lanConfig.dns}
                      onChange={e => setLanConfig({ ...lanConfig, dns: e.target.value })}
                      style={inputStyle}
                    />
                  </div>
                </div>
              )}
            </div>
          </div>

          <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
            {backBtn(() => setStep(2))}
            {nextBtn(() => {
              if (!lanConfig.address) { showMsg('Enter bridge IP'); return; }
              setStep(4);
            })}
          </div>
        </div>
      )}

      {step === 4 && (
        <div style={cardStyle}>
          <div style={{ fontSize: 16, fontWeight: 700, color: '#eef0f4', marginBottom: 4, letterSpacing: '-0.02em' }}>Connection Scheme</div>
          <div style={{ ...labelStyle, marginBottom: 16 }}>
            {wanPorts.length} WAN ({wanPorts.join(', ')}) / LAN ({lanLabel})
          </div>

          <div style={{ display: 'flex', gap: 10, marginBottom: 16 }}>
            {wanPorts.length === 1 && schemeBtn('simple', 'Simple', '#22c55e', 'Single ISP with NAT masquerade')}
            {wanPorts.length >= 2 && schemeBtn('pcc', 'PCC Balance', '#8b5cf6', 'Per-connection load balancing across ISPs')}
            {wanPorts.length >= 2 && schemeBtn('failover', 'Failover', '#f59e0b', 'Primary ISP + automatic backup')}
          </div>

          <div style={{ display: 'flex', gap: 8 }}>
            {backBtn(() => setStep(3))}
            {nextBtn(() => {
              if (!scheme) { showMsg('Select a scheme'); return; }
              setStep(5);
            })}
          </div>
        </div>
      )}

      {step === 5 && (
        <div style={cardStyle}>
          <div style={{ fontSize: 16, fontWeight: 700, color: '#eef0f4', marginBottom: 4, letterSpacing: '-0.02em' }}>Review & Apply</div>
          <div style={{ ...labelStyle, marginBottom: 16 }}>Verify configuration before applying</div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 16 }}>
            <div style={{ background: '#0d1017', borderRadius: 8, border: '1px solid #f59e0b20', padding: 14 }}>
              <div style={{ ...labelStyle, marginBottom: 8, color: '#f59e0b' }}>WAN</div>
              {wanPorts.map(port => {
                const cfg = wanConfig[port] || {};
                return (
                  <div key={port} style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', borderBottom: '1px solid #ffffff06' }}>
                    <span style={{ fontSize: 12, fontFamily: "'JetBrains Mono', monospace", color: '#eef0f4', fontWeight: 600 }}>{port}{cfg.name ? ` — ${cfg.name}` : ''}</span>
                    <span style={{ fontSize: 11, fontFamily: "'JetBrains Mono', monospace", color: '#c8ccd4' }}>
                      {cfg.type === 'dhcp' ? 'DHCP (auto)' : `Static: ${cfg.address}`}
                      {cfg.type === 'static' && cfg.gateway ? ` → ${cfg.gateway}` : ''}
                    </span>
                  </div>
                );
              })}
            </div>

            <div style={{ background: '#0d1017', borderRadius: 8, border: '1px solid #3b82f620', padding: 14 }}>
              <div style={{ ...labelStyle, marginBottom: 8, color: '#3b82f6' }}>LAN</div>
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', borderBottom: '1px solid #ffffff06' }}>
                <span style={{ fontSize: 11, fontFamily: "'JetBrains Mono', monospace", color: '#636b7e' }}>Bridge</span>
                <span style={{ fontSize: 11, fontFamily: "'JetBrains Mono', monospace", color: '#c8ccd4' }}>{lanConfig.bridgeName} ({lanLabel})</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', borderBottom: '1px solid #ffffff06' }}>
                <span style={{ fontSize: 11, fontFamily: "'JetBrains Mono', monospace", color: '#636b7e' }}>IP</span>
                <span style={{ fontSize: 11, fontFamily: "'JetBrains Mono', monospace", color: '#c8ccd4' }}>{lanConfig.address}</span>
              </div>
              {lanConfig.dhcpEnabled && (
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', borderBottom: '1px solid #ffffff06' }}>
                  <span style={{ fontSize: 11, fontFamily: "'JetBrains Mono', monospace", color: '#636b7e' }}>DHCP Pool</span>
                  <span style={{ fontSize: 11, fontFamily: "'JetBrains Mono', monospace", color: '#c8ccd4' }}>{lanConfig.dhcpStart} — {lanConfig.dhcpEnd}</span>
                </div>
              )}
              {lanConfig.dhcpEnabled && (
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0' }}>
                  <span style={{ fontSize: 11, fontFamily: "'JetBrains Mono', monospace", color: '#636b7e' }}>DNS</span>
                  <span style={{ fontSize: 11, fontFamily: "'JetBrains Mono', monospace", color: '#c8ccd4' }}>{lanConfig.dns}</span>
                </div>
              )}
            </div>

            <div style={{ background: '#0d1017', borderRadius: 8, border: '1px solid #8b5cf620', padding: 14 }}>
              <div style={{ ...labelStyle, marginBottom: 8, color: '#8b5cf6' }}>Scheme</div>
              <div style={{ fontSize: 13, fontFamily: "'JetBrains Mono', monospace", color: '#eef0f4', fontWeight: 600 }}>
                {scheme === 'pcc' ? 'PCC Load Balance' : scheme === 'failover' ? 'Failover' : 'Simple Connection'}
              </div>
            </div>
          </div>

          {applying && applyLog.length > 0 && (
            <div style={{
              background: '#0d1017',
              borderRadius: 8,
              border: '1px solid #22c55e20',
              padding: 12,
              marginBottom: 16,
              maxHeight: 200,
              overflowY: 'auto',
            }}>
              {applyLog.map((log, i) => (
                <div key={i} style={{
                  fontSize: 10,
                  fontFamily: "'JetBrains Mono', monospace",
                  color: log.startsWith('Error') ? '#ef4444' : log === 'Done!' ? '#22c55e' : '#636b7e',
                  padding: '2px 0',
                }}>
                  <span style={{ color: '#22c55e', marginRight: 6 }}>{'>'}</span>{log}
                </div>
              ))}
            </div>
          )}

          <div style={{ display: 'flex', gap: 8 }}>
            {backBtn(() => { setApplying(false); setApplyLog([]); setStep(4); })}
            <button
              onClick={handleApply}
              disabled={loading}
              style={{
                flex: 2,
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
                transition: 'all 0.2s ease',
              }}
            >{loading ? 'Applying...' : 'Apply'}</button>
          </div>
        </div>
      )}
    </>
  );
}
